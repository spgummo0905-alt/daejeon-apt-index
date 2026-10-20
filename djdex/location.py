"""입지점수: 항목별로 대전 전체 단지 중 백분위를 매기고 가중평균합니다 (0~100)."""
from __future__ import annotations

import pandas as pd


def percentile(s: pd.Series, higher_is_better: bool = True) -> pd.Series:
    """값이 있는 단지끼리 0~100 백분위. 값이 하나뿐이면 50."""
    valid = s.dropna()
    out = pd.Series(index=s.index, dtype=float)
    if valid.empty:
        return out
    if len(valid) == 1:
        out[valid.index] = 50.0
        return out
    ranks = valid.rank(method="average", ascending=higher_is_better)
    out[valid.index] = (ranks - 1) / (len(valid) - 1) * 100
    return out


def score(poi: pd.DataFrame, factors: list[dict]) -> pd.DataFrame:
    """poi: index=complex_id, 열=factor key. 반환: 항목별 백분위(<key>_pct)와 location_score.

    반경 안에 시설이 없는 'nearest' 항목(None)은 최하점(0)으로 봅니다.
    """
    out = pd.DataFrame(index=poi.index)
    total_w = sum(f["weight"] for f in factors)
    acc = pd.Series(0.0, index=poi.index)
    for f in factors:
        col = poi.get(f["key"], pd.Series(index=poi.index, dtype=float)).astype(float)
        if f["kind"] == "nearest":
            pct = percentile(col, higher_is_better=False).fillna(0.0)
        else:
            pct = percentile(col.fillna(0), higher_is_better=True).fillna(0.0)
        out[f"{f['key']}_pct"] = pct
        acc += pct * f["weight"]
    out["location_score"] = acc / total_w
    return out
