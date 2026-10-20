import math

import pandas as pd
import pytest

from djdex import location, metrics, site
from djdex.cpi import CPI

M = {"reference_area": 84.0, "window_months": 12, "min_trades": 2, "cagr_years": [10, 5]}
F = {"exclude_cancelled": True, "exclude_direct": True}


def _trades(cid, ppm2_by_year, n=2, **extra):
    rows = []
    for year, p in ppm2_by_year.items():
        for k in range(n):
            rows.append({"complex_id": cid, "name": cid, "gu": "서구", "dong": "둔산동", "jibun": "1",
                         "build_year": 2000, "area": 100.0, "price": p * 100,
                         "date": f"{year}-0{k + 3}-15", "floor": 5,
                         "cancelled": False, "direct": False, **extra})
    return rows


def test_cagr_and_index():
    # A: 10년간 2배, B: 5년치만 있음 (신축 취급)
    rows = _trades("A", {2016: 500, 2021: 700, 2026: 1000}) + _trades("B", {2021: 800, 2026: 1000})
    loc = pd.DataFrame({"location_score": [40.0, 80.0]}, index=["A", "B"])
    table, hist, meta = metrics.compute(pd.DataFrame(rows), M, F, location=loc,
                                        asof=pd.Timestamp("2026-08-31"))
    a, b = table.loc["A"], table.loc["B"]
    assert a["cagr_10y"] == pytest.approx(2 ** 0.1 - 1)
    assert a["cagr_5y"] == pytest.approx((1000 / 700) ** 0.2 - 1)
    assert a["price_ref"] == pytest.approx(1000 * 84)
    assert math.isnan(b["cagr_10y"])
    # 5년: A 700→1000, B 800→1000 이므로 A가 백분위 100, B가 0
    assert a["cagr_5y_pct"] == 100 and b["cagr_5y_pct"] == 0
    # 10년 수익률은 A 하나뿐이라 백분위 50
    # A: (40 + 50 + 100)/3, B: (80 + 0)/2
    assert a["index"] == pytest.approx((40 + 50 + 100) / 3)
    assert b["index"] == pytest.approx(40) and b["index_parts"] == 2
    assert meta["asof"] == "2026.08" and not meta["real_returns"]


def test_filters_and_min_trades():
    rows = _trades("A", {2026: 1000}) + _trades("A", {2026: 1}, n=1, cancelled=True)
    rows += _trades("C", {2026: 900}, n=1)  # 최근 구간 거래 1건뿐 → 가격 없음
    table, _, _ = metrics.compute(pd.DataFrame(rows), M, F, asof=pd.Timestamp("2026-08-31"))
    assert table.loc["A", "ppm2_now"] == 1000
    assert math.isnan(table.loc["C", "ppm2_now"])


def test_real_returns_use_cpi():
    rows = _trades("A", {2021: 500, 2026: 1000}, n=2)
    cpi = CPI(pd.Series([100.0, 125.0], index=pd.PeriodIndex(["2021-08", "2026-08"], freq="M")))
    table, _, meta = metrics.compute(pd.DataFrame(rows), {**M, "cagr_years": [5]}, F, cpi=cpi,
                                     asof=pd.Timestamp("2026-08-31"))
    assert meta["real_returns"]
    assert table.loc["A", "cagr_5y"] == pytest.approx((2 / 1.25) ** 0.2 - 1)


def test_location_score_direction():
    factors = [{"key": "subway", "kind": "nearest", "weight": 1.0},
               {"key": "academy", "kind": "count", "weight": 1.0}]
    poi = pd.DataFrame({"subway": [100, 1000, None], "academy": [50, 10, 0]}, index=["near", "far", "none"])
    s = location.score(poi, factors)
    assert s.loc["near", "subway_pct"] == 100 and s.loc["far", "subway_pct"] == 0
    assert s.loc["none", "subway_pct"] == 0  # 반경 안에 역 없음 → 최하점
    assert s.loc["near", "location_score"] == 100


def test_formatting_and_slug():
    assert site.fmt_price(52500) == "5.25억" and site.fmt_price(8500) == "8,500만"
    assert site.fmt_pct(0.0123) == "+1.2%" and site.fmt_pct(float("nan")) == "-"
    assert site.slug("30200-1234") == "30200-1234"
    assert len(site.slug("30200-봉명동-1-가")) == 12
