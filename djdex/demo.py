"""API 키 없이 화면과 계산 흐름을 확인하기 위한 가짜 데이터.

이름, 위치, 가격 모두 무작위입니다. 실제 단지와 무관하며 배포용이 아닙니다.
"""
from __future__ import annotations

import random

import pandas as pd

CENTER = (36.3504, 127.3845)  # 대전시청 부근


def generate(districts: dict[str, str], factors: list[dict], n_complexes: int = 60,
             start_year: int = 2010, end: str = "2026-08-31", seed: int = 7):
    rnd = random.Random(seed)
    gus = list(districts.values())
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
                       if f["kind"] == "nearest" else round(rnd.uniform(0, 18), 1) if f["key"] == "school_adv"
                       else round(rnd.uniform(-5, 8), 1) if f["kind"] == "value"
                       else rnd.randint(0, 120))
            for f in factors
        }
        poi[cid]["subway_name"] = rnd.choice(stations) + " 대전1호선"
        geo[cid] = (CENTER[0] + rnd.uniform(-0.06, 0.06), CENTER[1] + rnd.uniform(-0.08, 0.08))
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
    geo[cid] = (CENTER[0] + 0.01, CENTER[1] - 0.02)
    return pd.DataFrame(trades), pd.DataFrame.from_dict(poi, orient="index"), geo
