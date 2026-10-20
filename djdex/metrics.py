"""가격, 수익률, 종합 지수 계산."""
from __future__ import annotations

import pandas as pd

from .cpi import CPI
from .location import percentile


def prepare(trades: pd.DataFrame, filters: dict) -> pd.DataFrame:
    df = trades.copy()
    df["date"] = pd.to_datetime(df["date"])
    if filters.get("exclude_cancelled", True):
        df = df[~df["cancelled"].astype(bool)]
    if filters.get("exclude_direct", False):
        df = df[~df["direct"].astype(bool)]
    df = df[df["area"] > 0]
    df["ppm2"] = df["price"] / df["area"]  # 만원/㎡
    return df


def window_price(df: pd.DataFrame, end: pd.Timestamp, months: int, min_trades: int) -> pd.Series:
    """(end - months, end] 구간 단지별 ㎡당 중위가격. 거래가 min_trades 미만이면 제외."""
    start = end - pd.DateOffset(months=months)
    w = df[(df["date"] > start) & (df["date"] <= end)]
    g = w.groupby("complex_id")["ppm2"]
    med, n = g.median(), g.size()
    return med[n >= min_trades]


def cagr(end_price: pd.Series, start_price: pd.Series, years: int,
         deflator: float | None = None) -> pd.Series:
    """연평균 수익률. deflator = CPI(끝)/CPI(시작) 이면 실질 수익률."""
    ratio = (end_price / start_price).dropna()
    if deflator:
        ratio = ratio / deflator
    return ratio ** (1 / years) - 1


def complexes(df: pd.DataFrame) -> pd.DataFrame:
    g = df.sort_values("date").groupby("complex_id")
    out = g.agg(
        name=("name", "last"),
        gu=("gu", "last"),
        dong=("dong", "last"),
        jibun=("jibun", "last"),
        build_year=("build_year", "max"),
        n_trades=("price", "size"),
        last_trade=("date", "max"),
    )
    return out


def compute(trades: pd.DataFrame, cfg_metrics: dict, filters: dict,
            location: pd.DataFrame | None = None, cpi: CPI | None = None,
            components: list[str] | None = None,
            asof: pd.Timestamp | None = None) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """반환: (단지별 지표표, 연도별 가격 이력, 메타정보)."""
    df = prepare(trades, filters)
    if df.empty:
        raise ValueError("필터 후 남은 거래가 없습니다.")
    asof = asof or (df["date"].max().to_period("M").to_timestamp("M"))
    months = cfg_metrics["window_months"]
    min_n = cfg_metrics["min_trades"]
    ref = cfg_metrics["reference_area"]

    table = complexes(df)
    cur = window_price(df, asof, months, min_n)
    table["ppm2_now"] = cur
    table["price_ref"] = cur * ref  # 만원, 전용 84㎡ 환산

    real = cpi is not None
    for n in cfg_metrics["cagr_years"]:
        past_end = asof - pd.DateOffset(years=n)
        past = window_price(df, past_end, months, min_n)
        deflator = None
        if cpi:
            a, b = cpi.at(asof), cpi.at(past_end)
            deflator = a / b if a and b else None
        r = cagr(cur, past, n, deflator)
        table[f"cagr_{n}y"] = r
        table[f"cagr_{n}y_pct"] = percentile(table[f"cagr_{n}y"])

    if location is not None and not location.empty:
        table = table.join(location, how="left")
    if "location_score" not in table:
        table["location_score"] = float("nan")

    comps = components or ["location_score"] + [f"cagr_{n}y_pct" for n in cfg_metrics["cagr_years"]]
    table["index"] = table[comps].mean(axis=1, skipna=True)
    table["index_parts"] = table[comps].notna().sum(axis=1)
    table = table.sort_values("index", ascending=False, na_position="last")
    table["rank"] = range(1, len(table) + 1)

    hist = (df.assign(year=df["date"].dt.year)
              .groupby(["complex_id", "year"])["ppm2"]
              .agg(["median", "size"]).reset_index()
              .rename(columns={"median": "ppm2", "size": "n"}))

    region_hist = df.groupby(df["date"].dt.year)["ppm2"].median()
    meta = {
        "asof": asof.strftime("%Y.%m"),
        # 연도별 대전 전체 ㎡당 중위가격 (단지 페이지 비교선)
        "region_history": [(int(y), float(v)) for y, v in region_hist.items()],
        "real_returns": real,
        "n_complexes": int(len(table)),
        "n_trades": int(len(df)),
        "median_index": float(table["index"].median()) if table["index"].notna().any() else None,
        "median_location": float(table["location_score"].median()) if table["location_score"].notna().any() else None,
    }
    return table, hist, meta
