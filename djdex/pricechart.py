"""단지 페이지 시세 차트 자료: 평형별 추정 시세와 예상 거래 범위, 지역·구 지수.

추정 시세
- 평형(전용면적 묶음)마다 거래가를 그 평형 대표 면적으로 맞춘 뒤(㎡당 가격 × 대표 면적) 로그를 씁니다.
- 달마다 앞뒤 6개월 거래를 가까울수록 크게(삼각 가중) 평균합니다. 거래가 드물면 앞뒤 12개월까지 넓혀
  보고 그 달은 '거래 희소'로 표시합니다 (점선).
- 해제 거래와 (설정에 따라) 직거래는 빼고, 1~3층은 시세보다 싸게 거래되는 일이 많아 뺍니다
  (저층 거래가 절반이 넘는 평형은 그대로 씁니다). 한 번 계산한 뒤 크게 벗어난 거래는 빼고 다시 계산합니다.
- 예상 거래 범위는 시세에서 벗어난 정도(앞뒤 12개월)로 구한 80% 범위입니다 (10건 중 8건이 이 안).

지역 지수
- 같은 단지·같은 면적의 거래끼리 비교하는 방식(단지·면적 고정효과)으로 달마다 지역 전체 가격 수준을 구합니다.
  비싼 단지가 많이 거래된 달에 지수가 튀는 것을 막습니다. 석 달 이동평균, 첫 달 = 100.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

H, H_WIDE, H_BAND = 7, 13, 13   # 삼각 가중 반폭(개월): 6개월, 12개월, 범위 12개월
Z80 = 1.2816                     # 80% 범위 (양쪽 10%씩)
LOW_FLOOR = 3

F_CANCEL, F_DIRECT, F_PRESALE, F_LOW = 1, 2, 4, 8


def month_no(ts) -> int:
    ts = pd.Timestamp(ts)
    return ts.year * 12 + ts.month - 1


def _kernel(h: int) -> np.ndarray:
    d = np.arange(-h + 1, h)
    return 1 - np.abs(d) / h


def _conv(x: np.ndarray, k: np.ndarray) -> np.ndarray:
    """가운데 맞춘 합성곱, 길이는 x 그대로 (x 가 커널보다 짧아도)."""
    full = np.convolve(x, k)
    start = (len(k) - 1) // 2
    return full[start:start + len(x)]


def estimate(m: np.ndarray, logp: np.ndarray, n: int, trim: bool = True) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """m: 0..n-1 달 번호, logp: 로그 가격. 반환 (추정 로그 가격, 희소 여부, 범위 표준편차) — 길이 n.
    첫 거래 달 앞과, 앞뒤 12개월에 거래가 하나도 없는 달은 NaN."""
    est = np.full(n, np.nan)
    sparse = np.zeros(n, dtype=bool)
    if len(m) == 0:
        return est, sparse, np.full(n, np.nan)

    def fit(mm, yy):
        cnt = np.bincount(mm, minlength=n).astype(float)
        s = np.bincount(mm, weights=yy, minlength=n)
        out, sp = np.full(n, np.nan), np.zeros(n, dtype=bool)
        cw, sw = _conv(cnt, _kernel(H_WIDE)), _conv(s, _kernel(H_WIDE))
        cn, sn = _conv(cnt, _kernel(H)), _conv(s, _kernel(H))
        wide = cw > 1e-9
        out[wide] = sw[wide] / cw[wide]
        near = cn >= 1.0
        out[near] = sn[near] / cn[near]
        box = _conv(cnt, np.ones(7))            # 앞뒤 3개월 거래 수
        sp[:] = (box < 2) | ~near
        return out, sp

    est, sparse = fit(m, logp)
    if trim and len(m) >= 6:
        r = logp - est[m]
        mad = np.nanmedian(np.abs(r - np.nanmedian(r))) * 1.4826
        keep = np.abs(r) <= max(0.15, 3 * mad)
        if keep.sum() >= 3 and not keep.all():
            m, logp = m[keep], logp[keep]
            est, sparse = fit(m, logp)
    est[: int(m.min())] = np.nan
    sparse[np.isnan(est)] = False
    # 범위: 시세에서 벗어난 정도(로그)의 표준편차, 앞뒤 12개월. 거래가 적으면 평형 전체 값.
    r = logp - est[m]
    ok = ~np.isnan(r)
    glob = float(np.sqrt(np.mean(r[ok] ** 2))) if ok.sum() >= 3 else 0.06
    cnt = np.bincount(m[ok], minlength=n).astype(float)
    r2 = np.bincount(m[ok], weights=r[ok] ** 2, minlength=n)
    k = _kernel(H_BAND)
    c, s = _conv(cnt, k), _conv(r2, k)
    sig = np.where(c >= 4, np.sqrt(np.divide(s, c, out=np.zeros(n), where=c > 0)), glob)
    sig = np.clip(sig, 0.03, 0.30)
    sig[np.isnan(est)] = np.nan
    return est, sparse, sig


WOLSE_RATE = 0.06   # 월세 계약을 줄 세울 때만 쓰는 보증금 → 월세 환산 비율 (연)


def _int(x) -> int | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else int(round(x))


def complex_payload(trades: list[dict], types: list[dict], asof_m: int, exclude_direct: bool,
                    start_m: int | None = None, rents: list[dict] | None = None) -> dict | None:
    """단지 하나의 차트 자료. trades 는 거래 dict 목록(각각 'akey' 가 달린 상태), types 는 site._area_types 결과.
    rents(전월세)가 있으면 평형마다 전세 추정 보증금(je), 달별 전세 계약 수(rv: [[달, 신규, 갱신, 미표기]]),
    최근 월세 대표 계약(wr: [보증금, 월세, 계약 수])도 넣습니다.
    반환: {m0, n, types: [{k, py, su, a, n, est, lo, hi, sp, je?, rv?, wr?}], tr: [[달, 일, 평형 번호, 가격, 층, 표시]]}.
    su 는 공급면적(㎡, 모르면 None), py 는 공급 평형(모르면 어림)."""
    rows = [t for t in trades if t.get("akey") and not _nan(t.get("price")) and not _nan(t.get("area"))]
    if not rows:
        return None
    first = min(month_no(t["date"]) for t in rows)
    m0 = max(first, start_m) if start_m is not None else first
    n = asof_m - m0 + 1
    if n <= 0:
        return None
    idx = {t["key"]: i for i, t in enumerate(types)}
    out_types = []
    for t in types:
        tr = [x for x in rows if x["akey"] == t["key"] and month_no(x["date"]) >= m0]
        a_rep = float(np.median([x["area"] for x in tr])) if tr else float(t["key"])
        use = [x for x in tr if not x.get("cancelled") and not (exclude_direct and x.get("direct"))]
        low = [x for x in use if _is_low(x)]
        if use and len(low) <= len(use) / 2:
            use = [x for x in use if not _is_low(x)]
        mm = np.array([month_no(x["date"]) - m0 for x in use], dtype=int)
        mm = np.clip(mm, 0, n - 1)
        lp = np.array([math.log(x["price"] / x["area"] * a_rep) for x in use], dtype=float)
        est, sp, sig = estimate(mm, lp, n)
        e = np.exp(est)
        out_types.append({
            "k": t["key"], "py": t.get("py"), "su": t.get("su"), "a": round(a_rep, 1), "n": len(tr),
            "est": [_int(v) for v in e],
            "lo": [_int(v) for v in e * np.exp(-Z80 * sig)],
            "hi": [_int(v) for v in e * np.exp(Z80 * sig)],
            "sp": [1 if v else 0 for v in sp],
        })
    if rents:
        _add_rent(out_types, rents, m0, n, asof_m)
    tr_out = []
    for x in sorted(rows, key=lambda x: x["date"]):
        mo = month_no(x["date"])
        if mo < m0 or mo > asof_m:
            continue
        flags = ((F_CANCEL if x.get("cancelled") else 0) | (F_DIRECT if x.get("direct") else 0)
                 | (F_PRESALE if x.get("kind", "매매") != "매매" else 0) | (F_LOW if _is_low(x) else 0))
        fl = x.get("floor")
        tr_out.append([mo - m0, pd.Timestamp(x["date"]).day, idx[x["akey"]], int(x["price"]),
                       -1 if _nan(fl) else int(fl), flags])
    return {"m0": m0, "n": n, "types": out_types, "tr": tr_out}


def _add_rent(types: list[dict], rents: list[dict], m0: int, n: int, asof_m: int) -> None:
    """전월세를 대표 면적이 가장 가까운(3㎡ 안) 평형에 붙입니다.
    전세(월세 없는 계약)는 매매와 같은 방식으로 평형별 추정 보증금(je)을 구하고, 갱신 계약은 인상 폭이 묶여(5% 상한)
    시세보다 낮게 나오므로 시세 계산에서는 빼고 계약 수(rv)에만 셉니다.
    월세는 보증금과 월세 조합이 계약마다 달라 평균을 내지 않고, 최근 1년(적으면 2년) 신규 계약 가운데 값인 실제 계약 하나(wr)를 보여 줍니다."""
    areas = np.array([t["a"] for t in types])
    jeonse: dict[int, list] = {}
    wolse: dict[int, list] = {}
    for r in rents:
        if _nan(r.get("area")) or not r.get("deposit"):
            continue
        mo = month_no(r["date"])
        if mo < m0 or mo > asof_m:
            continue
        k = int(np.argmin(np.abs(areas - r["area"])))
        if abs(areas[k] - r["area"]) <= 3:
            (wolse if r.get("monthly") else jeonse).setdefault(k, []).append((mo - m0, r))
    for k, rows in jeonse.items():
        t = types[k]
        use = [(m, r) for m, r in rows if r.get("contract") != "갱신"]
        low = [1 for _, r in use if _is_low(r)]
        if use and len(low) <= len(use) / 2:
            use = [(m, r) for m, r in use if not _is_low(r)]
        if len(use) >= 3:
            mm = np.array([m for m, _ in use], dtype=int)
            lp = np.array([math.log(r["deposit"] / r["area"] * t["a"]) for _, r in use], dtype=float)
            est, _, _ = estimate(mm, lp, n)
            t["je"] = [_int(v) for v in np.exp(est)]
        vol: dict[int, list] = {}
        for m, r in rows:
            c = vol.setdefault(m, [0, 0, 0])
            c[0 if r.get("contract") == "신규" else 1 if r.get("contract") == "갱신" else 2] += 1
        t["rv"] = [[m, *c] for m, c in sorted(vol.items())]
    last = asof_m - m0
    for k, rows in wolse.items():
        for span in (12, 24):
            use = [r for m, r in rows if m > last - span and r.get("contract") != "갱신"]
            if use:
                break
        if use:
            # 보증금을 월세로 바꿔(연 6%) 한 줄로 세운 뒤 가운데 계약. 비율은 줄 세우기에만 써서 보여 주는 값은 실제 계약 그대로
            use.sort(key=lambda r: r["monthly"] + r["deposit"] * WOLSE_RATE / 12)
            mid = use[(len(use) - 1) // 2]
            types[k]["wr"] = [int(mid["deposit"]), int(mid["monthly"]), len(use)]


def type_quotes(payload: dict | None, recent: int = 24) -> list[dict]:
    """단지 페이지 '평형별 시세': 평형마다 지금 매매·전세 추정 시세와 최근 월세 대표 계약.
    [{k, a, su, sale, je, ratio, wr}] (최근 recent 개월 안에 값이 있는 것만, 하나도 없는 평형은 뺌)."""
    if not payload:
        return []
    n, out = payload["n"], []

    def now(series):
        li = max((i for i, v in enumerate(series or []) if v is not None), default=-1)
        return series[li] if li >= 0 and li >= n - recent else None

    for t in payload["types"]:
        sale, je = now(t["est"]), now(t.get("je"))
        if sale is None and je is None and not t.get("wr"):
            continue
        out.append({"k": t["k"], "a": t["a"], "su": t.get("su"), "sale": sale, "je": je,
                    "ratio": round(je / sale * 100) if sale and je else None, "wr": t.get("wr")})
    return out


def type_prices(payload: dict | None, recent: int = 24) -> list[list]:
    """평형별 지금 추정 시세 [[평, 만원, 전용㎡ 묶음], ...] (조건으로 찾기). 최근 recent 개월 안에 시세가 있는 평형만."""
    if not payload:
        return []
    out = []
    for t in payload["types"]:
        est = t["est"]
        li = max((i for i, v in enumerate(est) if v is not None), default=-1)
        if li >= payload["n"] - recent and t.get("py"):
            out.append([t["py"], est[li], t["k"]])
    return out


def _is_low(t: dict) -> bool:
    fl = t.get("floor")
    return not _nan(fl) and int(fl) <= LOW_FLOOR


def _nan(x) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x))


def market_index(df: pd.DataFrame, m0: int, n: int, min_n: int, iters: int = 15) -> list[float | None]:
    """df: 열 key(단지·면적), m(달 번호), y(로그 ㎡당 가격). 달마다 지역 가격 수준 (첫 유효 달 = 100)."""
    if df.empty:
        return [None] * n
    df = df[df.groupby("key")["y"].transform("size") >= 2]
    if df.empty:
        return [None] * n
    b = pd.Series(0.0, index=pd.RangeIndex(n))
    mi = (df["m"] - m0).to_numpy()
    y = df["y"].to_numpy()
    keys = df["key"].to_numpy()
    for _ in range(iters):
        a = pd.Series(y - b.to_numpy()[mi]).groupby(keys).transform("mean").to_numpy()
        bt = pd.Series(y - a).groupby(mi).mean()
        b = bt.reindex(range(n))
        b = b.fillna(0.0) if b.notna().any() else b
    cnt = np.bincount(mi, minlength=n)
    raw = pd.Series(pd.Series(y - a).groupby(mi).mean().reindex(range(n)).to_numpy())
    raw[cnt < min_n] = np.nan
    smooth = raw.rolling(3, center=True, min_periods=2).mean().interpolate(limit=3, limit_area="inside")
    first = smooth.first_valid_index()
    if first is None:
        return [None] * n
    idx = np.exp(smooth - smooth[first]) * 100
    return [None if pd.isna(v) else round(float(v), 2) for v in idx]


def market_payload(trades: pd.DataFrame, filters: dict, asof, region: str, macro: dict | None = None,
                   start_m: int | None = None) -> dict:
    """시장 흐름 자료: 지역 전체·구별 지수와 월 거래량 (매매, 해제 제외). macro 가 있으면 물가·금리도."""
    df = trades.copy()
    df["date"] = pd.to_datetime(df["date"])
    if "kind" in df:
        df = df[df["kind"].fillna("매매") == "매매"]
    df = df[~df["cancelled"].astype(bool)]
    vol_df = df
    if filters.get("exclude_direct"):
        df = df[~df["direct"].astype(bool)]
    df = df[(df["area"] > 0) & (df["price"] > 0)]
    m_all = df["date"].dt.year * 12 + df["date"].dt.month - 1
    m0 = int(m_all.min()) if start_m is None else start_m
    asof_m = month_no(asof)
    n = asof_m - m0 + 1
    df = df.assign(m=m_all, y=np.log(df["price"] / df["area"]),
                   key=df["complex_id"].astype(str) + "|" + df["area"].round(0).astype(int).astype(str))
    df = df[(df["m"] >= m0) & (df["m"] <= asof_m)]
    vm = vol_df["date"].dt.year * 12 + vol_df["date"].dt.month - 1

    def vol(mask) -> list[int]:
        mm = (vm[mask] - m0).to_numpy()
        mm = mm[(mm >= 0) & (mm < n)]
        return np.bincount(mm, minlength=n).astype(int).tolist()

    out = {"m0": m0, "n": n, "region": {"name": region, "idx": market_index(df, m0, n, 30),
                                        "vol": vol(pd.Series(True, index=vol_df.index))},
           "gu": {}}
    for gu, g in df.groupby("gu"):
        out["gu"][gu] = {"idx": market_index(g, m0, n, 8), "vol": vol(vol_df["gu"] == gu)}
    if macro:
        for k, series in macro.items():
            out[k] = [series.get(_ym(m0 + i)) for i in range(n)]
    return out


def _ym(m: int) -> str:
    return f"{m // 12:04d}-{m % 12 + 1:02d}"
