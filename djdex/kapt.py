"""공동주택관리정보시스템(K-apt) 단지 정보: 세대수·동수·주차·승강기 등.

API (공공데이터포털, 매매 실거래와 같은 인증키)
- 국토교통부_공동주택 단지 목록제공 서비스: AptListService4/getSigunguAptList4 (sigunguCode = 시군구 5자리)
- 국토교통부_공동주택 기본 정보제공 서비스: AptBasisInfoServiceV5/getAphusBassInfoV5 (기본), getAphusDtlInfoV5 (상세)
  (포털이 버전을 올리면 예전 주소는 400 '없는 서비스'로 응답합니다. 응답 항목 이름은 그대로)

받은 원본은 data/kapt/list/<시군구>.json, data/kapt/info/<단지코드>.json 에 둡니다.
K-apt 에는 의무관리대상(대략 150세대 이상) 단지만 있어 작은 단지는 정보가 없을 수 있어요.
"""
from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

import requests

from .molit import MolitError, _norm_name, portal_down, portal_result

LIST_URL = "https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4"
BASS_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5"
DTL_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5"
REFRESH_DAYS = 180  # 단지 정보는 잘 안 바뀌어서 반년마다 다시 받음
EMPTY_RETRY_DAYS = 14  # 세대수 등이 비어 온 단지(새 단지·등록 중)는 두 주 뒤 다시
BLANK_STOP = 20        # 기본·상세가 모두 빈 응답이 이만큼 연달아 오면 이번 실행은 멈춤
BLANK_RETRY_DAYS = 3   # 빈 응답만 온 단지는 표시해 두고 사흘 뒤 다시 (같은 단지들이 매번 맨 앞에서 '연달아 빈 응답'으로 막지 않게)
BLANK_WAITS = (3, 10, None)   # 빈 응답이면 3초, 10초 쉬었다 다시 (세 번째도 비면 빈 응답으로)
PAUSE = 0.3            # 단지 사이 쉬는 시간 (빨리 부르면 빈 응답이 옴)
# 배포 뒤 이어 받기: 포털 오류가 세 번 연달아 오면 이만큼 쉬었다가 다음 단지부터 다시.
# 서울에서 70곳쯤 받으면 'HTTP 에러'가 시작되고 1분·3분 쉬어도 바로 다시 실패해서, 마지막엔 10분 쉬어 봄
SLOW_COOLS = (60, 180, 600)
SLOW_TIME = 1200   # 배포 뒤 이어 받기의 단지 정보 시간 상한 (쉬는 시간 포함)
SHOWN = ("hh", "dongs", "ppu", "top", "use", "heat", "hall", "elev", "evc", "builder", "mgr")   # 화면에 쓰는 항목


def parse(text: str) -> tuple[list[dict], int]:
    """응답(JSON 또는 XML)에서 항목 목록과 전체 건수를 꺼냅니다."""
    t = text.lstrip()
    if t.startswith("<"):
        try:
            root = ET.fromstring(t)
        except ET.ParseError as e:
            raise MolitError(f"XML 파싱 실패: {t[:200]!r}") from e
        auth = root.findtext(".//returnAuthMsg")
        if auth:
            raise MolitError(f"포털 오류: {auth} ({root.findtext('.//returnReasonCode')})")   # 인증 키·없는 서비스·호출 한도 등
        code = (root.findtext(".//resultCode") or "").strip()
        if code not in ("00", "000"):
            raise MolitError(f"API 오류 {code}: {root.findtext('.//resultMsg')}")
        items = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
        return items, int((root.findtext(".//totalCount") or "0").strip() or 0) or len(items)
    try:
        data = json.loads(t)
    except ValueError as e:
        raise MolitError(f"응답 파싱 실패: {t[:200]!r}") from e
    gw = data.get("OpenAPI_ServiceResponse") if isinstance(data, dict) else None
    if gw is not None:
        # 포털 게이트웨이 오류가 JSON 으로 올 때 (예: HTTP 에러 04). 예전엔 header 가 없어 '빈 정상 응답'으로 읽혀
        # 관리비 '공개 달 없음', 단지 정보 '빈 응답', 단지 목록 0곳(받아 둔 목록을 덮어씀)이 됐습니다.
        h = (gw or {}).get("cmmMsgHeader") or {}
        raise MolitError(f"포털 오류: {h.get('returnAuthMsg') or h.get('errMsg')} ({h.get('returnReasonCode')})")
    resp = data.get("response", data)
    head = resp.get("header") or {}
    code = str(head.get("resultCode", "00")).strip()
    if code not in ("00", "000"):
        raise MolitError(f"API 오류 {code}: {head.get('resultMsg')}")
    body = resp.get("body") or {}
    raw = body.get("items", body.get("item"))
    if isinstance(raw, dict) and "item" in raw:
        raw = raw["item"]
    items = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
    items = [{k: ("" if v is None else str(v).strip()) for k, v in it.items()} for it in items]
    return items, int(body.get("totalCount") or 0) or len(items)


