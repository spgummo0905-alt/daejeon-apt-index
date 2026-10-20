"""지표표를 정적 HTML 사이트로 내보냅니다 (메인, 단지별 페이지, 산출 방법)."""
from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import charts
from .charts import eok, grade, nan as _nan
from .config import ROOT


def slug(complex_id: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]+", complex_id):
        return complex_id
    return hashlib.sha1(complex_id.encode("utf-8")).hexdigest()[:12]


def fmt_price(manwon) -> str:
    """만원 단위 가격을 '3.42억' / '8,500만' 으로."""
    return eok(manwon, 2)


def fmt_pct(x, signed: bool = True) -> str:
    if _nan(x):
        return "-"
    return f"{x * 100:+.1f}%" if signed else f"{x * 100:.1f}%"


def fmt_score(x) -> str:
    return "-" if _nan(x) else f"{x:.0f}"


def fmt_raw(v, factor: dict) -> str:
    """입지 원래 값: 거리는 m/km, 개수는 '곳'."""
    if factor["kind"] == "nearest":
        if _nan(v):
            return f"반경 {factor['radius'] / 1000:g}km 안에 없음"
        return f"{v:.0f}m" if v < 1000 else f"{v / 1000:.1f}km"
    return "-" if _nan(v) else f"{int(v)}곳"


def svg_chart(points, width: int = 640, height: int = 220) -> str:
    """예전 단순 그래프 호환용: 비교선 없는 연도별 가격."""
    return charts.line_compare(points, [], "이 단지", "", width, height)


def _top_share(series: pd.Series) -> pd.Series:
    """값이 클수록 상위. 반환: '상위 x%' 의 x (1~100)."""
    valid = series.dropna()
    rank = valid.rank(ascending=False, method="min")
    out = pd.Series(index=series.index, dtype=float)
    out[valid.index] = (rank / len(valid) * 100).clip(lower=1)
    return out


def _env() -> Environment:
    env = Environment(loader=FileSystemLoader(ROOT / "templates"),
                      autoescape=select_autoescape(["html"]))
    env.filters.update(price=fmt_price, pct=fmt_pct, score=fmt_score, eok=eok)
    env.tests["nan"] = _nan
    return env


def _summary(c: dict, n: int, gu_med: dict, factors: list[dict], years: list[int],
             real: bool, region: str) -> list[str]:
    """단지 페이지 맨 위 '한눈에 보기' 문장들."""
    out = []
    if not _nan(c["index"]):
        g, gname = grade(c["index"])
        out.append(f"종합 지수 {c['index']:.0f}점, {region} {n}개 단지 중 {c['rank']}위로 상위 {c['index_top']:.0f}%입니다 ({g}등급 {gname}).")
    if not _nan(c.get("location_top")):
        best = max(factors, key=lambda f: -1 if _nan(c.get(f["key"] + "_pct")) else c[f["key"] + "_pct"])
        out.append(f"입지점수는 {region} 상위 {c['location_top']:.0f}%이고, 가장 강한 항목은 {best['label']}입니다.")
    for n_y in years:
        v = c.get(f"cagr_{n_y}y")
        if not _nan(v):
            kind = "실질" if real else "명목"
            word = "올랐습니다" if v > 0 else "내렸습니다"
            out.append(f"최근 {n_y}년 동안 {kind} 기준 연평균 {abs(v) * 100:.1f}%씩 {word}.")
            break
    med = gu_med.get(c["gu"])
    if not _nan(c.get("price_ref")) and med:
        diff = c["price_ref"] / med - 1
        if abs(diff) < 0.03:
            out.append(f"84㎡ 환산가는 {c['gu']} 중위가와 거의 같습니다.")
        else:
            out.append(f"84㎡ 환산가는 {c['gu']} 중위가보다 {abs(diff) * 100:.0f}% {'비쌉' if diff > 0 else '저렴합'}니다."
                       )
    return out


