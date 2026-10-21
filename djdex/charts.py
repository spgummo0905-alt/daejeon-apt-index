"""인라인 SVG 차트. 외부 라이브러리 없이 HTML에 바로 넣습니다.

색은 CSS 변수(--s1 파랑, --s2 주황, --s3 청록, --g-S..--g-D 등급 단계)로만 칠해
라이트/다크 모드가 CSS 한 곳에서 바뀝니다. 마우스를 올리면 static/charts.js 가
data-tip 문구를 툴팁으로 보여줍니다.
"""
from __future__ import annotations

import math
from html import escape

import pandas as pd

GRADES = [  # (하한, 등급, 이름)
    (80, "S", "최상위"),
    (65, "A", "우수"),
    (50, "B", "양호"),
    (35, "C", "보통"),
    (0, "D", "아쉬움"),
]


def nan(x) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x))


def grade(index) -> tuple[str, str]:
    if nan(index):
        return "-", "정보 부족"
    for lo, g, name in GRADES:
        if index >= lo:
            return g, name
    return "D", "아쉬움"


def eok(manwon, digits: int = 1) -> str:
    """만원 → '5.2억' / '8,500만'."""
    if nan(manwon):
        return "-"
    if manwon == 0:
        return "0"
    if manwon >= 10000:
        return f"{manwon / 10000:.{digits}f}억"
    return f"{manwon:,.0f}만"


def _tip(text: str) -> str:
    return f'data-tip="{escape(text, quote=True)}" tabindex="0"'


def _nice_ticks(lo: float, hi: float, n: int = 4) -> list[float]:
    if hi <= lo:
        hi = lo + 1
    raw = (hi - lo) / n
    mag = 10 ** math.floor(math.log10(raw))
    step = min((s * mag for s in (1, 2, 2.5, 5, 10) if s * mag >= raw), default=raw)
    start = math.floor(lo / step) * step
    ticks, v = [], start
    while v <= hi + step * 0.5:
        ticks.append(round(v, 10))
        v += step
    return ticks


def _empty(msg: str) -> str:
    return f'<p class="muted chart-empty">{escape(msg)}</p>'


# ---------------------------------------------------------------- 지도 (점)

