"""이번 달 볼거리: 단지별 최근 변동, 랭킹, 동별 시황 온도와 육각 타일 배치.

모두 국토부 실거래만으로 계산합니다 (조회수 같은 서버 데이터 없이).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .location import percentile
from .metrics import SALE, prepare, window_price

# 시황 온도: 5단계 이름 구간 (높은 쪽부터). 분위수로 나눠 단계마다 동 수가 비슷합니다.
BANDS = [(5, "뜨거움"), (4, "따뜻함"), (3, "보합"), (2, "선선함"), (1, "차가움")]
QUIET = (0, "거래 적음")


def _sale(trades: pd.DataFrame, filters: dict, keep: pd.Index | None = None) -> pd.DataFrame:
    df = prepare(trades, filters)
    df = df[df["kind"] == SALE]
    return df[df["complex_id"].isin(keep)] if keep is not None else df


def recent_change(sale: pd.DataFrame, asof: pd.Timestamp, months: int = 6, min_n: int = 3) -> pd.Series:
    """단지별 최근 months개월 ㎡당 중위가 ÷ 1년 전 같은 기간 중위가 − 1."""
    now = window_price(sale, asof, months, min_n)
    before = window_price(sale, asof - pd.DateOffset(years=1), months, min_n)
    return (now / before - 1).dropna()


def recent_count(sale: pd.DataFrame, asof: pd.Timestamp, months: int = 3) -> pd.Series:
    w = sale[sale["date"] > asof - pd.DateOffset(months=months)]
    return w.groupby("complex_id").size()


def top_deals(sale: pd.DataFrame, asof: pd.Timestamp, months: int = 3, k: int = 10) -> pd.DataFrame:
    """최근 months개월 거래 중 금액이 큰 순 (한 단지는 가장 비싼 한 건만)."""
    w = sale[sale["date"] > asof - pd.DateOffset(months=months)]
    w = w.sort_values("price", ascending=False).drop_duplicates("complex_id")
    return w.head(k)[["complex_id", "price", "area", "date", "floor"]]


def dong_heat(sale: pd.DataFrame, table: pd.DataFrame, asof: pd.Timestamp, min_year_trades: int = 8) -> pd.DataFrame:
    """동별 시황 온도.

    - 가격 흐름: 동 안 단지들의 최근 6개월 변동(1년 전 같은 기간 대비)의 중간값
      (단지 구성이 달라 생기는 착시를 줄이려 동 전체 중위가 대신 단지별 변동을 모읍니다)
    - 거래 흐름: 최근 3개월 거래 수 ÷ 그 전 1년 평균 3개월 거래 수
    둘을 동끼리 백분위로 바꿔 6:4로 섞고, 분위수로 다섯 단계를 매깁니다.
    최근 1년 거래가 min_year_trades 건보다 적은 동은 '거래 적음'.
    """
    info = table[["gu", "dong"]]
    s = sale.merge(info, left_on="complex_id", right_index=True, how="inner", suffixes=("_t", ""))
    key = ["gu", "dong"]
    last3 = s[s["date"] > asof - pd.DateOffset(months=3)].groupby(key).size()
    prev = s[(s["date"] > asof - pd.DateOffset(months=15)) & (s["date"] <= asof - pd.DateOffset(months=3))]
    prev_q = prev.groupby(key).size() / 4
    year = s[s["date"] > asof - pd.DateOffset(months=12)].groupby(key).size()
    chg = recent_change(sale, asof, 6, 2)
    ch = info.join(chg.rename("chg"), how="inner").groupby(key)["chg"].median()

    out = info.groupby(key).size().rename("n").to_frame().join(
        pd.DataFrame({"chg": ch, "last3": last3, "prev_q": prev_q, "year": year}), how="left")
    out[["last3", "prev_q", "year"]] = out[["last3", "prev_q", "year"]].fillna(0)
    out["vol"] = out["last3"] / out["prev_q"].where(out["prev_q"] > 0)
    active = out["year"] >= min_year_trades
    a = out[active]
    out["score"], out["band"] = np.nan, np.nan
    if len(a) >= 5:
        score = (0.6 * percentile(a["chg"]).fillna(50) + 0.4 * percentile(a["vol"]).fillna(50))
        out.loc[a.index, "score"] = score
        q = score.rank(pct=True, method="first")
        out.loc[a.index, "band"] = np.ceil(q * 5).clip(1, 5)
    out["band"] = out["band"].fillna(0).astype(int)
    out["band_name"] = out["band"].map(dict(BANDS + [QUIET]))
    return out


def hex_layout(points: dict, max_ring: int = 12) -> dict:
    """{key: (lat, lng)} 을 겹치지 않는 육각 타일 (q, r) 좌표로 놓습니다 (뾰족한 꼭짓점이 위).

    실제 위치에 가깝게 놓되 한 칸에 하나만: 중심에서 가까운 동부터 가장 가까운 빈칸을 고릅니다.
    한 칸 크기는 동 수에 맞춰 전체 범위를 대략 채우도록 정합니다.
    """
    if not points:
        return {}
    lat0 = sum(p[0] for p in points.values()) / len(points)
    kx = math.cos(math.radians(lat0))
    xy = {k: (p[1] * kx, -p[0]) for k, p in points.items()}
    xs, ys = [v[0] for v in xy.values()], [v[1] for v in xy.values()]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    area = max((max(xs) - min(xs)) * (max(ys) - min(ys)), 1e-9)
    size = math.sqrt(area / max(len(points), 1) / (1.5 * math.sqrt(3))) * 0.9 or 1e-3

    def to_axial(x, y):
        q = (math.sqrt(3) / 3 * x - y / 3) / size
        r = (2 / 3 * y) / size
        # 큐브 좌표 반올림
        cxq, cz = q, r
        cyq = -cxq - cz
        rx, ry, rz = round(cxq), round(cyq), round(cz)
        dx, dy, dz = abs(rx - cxq), abs(ry - cyq), abs(rz - cz)
        if dx > dy and dx > dz:
            rx = -ry - rz
        elif dy > dz:
            ry = -rx - rz
        else:
            rz = -rx - ry
        return rx, rz

    def center(q, r):
        return size * math.sqrt(3) * (q + r / 2), size * 1.5 * r

    taken: dict[tuple, str] = {}
    out = {}
    order = sorted(xy, key=lambda k: (xy[k][0] - cx) ** 2 + (xy[k][1] - cy) ** 2)
    dirs = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
    for k in order:
        x, y = xy[k][0] - cx, xy[k][1] - cy
        q0, r0 = to_axial(x, y)
        best = None
        for ring in range(max_ring + 1):
            cells = [(q0, r0)] if ring == 0 else []
            if ring:
                q, r = q0 - ring, r0 + ring
                for dq, dr in dirs:
                    for _ in range(ring):
                        cells.append((q, r))
                        q, r = q + dq, r + dr
            for c in cells:
                if c in taken:
                    continue
                px, py = center(*c)
                d = (px - x) ** 2 + (py - y) ** 2
                if best is None or d < best[0]:
                    best = (d, c)
            if best:
                break
        taken[best[1]] = k
        out[k] = best[1]
    return out
