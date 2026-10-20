"""지표표를 정적 HTML 사이트로 내보냅니다 (메인 목록, 단지별 페이지, 산출 방법)."""
from __future__ import annotations

import hashlib
import math
import re
import shutil
from pathlib import Path

import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape

from .config import ROOT


def slug(complex_id: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]+", complex_id):
        return complex_id
    return hashlib.sha1(complex_id.encode("utf-8")).hexdigest()[:12]


def _nan(x) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x))


def fmt_price(manwon) -> str:
    """만원 단위 가격을 '3.42억' / '8,500만' 으로."""
    if _nan(manwon):
        return "-"
    if manwon >= 10000:
        return f"{manwon / 10000:.2f}억"
    return f"{manwon:,.0f}만"


def fmt_pct(x, signed: bool = True) -> str:
    if _nan(x):
        return "-"
    return f"{x * 100:+.1f}%" if signed else f"{x * 100:.1f}%"


def fmt_score(x) -> str:
    return "-" if _nan(x) else f"{x:.0f}"


def svg_chart(points: list[tuple[int, float]], width: int = 640, height: int = 220) -> str:
    """연도별 가격(만원) 선 그래프. 외부 라이브러리 없이 인라인 SVG로 그립니다."""
    if len(points) < 2:
        return '<p class="muted">가격 그래프를 그리기에 거래 연도가 부족합니다.</p>'
    pad_l, pad_r, pad_t, pad_b = 52, 16, 16, 28
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1 = min(xs), max(xs)
    lo, hi = min(ys), max(ys)
    span = (hi - lo) or hi * 0.1 or 1
    lo, hi = lo - span * 0.1, hi + span * 0.1

    def px(x):
        return pad_l + (x - x0) / ((x1 - x0) or 1) * (width - pad_l - pad_r)

    def py(y):
        return pad_t + (hi - y) / (hi - lo) * (height - pad_t - pad_b)

    path = " ".join(f"{'M' if i == 0 else 'L'}{px(x):.1f},{py(y):.1f}" for i, (x, y) in enumerate(points))
    grid = []
    for k in range(4):
        v = lo + (hi - lo) * k / 3
        y = py(v)
        grid.append(f'<line x1="{pad_l}" x2="{width - pad_r}" y1="{y:.1f}" y2="{y:.1f}" class="grid"/>'
                    f'<text x="{pad_l - 6}" y="{y + 4:.1f}" text-anchor="end" class="axis">{fmt_price(v)}</text>')
    step = max(1, math.ceil(len(xs) / 8))
    xlabels = [f'<text x="{px(x):.1f}" y="{height - 8}" text-anchor="middle" class="axis">{x}</text>'
               for x in xs[::step]]
    dots = [f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="3" class="dot"><title>{x}년 {fmt_price(y)}</title></circle>'
            for x, y in points]
    return (f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="연도별 가격 추이">'
            + "".join(grid) + "".join(xlabels)
            + f'<path d="{path}" class="line"/>' + "".join(dots) + "</svg>")


def _env() -> Environment:
    env = Environment(loader=FileSystemLoader(ROOT / "templates"),
                      autoescape=select_autoescape(["html"]))
    env.filters.update(price=fmt_price, pct=fmt_pct, score=fmt_score)
    return env


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
    common = dict(meta=meta, region=cfg.region_name, demo=demo, ref_area=int(ref),
                  window=cfg.metrics["window_months"],
                  years=years, factors=factors, gus=list(cfg.districts.values()))

    rows = []
    for cid, r in table.iterrows():
        d = r.to_dict()
        d["complex_id"], d["slug"] = cid, slug(cid)
        # 결측이 섞이면 pandas가 정수 열을 float로 바꾸므로 표시용으로 되돌립니다.
        d["build_year"] = None if _nan(d.get("build_year")) else int(d["build_year"])
        rows.append(d)

    (out_dir / "index.html").write_text(
        env.get_template("index.html").render(rows=rows, root="", **common), encoding="utf-8")
    (out_dir / "methodology.html").write_text(
        env.get_template("methodology.html").render(root="", cfg=cfg, **common), encoding="utf-8")

    trades = trades.copy()
    trades["date"] = pd.to_datetime(trades["date"])
    by_cid = dict(tuple(trades.sort_values("date", ascending=False).groupby("complex_id")))
    hist_by = dict(tuple(hist.groupby("complex_id")))
    tpl = env.get_template("apt.html")
    for row in rows:
        cid = row["complex_id"]
        h = hist_by.get(cid)
        points = [] if h is None else [(int(y), float(p) * ref) for y, p in zip(h["year"], h["ppm2"])]
        recent = by_cid.get(cid)
        recent = [] if recent is None else recent.head(15).to_dict("records")
        loc = (geo or {}).get(cid)
        html = tpl.render(c=row, chart=svg_chart(points), recent=recent, root="../",
                          latlng=loc, kakao_js_key=kakao_js_key, **common)
        (out_dir / "apt" / f"{row['slug']}.html").write_text(html, encoding="utf-8")
    return len(rows)