def _get(s: requests.Session, url: str, params: dict, retries: int = 3) -> tuple[list[dict], int]:
    if portal_down():
        raise MolitError("공공데이터포털 연결 안 됨 (이번 실행은 건너뜀)")
    for attempt in range(retries):
        try:
            r = s.get(url, params=params, timeout=(10, 30))
            if r.status_code >= 400:
                # 포털 게이트웨이 오류는 본문 XML에 이유가 있어(인증 오류, 없는 서비스 등) 그것을 남깁니다
                parse(r.text)
                r.raise_for_status()
            got = parse(r.text)
            portal_result(None)
            return got
        except (requests.RequestException, MolitError) as e:
            portal_result(e)
            if attempt == retries - 1 or portal_down():
                raise
            time.sleep(2 ** attempt)
    return [], 0


def fetch_list(key: str, sgg: str, session=None, rows: int = 1000) -> list[dict]:
    s = session or requests.Session()
    page, out = 1, []
    while True:
        items, total = _get(s, LIST_URL, {"serviceKey": key, "sigunguCode": sgg, "pageNo": page, "numOfRows": rows})
        out.extend(items)
        if not items or len(out) >= total:
            return out
        page += 1


def collect(key: str, districts: dict[str, str], root: Path, budget: int | None = None, log=print,
            time_limit: float = 600, cools: tuple[int, ...] = ()) -> None:
    """단지 목록(시군구별)은 매번, 단지별 기본·상세 정보는 없거나 오래된 것만 받습니다.
    배포 전 단계에서 돌므로 time_limit 초가 지나면 멈추고 나머지는 다음 실행 때 받습니다.
    cools: 포털 오류가 세 번 연달아 올 때 멈추는 대신 쉴 초 (차례로 한 번씩, 다 쓰면 멈춤).
    다른 API(관리비·실거래)를 몰아서 부른 직후엔 포털이 'HTTP 에러'를 잠깐 줘서, 서울은 매번 한 곳만 받고 멈췄음"""
    s = requests.Session()
    (root / "list").mkdir(parents=True, exist_ok=True)
    (root / "info").mkdir(parents=True, exist_ok=True)
    codes = []
    for sgg, name in districts.items():
        path = root / "list" / f"{sgg}.json"
        try:
            items = fetch_list(key, sgg, s)
            if not items and path.exists() and json.loads(path.read_text(encoding="utf-8")):
                raise MolitError("목록이 비어 옴")   # 받아 둔 목록을 빈 목록으로 덮지 않음
            path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
        except (requests.RequestException, MolitError) as e:
            if not path.exists():
                raise
            log(f"::warning::{name} 단지 목록 받기 실패, 받아 둔 목록 사용: {e}")
            items = json.loads(path.read_text(encoding="utf-8"))
        codes += [it["kaptCode"] for it in items if it.get("kaptCode")]
    old = (date.today() - timedelta(days=REFRESH_DAYS)).isoformat()
    old_empty = (date.today() - timedelta(days=EMPTY_RETRY_DAYS)).isoformat()
    old_blank = (date.today() - timedelta(days=BLANK_RETRY_DAYS)).isoformat()
    todo = []
    for c in codes:
        p = root / "info" / f"{c}.json"
        got = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        if "_blank" in got:
            if got["_blank"] < old_blank:
                todo.append((0, c))   # 사흘 전에 빈 응답이었던 단지: 다시
            continue
        if not any(k != "_at" for k in got):
            todo.append((0, c))   # 아직 없거나, 예전에 빈 응답만 받아 둔 단지: 바로 받음
        else:
            empty = not any(summarize(got).get(k) for k in SHOWN)
            if got.get("_at", "") < (old_empty if empty else old):
                todo.append((1, c))
    todo.sort()  # 처음 받는 단지 먼저
    used, fails, done, blank, blank_run = 0, 0, 0, 0, 0
    cools = list(cools)
    t0 = time.monotonic()
    for _, c in todo:
        if (budget is not None and used + 2 > budget) or time.monotonic() - t0 > time_limit:
            log(f"::notice::단지 정보 {done}곳 받음, 나머지는 다음 실행 때 받습니다")
            break
        try:
            for wait in BLANK_WAITS:   # 몰아서 부르면 포털이 빈 응답을 줄 때가 있어, 비면 쉬었다가 다시
                bass, _ = _get(s, BASS_URL, {"serviceKey": key, "kaptCode": c})
                dtl, _ = _get(s, DTL_URL, {"serviceKey": key, "kaptCode": c})
                used += 2
                if bass or dtl or wait is None:
                    break
                time.sleep(wait)
            time.sleep(PAUSE)
        except (requests.RequestException, MolitError) as e:
            fails += 1
            log(f"::warning::단지 정보 {c} 받기 실패: {e}")
            if fails >= 3 and cools and not portal_down():
                wait = cools.pop(0)
                log(f"::notice::단지 정보 포털 오류가 연달아 와서 {wait}초 쉬었다가 다음 단지부터 다시")
                time.sleep(wait)
                fails = 0
            elif fails >= 3:
                log("::warning::여러 번 연달아 실패해 단지 정보는 여기까지 받습니다")
                break
            continue
        fails = 0
        if not bass and not dtl:
            # 기본·상세가 모두 빈 응답: 정보 없이 '빈 응답'만 표시해 두고 사흘 뒤 다시
            # (저장하지 않으면 같은 단지들이 다음 실행에도 맨 앞에 와서 '연달아 빈 응답'으로 또 멈춤. 서울에서 매번 두 곳만 받고 멈췄음)
            (root / "info" / f"{c}.json").write_text(json.dumps({"_blank": date.today().isoformat()}), encoding="utf-8")
            blank, blank_run = blank + 1, blank_run + 1
            if blank_run >= BLANK_STOP:
                log(f"::warning::단지 정보가 {BLANK_STOP}곳 연달아 비어 와서 여기까지 받습니다 (포털 쪽 문제일 수 있어 다음 실행 때 다시)")
                break
            continue
        blank_run = 0
        info = {**(dtl[0] if dtl else {}), **(bass[0] if bass else {}), "_at": date.today().isoformat()}
        (root / "info" / f"{c}.json").write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        done += 1
    log(f"단지 정보: 목록 {len(codes):,}곳, 받을 곳 {len(todo):,}곳 중 이번에 {done:,}곳 받음"
        + (f", 빈 응답 {blank:,}곳은 사흘 뒤 다시" if blank else ""))


