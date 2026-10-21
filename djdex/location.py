"""입지점수: 항목별로 대전 단지 중 백분위를 매기고 가중평균합니다 (0~100)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def percentile(s: pd.Series, higher_is_better: bool = True, ref: pd.Index | None = None) -> pd.Series:
    """0~100 백분위. ref 를 주면 그 단지들(보통 소규모 제외 단지)의 분포를 기준으로 매기고,
    ref 밖 단지도 그 분포 안 어디쯤인지로 점수를 받습니다. 기준 값이 하나뿐이면 50."""
    out = pd.Series(np.nan, index=s.index, dtype=float)
    valid = s.dropna()
    base = valid if ref is None else valid[valid.index.isin(ref)]
    if valid.empty or base.empty:
        return out
    if len(base) == 1:
        out[valid.index] = 50.0
        return out
    b = np.sort(base.to_numpy(dtype=float))
    v = valid.to_numpy(dtype=float)
    # 중간 순위: 같은 값이 여럿이면 가운데 순위. 기준 집합 안 값은 (순위-1)/(n-1) 과 같습니다.
    mid = (np.searchsorted(b, v, "left") + np.searchsorted(b, v, "right")) / 2
    pct = np.clip((mid - 0.5) / (len(b) - 1), 0, 1) * 100
    out[valid.index] = pct if higher_is_better else 100 - pct
    return out


def score(poi: pd.DataFrame, factors: list[dict], ref: pd.Index | None = None) -> pd.DataFrame:
    """poi: index=complex_id, 열=factor key. 반환: 항목별 백분위(<key>_pct)와 location_score.

    반경 안에 시설이 없는 'nearest' 항목(None)은 최하점(0)으로 봅니다.
    """
    out = pd.DataFrame(index=poi.index)
    total_w = sum(f["weight"] for f in factors)
    acc = pd.Series(0.0, index=poi.index)
    for f in factors:
        col = poi.get(f["key"], pd.Series(index=poi.index, dtype=float)).astype(float)
        if f["kind"] == "nearest":
            pct = percentile(col, higher_is_better=False, ref=ref).fillna(0.0)
        else:
            pct = percentile(col.fillna(0), higher_is_better=True, ref=ref).fillna(0.0)
        out[f"{f['key']}_pct"] = pct
        acc += pct * f["weight"]
    out["location_score"] = acc / total_w
    return out