def dot_map(points: list[dict], width: int = 960, max_height: int = 560) -> str:
    """points: lat, lng, index, name, href, gu. 단지 위치를 점으로, 색은 등급."""
    pts = [p for p in points if not nan(p.get("lat")) and not nan(p.get("lng"))]
    if len(pts) < 3:
        return _empty("단지 좌표가 아직 없어 지도를 그릴 수 없습니다.")
    lat0 = sum(p["lat"] for p in pts) / len(pts)
    kx = math.cos(math.radians(lat0))
    xs = [p["lng"] * kx for p in pts]
    ys = [p["lat"] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pad = 28
    # 가로·세로 중 더 빡빡한 쪽에 맞춰 축척을 정하고, 남는 쪽은 가운데 정렬합니다.
    scale = min((width - 2 * pad) / ((x1 - x0) or 1e-6), (max_height - 2 * pad) / ((y1 - y0) or 1e-6))
    height = int(max(280, (y1 - y0) * scale + 2 * pad))
    ox = (width - (x1 - x0) * scale) / 2
    oy = (height - (y1 - y0) * scale) / 2

    def proj(p):
        return ox + (p["lng"] * kx - x0) * scale, height - oy - (p["lat"] - y0) * scale

    # 구 이름을 그 구 단지들의 중심에 옅게 적어 위치 감을 줍니다.
    labels = []
    by_gu: dict[str, list] = {}
    for p in pts:
        by_gu.setdefault(p.get("gu", ""), []).append(proj(p))
    for gu, xy in by_gu.items():
        if gu and len(xy) >= 3:
            cx = sum(a for a, _ in xy) / len(xy)
            cy = sum(b for _, b in xy) / len(xy)
            labels.append(f'<text x="{cx:.0f}" y="{cy:.0f}" class="map-gu" text-anchor="middle">{escape(gu)}</text>')

    dots = []
    # 높은 등급이 위에 그려지도록 지수 오름차순
    for p in sorted(pts, key=lambda p: -1 if nan(p.get("index")) else p["index"]):
        x, y = proj(p)
        g, gname = grade(p.get("index"))
        idx = "-" if nan(p.get("index")) else f"{p['index']:.0f}"
        tip = f"{p['name']}\n{p.get('gu', '')} {p.get('dong', '')}\n지수 {idx} · {g}등급 {gname}"
        dots.append(
            f'<a href="{escape(p["href"])}" class="mark" {_tip(tip)}>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" class="hit"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6.5" class="dot g-{g}"/></a>')
    return (f'<svg viewBox="0 0 {width} {height}" class="chart map" role="img" '
            f'aria-label="대전 단지 위치와 등급 지도">{"".join(labels)}{"".join(dots)}</svg>')


def grade_legend() -> str:
    items = "".join(
        f'<span class="legend-item"><span class="key-dot g-{g}"></span>{g} {name}'
        f'<span class="muted"> {lo}점 이상</span></span>' if lo else
        f'<span class="legend-item"><span class="key-dot g-{g}"></span>{g} {name}'
        f'<span class="muted"> 35점 미만</span></span>'
        for lo, g, name in GRADES)
    return f'<div class="legend">{items}</div>'


# ---------------------------------------------------------------- 가로 막대

def hbar(items: list[tuple[str, float, str]], width: int = 360, unit_tip: str = "",
         marker: float | None = None, marker_label: str = "", vmax: float | None = None) -> str:
    """items: (이름, 값, 표시문자열). 한 계열이라 모두 같은 색(--s1)."""
    items = [(k, v, s) for k, v, s in items if not nan(v)]
    if not items:
        return _empty("표시할 값이 없습니다.")
    row, gap, value_w = 30, 8, 64
    # 한글 12px 기준 글자당 약 12px로 이름 칸 너비를 잡습니다.
    label_w = max(56, max(len(k) for k, _, _ in items) * 12 + 12)
    height = len(items) * (row + gap) + (18 if marker is not None else 0)
    vmax = vmax or max(v for _, v, _ in items) or 1
    plot_w = width - label_w - value_w
    out = []
    for i, (name, v, shown) in enumerate(items):
        y = i * (row + gap)
        w = max(2.0, v / vmax * plot_w)
        out.append(
            f'<g class="mark" {_tip(f"{name} {shown}{unit_tip}")}>'
            f'<rect x="0" y="{y}" width="{width}" height="{row + gap}" class="hit"/>'
            f'<text x="{label_w - 8}" y="{y + row / 2 + 5}" text-anchor="end" class="lbl">{escape(name)}</text>'
            f'<path d="{_bar_path(label_w, y + 4, w, row - 8)}" class="bar"/>'
            f'<text x="{label_w + w + 6}" y="{y + row / 2 + 5}" class="val">{escape(shown)}</text></g>')
    if marker is not None:
        mx = label_w + marker / vmax * plot_w
        out.append(f'<line x1="{mx:.1f}" x2="{mx:.1f}" y1="0" y2="{height - 16}" class="ref"/>'
                   f'<text x="{mx:.1f}" y="{height - 2}" text-anchor="middle" class="axis">{escape(marker_label)}</text>')
    return f'<svg viewBox="0 0 {width} {height}" class="chart hbar" role="img">{"".join(out)}</svg>'


def _bar_path(x: float, y: float, w: float, h: float, r: float = 4) -> str:
    """오른쪽 끝만 둥근 막대 (기준선 쪽은 각지게)."""
    r = min(r, w / 2, h / 2)
    return (f"M{x:.1f},{y:.1f}H{x + w - r:.1f}Q{x + w:.1f},{y:.1f} {x + w:.1f},{y + r:.1f}"
            f"V{y + h - r:.1f}Q{x + w:.1f},{y + h:.1f} {x + w - r:.1f},{y + h:.1f}H{x:.1f}Z")


# ---------------------------------------------------------------- 산점도 (가성비)

def value_scatter(points: list[dict], width: int = 720, height: int = 380) -> str:
    """x=입지점수, y=84㎡ 환산가. 중위선으로 4분면, '입지 좋고 저렴' 칸을 강조."""
    pts = [p for p in points if not nan(p.get("x")) and not nan(p.get("y"))]
    if len(pts) < 5:
        return _empty("입지점수와 가격이 모두 있는 단지가 부족합니다.")
    xs = sorted(p["x"] for p in pts)
    ys = sorted(p["y"] for p in pts)
    xmed, ymed = xs[len(xs) // 2], ys[len(ys) // 2]
    pl, pr, pt, pb = 56, 16, 16, 40
    yt = _nice_ticks(0, ys[-1] * 1.05)
    ymax = yt[-1]

    def px(v):
        return pl + v / 100 * (width - pl - pr)

    def py(v):
        return pt + (1 - v / ymax) * (height - pt - pb)

    out = []
    for t in yt:
        out.append(f'<line x1="{pl}" x2="{width - pr}" y1="{py(t):.1f}" y2="{py(t):.1f}" class="grid"/>'
                   f'<text x="{pl - 8}" y="{py(t) + 4:.1f}" text-anchor="end" class="axis">{eok(t, 0)}</text>')
    for t in (0, 25, 50, 75, 100):
        out.append(f'<text x="{px(t):.1f}" y="{height - pb + 18}" text-anchor="middle" class="axis">{t}</text>')
    out.append(f'<text x="{(pl + width - pr) / 2:.0f}" y="{height - 4}" text-anchor="middle" class="axis">입지점수 →</text>')
    # 강조 4분면 배경
    out.append(f'<rect x="{px(xmed):.1f}" y="{py(ymed):.1f}" width="{width - pr - px(xmed):.1f}" '
               f'height="{height - pb - py(ymed):.1f}" class="quad-hi"/>')
    out.append(f'<line x1="{px(xmed):.1f}" x2="{px(xmed):.1f}" y1="{pt}" y2="{height - pb}" class="ref"/>'
               f'<line x1="{pl}" x2="{width - pr}" y1="{py(ymed):.1f}" y2="{py(ymed):.1f}" class="ref"/>')
    short = width < 500
    out.append(f'<text x="{width - pr - 8}" y="{height - pb - 10}" text-anchor="end" class="quad-label hi">{"입지 대비 저렴" if short else "입지 좋고 저렴"}</text>'
               f'<text x="{width - pr - 8}" y="{pt + 16}" text-anchor="end" class="quad-label">{"" if short else "입지 좋고 비쌈"}</text>'
               f'<text x="{pl + 8}" y="{pt + 16}" class="quad-label">{"" if short else "입지 아쉽고 비쌈"}</text>'
               f'<text x="{pl + 8}" y="{height - pb - 10}" class="quad-label">{"" if short else "입지 아쉽고 저렴"}</text>')
    for p in sorted(pts, key=lambda p: (p["x"] > xmed and p["y"] < ymed)):
        hi = p["x"] > xmed and p["y"] < ymed
        tip = f"{p['name']}\n{p.get('gu', '')} {p.get('dong', '')}\n입지 {p['x']:.0f}점 · 84㎡ {eok(p['y'])}"
        out.append(f'<a href="{escape(p["href"])}" class="mark" {_tip(tip)}>'
                   f'<circle cx="{px(p["x"]):.1f}" cy="{py(p["y"]):.1f}" r="12" class="hit"/>'
                   f'<circle cx="{px(p["x"]):.1f}" cy="{py(p["y"]):.1f}" r="4.5" '
                   f'class="dot {"s1" if hi else "dim"}"/></a>')
    return f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="입지점수와 가격 산점도">{"".join(out)}</svg>'


# ---------------------------------------------------------------- 히스토그램

def histogram(values: list[float], highlight: float | None = None, width: int = 720,
              height: int = 200, highlight_label: str = "이 단지") -> str:
    vals = [v for v in values if not nan(v)]
    if not vals:
        return _empty("지수 값이 없습니다.")
    bins = [0] * 10
    for v in vals:
        bins[min(9, int(v // 10))] += 1
    hb = None if nan(highlight) else min(9, int(highlight // 10))
    pl, pr, pt, pb = 40, 8, 22, 28
    ymax = max(bins) or 1
    bw = (width - pl - pr) / 10
    out = []
    for t in _nice_ticks(0, ymax, 3):
        if t > ymax * 1.15:
            continue
        y = pt + (1 - t / ymax) * (height - pt - pb)
        out.append(f'<line x1="{pl}" x2="{width - pr}" y1="{y:.1f}" y2="{y:.1f}" class="grid"/>'
                   f'<text x="{pl - 6}" y="{y + 4:.1f}" text-anchor="end" class="axis">{t:.0f}</text>')
    for i, n in enumerate(bins):
        x = pl + i * bw + 1
        h = n / ymax * (height - pt - pb)
        y = height - pb - h
        cls = "bar" if hb is None else ("bar" if i == hb else "bar dim")
        tip = f"지수 {i * 10}~{i * 10 + 9}점: {n}개 단지"
        out.append(f'<g class="mark" {_tip(tip)}><rect x="{pl + i * bw:.1f}" y="{pt}" width="{bw:.1f}" '
                   f'height="{height - pt - pb}" class="hit"/>'
                   f'<path d="{_vbar_path(x, y, bw - 2, h)}" class="{cls}"/></g>'
                   f'<text x="{x + (bw - 2) / 2:.1f}" y="{height - pb + 16}" text-anchor="middle" class="axis">{i * 10}</text>')
        if i == hb:
            out.append(f'<text x="{x + (bw - 2) / 2:.1f}" y="{max(12, y - 6):.1f}" text-anchor="middle" '
                       f'class="val strong">{escape(highlight_label)} ▼</text>')
    return f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="지수 분포">{"".join(out)}</svg>'


def _vbar_path(x, y, w, h, r=4):
    if h <= 0:
        return f"M{x:.1f},{y:.1f}h{w:.1f}"
    r = min(r, w / 2, h)
    return (f"M{x:.1f},{y + h:.1f}V{y + r:.1f}Q{x:.1f},{y:.1f} {x + r:.1f},{y:.1f}"
            f"H{x + w - r:.1f}Q{x + w:.1f},{y:.1f} {x + w:.1f},{y + r:.1f}V{y + h:.1f}Z")


# ---------------------------------------------------------------- 선 그래프 (비교)

def line_compare(main: list[tuple[int, float]], ref: list[tuple[int, float]],
                 main_label: str, ref_label: str, width: int = 720, height: int = 260) -> str:
    """연도별 84㎡ 환산가: 이 단지(강조) vs 대전 중위(회색)."""
    if len(main) < 2:
        return _empty("가격 그래프를 그리기에 거래 연도가 부족합니다.")
    years = sorted({y for y, _ in main} | {y for y, _ in ref if main[0][0] <= y <= main[-1][0]})
    ref = [(y, v) for y, v in ref if years[0] <= y <= years[-1]]
    allv = [v for _, v in main] + [v for _, v in ref]
    yt = _nice_ticks(min(allv) * 0.9, max(allv) * 1.05)
    lo, hi = yt[0], yt[-1]
    pl, pr, pt, pb = 56, 88, 16, 28

    def px(y):
        return pl + (y - years[0]) / ((years[-1] - years[0]) or 1) * (width - pl - pr)

    def py(v):
        return pt + (hi - v) / ((hi - lo) or 1) * (height - pt - pb)

    out = []
    for t in yt:
        out.append(f'<line x1="{pl}" x2="{width - pr}" y1="{py(t):.1f}" y2="{py(t):.1f}" class="grid"/>'
                   f'<text x="{pl - 8}" y="{py(t) + 4:.1f}" text-anchor="end" class="axis">{eok(t)}</text>')
    step = max(1, math.ceil(len(years) / max(3, (width - pl - pr) // 56)))
    for y in years[::step]:
        out.append(f'<text x="{px(y):.1f}" y="{height - 8}" text-anchor="middle" class="axis">{y}</text>')

    def path(series):
        return " ".join(f"{'M' if i == 0 else 'L'}{px(y):.1f},{py(v):.1f}" for i, (y, v) in enumerate(series))

    if len(ref) >= 2:
        out.append(f'<path d="{path(ref)}" class="line ref-line"/>')
        y, v = ref[-1]
        out.append(f'<text x="{px(y) + 8:.1f}" y="{py(v) + 4:.1f}" class="lbl muted-ink">{escape(ref_label)}</text>')
    out.append(f'<path d="{path(main)}" class="line s1"/>')
    for y, v in main:
        out.append(f'<circle cx="{px(y):.1f}" cy="{py(v):.1f}" r="3.5" class="dot s1 ring"/>')
    y, v = main[-1]
    out.append(f'<text x="{px(y) + 8:.1f}" y="{py(v) + 4:.1f}" class="lbl strong">{escape(main_label)} {eok(v)}</text>')

    # 연도별 세로 띠: 가리키면 가는 세로선과 두 값을 함께 보여줍니다.
    mm, rr = dict(main), dict(ref)
    colw = (width - pl - pr) / max(1, len(years) - 1)
    for y in years:
        parts = [f"{y}년"]
        if y in mm:
            parts.append(f"{main_label} {eok(mm[y])}")
        if y in rr:
            parts.append(f"{ref_label} {eok(rr[y])}")
        out.append(f'<g class="col" {_tip(chr(10).join(parts))}>'
                   f'<rect x="{px(y) - colw / 2:.1f}" y="{pt}" width="{colw:.1f}" height="{height - pt - pb}" class="hit"/>'
                   f'<line x1="{px(y):.1f}" x2="{px(y):.1f}" y1="{pt}" y2="{height - pb}" class="xhair"/></g>')
    return f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="연도별 가격 추이">{"".join(out)}</svg>'


# ---------------------------------------------------------------- 거래 점그래프

AREA_GROUPS = [("소형 60㎡ 이하", 0, 60, "s1"), ("중형 60~85㎡", 60, 85.5, "s2"), ("대형 85㎡ 초과", 85.5, 1e9, "s3")]


def trade_dots(trades: list[dict], width: int = 720, height: int = 260) -> str:
    """trades: date(Timestamp), price(만원), area, floor. 평형대별 색 3개."""
    ts = [t for t in trades if not t.get("cancelled")]
    if len(ts) < 2:
        return _empty("표시할 거래가 부족합니다.")
    d0 = min(t["date"] for t in ts)
    d1 = max(t["date"] for t in ts)
    span = (d1 - d0).days or 1
    yt = _nice_ticks(0, max(t["price"] for t in ts) * 1.05)
    ymax = yt[-1]
    pl, pr, pt, pb = 56, 16, 12, 28

    def px(d):
        return pl + (d - d0).days / span * (width - pl - pr)

    def py(v):
        return pt + (1 - v / ymax) * (height - pt - pb)

    out = []
    for t in yt:
        out.append(f'<line x1="{pl}" x2="{width - pr}" y1="{py(t):.1f}" y2="{py(t):.1f}" class="grid"/>'
                   f'<text x="{pl - 8}" y="{py(t) + 4:.1f}" text-anchor="end" class="axis">{eok(t, 0)}</text>')
    n_labels = max(3, (width - pl - pr) // 56)
    for yr in range(d0.year, d1.year + 1, max(1, math.ceil((d1.year - d0.year + 1) / n_labels))):
        d = max(d0, pd.Timestamp(year=yr, month=1, day=1))
        out.append(f'<text x="{px(d):.1f}" y="{height - 8}" text-anchor="middle" class="axis">{yr}</text>')
    for t in ts:
        cls = next(c for _, lo, hi, c in AREA_GROUPS if lo <= t["area"] < hi)
        fl = "" if nan(t.get("floor")) or t.get("floor") is None else f" · {int(t['floor'])}층"
        kind = t.get("kind") or "매매"
        pre = kind != "매매"
        tip = f"{eok(t['price'], 2)}\n{t['date']:%Y.%m.%d} · 전용 {t['area']:.0f}㎡{fl}" + (f" · {kind}" if pre else "")
        x, y = px(t["date"]), py(t["price"])
        out.append(f'<g class="mark" {_tip(tip)}><circle cx="{x:.1f}" cy="{y:.1f}" r="10" class="hit"/>'
                   f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" class="dot {cls} {"hollow" if pre else "ring"}"/></g>')
    present = {next(c for _, lo, hi, c in AREA_GROUPS if lo <= t["area"] < hi) for t in ts}
    legend = "".join(f'<span class="legend-item"><span class="key-dot {c}"></span>{escape(n)}</span>'
                     for n, _, _, c in AREA_GROUPS if c in present)
    if any((t.get("kind") or "매매") != "매매" for t in ts):
        legend += '<span class="legend-item"><span class="key-dot hollow"></span>분양권·입주권 (속 빈 점)</span>'
    return (f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="거래 점그래프">{"".join(out)}</svg>'
            f'<div class="legend">{legend}</div>')


# ---------------------------------------------------------------- 레이더 (입지)

def radar(axes: list[tuple[str, float, float]], size: int = 340) -> str:
    """axes: (항목명, 이 단지 백분위, 대전 중위 백분위). 0~100."""
    if len(axes) < 3:
        return _empty("입지 항목이 부족합니다.")
    c = size / 2
    r = size / 2 - 64
    n = len(axes)

    def pt(i, v):
        a = -math.pi / 2 + 2 * math.pi * i / n
        return c + math.cos(a) * r * v / 100, c + math.sin(a) * r * v / 100

    out = []
    for ring in (25, 50, 75, 100):
        poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in (pt(i, ring) for i in range(n)))
        out.append(f'<polygon points="{poly}" class="grid-poly"/>')
    for i, (name, v, _) in enumerate(axes):
        x, y = pt(i, 100)
        out.append(f'<line x1="{c}" y1="{c}" x2="{x:.1f}" y2="{y:.1f}" class="grid"/>')
        lx, ly = pt(i, 128)
        anchor = "middle" if abs(lx - c) < 10 else ("start" if lx > c else "end")
        shown = "-" if nan(v) else f"{v:.0f}"
        out.append(f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="{anchor}" class="lbl">{escape(name)}</text>'
                   f'<text x="{lx:.1f}" y="{ly + 15:.1f}" text-anchor="{anchor}" class="val strong">{shown}</text>')
    ref = " ".join(f"{x:.1f},{y:.1f}" for x, y in (pt(i, m) for i, (_, _, m) in enumerate(axes)))
    out.append(f'<polygon points="{ref}" class="ref-poly"/>')
    me = " ".join(f"{x:.1f},{y:.1f}" for x, y in (pt(i, 0 if nan(v) else v) for i, (_, v, _) in enumerate(axes)))
    out.append(f'<polygon points="{me}" class="me-poly"/>')
    for i, (name, v, m) in enumerate(axes):
        x, y = pt(i, 0 if nan(v) else v)
        shown = "-" if nan(v) else f"{v:.0f}"
        out.append(f'<g class="mark" {_tip(f"{name}: 이 단지 {shown} · 대전 중위 {m:.0f}")}>'
                   f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" class="hit"/>'
                   f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" class="dot s1 ring"/></g>')
    legend = ('<div class="legend"><span class="legend-item"><span class="key-line s1"></span>이 단지</span>'
              '<span class="legend-item"><span class="key-line ref"></span>대전 중위</span></div>')
    return (f'<svg viewBox="0 0 {size} {size}" class="chart radar" role="img" aria-label="입지 항목 레이더">'
            f'{"".join(out)}</svg>{legend}')


# ---------------------------------------------------------------- 게이지

def gauge(value, size: int = 200) -> str:
    """반원 게이지. 지수 0~100."""
    c, r, sw = size / 2, size / 2 - 14, 14
    cy = c

    def arc(v):
        a = math.pi * (1 - v / 100)
        return c + r * math.cos(a), cy - r * math.sin(a)

    x0, y0 = arc(0)
    x1, y1 = arc(100)
    track = f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}" class="gauge-track" stroke-width="{sw}"/>'
    if nan(value):
        fill, num = "", "-"
    else:
        v = max(0.5, min(100, value))
        xv, yv = arc(v)
        fill = f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {xv:.1f},{yv:.1f}" class="gauge-fill g-stroke-{grade(value)[0]}" stroke-width="{sw}"/>'
        num = f"{value:.0f}"
    return (f'<svg viewBox="0 0 {size} {size / 2 + 12}" class="gauge" role="img" aria-label="종합 지수 {num}">'
            f'{track}{fill}<text x="{c}" y="{cy - 8}" text-anchor="middle" class="gauge-num">{num}</text>'
            f'<text x="{c}" y="{cy + 10}" text-anchor="middle" class="axis">/ 100</text></svg>')


def responsive(fn, *args, desk: dict | None = None, mob: dict | None = None, **kw) -> str:
    """같은 차트를 넓은 화면용과 휴대폰용 크기로 두 번 그립니다. CSS가 화면 폭에 따라 하나만 보여줍니다."""
    a = fn(*args, **{**kw, **(desk or {})})
    b = fn(*args, **{**kw, **(mob or {})})
    return f'<div class="c-desk">{a}</div><div class="c-mob">{b}</div>'
