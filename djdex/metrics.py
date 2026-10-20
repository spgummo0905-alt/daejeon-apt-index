"""가격, 수익률, 신고가, 종합 지수 계산."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import location as location_mod
from .cpi import CPI
from .location import percentile

SALE = "매매"


def prepare(trades: pd.DataFrame, filters: dict) -> pd.DataFrame:
    df = trades.copy()
    df["date"] = pd.to_datetime(df["date"])
    if "kind" not in df:
        df["kind"] = SALE
    df["kind"] = df["kind"].fillna(SALE)
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
    # 이름은 매매 거래의 최신 이름을 우선 씁니다 (분양권 신고 이름이 조금 다를 수 있음).
    d = df.assign(_sale=(df["kind"] == SALE)).sort_values(["_sale", "date"])
    g = d.groupby("complex_id")
    return g.agg(
        name=("name", "last"),
        gu=("gu", "last"),
        dong=("dong", "last"),
        jibun=("jibun", "last"),
        build_year=("build_year", "max"),
        n_trades=("price", "size"),
        last_trade=("date", "max"),
    )


def recent_price(sale: pd.DataFrame, presale: pd.DataFrame, asof: pd.Timestamp,
                 windows: list[int], min_n: int) -> tuple[pd.Series, pd.Series]:
    """짧은 구간부터 보며 거래가 충분한 첫 구간의 ㎡당 중위가. 매매가 없으면 분양권·입주권으로.
    반환: (㎡당 가격, 기준 설명)."""
    price = pd.Series(dtype=float)
    basis = pd.Series(dtype=object)
    for m in windows:
        p = window_price(sale, asof, m, min_n)
        new = p.index.difference(price.index)
        price = pd.concat([price, p[new]])
        basis = pd.concat([basis, pd.Series(f"최근 {m}개월 매매", index=new)])
    if not presale.empty:
        p = window_price(presale, asof, max(windows), 1)
        new = p.index.difference(price.index)
        price = pd.concat([price, p[new]])
        basis = pd.concat([basis, pd.Series(f"최근 {max(windows)}개월 분양권·입주권", index=new)])
    return price, basis


def latest_and_high(df: pd.DataFrame, asof: pd.Timestamp, recent_days: int,
                    area_tol: float = 3.0, min_prior: int = 2) -> pd.DataFrame:
    """단지별 마지막 거래와, 그 거래가 같은 면적대(±area_tol㎡) 이전 최고가를 넘었는지."""
    rows = {}
    for cid, g in df.sort_values("date").groupby("complex_id"):
        last = g.iloc[-1]
        prior = g.iloc[:-1]
        prior = prior[(prior["area"] - last["area"]).abs() <= area_tol]
        prev_max = prior["price"].max() if len(prior) else np.nan
        is_high = bool(len(prior) >= min_prior and last["price"] > prev_max)
        rows[cid] = {
            "last_price": float(last["price"]),
            "last_area": float(last["area"]),
            "last_date": last["date"],
            "last_kind": last["kind"],
            "prev_high": float(prev_max) if len(prior) else np.nan,
            "new_high": is_high,
            "new_high_recent": is_high and (asof - last["date"]).days <= recent_days,
        }
    return pd.DataFrame.from_dict(rows, orient="index")


def compute(trades: pd.DataFrame, cfg_metrics: dict, filters: dict,
            location: pd.DataFrame | None = None, cpi: CPI | None = None,
            components: list[str] | None = None,
            asof: pd.Timestamp | None = None,
            poi: pd.DataFrame | None = None, factors: list[dict] | None = None,
            ) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """반환: (단지별 지표표, 연도별 가격 이력, 메타정보).

    poi 와 factors 를 주면 소규모 단지를 뺀 분포 기준으로 입지점수를 계산합니다.
    (예전처럼 미리 계산한 location 표를 넘겨도 됩니다.)
    """
    df = prepare(trades, filters)
    if df.empty:
        raise ValueError("필터 후 남은 거래가 없습니다.")
    asof = asof or (df["date"].max().to_period("M").to_timestamp("M"))
    months = cfg_metrics["window_months"]
    min_n = cfg_metrics["min_trades"]
    ref = cfg_metrics["reference_area"]
    windows = cfg_metrics.get("price_windows") or [months]
    sale, presale = df[df["kind"] == SALE], df[df["kind"] != SALE]

    table = complexes(df)
    # 소규모: 어느 해에도 거래가 small_peak_trades 건에 못 미친 단지
    peak = df.groupby(["complex_id", df["date"].dt.year]).size().groupby(level=0).max()
    table["peak_trades"] = peak
    table["small"] = table["peak_trades"] < cfg_metrics.get("small_peak_trades", 0)
    main = table.index[~table["small"]]

    cur_now, basis = recent_price(sale, presale, asof, windows, min_n)
    table["ppm2_now"] = cur_now
    table["price_basis"] = basis
    table["price_ref"] = table["ppm2_now"] * ref  # 만원, 전용 84㎡ 환산
    table = table.join(latest_and_high(df, asof, cfg_metrics.get("new_high_days", 90)))

    # 수익률은 매매끼리, 12개월 구간으로 비교합니다 (구간 길이가 다르면 비교가 흔들림).
    cur = window_price(sale, asof, months, min_n)
    real = cpi is not None
    for n in cfg_metrics["cagr_years"]:
        past_end = asof - pd.DateOffset(years=n)
        past = window_price(sale, past_end, months, min_n)
        deflator = None
        if cpi:
            a, b = cpi.at(asof), cpi.at(past_end)
            deflator = a / b if a and b else None
        table[f"cagr_{n}y"] = cagr(cur, past, n, deflator)
        table[f"cagr_{n}y_pct"] = percentile(table[f"cagr_{n}y"], ref=main)

    if poi is not None and not poi.empty and factors:
        location = location_mod.score(poi, factors, ref=main).join(poi.add_suffix("_raw"))
    if location is not None and not location.empty:
        table = table.join(location, how="left")
    if "location_score" not in table:
        table["location_score"] = float("nan")

    comps = components or ["location_score"] + [f"cagr_{n}y_pct" for n in cfg_metrics["cagr_years"]]
    table["index"] = table[comps].mean(axis=1, skipna=True)
    table["index_parts"] = table[comps].notna().sum(axis=1)
    # 순위는 소규모를 뺀 단지끼리
    table = table.sort_values(["small", "index"], ascending=[True, False], na_position="last")
    table["rank"] = np.nan
    n_main = int((~table["small"]).sum())
    table.loc[~table["small"], "rank"] = range(1, n_main + 1)

    hist = (sale.assign(year=sale["date"].dt.year)
              .groupby(["complex_id", "year"])["ppm2"]
              .agg(["median", "size"]).reset_index()
              .rename(columns={"median": "ppm2", "size": "n"}))

    region_hist = sale[sale["complex_id"].isin(main)].groupby(sale["date"].dt.year)["ppm2"].median()
    m = table[~table["small"]]
    meta = {
        "asof": asof.strftime("%Y.%m"),
        # 연도별 대전 전체 ㎡당 중위가격 (단지 페이지 비교선)
        "region_history": [(int(y), float(v)) for y, v in region_hist.items()],
        "real_returns": real,
        "n_complexes": n_main,
        "n_small": int(table["small"].sum()),
        "n_trades": int(len(df)),
        "n_presale": int(len(presale)),
        "median_index": float(m["index"].median()) if m["index"].notna().any() else None,
        "median_location": float(m["location_score"].median()) if m["location_score"].notna().any() else None,
    }
    return table, hist, meta