def _num(v) -> int | None:
    """'1,272' · '1272' · '1272.0'(V5 응답) → 1272. 숫자만 남기면 '1272.0'이 12720이 되므로 실수로 읽습니다."""
    s = str(v if v is not None else "").replace(",", "").strip()
    if not s:
        return None
    try:
        return int(round(float(s)))
    except ValueError:
        m = re.search(r"\d+(?:\.\d+)?", s)
        return int(round(float(m.group()))) if m else None


def summarize(it: dict) -> dict:
    """원본 항목 → 화면에 쓰는 값만."""
    hh = _num(it.get("kaptdaCnt"))
    pk = sum(n for n in (_num(it.get("kaptdPcnt")), _num(it.get("kaptdPcntu"))) if n) or None
    ev = sum(n for n in (_num(it.get("groundElChargerCnt")), _num(it.get("undergroundElChargerCnt"))) if n) or None
    use = re.sub(r"[^\d]", "", it.get("kaptUsedate", ""))
    out = {
        "code": it.get("kaptCode"), "name": it.get("kaptName"),
        "hh": hh, "dongs": _num(it.get("kaptDongCnt")), "top": _num(it.get("kaptTopFloor")),
        "base": _num(it.get("kaptBaseFloor")),
        "use": f"{use[:4]}.{use[4:6]}" if len(use) >= 6 else None,
        "park": pk, "park_up": _num(it.get("kaptdPcnt")), "park_dn": _num(it.get("kaptdPcntu")),
        "ppu": round(pk / hh, 2) if pk and hh else None,
        "heat": it.get("codeHeatNm") or None, "hall": it.get("codeHallNm") or None,
        "builder": it.get("kaptBcompany") or None, "mgr": it.get("codeMgrNm") or None,
        "elev": _num(it.get("kaptdEcnt")), "evc": ev, "cctv": _num(it.get("kaptdCccnt")),
        "marea": _num(it.get("kaptMarea")),   # 관리비 부과면적(㎡): 관리비 ㎡당 금액에 씀
    }
    return {k: v for k, v in out.items() if v not in (None, "", 0) or k in ("code",)}


