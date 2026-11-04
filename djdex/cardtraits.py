"""단지 카드의 개성: 생활 타입 · 특징 도장 · 같은 조합 수 · 도감 번호.

원칙
- 단지 데이터(이미 있는 값)에서만 계산합니다. 값이 없으면 그 항목은 건너뜁니다(지어내지 않음).
- 판단어 없이 숫자 기준입니다. 등급(점수)과 섞이지 않습니다. 금속 질감은 S·A 등급 전용으로 남깁니다.
- 브라우저(canvas)와 서버(미리보기 그림)는 여기서 계산한 값을 받아 그리기만 합니다. 규칙은 이 파일 한 곳에만 둡니다.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

REG_DIR = Path(__file__).resolve().parent / "card_numbers"

# 생활 타입: (키, 이름, 값을 읽는 열, 높을수록 앞서는가)
TYPES = [
    ("sub", "지하철형", "subway_raw", False),
    ("rail", "기차역형", "rail_raw", False),
    ("sch", "학교형", "elementary_raw", False),
    ("aca", "학원가형", "hub_raw", True),
    ("mart", "장보기형", "mart_raw", False),
    ("hosp", "병원형", "hospital_raw", True),
    ("new", "새집형", "build_year", True),
    ("big", "큰단지형", "hh", True),
]
TYPE_NAME = {k: n for k, n, _, _ in TYPES}

# 특징 도장 (절대 기준). 상위 20% 기준 도장은 도시 분포로 정해집니다.
STAMPS = {
    "sub": "지하철 500m 이내",
    "sch": "초등학교 250m 이내",
    "aca": "학원가 점수 상위 20%",
    "mart": "대형마트 300m 이내",
    "hosp": "병원 수 상위 20%",
    "new": "준공 5년 이내",
    "big": "1,000세대 이상",
}
STAMP_ORDER = list(STAMPS)


def _num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if v != v else v


def _metric(row: dict, col: str):
    if col == "hh":
        v = _num(row.get("hh"))
        return v if v and v > 0 else None
    if col == "build_year":
        v = _num(row.get("build_year"))
        return v if v and v > 1900 else None
    return _num(row.get(col))


def _pct(sorted_vals: list[float], v: float, higher_better: bool) -> float:
    """도시 안에서 이 값보다 못한 단지 비율(동점은 절반). 클수록 앞섭니다."""
    n = len(sorted_vals)
    worse = sum(1 for x in sorted_vals if (x < v if higher_better else x > v))
    same = sum(1 for x in sorted_vals if x == v)
    return (worse + 0.5 * same) / n


def _p80(vals: list[float]) -> float | None:
    if len(vals) < 10:
        return None
    s = sorted(vals)
    return s[int(len(s) * 0.8)]


def stamps_of(row: dict, p80: dict) -> list[str]:
    out = []
    v = _metric(row, "subway_raw")
    if v is not None and v <= 500:
        out.append("sub")
    v = _metric(row, "elementary_raw")
    if v is not None and v <= 250:
        out.append("sch")
    v = _metric(row, "hub_raw")
    if v is not None and p80.get("aca") is not None and v > 0 and v >= p80["aca"]:
        out.append("aca")
    v = _metric(row, "mart_raw")
    if v is not None and v <= 300:
        out.append("mart")
    v = _metric(row, "hospital_raw")
    if v is not None and p80.get("hosp") is not None and v > 0 and v >= p80["hosp"]:
        out.append("hosp")
    if row.get("is_new"):
        out.append("new")
    v = _metric(row, "hh")
    if v is not None and v >= 1000:
        out.append("big")
    return out


def main_type(row: dict, pools: dict) -> str | None:
    """그 단지의 항목 중 도시 안에서 가장 앞선 것 하나 (동점이면 TYPES 순서)."""
    best, best_p = None, -1.0
    for key, _, col, hb in TYPES:
        v = _metric(row, col)
        pool = pools.get(col)
        if v is None or not pool:
            continue
        p = _pct(pool, v, hb)
        if p > best_p + 1e-9:
            best, best_p = key, p
    return best


def load_registry(region: str) -> dict:
    f = REG_DIR / f"{region}.json"
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def assign_numbers(rows: list[dict], registry: dict) -> dict:
    """구별 묶음 도감 번호. 등록된 번호는 바뀌지 않고, 새 단지는 그 구의 마지막 번호 다음부터 (슬러그 순)."""
    nxt: dict[str, int] = {}
    for gu, no in registry.values():
        nxt[gu] = max(nxt.get(gu, 0), int(no))
    out = {}
    fresh = sorted((r for r in rows if r["slug"] not in registry), key=lambda r: str(r["slug"]))
    for r in rows:
        if r["slug"] in registry:
            gu, no = registry[r["slug"]]
            out[r["slug"]] = (gu, int(no))
    for r in fresh:
        gu = str(r.get("gu") or "")
        nxt[gu] = nxt.get(gu, 0) + 1
        out[r["slug"]] = (gu, nxt[gu])
    return out


def compute(rows: list[dict], region: str) -> dict:
    """slug → {t: 주 타입 키, m: 도장 키 목록, n: 같은 도장 조합인 단지 수, g: 구, no: 구별 번호}"""
    pools = {}
    for _, _, col, _ in TYPES:
        vals = [v for v in (_metric(r, col) for r in rows) if v is not None]
        if vals:
            pools[col] = sorted(vals)
    p80 = {"aca": _p80(pools.get("hub_raw", [])), "hosp": _p80(pools.get("hospital_raw", []))}
    st = {r["slug"]: stamps_of(r, p80) for r in rows}
    combo = Counter(tuple(v) for v in st.values())
    nums = assign_numbers(rows, load_registry(region))
    out = {}
    for r in rows:
        s = r["slug"]
        gu, no = nums[s]
        out[s] = {"t": main_type(r, pools), "m": st[s], "n": combo[tuple(st[s])], "g": gu, "no": no}
    return out


def pack(ct: dict) -> list:
    """complexes.json 에 넣는 짧은 모양: [타입키, 도장 글자들, 조합 수, 번호]"""
    return [ct["t"], "".join(STAMP_ORDER.index(k).__str__() for k in ct["m"]), ct["n"], ct["no"]]
