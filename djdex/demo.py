"""API 키 없이 화면과 계산 흐름을 확인하기 위한 가짜 데이터.

이름, 위치, 가격 모두 무작위입니다. 실제 단지와 무관하며 배포용이 아닙니다.
"""
from __future__ import annotations

import math
import random

import pandas as pd

CENTER = (36.3504, 127.3845)  # 대전시청 부근


def generate(districts: dict[str, str], factors: list[dict], n_complexes: int = 60,
             start_year: int = 2010, end: str = "2026-08-31", seed: int = 7):
    rnd = random.Random(seed)
    gus = list(districts.values())
    center = _center(districts)
    end_ts = pd.Timestamp(end)
    trades, poi, geo = [], {}, {}
    for i in range(1, n_complexes + 1):
        cid = f"DEMO-{i:04d}"
        gu = gus[i % len(gus)]
        build_year = rnd.randint(1985, 2024)
        base = rnd.uniform(250, 650)          # 2010년 ㎡당 가격(만원)
        growth = rnd.uniform(-0.01, 0.06)     # 연 성장률
        first_year = max(start_year, build_year)
        small = i % 6 == 0  # 여섯 곳 중 하나는 거래가 드문 소규모 단지
        for _ in range(rnd.randint(6, 14) if small else rnd.randint(120, 260)):
            d = pd.Timestamp(year=rnd.randint(first_year, end_ts.year), month=rnd.randint(1, 12),
                             day=rnd.randint(1, 28))
            if d > end_ts:
                continue
            years = (d.year - start_year) + d.month / 12
            area = rnd.choice([59.9, 74.8, 84.9, 101.5, 114.7])
            ppm2 = base * (1 + growth) ** years * rnd.uniform(0.9, 1.1)
            trades.append({
                "complex_id": cid, "name": f"데모단지 {i:02d}", "gu": gu, "dong": f"데모{i % 7 + 1}동",
                "jibun": str(rnd.randint(1, 999)), "build_year": build_year, "area": area,
                "price": round(ppm2 * area), "date": d.strftime("%Y-%m-%d"),
                "floor": rnd.randint(1, 25), "cancelled": rnd.random() < 0.02,
                "direct": rnd.random() < 0.05, "kind": "매매",
            })
        stations = ["판암역", "대동역", "대전역", "중앙로역", "서대전네거리역", "용문역", "탄방역", "시청역",
                    "정부청사역", "갈마역", "월평역", "유성온천역", "노은역", "반석역"]
        poi.setdefault(cid, {})
        poi[cid] = {
            f["key"]: (rnd.choice([None, *[rnd.uniform(80, f["radius"]) for _ in range(9)]])
                       if f["kind"] == "nearest" else round(rnd.uniform(-5, 8), 1) if f["kind"] == "value"
                       else rnd.randint(0, 120))
            for f in factors
        }
        poi[cid]["subway_name"] = rnd.choice(stations) + " 대전1호선"
        geo[cid] = (center[0] + rnd.uniform(-0.06, 0.06), center[1] + rnd.uniform(-0.08, 0.08))
    # 입주 직전 신축: 매매 없이 분양권·입주권 거래만 있는 단지
    cid = "DEMO-NEW1"
    for k in range(40):
        d = end_ts - pd.Timedelta(days=rnd.randint(1, 360))
        area = rnd.choice([59.9, 84.9])
        trades.append({"complex_id": cid, "name": "데모신축", "gu": gus[2 % len(gus)], "dong": "데모3동", "jibun": "1",
                       "build_year": end_ts.year, "area": area, "price": round(area * rnd.uniform(800, 950)),
                       "date": d.strftime("%Y-%m-%d"), "floor": rnd.randint(1, 30), "cancelled": False,
                       "direct": False, "kind": "입주권" if k % 3 == 0 else "분양권"})
    poi[cid] = {f["key"]: (rnd.uniform(80, 600) if f["kind"] == "nearest" else rnd.randint(20, 120)) for f in factors}
    geo[cid] = (center[0] + 0.01, center[1] - 0.02)
    return pd.DataFrame(trades), pd.DataFrame.from_dict(poi, orient="index"), geo


def _center(districts: dict[str, str]) -> tuple[float, float]:
    """데모 단지를 뿌릴 가운데: 설정한 구 경계의 가운데 (경계가 없으면 대전시청 부근)."""
    from shapely.geometry import shape
    from shapely.ops import unary_union

    from .heatmap import load_districts
    shapes = [shape(g) for g in load_districts(districts).values()]
    if not shapes:
        return CENTER
    c = unary_union(shapes).centroid
    return (c.y, c.x)


def macro(start: str = "2006-01", end: str = "2026-08") -> dict:
    """데모용 가짜 물가·금리 (실제 값 아님): 물가 연 2.3%, 금리는 오르내리는 계단."""
    months = pd.period_range(start, end, freq="M")
    cpi, base, mort = {}, {}, {}
    for k, p in enumerate(months):
        key = str(p)
        cpi[key] = round(76.0 * 1.023 ** (k / 12), 2)
        b = 3.25 + 1.25 * math.sin(k / 30) if k < 160 else 0.75 + 0.25 * ((k - 160) // 6)
        base[key] = round(max(0.5, min(b, 3.5)) * 4) / 4
        mort[key] = round(base[key] + 1.6 + 0.2 * math.sin(k / 9), 2)
    return {"cpi": cpi, "base": base, "mort": mort}


def rents(trades: pd.DataFrame, seed: int = 11) -> pd.DataFrame:
    """데모용 가짜 전세 계약: 같은 단지 매매가의 55~75%, 2011년부터, 2021년 6월부터 신규·갱신 표시."""
    rnd = random.Random(seed)
    sale = trades[trades["kind"] == "매매"]
    out = []
    for cid, g in sale.groupby("complex_id"):
        for _, t in g.sample(frac=1.2, replace=True, random_state=rnd.randint(0, 9999)).iterrows():
            d = pd.Timestamp(t["date"]) + pd.Timedelta(days=rnd.randint(-40, 40))
            if d.year < 2011:
                continue
            renew = d >= pd.Timestamp("2021-06-01") and rnd.random() < 0.35
            out.append({"complex_id": cid, "name": t["name"], "gu": t["gu"], "dong": t["dong"], "jibun": t["jibun"],
                        "area": t["area"], "deposit": round(t["price"] * rnd.uniform(0.55, 0.72) * (0.95 if renew else 1)),
                        "monthly": 0 if rnd.random() < 0.7 else rnd.randint(30, 120), "date": d.strftime("%Y-%m-%d"),
                        "floor": t["floor"], "contract": ("갱신" if renew else "신규") if d >= pd.Timestamp("2021-06-01") else ""})
    return pd.DataFrame(out)