_JIBUN = re.compile(r"^(산\s?)?\d+(-\d+)?(번지)?$")


def _addr_jibun(addr: str) -> str | None:
    for tok in (addr or "").replace(",", " ").split():
        tok = tok.strip(".()")
        if _JIBUN.match(tok):
            return tok.replace("번지", "").replace(" ", "")
    return None


def _plain_addr(addr: str) -> str:
    """'대전광역시 서구 둔산동 920 크로바아파트' → '대전광역시 서구 둔산동 920' (주소 검색이 잘 되게 단지명을 뗌)."""
    out = []
    for tok in (addr or "").replace(",", " ").split():
        out.append(tok)
        if _JIBUN.match(tok.strip(".()")):
            return " ".join(out)
    return ""


def locate(root: Path, districts: dict[str, str], client, region: str = "", log=print) -> None:
    """지번·이름으로 못 잇는 단지를 위해 단지 주소를 카카오로 좌표로 바꿔 data/kapt/geo.json 에 둡니다 (처음 한 번만)."""
    path = root / "geo.json"
    geo = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    new = 0
    for sgg in districts:
        p = root / "list" / f"{sgg}.json"
        if not p.exists():
            continue
        for it in json.loads(p.read_text(encoding="utf-8")):
            code = it.get("kaptCode")
            if not code or code in geo:
                continue
            ip = root / "info" / f"{code}.json"
            info = json.loads(ip.read_text(encoding="utf-8")) if ip.exists() else {}
            addr = _plain_addr(info.get("kaptAddr", "")) or info.get("doroJuso")
            if not addr:
                continue
            try:
                ll = client.geocode(addr, [f"{region} {it.get('kaptName', '')}".strip()])
            except Exception as e:   # 좌표를 못 구해도 지번·이름으로 잇는 것은 그대로
                log(f"::warning::단지 정보 좌표 찾기 실패: {type(e).__name__}")
                break
            geo[code] = list(ll) if ll else None
            new += 1
    path.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    if new:
        log(f"단지 정보 좌표: 이번에 {new}곳 찾음 (모두 {sum(1 for v in geo.values() if v)}곳)")


def load(root: Path, districts: dict[str, str]) -> list[dict]:
    """받아 둔 목록·정보를 합쳐 [{gu, dong, jibun, name, ...정보}] 로."""
    out = []
    gp = root / "geo.json"
    geo = json.loads(gp.read_text(encoding="utf-8")) if gp.exists() else {}
    for sgg, gu in districts.items():
        p = root / "list" / f"{sgg}.json"
        if not p.exists():
            continue
        for it in json.loads(p.read_text(encoding="utf-8")):
            ip = root / "info" / f"{it.get('kaptCode')}.json"
            info = json.loads(ip.read_text(encoding="utf-8")) if ip.exists() else {}
            dong = " ".join(x for x in (it.get("as3"), it.get("as4")) if x)
            out.append({"gu": gu, "dong": dong, "jibun": _addr_jibun(info.get("kaptAddr", "")),
                        "key": _norm_name(it.get("kaptName", "")), "ll": geo.get(it.get("kaptCode")),
                        **summarize({**it, **info})})
    return out


_SUFFIX = re.compile(r"(아파트|APT|apt)$")


