"""단지별 링크 미리보기 카드 (1200×630 JPG).

카톡·문자·SNS 에 단지 주소를 붙였을 때 나오는 그림입니다. 휴대폰에서는 폭 300px 안팎으로 줄어 보이므로
글자는 크게(단지 이름 64px 이상), 정보는 이름·등급·점수·순위만 왼쪽에 담고 오른쪽에 수집 카드를 세웁니다.
카드는 단지 ID 로 정해지는 난수로 색 조합·야경 그림·기울기·호일 위상·반짝이 위치가 달라져 단지마다 다른 카드가 됩니다
(같은 단지는 늘 같은 그림). 등급 색은 static/cardgen.js 의 TIER 와 같은 결. S·A 등급 단지만 만듭니다.
"""
from __future__ import annotations

import hashlib
import math
import random
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = Path(__file__).parent / "fonts"
BRAND = Path(__file__).resolve().parent.parent / "static" / "brand" / "symbol-96.png"
W, H = 1200, 630
OG_GRADES = ("S", "A")
GEMS = {"S": 5, "A": 4}
LANCZOS = Image.Resampling.LANCZOS
BICUBIC = Image.Resampling.BICUBIC

# 등급별 기본색. frame 은 금속 테두리, inner 는 카드 안쪽
TIER = {
    "S": dict(frame=("#fff3c4", "#d9b55a", "#8a6a12"), inner=("#1a3354", "#0b1525"), ink="#f6f0e1", sub="#c9bfa4",
              bar=("#a37b22", "#fff1bf"), chip=("#fff1bf", "#b8912f"), chip_ink="#2a1d02", accent="#f0d58a", name="최상위",
              holo=.15, sparks=42, tint="#ffd98a"),
    "A": dict(frame=("#ffffff", "#c9d0db", "#6b7480"), inner=("#2c333e", "#171b22"), ink="#eef1f6", sub="#aeb7c4",
              bar=("#6b7480", "#ffffff"), chip=("#ffffff", "#9aa4b2"), chip_ink="#10151d", accent="#dfe6f0", name="우수",
              holo=.13, sparks=28, tint="#cfe0ff"),
}
# 같은 등급 안에서 단지마다 달라지는 색 조합 (야경 하늘 3색, 배경 빛, 보케 색)
VARIANTS = {
    "S": [dict(sky=("#1a1030", "#6b3a58", "#f0b45a"), glow="#5a3318", bokeh=(255, 196, 110)),
          dict(sky=("#0b1830", "#2b4f80", "#e9c46a"), glow="#1e3a6e", bokeh=(255, 214, 120)),
          dict(sky=("#0c2224", "#2f6b66", "#f0d58a"), glow="#1c4a40", bokeh=(150, 255, 205)),
          dict(sky=("#240f1a", "#7a2f48", "#ffcf8a"), glow="#5a2038", bokeh=(255, 170, 150))],
    "A": [dict(sky=("#151b26", "#3a4a63", "#b8c4d6"), glow="#243a60", bokeh=(190, 210, 255)),
          dict(sky=("#1a1630", "#4a4a8a", "#c9c4f0"), glow="#3a2f70", bokeh=(210, 190, 255)),
          dict(sky=("#0f2226", "#2f5f6b", "#bfe6e0"), glow="#1f4a55", bokeh=(170, 240, 230)),
          dict(sky=("#1b1f2c", "#4a5b7a", "#e3d2c2"), glow="#33425f", bokeh=(255, 220, 200))],
}
_fonts: dict = {}
_bg_cache: dict = {}


def _font(weight: str, px: int) -> ImageFont.FreeTypeFont:
    key = (weight, px)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(str(FONT_DIR / f"NotoSansKR-{weight}.ttf"), px)
    return _fonts[key]


def _hex(c: str) -> tuple:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _mix(a: str, b: str, t: float) -> str:
    ca, cb = _hex(a), _hex(b)
    return "#%02x%02x%02x" % tuple(int(ca[i] * (1 - t) + cb[i] * t) for i in range(3))


def _gradient(w: int, h: int, stops, diagonal: bool = True) -> Image.Image:
    """왼쪽 위 → 오른쪽 아래 (또는 위 → 아래) 여러 색 그라데이션."""
    cols = np.array([_hex(s) for s in stops], dtype=float)
    ys, xs = np.mgrid[0:h, 0:w]
    t = (xs / max(w - 1, 1) * 0.55 + ys / max(h - 1, 1) * 0.45) if diagonal else ys / max(h - 1, 1)
    pos = np.linspace(0, 1, len(cols))
    out = np.stack([np.interp(t, pos, cols[:, k]) for k in range(3)], axis=-1)
    return Image.fromarray(out.astype("uint8"), "RGB")


