import math

import numpy as np
import pandas as pd
import pytest

from djdex import pricechart as pc


def _t(d, price, area=84.9, floor=10, **k):
    return {**dict(date=pd.Timestamp(d), price=price, area=area, floor=floor, kind="매매", cancelled=False,
                   direct=False, akey="84"), **k}


def test_estimate_follows_trend_and_marks_sparse_months():
    rnd = np.random.default_rng(1)
    m = np.repeat(np.arange(0, 36), 3)                       # 3년, 달마다 3건
    lp = np.log(50000) + 0.01 * m + rnd.normal(0, 0.02, len(m))
    m = np.concatenate([m, [80]]); lp = np.concatenate([lp, [np.log(50000) + 0.8]])  # 4년 쉬고 한 건
    est, sp, sig = pc.estimate(m, lp, 81)
    assert abs(math.exp(est[18]) / (50000 * math.exp(0.18)) - 1) < 0.03
    assert not sp[18] and sp[80] and sp[44]                              # 혼자 떨어진 거래 달은 '거래 희소'
    assert np.isnan(est[60])                                  # 앞뒤 12개월에 거래가 없으면 공백
    assert 0.03 <= sig[18] <= 0.06


def test_estimate_drops_outliers_before_band():
    m = np.array([0, 0, 1, 1, 2, 2, 2])
    lp = np.log([50000, 50500, 51000, 50800, 51200, 30000, 51000])  # 30000은 가족 간 저가 거래로 보임
    est, _, _ = pc.estimate(m, lp, 3)
    assert math.exp(est[2]) > 50000


def test_complex_payload_low_floors_cancelled_and_flags():
    tr = [_t("2024-01-05", 50000), _t("2024-01-20", 51000), _t("2024-02-03", 40000, floor=1),
          _t("2024-03-10", 52000), _t("2024-03-11", 60000, cancelled=True),
          _t("2024-03-15", 30000, area=59.9, akey="59")]
    types = [{"key": "59", "n": 1, "py": 24}, {"key": "84", "n": 5, "py": 34}]
    p = pc.complex_payload(tr, types, pc.month_no("2024-03-31"), exclude_direct=True)
    assert p["m0"] == pc.month_no("2024-01-01") and p["n"] == 3
    t84 = p["types"][1]
    assert t84["k"] == "84" and t84["n"] == 5 and len(t84["est"]) == 3
    assert 50000 < t84["est"][2] < 53000                      # 1층 4억·해제 6억은 시세 계산에서 빠짐
    assert t84["lo"][2] < t84["est"][2] < t84["hi"][2]
    assert pc.type_prices(p) == [[24, p["types"][0]["est"][2], "59"], [34, t84["est"][2], "84"]]
    flags = {(row[3]): row[5] for row in p["tr"]}
    assert flags[40000] == pc.F_LOW and flags[60000] == pc.F_CANCEL and p["tr"][-1][2] == 0


def test_market_index_ignores_which_complexes_traded():
    # 비싼 단지와 싼 단지가 해마다 번갈아 거래돼도 지역 지수는 실제 상승(월 1%)만 따라갑니다.
    rows = []
    for mo in range(24):
        ts = pd.Timestamp(2020, 1, 1) + pd.DateOffset(months=mo)
        for k, base in (("A", 1000), ("B", 300)):
            reps = 40 if (mo // 6) % 2 == (k == "A") else 5
            for _ in range(reps):
                rows.append(dict(complex_id=k, gu="서구", date=ts, area=84.0, price=base * 84 * 1.01 ** mo,
                                 cancelled=False, direct=False, kind="매매"))
    df = pd.DataFrame(rows)
    out = pc.market_payload(df, {"exclude_direct": True}, "2021-12-31", "대전")
    idx = out["region"]["idx"]
    assert idx[0] == pytest.approx(100.0) and idx[22] / idx[2] == pytest.approx(1.01 ** 20, rel=0.005)
    assert out["region"]["vol"][0] == 45 and set(out["gu"]) == {"서구"}
    assert out["terms"][0][0] == "노무현"


def test_ecos_parse_and_market_macro():
    from djdex import ecos
    payload = {"StatisticSearch": {"row": [{"TIME": "202401", "DATA_VALUE": "113.2"},
                                           {"TIME": "202402", "DATA_VALUE": ""}]}}
    assert ecos.parse(payload) == {"2024-01": 113.2}
    assert ecos.parse({"RESULT": {"CODE": "INFO-200"}}) == {}
    df = pd.DataFrame([dict(complex_id="A", gu="서구", date=pd.Timestamp("2024-01-10"), area=84.0, price=50000,
                            cancelled=False, direct=False, kind="매매")])
    out = pc.market_payload(df, {}, "2024-02-29", "대전", {"cpi": {"2024-01": 113.2}})
    assert out["cpi"] == [113.2, None]
