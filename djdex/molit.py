"""국토교통부 아파트 매매 실거래가 API 수집과 정규화.

API: 공공데이터포털 '국토교통부_아파트 매매 실거래가 상세 자료'
요청 파라미터: serviceKey, LAWD_CD(시군구 5자리), DEAL_YMD(YYYYMM), pageNo, numOfRows
"""
from __future__ import annotations

import json
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
                r = s.get(endpoint, params=params, timeout=30)
                r.raise_for_status()
                batch, total = parse_response(r.text)
                break
            except (requests.RequestException, MolitError):
                if attempt == retries - 1:
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


def normalize(raw: dict, districts: dict[str, str]) -> dict | None:
    """API 원본 항목을 분석용 한 줄로 바꿉니다. 필수값이 없으면 None."""
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
        "cancelled": (raw.get("cdealType") or "").strip().upper() == "O",
        "direct": (raw.get("dealingGbn") or "").strip() == "직거래",
    }


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
    log=print,
) -> None:
    """원본 응답을 data/raw/<구코드>/<YYYYMM>.json 으로 캐시합니다. 이미 있는 달은 건너뜁니다."""
    s = requests.Session()
    for lawd in districts:
        for ym in months:
            path = raw_dir / lawd / f"{ym}.json"
            if path.exists() and ym not in refresh:
                continue
            items = fetch_month(service_key, lawd, ym, endpoint, rows, session=s)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
            log(f"{districts[lawd]} {ym}: {len(items)}건")


def load_raw(raw_dir: Path, districts: dict[str, str]) -> list[dict]:
    rows = []
    for path in sorted(raw_dir.glob("*/*.json")):
        for item in json.loads(path.read_text(encoding="utf-8")):
            row = normalize(item, districts)
            if row:
                rows.append(row)
    return rows
