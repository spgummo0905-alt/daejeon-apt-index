"""입주 예정 물량: 청약홈 APT 분양 공고에서 단지별 입주 예정 연월과 공급 세대수를 모아 구(동)별로 봅니다.

API (공공데이터포털, 매매 실거래와 같은 인증키, 활용신청 필요)
- 한국부동산원_청약홈 분양정보 조회 서비스: ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail
  주요 항목: HOUSE_MANAGE_NO(주택관리번호) HOUSE_NM(주택명) HSSPLY_ADRES(공급위치) TOT_SUPLY_HSHLDCO(공급규모)
            MVN_PREARNGE_YM(입주예정월 YYYYMM) RCRIT_PBLANC_DE(모집공고일) SUBSCRPT_AREA_CODE_NM(공급지역명)

입주가 한꺼번에 몰리면 그 동네 전세가가 흔들리고, 매수 뒤 세입자를 구하기도 어려워집니다. 그래서 임장 갈 동네의
앞으로 1~3년 입주 물량을 함께 봅니다. 공급규모는 청약 공고 세대수라, 재개발·재건축은 조합원 몫이 빠져 실제 입주
세대보다 적을 수 있습니다.

결과는 data/<지역>/movein.json {asof, rows: [{id, name, addr, area, hh, ym, notice}]}. 새로 받지 못하면 지난번 것을 씁니다.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

import requests

URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail"
PER = 500
FIELDS = {   # 화면에 쓰는 항목 → API 이름 후보 (대·소문자가 섞여 오는 경우가 있어 함께 봄)
    "id": ("HOUSE_MANAGE_NO", "houseManageNo"),
    "name": ("HOUSE_NM", "houseNm"),
    "addr": ("HSSPLY_ADRES", "hssplyAdres"),
    "hh": ("TOT_SUPLY_HSHLDCO", "totSuplyHshldco"),
    "ym": ("MVN_PREARNGE_YM", "mvnPrearngeYm"),
    "notice": ("RCRIT_PBLANC_DE", "rcritPblancDe"),
    "area_nm": ("SUBSCRPT_AREA_CODE_NM", "subscrptAreaCodeNm"),
}


def _get(row: dict, key: str):
    for k in FIELDS[key]:
        if row.get(k) not in (None, ""):
            return row[k]
    return None


def parse(rows: list[dict], region: str, areas: list[str], addr_has: str = "") -> list[dict]:
    """공고 목록 → 이 지역 단지만 [{id, name, addr, area, hh, ym, notice}] (같은 주택관리번호는 하나로).
    areas: 구(또는 동) 이름들. 공급위치 주소에서 처음 맞는 이름을 area 로 씁니다."""
    out: dict[str, dict] = {}
    for r in rows:
        nm, addr = _get(r, "area_nm") or "", _get(r, "addr") or ""
        if region not in nm and region not in addr:
            continue
        if addr_has and addr_has not in addr:
            continue
        ym = re.sub(r"\D", "", str(_get(r, "ym") or ""))[:6]
        try:
            hh = int(float(_get(r, "hh") or 0))
        except ValueError:
            hh = 0
        if len(ym) != 6 or hh <= 0:
            continue
        toks = addr.split()
        area = next((a for a in areas if a in toks), None) or next((a for a in areas if a in addr), None) or ""
        rid = str(_get(r, "id") or (_get(r, "name") or "") + ym)
        old = out.get(rid)
        if old is None or hh > old["hh"]:   # 같은 단지의 정정·추가 공고는 큰 쪽
            out[rid] = {"id": rid, "name": (_get(r, "name") or "").strip(), "addr": addr, "area": area,
                        "hh": hh, "ym": ym, "notice": str(_get(r, "notice") or "")[:10]}
    return sorted(out.values(), key=lambda x: (x["ym"], x["name"]))


def collect(key: str, region: str, areas: list[str], path: Path, addr_has: str = "", log=print, session=None) -> list[dict]:
    old = load(path)
    s = session or requests.Session()
    rows, page = [], 1
    try:
        while True:
            params = {"page": page, "perPage": PER, "serviceKey": key, "cond[SUBSCRPT_AREA_CODE_NM::EQ]": region}
            r = s.get(URL, params=params, timeout=(10, 60))
            if r.status_code in (401, 403):
                log(f"::warning::[입주 물량] 청약홈 분양정보 API 를 쓸 수 없습니다 ({r.status_code}, 활용신청 승인 전이면 정상). 지난번 자료를 씁니다")
                return old
            r.raise_for_status()
            d = r.json()
            data = d.get("data") or []
            rows += data
            if not data or page * PER >= int(d.get("matchCount") or d.get("totalCount") or 0):
                break
            page += 1
    except (requests.RequestException, ValueError) as e:   # 오류 문장에는 키가 든 주소가 섞일 수 있어 종류·상태만 남김
        code = getattr(getattr(e, "response", None), "status_code", "")
        log(f"::warning::[입주 물량] 받지 못해 지난번 자료를 씁니다: {type(e).__name__} {code}".rstrip())
        return old
    res = parse(rows, region, areas, addr_has)
    if rows and not res:
        log(f"[입주 물량] 공고 {len(rows)}건을 받았지만 항목 이름이 달라 읽지 못했습니다: {sorted(rows[0])[:20]}")
        return old
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"asof": date.today().isoformat(), "rows": res}, ensure_ascii=False, indent=0), encoding="utf-8")
    log(f"[입주 물량] 공고 {len(rows):,}건 중 {region} 단지 {len(res):,}곳")
    return res


def load(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")).get("rows", []) if path.exists() else []


def view(rows: list[dict], areas: list[str], today: date | None = None, years: int = 3) -> dict | None:
    """첫 화면 '입주 예정 물량': 올해부터 3년, 구(동)별 세대수와 다가오는 단지. 앞으로 입주할 단지가 없으면 None."""
    t = today or date.today()
    now = f"{t.year:04d}{t.month:02d}"
    yrs = [t.year + k for k in range(years)]
    up = [r for r in rows if r["ym"] >= now and int(r["ym"][:4]) in yrs]
    if not up:
        return None
    by = {a: {y: 0 for y in yrs} for a in areas}
    for r in up:   # 구(동)는 화면의 구·동 이름으로 주소에서 다시 찾음 (세종처럼 동으로 묶는 지역)
        toks = r["addr"].split()
        a = next((a for a in areas if a in toks), None) or next((a for a in areas if a in r["addr"]), None)
        r["area"] = a or r["area"]
        if a:
            by[a][int(r["ym"][:4])] += r["hh"]
    total = {y: sum(r["hh"] for r in up if int(r["ym"][:4]) == y) for y in yrs}
    mx = max([v for a in by.values() for v in a.values()] + [1])
    table = [{"area": a, "vals": [by[a][y] for y in yrs], "w": [round(by[a][y] / mx * 100, 1) for y in yrs]}
             for a in areas if any(by[a].values())]
    table.sort(key=lambda x: -sum(x["vals"]))
    soon = [dict(r, when=f"{r['ym'][:4]}.{r['ym'][4:]}") for r in up][:8]
    return {"years": yrs, "total": [total[y] for y in yrs], "table": table, "soon": soon,
            "from": f"{t.year}.{t.month:02d}"}
