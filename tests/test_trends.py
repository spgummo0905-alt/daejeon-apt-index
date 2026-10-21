import pandas as pd
import pytest

from djdex import trends

F = {"exclude_cancelled": True, "exclude_direct": True}


def _rows(cid, dong, monthly):
    """monthly: {"YYYY-MM": (건수, ㎡당 가격)}"""
    out = []
    for ym, (n, p) in monthly.items():
        for k in range(n):
            out.append({"complex_id": cid, "gu": "서구", "dong": dong, "date": f"{ym}-{10 + k % 15:02d}",
                        "price": p * 84, "area": 84.0, "floor": 5, "cancelled": False, "direct": False, "kind": "매매"})
    return out


def test_recent_change_and_counts():
    rows = _rows("A", "둔산동", {"2025-06": (3, 1000), "2026-06": (3, 1200), "2026-08": (2, 1300)})
    sale = trends._sale(pd.DataFrame(rows), F)
    asof = pd.Timestamp("2026-08-31")
    chg = trends.recent_change(sale, asof, months=6, min_n=3)
    # 최근 6개월 중위 (1200,1200,1200,1300,1300) = 1200 / 1년 전 1000 → +20%
    assert chg["A"] == pytest.approx(0.2)
    assert trends.recent_count(sale, asof, 3)["A"] == 5
    deals = trends.top_deals(sale, asof)
    assert list(deals["complex_id"]) == ["A"] and deals.iloc[0]["price"] == 1300 * 84


def test_dong_heat_bands_and_quiet():
    rows = []
    for i in range(6):  # 6개 동, 가격 상승폭이 다름
        rows += _rows(f"C{i}", f"동{i}", {"2025-04": (4, 1000), "2026-04": (4, 1000 + 50 * i), "2026-07": (2 + i, 1000 + 50 * i)})
    rows += _rows("Q", "조용동", {"2026-07": (1, 900)})
    trades = pd.DataFrame(rows)
    table = trades.groupby("complex_id")[["gu", "dong"]].last()
    sale = trends._sale(trades, F)
    heat = trends.dong_heat(sale, table, pd.Timestamp("2026-08-31"), min_year_trades=4)
    assert heat.loc[("서구", "조용동"), "band"] == 0 and heat.loc[("서구", "조용동"), "band_name"] == "거래 적음"
    bands = heat["band"].drop(("서구", "조용동"))
    assert bands.loc[("서구", "동5")] == 5 and bands.loc[("서구", "동0")] == 1
    assert set(heat["band_name"]) >= {"뜨거움", "차가움"}


def test_hex_layout_unique_cells_keep_rough_position():
    pts = {f"p{i}": (36.30 + 0.01 * (i // 5), 127.30 + 0.01 * (i % 5)) for i in range(25)}
    pts["dup"] = pts["p12"]  # 같은 자리 → 옆 칸으로 밀림
    cells = trends.hex_layout(pts)
    assert len(set(cells.values())) == len(pts)
    # 동쪽(경도 큼) 점은 서쪽 점보다 오른쪽 칸
    q = lambda k: cells[k][0] + cells[k][1] / 2
    assert q("p4") > q("p0")
