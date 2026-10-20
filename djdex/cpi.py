"""소비자물가지수(CPI)로 명목 가격을 실질 가격으로 바꿉니다.

data/cpi.csv 형식: ym,cpi  (예: 2020-01,99.75)
통계청 KOSIS '소비자물가지수(2020=100)' 전국 총지수 월별 값을 넣으면 됩니다.
파일이 비어 있으면 수익률은 명목 기준으로 계산되고 사이트에 '명목'으로 표시됩니다.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd


class CPI:
    def __init__(self, series: pd.Series):
        self.s = series.sort_index()

    @classmethod
    def load(cls, path: Path) -> "CPI | None":
        if not path.exists():
            return None
        df = pd.read_csv(path, comment="#")
        if df.empty:
            return None
        s = pd.Series(df["cpi"].astype(float).values,
                      index=pd.PeriodIndex(df["ym"], freq="M"))
        return cls(s)

    def at(self, ts: pd.Timestamp) -> float | None:
        """그 달 값, 없으면 그 이전 가장 가까운 달 값."""
        p = ts.to_period("M")
        prior = self.s[self.s.index <= p]
        return float(prior.iloc[-1]) if not prior.empty else None
