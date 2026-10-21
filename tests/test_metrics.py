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


def _rows(cid, dates_prices, area=84.0, kind="매매"):
    return [{"complex_id": cid, "name": cid, "gu": "서구", "dong": "둔산동", "jibun": "1", "build_year": 2000,
             "area": area, "price": p, "date": d, "floor": 5, "cancelled": False, "direct": False, "kind": kind}
            for d, p in dates_prices]


M2 = {**M, "price_windows": [3, 6, 12], "small_peak_trades": 8, "new_high_days": 90}


def test_small_complexes_are_unranked():
    big = _rows("BIG", [(f"2025-{m:02d}-10", 50000 + m * 100) for m in range(1, 13)])
    tiny = _rows("TINY", [("2025-03-01", 30000), ("2026-02-01", 31000)])
    table, _, meta = metrics.compute(pd.DataFrame(big + tiny), M2, F, asof=pd.Timestamp("2026-08-31"))
    assert bool(table.loc["TINY", "small"]) and not bool(table.loc["BIG", "small"])
    assert table.loc["BIG", "rank"] == 1 and math.isnan(table.loc["TINY", "rank"])
    assert meta["n_complexes"] == 1 and meta["n_small"] == 1


def test_price_uses_shortest_window_with_enough_trades():
    rows = _rows("A", [("2025-10-01", 50000), ("2025-11-01", 50000), ("2026-07-01", 60000), ("2026-08-01", 62000)])
    table, _, _ = metrics.compute(pd.DataFrame(rows), M2, F, asof=pd.Timestamp("2026-08-31"))
    # 최근 3개월에 2건이 있으니 3개월 중위가(61,000/84㎡)를 씁니다. 12개월이면 55,000 근처로 늦게 따라감.
    assert table.loc["A", "price_ref"] == pytest.approx(61000)
    assert table.loc["A", "price_basis"] == "최근 3개월 매매"


def test_presale_only_complex_gets_price_but_no_cagr():
    rows = _rows("NEW", [("2026-05-01", 70000), ("2026-06-01", 72000)], kind="분양권")
    rows += _rows("OLD", [("2016-03-01", 30000), ("2016-04-01", 30000), ("2026-07-01", 50000), ("2026-08-01", 50000)])
    table, _, _ = metrics.compute(pd.DataFrame(rows), M2, F, asof=pd.Timestamp("2026-08-31"))
    assert table.loc["NEW", "price_ref"] == pytest.approx(71000)
    assert "분양권" in table.loc["NEW", "price_basis"]
    assert math.isnan(table.loc["NEW", "cagr_10y"]) and not math.isnan(table.loc["OLD", "cagr_10y"])


def test_new_high_detection():
    rows = _rows("A", [("2025-01-01", 50000), ("2025-06-01", 55000), ("2026-08-20", 58000)])
    rows += _rows("A", [("2026-08-25", 40000)], area=59.0)  # 다른 면적대 거래는 비교하지 않음
    rows += _rows("B", [("2025-01-01", 50000), ("2025-06-01", 55000), ("2026-08-20", 52000)])
    table, _, _ = metrics.compute(pd.DataFrame(rows), M2, F, asof=pd.Timestamp("2026-08-31"))
    assert not bool(table.loc["A", "new_high"])  # 마지막 거래(59㎡)는 비교 대상이 없음
    assert not bool(table.loc["B", "new_high"]) and table.loc["B", "prev_high"] == 55000
    rows = rows[:-1] + _rows("B", [("2026-08-20", 56000)])
    table, _, _ = metrics.compute(pd.DataFrame([r for r in rows if r["complex_id"] == "B" and r["price"] != 52000]),
                                  M2, F, asof=pd.Timestamp("2026-08-31"))
    assert bool(table.loc["B", "new_high"]) and bool(table.loc["B", "new_high_recent"])


def test_percentile_against_reference_group():
    s = pd.Series([10, 20, 30, 999], index=["a", "b", "c", "x"])
    pct = location.percentile(s, ref=pd.Index(["a", "b", "c"]))
    assert list(pct[["a", "b", "c"]]) == [0, 50, 100]
    assert pct["x"] == 100  # 기준 밖 값도 기준 분포 안 위치로 점수를 받음


def test_from_peak():
    rows = _rows("A", [("2021-03-01", 100000), ("2021-05-01", 100000), ("2024-03-01", 70000), ("2024-04-01", 70000),
                       ("2026-07-01", 80000), ("2026-08-01", 80000)])
    table, _, _ = metrics.compute(pd.DataFrame(rows), M2, F, asof=pd.Timestamp("2026-08-31"))
    assert table.loc["A", "peak_year"] == 2021
    assert table.loc["A", "from_peak"] == pytest.approx(-0.2)


