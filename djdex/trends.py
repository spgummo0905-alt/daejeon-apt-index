"""이번 달 볼거리: 단지별 최근 변동, 랭킹, 동별 시황 온도.

모두 국토부 실거래만으로 계산합니다 (조회수 같은 서버 데이터 없이).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .location import percentile
from .metrics import SALE, prepare, window_price

# 동네 온도: 5단계 (높은 쪽부터). 분위수로 나눠 단계마다 동 수가 비슷합니다.
# 다른 동네와 견준 상대 온도라 '상승·하락' 대신 온도 말로 부릅니다.
BANDS = [(5, "뜨거운 동네"), (4, "따뜻한 동네"), (3, "미지근한 동네"), (2, "서늘한 동네"), (1, "차가운 동네")]
QUIET = (0, "거래 적은 동네")


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
    최근 1년 거래가 min_year_trades 건보다 적은 동은 '거래 적은 동네'.
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
    out["p_chg"], out["p_vol"] = np.nan, np.nan
    if len(a) >= 5:
        p_chg, p_vol = percentile(a["chg"]).fillna(50), percentile(a["vol"]).fillna(50)
        score = 0.6 * p_chg + 0.4 * p_vol
        out.loc[a.index, "score"] = score
        out.loc[a.index, "p_chg"], out.loc[a.index, "p_vol"] = p_chg, p_vol  # 온도를 이루는 두 값 (카드에서 근거로)
        q = score.rank(pct=True, method="first")
        out.loc[a.index, "band"] = np.ceil(q * 5).clip(1, 5)
    out["band"] = out["band"].fillna(0).astype(int)
    out["band_name"] = out["band"].map(dict(BANDS + [QUIET]))
    return out