def _base_name(n: str) -> str:
    return _SUFFIX.sub("", _norm_name(n))


def _score(a: str, b: str) -> int:
    """이름이 얼마나 비슷한지: 같음 3, 한쪽이 다른 쪽을 품음 2, 앞 두 글자 같음 1."""
    a, b = _base_name(a), _base_name(b)
    if not a or not b:
        return 0
    if a == b:
        return 3
    return 2 if (a in b or b in a) else 1 if a[:2] == b[:2] else 0


def _sim(a: str, b: str) -> float:
    """두 글자씩 끊은 조각이 짧은 쪽 기준으로 얼마나 겹치는지 (0~1). 단지 번호가 어긋나면 0.
    '열매7단지현대' ↔ '노은열매마을7단지현대' 0.83, '새뜸마을 9단지 (2-2 예미지)' ↔ '새뜸마을9단지' 1.0, 7단지 ↔ 8단지 0."""
    a, b = _base_name(a), _base_name(b)
    da, db = set(re.findall(r"\d+", a)), set(re.findall(r"\d+", b))
    if da and db and not (da <= db or db <= da):
        return 0.0
    ua, ub = set(re.findall(r"(\d+)단지", a)), set(re.findall(r"(\d+)단지", b))
    if ua and ub and ua != ub:   # '도램마을17단지(…) L5블럭' 과 '도램마을5단지' 는 다른 단지
        return 0.0
    ga, gb = {a[i:i + 2] for i in range(len(a) - 1)}, {b[i:i + 2] for i in range(len(b) - 1)}
    if min(len(ga), len(gb)) < 3:
        return 0.0
    return len(ga & gb) / min(len(ga), len(gb))


def _too_few(c: dict, k: dict) -> bool:
    """좌표로만 이을 때: 거래 수가 세대수의 1/20도 안 되면(큰 단지 옆 빌라 등) 같은 단지로 보지 않음."""
    return bool(k.get("hh")) and c.get("n") is not None and c["n"] < k["hh"] / 20


def _dist(a, b) -> float:
    import math
    dy = (a[0] - b[0]) * 111_000
    dx = (a[1] - b[1]) * 111_000 * math.cos(math.radians(a[0]))
    return (dx * dx + dy * dy) ** 0.5