def test_studio_complex_is_small_and_no_return_index_is_neutral():
    # S: 원룸형(면적 30㎡), N: 수익률 자료 없는 단지(최근 거래만)
    rows = _trades("A", {2016: 500, 2021: 700, 2026: 1000}, n=6)
    rows += [dict(r, area=30.0) for r in _trades("S", {2016: 500, 2021: 600, 2026: 700}, n=6)]
    rows += _trades("N", {2026: 900}, n=6)
    loc = pd.DataFrame({"location_score": [60.0, 90.0, 90.0]}, index=["A", "S", "N"])
    table, _, meta = metrics.compute(pd.DataFrame(rows), dict(M, small_peak_trades=5, min_main_area=45), F,
                                     location=loc, asof=pd.Timestamp("2026-08-31"))
    assert table.loc["S", "small"] and table.loc["S", "small_reason"] == "원룸형"
    assert not table.loc["A", "small"] and meta["n_studio"] == 1
    # 입지만 있는 단지는 수익률을 50으로 보고 계산: (90 + 50 + 50) / 3
    assert table.loc["N", "index"] == pytest.approx((90 + 50 + 50) / 3)


def test_hub_access_walk_and_subway():
    cfg = {"hubs": [{"name": "둔산", "weight": 1.0, "lat": 36.3555, "lng": 127.3795, "stations": {"시청": 8}},
                    {"name": "도안", "weight": 0.75, "lat": 36.3440, "lng": 127.3390}],
           "walk_m_per_min": 80, "detour": 1.3, "subway_wait_min": 5, "min_per_stop": 2,
           "full_min": 10, "zero_min": 40}
    poi = pd.DataFrame({"subway": [100.0, 200.0, None], "subway_name": ["정부청사역 대전1호선", "노은역 대전1호선", None]},
                       index=["center", "noeun", "far"])
    geo = {"center": (36.3555, 127.3795), "noeun": (36.3745, 127.3178), "far": (36.20, 127.60)}
    out = location.hub_access(poi, geo, cfg)
    assert out.loc["center", "hub"] == 100 and out.loc["center", "hub_name"] == "둔산"
    # 노은역 → 시청역: 9정거장. 도보 200m(약 3분) + 대기 5 + 18 + 8 = 34분 → 둔산 20점
    assert out.loc["noeun", "hub_name"] == "둔산" and out.loc["noeun", "hub_min"] == 34
    assert out.loc["noeun", "hub"] == pytest.approx(20, abs=1)
    assert out.loc["far", "hub"] == 0
    # 점수 항목은 백분위로 바꾸지 않고 그대로 씁니다.
    sc = location.score(out[["hub"]], [{"key": "hub", "kind": "score", "weight": 1.0}])
    assert sc.loc["center", "location_score"] == 100


def test_detect_hubs_finds_dense_cluster():
    poi = pd.DataFrame({"academy": [300, 280, 260, 250, 5, 4, 3, 2, 1, 0] * 3,
                        "subway": [300.0] * 30, "subway_name": ["노은역 대전1호선"] * 30},
                       index=[f"c{i}" for i in range(30)])
    geo = {f"c{i}": ((36.379 + (i % 10) * 0.0005, 127.319) if i % 10 < 4 else (36.30 + i * 0.01, 127.45))
           for i in range(30)}
    hubs = location.detect_hubs(poi, geo, top=0.4, dongs={f"c{i}": "노은동" for i in range(30)})
    assert len(hubs) == 1
    h = hubs[0]
    assert h["name"] == "노은동 학원가" and h["weight"] == 1.0 and "노은" in h["stations"]
    assert abs(h["lat"] - 36.380) < 0.002


def test_stat_new_by_age():
    t = pd.DataFrame({"small": [False] * 4, "build_year": [2026, 2011, 1990, None],
                      "price_basis": ["매매", "매매", "매매", "분양권"],
                      "location_score": [50.0] * 4, "price_ref": [1.0, 2.0, 3.0, 4.0]},
                     index=list("abcd"))
    tr = pd.DataFrame({"complex_id": ["a"], "date": ["2026-01-01"], "cancelled": [False]})
    out = site.add_game_stats(t, tr, {"asof": "2026.08"})
    assert out.loc["a", "stat_new"] == 100 and out.loc["c", "stat_new"] == 0
    assert 45 < out.loc["b", "stat_new"] < 55 and out.loc["d", "stat_new"] == 100
