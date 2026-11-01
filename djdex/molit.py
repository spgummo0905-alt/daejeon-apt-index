"""국토교통부 아파트 매매 실거래가 API 수집과 정규화.

API: 공공데이터포털 '국토교통부_아파트 매매 실거래가 상세 자료'
요청 파라미터: serviceKey, LAWD_CD(시군구 5자리), DEAL_YMD(YYYYMM), pageNo, numOfRows
"""
from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests


class MolitError(RuntimeError):
    pass


# 공공데이터포털이 정상으로 돌려주는 결과 코드
_OK_CODES = {"00", "000"}


def parse_response(xml_text: str) -> tuple[list[dict], int]:
    """응답 XML에서 거래 목록과 전체 건수를 꺼냅니다."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        raise MolitError(f"XML 파싱 실패: {xml_text[:200]!r}") from e

    # 키 오류 등은 OpenAPI_ServiceResponse 형태로 옵니다.
    auth_msg = root.findtext(".//returnAuthMsg")
    if auth_msg:
        raise MolitError(f"인증 오류: {auth_msg} ({root.findtext('.//returnReasonCode')})")

    code = (root.findtext(".//resultCode") or "").strip()
    if code not in _OK_CODES:
        raise MolitError(f"API 오류 {code}: {root.findtext('.//resultMsg')}")

    total = int((root.findtext(".//totalCount") or "0").strip() or 0)
    items = [
        {child.tag: (child.text or "").strip() for child in item}
        for item in root.iter("item")
    ]
    return items, total


# 공공데이터포털에 아예 연결이 안 될 때(연결 시간 초과): 한 번 실행 안에서 두 번 연달아 그러면 내려간 것으로 보고
# 남은 조회(매매·전월세·단지 정보·공급면적·관리비)는 바로 건너뜁니다. 받아 둔 자료로 사이트는 그대로 만듭니다.
_PORTAL = {"fails": 0, "down": False}


def portal_down() -> bool:
    return _PORTAL["down"]


def portal_result(exc: BaseException | None) -> None:
    """조회 결과를 알립니다. 연결 자체가 안 된 실패만 셉니다 (HTTP 오류·빈 응답은 서버가 살아 있는 것)."""
    if exc is None:
        _PORTAL["fails"] = 0
    elif isinstance(exc, (requests.ConnectionError, requests.ConnectTimeout)) and not _PORTAL["down"]:
        _PORTAL["fails"] += 1
        if _PORTAL["fails"] >= 2:
            _PORTAL["down"] = True
            print("::warning::공공데이터포털(apis.data.go.kr)에 연결이 안 됩니다. 이번 실행의 남은 조회는 건너뛰고 받아 둔 자료를 씁니다")


def fetch_month(
    service_key: str,
    lawd_cd: str,
    deal_ym: str,
    endpoint: str,
    rows: int = 1000,
    session: requests.Session | None = None,
    retries: int = 3,
) -> list[dict]:
    """한 구의 한 달치 거래를 페이지를 넘겨가며 모두 받습니다."""
    s = session or requests.Session()
    if portal_down():
        raise MolitError("공공데이터포털 연결 안 됨 (이번 실행은 건너뜀)")
    page, items = 1, []
    while True:
        params = {
            "serviceKey": service_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ym,
            "pageNo": page,
            "numOfRows": rows,
        }
        for attempt in range(retries):
            try:
                r = s.get(endpoint, params=params, timeout=(10, 40))  # 연결 10초, 응답 40초
                r.raise_for_status()
                batch, total = parse_response(r.text)
                portal_result(None)
                break
            except (requests.RequestException, MolitError) as e:
                portal_result(e)
                if attempt == retries - 1 or portal_down():
                    raise
                time.sleep(2 ** attempt)
        items.extend(batch)
        if not batch or len(items) >= total:
            return items
        page += 1


def _int(v: str | None) -> int | None:
    v = (v or "").replace(",", "").strip()
    return int(v) if v.lstrip("-").isdigit() else None


def _float(v: str | None) -> float | None:
    try:
        return float((v or "").replace(",", "").strip())
    except ValueError:
        return None


PRESALE_KINDS = {"분": "분양권", "입": "입주권", "분양권": "분양권", "입주권": "입주권"}


def normalize(raw: dict, districts: dict[str, str], kind: str = "매매") -> dict | None:
    """API 원본 항목을 분석용 한 줄로 바꿉니다. 필수값이 없으면 None.

    kind: "매매" 또는 분양권 API에서 온 거래면 "분양권"(ownershipGbn 으로 분양권/입주권 구분).
    """
    sgg = raw.get("sggCd", "")
    price = _int(raw.get("dealAmount"))
    area = _float(raw.get("excluUseAr"))
    y, m, d = _int(raw.get("dealYear")), _int(raw.get("dealMonth")), _int(raw.get("dealDay"))
    if not (price and area and y and m and d):
        return None
    name = raw.get("aptNm", "")
    dong = raw.get("umdNm", "")
    jibun = raw.get("jibun", "")
    complex_id = raw.get("aptSeq") or f"{sgg}-{dong}-{jibun}-{name}"
    return {
        "complex_id": complex_id,
        "name": name,
        "gu": districts.get(sgg, sgg),
        "dong": dong,
        "jibun": jibun,
        "build_year": _int(raw.get("buildYear")),
        "area": area,
        "price": price,  # 만원
        "date": f"{y:04d}-{m:02d}-{d:02d}",
        "floor": _int(raw.get("floor")),
        "apt_dong": (raw.get("aptDong") or "").strip(),  # 동 이름 (최근 신고분부터 채워짐)
        "cancelled": (raw.get("cdealType") or "").strip().upper() == "O",
        "direct": (raw.get("dealingGbn") or "").strip() == "직거래",
        "kind": kind if kind == "매매" else PRESALE_KINDS.get((raw.get("ownershipGbn") or "").strip(), "분양권"),
    }


def normalize_rent(raw: dict, districts: dict[str, str]) -> dict | None:
    """전월세 API 항목 → 한 줄. 보증금·월세는 만원. contract: 신규/갱신/''(2021년 6월 전에는 비어 있음)."""
    sgg = raw.get("sggCd", "")
    deposit = _int(raw.get("deposit"))
    area = _float(raw.get("excluUseAr"))
    y, m, d = _int(raw.get("dealYear")), _int(raw.get("dealMonth")), _int(raw.get("dealDay"))
    if not (deposit and area and y and m and d):
        return None
    name, dong, jibun = raw.get("aptNm", ""), raw.get("umdNm", ""), raw.get("jibun", "")
    return {
        "complex_id": raw.get("aptSeq") or f"{sgg}-{dong}-{jibun}-{name}",
        "name": name, "gu": districts.get(sgg, sgg), "dong": dong, "jibun": jibun,
        "area": area, "deposit": deposit, "monthly": _int(raw.get("monthlyRent")) or 0,
        "date": f"{y:04d}-{m:02d}-{d:02d}", "floor": _int(raw.get("floor")),
        "contract": (raw.get("contractType") or "").strip(),
    }


def load_rent(raw_dir: Path, districts: dict[str, str], sale_rows: list[dict]) -> list[dict]:
    """받아 둔 전월세를 읽어 매매 단지 일련번호에 잇습니다.
    전월세 API에 단지 일련번호가 없으면 같은 구·동의 지번이나 이름(공백 무시)이 같은 매매 단지로 합칩니다."""
    rows = []
    for path in sorted(raw_dir.glob("*/*.json")):
        for item in json.loads(path.read_text(encoding="utf-8")):
            row = normalize_rent(item, districts)
            if row:
                rows.append(row)
    ids = {r["complex_id"] for r in sale_rows if r.get("kind", "매매") == "매매"}
    by_jibun, by_name = {}, {}
    for r in sale_rows:
        if r.get("kind", "매매") == "매매":
            by_jibun.setdefault((r["gu"], r["dong"], str(r["jibun"])), r["complex_id"])
            by_name.setdefault((r["gu"], r["dong"], _norm_name(r["name"])), r["complex_id"])
    for r in rows:
        if r["complex_id"] not in ids:
            cid = by_jibun.get((r["gu"], r["dong"], str(r["jibun"]))) or by_name.get((r["gu"], r["dong"], _norm_name(r["name"])))
            if cid:
                r["complex_id"] = cid
    return rows


DOWN_AFTER = 3  # 최근 달 받기가 이만큼 연달아 실패하면 서버가 내려간 것으로 봄


def month_range(start_ym: str, end_ym: str) -> list[str]:
    y, m = int(start_ym[:4]), int(start_ym[4:])
    ey, em = int(end_ym[:4]), int(end_ym[4:])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def collect(
    service_key: str,
    districts: dict[str, str],
    months: list[str],
    raw_dir: Path,
    endpoint: str,
    rows: int,
    refresh: set[str] = frozenset(),
    budget: int | None = None,
    log=print,
) -> None:
    """원본 응답을 data/raw/<구코드>/<YYYYMM>.json 으로 캐시합니다. 이미 있는 달은 건너뜁니다.

    최근 달(refresh)을 다시 받다가 국토부 서버가 응답하지 않으면, 받아 둔 파일을 그대로 쓰고
    넘어갑니다 (하루 늦은 자료로라도 사이트는 만들어지게). 아직 받은 적 없는 최근 달은 다음 번에
    채우고, 예전 달을 처음 받는 중에 실패하면 자료가 빠지므로 멈춥니다.
    여러 번 연달아 실패하면 서버가 내려간 것으로 보고 나머지 최근 달은 시도하지 않습니다.

    budget 을 주면 한 번 실행에 그만큼만 받고 나머지는 다음 실행 때 이어서 받습니다 (공개 전 지역을
    하루 호출 한도 안에서 며칠에 나눠 채울 때). 이때는 예전 달이 실패해도 오류를 내지 않고 그 달을 건너뛰며, 연달아 실패하면 멈춥니다.
    """
    s = requests.Session()
    fails, down, used = 0, False, 0
    for lawd in districts:
        for ym in months:
            path = raw_dir / lawd / f"{ym}.json"
            if path.exists() and ym not in refresh:
                continue
            if budget is not None and used >= budget:
                log(f"::notice::이번 실행에서 {used}번 받았습니다. 나머지는 다음 실행 때 이어서 받습니다")
                return
            if down and ym in refresh:
                log(f"::warning::{districts[lawd]} {ym}: 국토부 서버 응답 없음, {'받아 둔 자료 사용' if path.exists() else '다음 번에 받음'}")
                continue
            try:
                items = fetch_month(service_key, lawd, ym, endpoint, rows, session=s)
            except (requests.RequestException, MolitError) as e:
                if ym not in refresh and budget is not None:
                    # 나눠 받는 중: 그 달은 건너뛰고(다음 실행 때 다시) 연달아 실패하면 오늘은 멈춤
                    fails += 1
                    log(f"::warning::{districts[lawd]} {ym} 받기 실패, 다음 실행 때 다시 받습니다: {e}")
                    if fails >= DOWN_AFTER:
                        log("::warning::여러 번 연달아 실패해 이번 실행은 여기까지 받습니다")
                        return
                    continue
                if ym not in refresh:
                    raise
                fails += 1
                down = fails >= DOWN_AFTER
                log(f"::warning::{districts[lawd]} {ym} 받기 실패, {'받아 둔 자료 사용' if path.exists() else '다음 번에 받음'}: {e}")
                continue
            fails, used = 0, used + 1
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
            log(f"{districts[lawd]} {ym}: {len(items)}건")


def progress(raw_dir: Path, districts: dict[str, str], months: list[str]) -> tuple[int, int]:
    """받아 둔 달 수와 받아야 할 달 수 (구 × 달)."""
    have = sum((raw_dir / lawd / f"{ym}.json").exists() for lawd in districts for ym in months)
    return have, len(districts) * len(months)


def load_raw(raw_dir: Path, districts: dict[str, str], presale_dir: Path | None = None) -> list[dict]:
    rows = []
    sources = [(raw_dir, "매매")] + ([(presale_dir, "분양권")] if presale_dir else [])
    for d, kind in sources:
        for path in sorted(d.glob("*/*.json")):
            for item in json.loads(path.read_text(encoding="utf-8")):
                row = normalize(item, districts, kind)
                if row:
                    rows.append(row)
    return link_ids(rows)


def _norm_name(name: str) -> str:
    return re.sub(r"[\s()（）·.,-]", "", name or "")


_CITY = re.compile(r"^(청주|대전|세종|서울|충북|충남)")
_BLOCK = re.compile(r"\(.*?\)|[A-Z]\d+BL|[A-Z]?\d+블록|아파트", re.I)


def _core_name(name: str) -> str:
    """분양 때 이름과 입주 뒤 이름을 견주려고 덜어 내는 부분: 괄호(블록 번호), A7BL·S4블록, '아파트', 앞의 도시 이름."""
    n = _norm_name(_BLOCK.sub("", name or ""))
    return _CITY.sub("", n)


def _subseq(a: str, b: str) -> bool:
    it = iter(b)
    return all(ch in it for ch in a)


def _same_complex(a: str, b: str) -> float:
    """두 이름이 같은 단지로 보이는 정도 (0~1). 차수·단지 번호 숫자가 다르면 0 (1단지와 2단지는 다른 단지)."""
    from difflib import SequenceMatcher
    ca, cb = _core_name(a), _core_name(b)
    if not ca or not cb or re.findall(r"\d+", ca) != re.findall(r"\d+", cb):
        return 0.0
    if ca == cb:
        return 1.0
    short, long_ = sorted((ca, cb), key=len)
    if len(short) >= 6 and _subseq(short, long_):   # '테크노폴리스지웰푸르지오' ⊂ '테크노폴리스신영지웰푸르지오'
        return 0.95
    r = SequenceMatcher(None, ca, cb).ratio()
    return r if r >= .86 else 0.0


def link_ids(rows: list[dict]) -> list[dict]:
    """분양권 API에는 단지 일련번호가 없어 '구-동-지번-이름' 임시 ID가 붙습니다. 매매 단지와 합치는 순서:
    ① 같은 동·같은 이름(공백 무시) ② 같은 동·같은 지번 ③ 같은 동에서 이름이 거의 같은 단지 하나
    (분양 때는 '청주테크노폴리스 지웰푸르지오', 입주 뒤에는 '청주테크노폴리스신영지웰푸르지오'처럼 이름이 조금 바뀌어
    같은 아파트가 두 단지로 나뉘던 것)."""
    by_key: dict[tuple, str] = {}
    by_jibun: dict[tuple, set] = {}
    names: dict[tuple, dict[str, str]] = {}
    for r in rows:
        if r["kind"] == "매매":
            by_key.setdefault((r["gu"], r["dong"], _norm_name(r["name"])), r["complex_id"])
            if str(r.get("jibun") or "").strip():
                by_jibun.setdefault((r["gu"], r["dong"], str(r["jibun"]).strip()), set()).add(r["complex_id"])
            names.setdefault((r["gu"], r["dong"]), {}).setdefault(r["complex_id"], r["name"])
    memo: dict[tuple, str | None] = {}
    for r in rows:
        if r["kind"] == "매매":
            continue
        k = (r["gu"], r["dong"], _norm_name(r["name"]), str(r.get("jibun") or "").strip())
        if k not in memo:
            cid = by_key.get(k[:3])
            if not cid and k[3] and len(by_jibun.get((k[0], k[1], k[3]), ())) == 1:
                cid = next(iter(by_jibun[(k[0], k[1], k[3])]))
            if not cid:
                scored = sorted(((_same_complex(r["name"], n), c) for c, n in names.get((k[0], k[1]), {}).items()), reverse=True)
                if scored and scored[0][0] > 0 and (len(scored) == 1 or scored[1][0] < scored[0][0]):
                    cid = scored[0][1]   # 가장 비슷한 단지가 하나뿐일 때만 (애매하면 합치지 않아요)
            memo[k] = cid
        if memo[k]:
            r["complex_id"] = memo[k]
    return rows