def build(table: pd.DataFrame, hist: pd.DataFrame, trades: pd.DataFrame, meta: dict,
          cfg, out_dir: Path, demo: bool = False, kakao_js_key: str | None = None,
          geo: dict | None = None) -> int:
    env = _env()
    out_dir = Path(out_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    (out_dir / "apt").mkdir(parents=True)
    shutil.copytree(ROOT / "static", out_dir / "static")

    ref = cfg.metrics["reference_area"]
    years = cfg.metrics["cagr_years"]
    factors = cfg.location_factors
    geo = geo or {}
    table = table.copy()
    table["index_top"] = _top_share(table["index"])
    table["location_top"] = _top_share(table["location_score"])
    n_total = len(table)

    rows = []
    for cid, r in table.iterrows():
        d = r.to_dict()
        d["complex_id"], d["slug"] = cid, slug(cid)
        # 결측이 섞이면 pandas가 정수 열을 float로 바꾸므로 표시용으로 되돌립니다.
        d["build_year"] = None if _nan(d.get("build_year")) else int(d["build_year"])
        d["grade"], d["grade_name"] = grade(d.get("index"))
        ll = geo.get(cid)
        d["lat"], d["lng"] = (ll[0], ll[1]) if ll else (None, None)
        rows.append(d)

    # 구별 통계
    gus = list(cfg.districts.values())
    gu_stats = []
    for gu in gus:
        sub = table[table["gu"] == gu]
        if sub.empty:
            continue
        gu_stats.append({"gu": gu, "n": len(sub), "price": sub["price_ref"].median(),
                         "index": sub["index"].median()})
    gu_med = {g["gu"]: g["price"] for g in gu_stats if not _nan(g["price"])}

    # TOP 목록
    def top(df, col, k=5):
        return [next(r for r in rows if r["complex_id"] == cid) for cid in df.nlargest(k, col).index]

    has_loc = table["location_score"].notna().any()
    priced = table.dropna(subset=["price_ref"])
    value_picks = []
    if has_loc and not priced.empty:
        cand = priced[(priced["location_score"] > priced["location_score"].median())
                      & (priced["price_ref"] < priced["price_ref"].median())]
        value_picks = top(cand.assign(v=cand["location_score"] - cand["price_ref"].rank(pct=True) * 100), "v")
    tops = [
        {"title": "종합 지수 TOP 5", "items": top(table.dropna(subset=["index"]), "index"),
         "value": lambda r: f"{r['index']:.0f}점"},
        {"title": f"{years[0]}년 수익률 TOP 5", "items": top(table.dropna(subset=[f"cagr_{years[0]}y"]), f"cagr_{years[0]}y"),
         "value": lambda r, k=f"cagr_{years[0]}y": fmt_pct(r[k])},
    ]
    if value_picks:
        tops.append({"title": "가성비 TOP 5", "items": value_picks,
                     "value": lambda r: f"입지 {r['location_score']:.0f} · {eok(r['price_ref'])}"})

    link = "apt/{}.html"
    index_charts = {
        "map": charts.responsive(charts.dot_map, [dict(r, href=link.format(r["slug"])) for r in rows],
                                mob={"width": 360, "max_height": 440}) if geo else "",
        "gu_price": charts.hbar([(g["gu"], g["price"], eok(g["price"])) for g in gu_stats],
                                unit_tip=" (84㎡ 환산 중위)"),
        "gu_index": charts.hbar([(g["gu"], g["index"], f"{g['index']:.0f}점") for g in gu_stats
                                 if not _nan(g["index"])], vmax=100, unit_tip=" (지수 중위)"),
        "scatter": charts.responsive(charts.value_scatter, [dict(r, x=r["location_score"], y=r["price_ref"],
                                    href=link.format(r["slug"])) for r in rows],
                                    mob={"width": 360, "height": 320}) if has_loc else "",
        "hist": charts.responsive(charts.histogram, list(table["index"]), mob={"width": 360}),
    }
    common = dict(meta=meta, region=cfg.region_name, demo=demo, ref_area=int(ref),
                  window=cfg.metrics["window_months"], years=years, factors=factors, gus=gus,
                  grades=charts.GRADES, grade_legend=charts.grade_legend())

    (out_dir / "index.html").write_text(env.get_template("index.html").render(
        rows=rows, root="", charts=index_charts, tops=tops, gu_stats=gu_stats, **common), encoding="utf-8")
    (out_dir / "methodology.html").write_text(
        env.get_template("methodology.html").render(root="", cfg=cfg, **common), encoding="utf-8")

    # 단지 페이지
    trades = trades.copy()
    trades["date"] = pd.to_datetime(trades["date"])
    by_cid = dict(tuple(trades.sort_values("date", ascending=False).groupby("complex_id")))
    hist_by = dict(tuple(hist.groupby("complex_id")))
    region_line = [(y, v * ref) for y, v in meta.get("region_history", [])]
    factor_med = {f["key"]: table[f["key"] + "_pct"].median() if f["key"] + "_pct" in table else float("nan")
                  for f in factors}
    index_values = list(table["index"])
    by_dong: dict[tuple, list] = {}
    for r in rows:
        by_dong.setdefault((r["gu"], r["dong"]), []).append(r)
    tpl = env.get_template("apt.html")
    for c in rows:
        cid = c["complex_id"]
        h = hist_by.get(cid)
        main = [] if h is None else [(int(y), float(p) * ref) for y, p in zip(h["year"], h["ppm2"])]
        tr = by_cid.get(cid)
        tr_list = [] if tr is None else tr.to_dict("records")
        cutoff = pd.Timestamp(meta["asof"].replace(".", "-") + "-01") - pd.DateOffset(years=10)
        has_loc_c = not _nan(c.get("location_score"))
        comps = [("입지점수", c.get("location_score"), f"{fmt_score(c.get('location_score'))}점")]
        comps += [(f"{n}년 수익률 백분위", c.get(f"cagr_{n}y_pct"), fmt_score(c.get(f"cagr_{n}y_pct"))) for n in years]
        c_charts = {
            "gauge": charts.gauge(c.get("index")),
            "components": charts.responsive(charts.hbar, [(k, v, s) for k, v, s in comps], vmax=100,
                                            marker=50, marker_label="대전 중간(50)",
                                            desk={"width": 520}, mob={"width": 340}),
            "price": charts.responsive(charts.line_compare, main, region_line, "이 단지", f"{cfg.region_name} 중위",
                                       mob={"width": 360, "height": 240}),
            "trades": charts.responsive(charts.trade_dots, [t for t in tr_list if t["date"] >= cutoff],
                                        mob={"width": 360, "height": 240}),
            "radar": charts.radar([(f["label"].replace("까지 거리", "").replace("반경 1km ", ""),
                                    c.get(f["key"] + "_pct"), factor_med[f["key"]]) for f in factors]) if has_loc_c else "",
            "hist": charts.responsive(charts.histogram, index_values, highlight=c.get("index"), height=180,
                                      mob={"width": 360}),
        }
        loc_rows = [{"label": f["label"], "pct": c.get(f["key"] + "_pct"),
                     "raw": fmt_raw(c.get(f["key"] + "_raw"), f) if f["key"] + "_raw" in c else None}
                    for f in factors]
        neighbors = [r for r in by_dong.get((c["gu"], c["dong"]), []) if r["complex_id"] != cid][:6]
        html = tpl.render(
            c=c, charts=c_charts, recent=tr_list[:15], root="../", latlng=geo.get(cid),
            kakao_js_key=kakao_js_key, loc_rows=loc_rows, neighbors=neighbors,
            summary=_summary(c, n_total, gu_med, factors, years, meta.get("real_returns"), cfg.region_name),
            n_total=n_total, **common)
        (out_dir / "apt" / f"{c['slug']}.html").write_text(html, encoding="utf-8")
    return len(rows)