def _round_mask(size, radius) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def _background(grade: str, vi: int) -> Image.Image:
    """밤하늘 남색 바탕 + 변형 색 빛 번짐. 변형마다 한 번만 만들어 복사해 씀."""
    key = (grade, vi)
    if key not in _bg_cache:
        v = VARIANTS[grade][vi]
        base = np.array(_gradient(W, H, ["#0a1428", "#0d1b36", "#0a1326"]), dtype=float)
        ys, xs = np.mgrid[0:H, 0:W]
        for cx, cy, r, col, a in [(0.78, 0.45, 0.62, v["glow"], 1.0), (0.0, 1.0, 0.5, "#142a52", .8), (1.0, 0.0, 0.4, v["glow"], .5)]:
            d = np.sqrt(((xs / W - cx) * (W / H)) ** 2 + (ys / H - cy) ** 2) / r
            m = np.clip(1 - d, 0, 1)[..., None] * a
            base = base * (1 - m) + np.array(_hex(col), dtype=float) * m
        _bg_cache[key] = Image.fromarray(base.clip(0, 255).astype("uint8"), "RGB")
    return _bg_cache[key].copy()


def _star(d: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    k = r * .2
    d.polygon([(x, y - r), (x + k, y - k), (x + r, y), (x + k, y + k), (x, y + r), (x - k, y + k), (x - r, y), (x - k, y - k)], fill=fill)


def _glow_layer(draw_fn, blur: float) -> Image.Image:
    """그린 것과 번진 빛을 합친 RGBA 층 (한 번만 만들어 마스크와 본체에 같이 씀)."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    glow = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(glow, layer)


def _over(img: Image.Image, layer: Image.Image) -> None:
    img.paste(layer, (0, 0), layer)


def _art(w: int, h: int, v: dict, rnd: random.Random, dong: str, ss: int) -> Image.Image:
    """카드 안 야경 그림: 하늘 → 해·달 → 먼 산 → 아파트 두 줄(창문 불빛) → 동 이름 워터마크. 단지마다 다름."""
    W2, H2 = w * ss, h * ss
    img = _gradient(W2, H2, v["sky"], diagonal=False).convert("RGBA")
    sx, sy = W2 * (0.58 + rnd.random() * 0.3), H2 * (0.26 + rnd.random() * 0.12)
    R = int(H2 * .42)
    ys, xs = np.mgrid[0:2 * R, 0:2 * R]
    a = np.clip(1 - np.sqrt((xs - R) ** 2 + (ys - R) ** 2) / R, 0, 1) ** 2.2
    sun = np.zeros((2 * R, 2 * R, 4), dtype="uint8")
    sun[..., 0], sun[..., 1], sun[..., 2] = 255, 238, 200
    sun[..., 3] = (a * 255).astype("uint8")
    img.alpha_composite(Image.fromarray(sun, "RGBA"), (max(0, int(sx - R)), max(0, int(sy - R)))) if sx - R >= 0 and sy - R >= 0 else None
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([sx - 11 * ss, sy - 11 * ss, sx + 11 * ss, sy + 11 * ss], fill=(255, 248, 226, 235))
    pts = [(0, H2)] + [(W2 * k / 8, H2 * (0.5 + rnd.random() * 0.14)) for k in range(9)] + [(W2, H2)]
    d.polygon(pts, fill=(255, 255, 255, 22))
    for base, color, maxh, lit in [(0.58, (10, 18, 32, 120), 0.34, False), (0.9, (8, 14, 26, 235), 0.5, True)]:
        bx = -10 * ss
        while bx < W2:
            bw, bh = (14 + rnd.random() * 18) * ss, H2 * (0.16 + rnd.random() * maxh)
            top = H2 * base - bh + (H2 * .02 if lit else 0)
            d.rectangle([bx, top, bx + bw, H2], fill=color)
            if lit:
                wy = top + 5 * ss
                while wy < H2 - 6 * ss:
                    wx = bx + 3 * ss
                    while wx < bx + bw - 4 * ss:
                        if rnd.random() < .45:
                            d.rectangle([wx, wy, wx + 2.6 * ss, wy + 3.6 * ss],
                                        fill=(255, 226, 150, 215) if rnd.random() < .6 else (255, 244, 214, 150))
                        wx += 5 * ss
                    wy += 7 * ss
            bx += bw + (1.5 + rnd.random() * 4) * ss
    if dong:
        d.text((10 * ss, 6 * ss), dong, font=_font("Bold", 30 * ss), fill=(255, 255, 255, 40))
    return img.convert("RGB")


def _holo(card: Image.Image, strength: float, phase: float, tint: str = "#ffffff") -> Image.Image:
    """무지개빛 호일 + 비스듬한 반사 띠를 카드 전체에 겹침 (화면 합성)."""
    w, h = card.size
    ys, xs = np.mgrid[0:h, 0:w]
    t = (xs / w * 0.9 + ys / h * 0.6) * 1.15 + phase
    rgb = np.stack([.5 + .5 * np.cos(2 * math.pi * (t + k / 3)) for k in range(3)], axis=-1)
    rgb = rgb * .55 + (np.array(_hex(tint)) / 255) * .45     # 무지개 절반 + 등급 색 절반 (금·은 느낌을 지킴)
    base = np.asarray(card, dtype=float) / 255
    out = 1 - (1 - base) * (1 - strength * rgb)
    line = (xs - ys * .55) / w
    band = np.zeros_like(line)
    for c0, wd, al in [(.28 + phase * .1, .05, .30), (.62 + phase * .1, .022, .20)]:
        band += np.exp(-((line - c0) / wd) ** 2) * al
    out = 1 - (1 - out) * (1 - band[..., None])
    return Image.fromarray((out.clip(0, 1) * 255).astype("uint8"), "RGB")


def display_parts(name: str) -> tuple[str, str]:
    """긴 단지 이름을 (본 이름, 보조 이름)으로. '대치우성아파트1동,2동,3동' → ('대치우성아파트', ''),
    '반석마을3단지(호반베르디움)' → ('반석마을3단지', '호반베르디움')."""
    name = str(name).strip()
    main, _, rest = name.partition("(")
    sub_ = rest.rstrip(")").strip()
    m = re.search(r"\d+동\s*,", main)          # 1동,2동,3동 … 나열은 앞에서 자름
    if m:
        main = main[:m.start()]
    if re.fullmatch(r"[\d,\s동·~\-]+", sub_ or "x"):   # 괄호 안이 동 번호뿐이면 버림
        sub_ = ""
    return main.strip() or name, sub_


def _fit(draw, text: str, weight: str, max_px: int, min_px: int, width: int):
    """폭에 맞는 가장 큰 글자 크기. 그래도 넘치면 줄여서 '…' ."""
    for px in range(max_px, min_px - 1, -2):
        f = _font(weight, px)
        if draw.textlength(text, font=f) <= width:
            return f, px, text
    f = _font(weight, min_px)
    while len(text) > 1 and draw.textlength(text + "…", font=f) > width:
        text = text[:-1]
    return f, min_px, text + "…"


def _two_lines(draw, text: str, weight: str, px: int, width: int):
    """이름이 한 줄에 안 들어갈 때 공백 기준으로 두 줄로."""
    f = _font(weight, px)
    words = text.split(" ")
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        if max(draw.textlength(a, font=f), draw.textlength(b, font=f)) <= width:
            return [a, b]
    return None


def _wrap_chars(draw, text: str, px: int, width: int) -> list[str]:
    f = _font("Bold", px)
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) > width and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    lines.append(cur)
    if len(lines) > 2:
        lines = [lines[0], lines[1][:-1] + "…"]
    return lines


def _num(v) -> float:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if v != v else max(3.0, min(100.0, v))


def render(c: dict, region: str, n_total: int, stats: list[tuple[str, str]], place: str, score_text: str, out: Path,
           seed: str = "", dong: str = "") -> bool:
    """c: 단지 행. stats: [(라벨, 0~100 값)] 네 개. seed: 단지 ID (같으면 늘 같은 그림). 그렸으면 True."""
    grade = c.get("grade")
    if grade not in TIER:
        return False
    t = TIER[grade]
    h = int(hashlib.md5(str(seed or c.get("name")).encode()).hexdigest(), 16)
    rnd = random.Random(h)
    vi = h % len(VARIANTS[grade])
    v = VARIANTS[grade][vi]
    img = _background(grade, vi)
    ccx = 960

    # ---- 배경 장식: 보케(빛망울), 카드에서 퍼지는 빛줄기 ----
    def bokeh(dd):
        for _ in range(16):
            r = rnd.uniform(14, 58)
            x, y = rnd.uniform(430, W), rnd.uniform(0, H)
            dd.ellipse([x - r, y - r, x + r, y + r], fill=(*v["bokeh"], int(rnd.uniform(14, 34))))
    _over(img, _glow_layer(bokeh, 5))

    def beams(dd):
        for _ in range(3):
            ang = math.radians(rnd.uniform(-70, 70) - 90)
            a0, a1 = ang - .06, ang + .06
            dd.polygon([(ccx, H / 2), (ccx + 1100 * math.cos(a0), H / 2 + 1100 * math.sin(a0)),
                        (ccx + 1100 * math.cos(a1), H / 2 + 1100 * math.sin(a1))], fill=(*v["bokeh"], 22))
    _over(img, _glow_layer(beams, 14))

    d = ImageDraw.Draw(img)
    # ---- 왼쪽: 브랜드 줄 ----
    x0 = 64
    if BRAND.exists():
        sym = Image.open(BRAND).convert("RGBA").resize((52, 52), LANCZOS)
        img.paste(sym, (x0, 52), sym)
    d.text((x0 + 66, 54), "집감", font=_font("Bold", 42), fill="#ffffff")
    chip_x = x0 + 66 + int(d.textlength("집감", font=_font("Bold", 42))) + 18
    cf = _font("Bold", 28)
    cw = int(d.textlength(region, font=cf)) + 32
    d.rounded_rectangle([chip_x, 56, chip_x + cw, 100], radius=22, fill="#1f2d4a")
    d.text((chip_x + 16, 60), region, font=cf, fill="#cfdcf3")

    # ---- 왼쪽: 등급 표지 + 단지 이름 ----
    d.text((x0, 112), "◆ " + grade + " RANK  ·  " + t["name"], font=_font("Bold", 24), fill=t["accent"])
    full = str(c["name"])
    name, alias = display_parts(full)
    text_w = 640
    f, px, one = _fit(d, name, "Bold", 100, 72, text_w)
    lines = [one]
    if one != name:   # 한 줄에 안 들어가면 두 줄로 (공백 기준, 안 되면 글자 수로)
        for tp in (80, 72, 64, 58, 52):
            two = _two_lines(d, name, "Bold", tp, text_w)
            if two:
                f, px, lines = _font("Bold", tp), tp, two
                break
        else:
            f, px, lines = _font("Bold", 56), 56, _wrap_chars(d, name, 56, text_w)
    y = 152 if len(lines) == 1 and not alias else 146 if len(lines) > 1 else 148
    for ln in lines:
        d.text((x0, y), ln, font=f, fill="#ffffff")
        y += int(px * 1.2)
    if alias and len(lines) == 1:
        af, _, al = _fit(d, "(" + alias + ")", "Regular", 40, 28, text_w)
        d.text((x0, y - 2), al, font=af, fill="#c9d6ee")
        y += 52
    d.text((x0, y + 6), place, font=_font("Regular", 36), fill="#aebbd3")

    # ---- 왼쪽 아래: 등급·점수·순위 ----
    by = 410
    d.text((x0, by), grade + "등급", font=_font("Bold", 64), fill=t["accent"])
    gw = int(d.textlength(grade + "등급", font=_font("Bold", 64)))
    d.text((x0 + gw + 28, by + 4), f"{score_text}점", font=_font("Bold", 64), fill="#ffffff")
    if c.get("rank"):
        d.text((x0, by + 94), f"{n_total:,}곳 중 {c['rank']}위", font=_font("Bold", 46), fill="#e7eefb")
    d.text((x0, H - 56), "집 볼 때도 감이 필요하니까  ·  jipgam.kr", font=_font("Regular", 26), fill="#7f8fae")

    # ---- 오른쪽: 수집 카드 (2배로 그려 줄이고 살짝 기울임) ----
    SS = 2
    cw_, ch_, fw = 400, 560, 12
    CW, CH = cw_ * SS, ch_ * SS
    card = _gradient(CW, CH, t["frame"])
    inner_sz = (CW - 2 * fw * SS, CH - 2 * fw * SS)
    card.paste(_gradient(*inner_sz, t["inner"], diagonal=False), (fw * SS, fw * SS), _round_mask(inner_sz, 24 * SS))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([(fw + 3) * SS, (fw + 3) * SS, (cw_ - fw - 3) * SS, (ch_ - fw - 3) * SS], radius=21 * SS,
                         outline=_mix(t["frame"][1], "#ffffff", .25), width=2)
    chip = _gradient(64 * SS, 64 * SS, t["chip"])
    cm = Image.new("L", chip.size, 0)
    ImageDraw.Draw(cm).ellipse([0, 0, chip.size[0] - 1, chip.size[1] - 1], fill=255)
    card.paste(chip, (30 * SS, 30 * SS), cm)
    gf = _font("Bold", 40 * SS)
    cd.text((30 * SS + (64 * SS - cd.textlength(grade, font=gf)) / 2, 30 * SS + 4 * SS), grade, font=gf, fill=t["chip_ink"])
    cd.text((112 * SS, 34 * SS), "종합 지수", font=_font("Regular", 18 * SS), fill=t["sub"])
    cd.text((112 * SS, 46 * SS), score_text, font=_font("Bold", 46 * SS), fill=t["ink"])
    aw, ah = cw_ - 2 * 28, 150
    art = _art(aw, ah, v, rnd, dong, SS)
    card.paste(art, (28 * SS, 108 * SS), _round_mask(art.size, 16 * SS))
    cd.rounded_rectangle([28 * SS, 108 * SS, (28 + aw) * SS, (108 + ah) * SS], radius=16 * SS,
                         outline=_mix(t["frame"][1], "#ffffff", .15), width=3)
    nf, _, nm = _fit(cd, name, "Bold", 30 * SS, 20 * SS, (cw_ - 56) * SS)
    cd.text((28 * SS, 270 * SS), nm, font=nf, fill=t["ink"])
    cd.text((28 * SS, 308 * SS), place, font=_font("Regular", 19 * SS), fill=t["sub"])
    yy = 348
    for label, val in stats:
        cd.text((28 * SS, yy * SS), label, font=_font("Bold", 19 * SS), fill=t["ink"])
        bx0, bx1, byy = 170, cw_ - 28, yy + 8
        cd.rounded_rectangle([bx0 * SS, byy * SS, bx1 * SS, (byy + 12) * SS], radius=6 * SS, fill=_mix(t["inner"][1], "#ffffff", .14))
        vv = _num(val)
        if vv:
            bar = _gradient(max(2, int((bx1 - bx0) * vv / 100 * SS)), 12 * SS, t["bar"], diagonal=False)
            card.paste(bar, (bx0 * SS, byy * SS), _round_mask(bar.size, 6 * SS))
        yy += 36
    gem = "◆ " * GEMS[grade]
    gwid = cd.textlength(gem, font=_font("Bold", 20 * SS))
    cd.text(((CW - gwid) / 2, (ch_ - fw - 40) * SS), gem, font=_font("Bold", 20 * SS), fill=t["accent"])
    card = _holo(card, t["holo"], rnd.random(), t["tint"])      # 무지개빛 호일: 단지마다 위상이 다름
    rc = card.convert("RGBA")
    rc.putalpha(_round_mask(card.size, 36 * SS))
    tilt = rnd.choice([-1, 1]) * rnd.uniform(3, 6)
    rc = rc.rotate(tilt, resample=BICUBIC, expand=True)
    rc = rc.resize((rc.size[0] // SS, rc.size[1] // SS), LANCZOS)
    px_, py_ = int(ccx - rc.size[0] / 2), int(H / 2 - rc.size[1] / 2)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shape = Image.new("RGBA", rc.size, (0, 0, 0, 0))
    shape.putalpha(rc.getchannel("A").point(lambda a: int(a * .55)))
    shadow.paste(shape, (px_ + 10, py_ + 18), shape)
    _over(img, shadow.filter(ImageFilter.GaussianBlur(18)))
    _over(img, _glow_layer(lambda dd: dd.rounded_rectangle(
        [px_ - 6, py_ - 6, px_ + rc.size[0] + 6, py_ + rc.size[1] + 6], radius=40, outline=(*v["bokeh"], 90), width=6), 16))
    img.paste(rc, (px_, py_), rc)

    # ---- 반짝이 (카드 주변) ----
    cx0, cy0, cx1, cy1 = px_ + 10, py_ + 10, px_ + rc.size[0] - 10, py_ + rc.size[1] - 10

    def sparks(dd):
        for i in range(t["sparks"]):
            x = rnd.gauss(ccx, 250) if i % 3 else rnd.uniform(520, W - 20)
            y = rnd.uniform(10, H - 10)
            if x < 520 or x > W - 8:
                continue
            if cx0 < x < cx1 and cy0 < y < cy1 and not (y < cy0 + 70 or y > cy1 - 60) and rnd.random() < .85:
                continue   # 카드 글자 위는 비워 둠 (위 알약 줄과 아래 다이아 줄만 허용)
            r = rnd.choice([4, 5, 6, 8, 11, 16]) if i % 7 else rnd.uniform(16, 24)
            if r < 6:
                dd.ellipse([x - 1.6, y - 1.6, x + 1.6, y + 1.6], fill=(255, 250, 235, 230))
            else:
                _star(dd, x, y, r, (255, 250, 235, int(rnd.uniform(170, 255))))
    _over(img, _glow_layer(sparks, 3))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return True