def match(complexes: list[dict], kapt: list[dict], geo: dict | None = None, log=None) -> dict[str, dict]:
    """매매 단지(complex_id, gu, dong, jibun, name) → K-apt 정보.
    1) 같은 구·동에서 지번이 같으면(본번만 같아도) 그 단지, 여럿이면 이름이 더 비슷한 쪽
    2) 지번으로 못 찾으면 같은 동에서 이름이 하나만 비슷한 단지
    3) 그래도 못 찾으면 같은 동에서 이름 조각이 가장 많이 겹치는 단지 (0.6 이상, 둘째와 0.15 넘게 차이)
    4) 그래도 못 찾으면 좌표(geo: 매매 단지 좌표, K-apt 주소 좌표)로 가까운 단지: 60m 안이거나, 150m 안에서 이름이 비슷하면
    5) 끝으로 같은 동에서 서로가 서로의 가장 가까운 단지이고 200m 안이면 (세종처럼 실거래는 블록·브랜드 이름,
       K-apt 는 마을 이름인 경우). 작은 빌라가 큰 단지 정보를 잘못 받지 않게, 거래 수(c['n'])가 세대수의 1/20 이상일 때만"""
    empty = [k for k in kapt if not any(k.get(f) for f in SHOWN)]
    kapt = [k for k in kapt if any(k.get(f) for f in SHOWN)]   # 세대수 등이 빈 정보는 이어도 보여 줄 게 없어 뺌
    by_dong: dict[tuple, list] = {}
    for k in kapt:
        by_dong.setdefault((k["gu"], k["dong"]), []).append(k)
    out, how = {}, {"지번": 0, "이름": 0, "이름 조각": 0, "좌표": 0, "서로 가장 가까움": 0}
    new = []   # 3)·5)로 이은 것: 로그로 확인
    strip = ("gu", "dong", "jibun", "key", "ll")

    for c in complexes:
        cands = by_dong.get((c["gu"], c["dong"]), [])
        if not cands:
            continue
        jb, nm = str(c.get("jibun") or ""), c.get("name", "")
        hit = [k for k in cands if k["jibun"] and k["jibun"] == jb]
        if not hit and jb:
            main = jb.split("-")[0]
            hit = [k for k in cands if k["jibun"] and k["jibun"].split("-")[0] == main]
        if hit:
            best = max(hit, key=lambda k: _score(nm, k["key"]))
            how["지번"] += 1
        else:
            named = [k for k in cands if _score(nm, k["key"]) >= 2 and len(_base_name(nm)) >= 2]
            if len(named) == 1:
                best = named[0]
                how["이름"] += 1
            else:
                sims = sorted(((_sim(nm, k.get("name") or k["key"]), i) for i, k in enumerate(cands)), reverse=True)
                if not sims or sims[0][0] < 0.6 or (len(sims) > 1 and sims[0][0] - sims[1][0] <= 0.15):
                    continue
                best = cands[sims[0][1]]
                how["이름 조각"] += 1
                new.append(f"[이름 조각] {nm} ↔ {best.get('name')} ({sims[0][0]:.2f})")
        out[c["complex_id"]] = {k: v for k, v in best.items() if k not in strip}

    if geo:
        used = {v["code"] for v in out.values()}
        left = [c for c in complexes if c["complex_id"] not in out and geo.get(c["complex_id"])]
        for k in kapt:
            if k["code"] in used or not k.get("ll"):
                continue
            near = []
            for c in left:
                if c["complex_id"] in out or (c["gu"] and k["gu"] and c["gu"] != k["gu"]) or _too_few(c, k):
                    continue
                d = _dist(k["ll"], geo[c["complex_id"]])
                if d <= 150:
                    near.append((-_score(c.get("name", ""), k["key"]), d, c))
            for neg, d, c in sorted(near, key=lambda x: (x[0], x[1])):
                if d <= 60 or -neg >= 1:
                    out[c["complex_id"]] = {kk: v for kk, v in k.items() if kk not in strip}
                    used.add(k["code"])
                    how["좌표"] += 1
                break
        # 5) 서로 가장 가까운 짝 (같은 동, 200m 안)
        used = {v["code"] for v in out.values()}
        ks = [k for k in kapt if k["code"] not in used and k.get("ll")]
        cs = [c for c in complexes if c["complex_id"] not in out and geo.get(c["complex_id"])]
        same = lambda c, k: c["gu"] == k["gu"] and c["dong"] == k["dong"]
        for k in ks:
            near_c = min((c for c in cs if same(c, k)), key=lambda c: _dist(k["ll"], geo[c["complex_id"]]), default=None)
            if not near_c or near_c["complex_id"] in out:
                continue
            d = _dist(k["ll"], geo[near_c["complex_id"]])
            if d > 200 or _too_few(near_c, k):
                continue
            back = min((kk for kk in ks if same(near_c, kk)), key=lambda kk: _dist(kk["ll"], geo[near_c["complex_id"]]))
            if back is not k:
                continue
            out[near_c["complex_id"]] = {kk: v for kk, v in k.items() if kk not in strip}
            how["서로 가장 가까움"] += 1
            new.append(f"[서로 가장 가까움] {near_c['name']} ↔ {k.get('name')} ({d:.0f}m)")

    if log:
        used = {v["code"] for v in out.values()}
        miss = [k for k in kapt if k["code"] not in used]
        log("단지 정보 잇기: " + ", ".join(f"{k} {v}곳" for k, v in how.items()) + f" / 못 이은 단지 정보 {len(miss)}곳"
            + (f" (정보가 비어 있어 뺀 곳 {len(empty)}곳, 두 주 뒤 다시 받음)" if empty else ""))
        for line in new[:25]:
            log(line)
        for k in sorted(miss, key=lambda k: -(k.get("hh") or 0))[:15]:
            cands = [c for c in complexes if c["gu"] == k["gu"] and c["dong"] == k["dong"]]
            near = ", ".join(f"{c['name']}({c.get('jibun')})" for c in cands[:6]) or "같은 동에 실거래 단지 없음"
            log(f"[못 이음] {k.get('name')} {k['dong']} {k['jibun']} {k.get('hh') or '-'}세대 ← 같은 동: {near}")
    return out
