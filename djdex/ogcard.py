"""단지별 링크 미리보기 카드 (1200×630 JPG).

카톡·문자·SNS 에 단지 주소를 붙였을 때 나오는 그림입니다. 휴대폰에서는 폭 300px 안팎으로 줄어 보이므로
글자는 크게(단지 이름 64px 이상), 정보는 이름·등급·점수·순위만 담습니다. 등급 색은 static/cardgen.js 의 TIER 와 같은 결.
S·A 등급 단지만 만듭니다 (카드 공유의 얼굴).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path(__file__).parent / "fonts"
BRAND = Path(__file__).resolve().parent.parent / "static" / "brand" / "symbol-96.png"
W, H, SS = 1200, 630, 2          # 그림 크기, 확대해서 그린 뒤 줄이는 배수 (모서리가 매끈하게)
OG_GRADES = ("S", "A")

# 등급별: 테두리 그라데이션, 카드 안쪽, 글자, 막대, 등급 알약 글자색
TIER = {
    "S": dict(frame=("#fff3c4", "#d9b55a", "#8a6a12"), inner=("#1a3354", "#0b1525"), ink="#f6f0e1", sub="#c9bfa4",
              bar=("#a37b22", "#fff1bf"), chip=("#fff1bf", "#b8912f"), chip_ink="#2a1d02", accent="#f0d58a", name="최상위"),
    "A": dict(frame=("#ffffff", "#c9d0db", "#6b7480"), inner=("#2c333e", "#171b22"), ink="#eef1f6", sub="#aeb7c4",
              bar=("#6b7480", "#ffffff"), chip=("#ffffff", "#9aa4b2"), chip_ink="#10151d", accent="#dfe6f0", name="우수"),
}
_fonts: dict = {}


def _font(weight: str, px: int) -> ImageFont.FreeTypeFont:
    key = (weight, px)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(str(FONT_DIR / f"NotoSansKR-{weight}.ttf"), px * SS)
    return _fonts[key]


def _hex(c: str) -> tuple:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _gradient(w: int, h: int, stops, diagonal: bool = True) -> Image.Image:
    """왼쪽 위 → 오른쪽 아래 (또는 위 → 아래) 여러 색 그라데이션."""
    cols = np.array([_hex(s) for s in stops], dtype=float)
    ys, xs = np.mgrid[0:h, 0:w]
    t = (xs / max(w - 1, 1) * 0.55 + ys / max(h - 1, 1) * 0.45) if diagonal else ys / max(h - 1, 1)
    pos = np.linspace(0, 1, len(cols))
    out = np.stack([np.interp(t, pos, cols[:, k]) for k in range(3)], axis=-1)
    return Image.fromarray(out.astype("uint8"), "RGB")


_bg_cache: Image.Image | None = None


def _background() -> Image.Image:
    """밤하늘 남색 바탕 (빛 번짐 둘). 한 번만 만들어 복사해 씀."""
    global _bg_cache
    if _bg_cache is None:
        w, h = W * SS, H * SS
        base = np.array(_gradient(w, h, ["#0a1428", "#0d1b36", "#0a1326"]), dtype=float)
        ys, xs = np.mgrid[0:h, 0:w]
        for cx, cy, r, col, a in [(0.80, 0.42, 0.55, "#1e3a6e", 0.9), (0.0, 1.0, 0.45, "#142a52", 0.8)]:
            d = np.sqrt(((xs / w - cx) * (w / h)) ** 2 + (ys / h - cy) ** 2) / r
            m = np.clip(1 - d, 0, 1)[..., None] * a
            base = base * (1 - m) + np.array(_hex(col), dtype=float) * m
        _bg_cache = Image.fromarray(base.clip(0, 255).astype("uint8"), "RGB")
    return _bg_cache.copy()


def _round_mask(size, radius) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def _fit(draw, text: str, weight: str, max_px: int, min_px: int, width: int) -> tuple[ImageFont.FreeTypeFont, int, str]:
    """폭에 맞는 가장 큰 글자 크기. 그래도 넘치면 줄여서 '…' ."""
    for px in range(max_px, min_px - 1, -2):
        f = _font(weight, px)
        if draw.textlength(text, font=f) <= width * SS:
            return f, px, text
    f = _font(weight, min_px)
    while len(text) > 1 and draw.textlength(text + "…", font=f) > width * SS:
        text = text[:-1]
    return f, min_px, text + "…"


def _two_lines(draw, text: str, weight: str, px: int, width: int) -> list[str] | None:
    """이름이 한 줄에 안 들어갈 때 공백 기준으로 두 줄로."""
    f = _font(weight, px)
    words = text.split(" ")
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        if max(draw.textlength(a, font=f), draw.textlength(b, font=f)) <= width * SS:
            return [a, b]
    return None


def _wrap_chars(draw, text: str, px: int, width: int) -> list[str]:
    f = _font("Bold", px)
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) > width * SS and cur:
            lines.append(cur); cur = ch
        else:
            cur += ch
    lines.append(cur)
    if len(lines) > 2:
        lines = [lines[0], lines[1][:-1] + "…"]
    return lines


def render(c: dict, region: str, n_total: int, stats: list[tuple[str, str]], place: str, score_text: str, out: Path) -> bool:
    """c: 단지 행. stats: [(라벨, 0~100 값)] 네 개. 그렸으면 True."""
    grade = c.get("grade")
    if grade not in TIER:
        return False
    t = TIER[grade]
    img = _background()
    d = ImageDraw.Draw(img)
    S = SS

    # ---- 왼쪽: 브랜드 줄 ----
    x0 = 64
    if BRAND.exists():
        sym = Image.open(BRAND).convert("RGBA").resize((52 * S, 52 * S), Image.Resampling.LANCZOS)
        img.paste(sym, (x0 * S, 52 * S), sym)
    d.text(((x0 + 66) * S, 54 * S), "집감", font=_font("Bold", 42), fill="#ffffff")
    chip_x = x0 + 66 + int(d.textlength("집감", font=_font("Bold", 42)) / S) + 18
    cf = _font("Bold", 28)
    cw = int(d.textlength(region, font=cf) / S) + 32
    d.rounded_rectangle([chip_x * S, 56 * S, (chip_x + cw) * S, 100 * S], radius=22 * S, fill="#1f2d4a")
    d.text(((chip_x + 16) * S, 60 * S), region, font=cf, fill="#cfdcf3")

    # ---- 왼쪽: 단지 이름 (크게) ----
    name = str(c["name"])
    text_w = 640
    f, px, one = _fit(d, name, "Bold", 100, 72, text_w)
    lines = [one]
    if one != name:   # 한 줄에 안 들어가면 두 줄로 (글자를 조금씩 줄여 가며)
        for tp in (80, 72, 64, 58, 52):
            two = _two_lines(d, name, "Bold", tp, text_w)
            if two:
                f, px, lines = _font("Bold", tp), tp, two
                break
        else:
            f, px, lines = _font("Bold", 56), 56, _wrap_chars(d, name, 56, text_w)
    y = 150 if len(lines) == 1 else 128
    for ln in lines:
        d.text((x0 * S, y * S), ln, font=f, fill="#ffffff")
        y += int(px * 1.2)
    pf = _font("Regular", 36)
    d.text((x0 * S, (y + 6) * S), place, font=pf, fill="#aebbd3")

    # ---- 왼쪽 아래: 등급·점수·순위 (큰 숫자) ----
    by = 392
    d.text((x0 * S, by * S), grade + "등급", font=_font("Bold", 64), fill=t["accent"])
    gw = int(d.textlength(grade + "등급", font=_font("Bold", 64)) / S)
    d.text(((x0 + gw + 28) * S, (by + 4) * S), f"{score_text}점", font=_font("Bold", 64), fill="#ffffff")
    rk = f"{n_total:,}곳 중 {c['rank']}위" if c.get("rank") else ""
    if rk:
        d.text((x0 * S, (by + 96) * S), rk, font=_font("Bold", 48), fill="#e7eefb")
    d.text((x0 * S, (H - 62) * S), "집 볼 때도 감이 필요하니까  ·  jipgam.kr", font=_font("Regular", 26), fill="#7f8fae")

    # ---- 오른쪽: 카드 (5:7) ----
    cw_, ch_ = 380, 532
    cx, cy = 770, (H - ch_) // 2
    fw = 12
    frame = _gradient(cw_ * S, ch_ * S, t["frame"])
    card = Image.new("RGB", (cw_ * S, ch_ * S))
    card.paste(frame, (0, 0))
    inner_sz = ((cw_ - 2 * fw) * S, (ch_ - 2 * fw) * S)
    inner = _gradient(*inner_sz, t["inner"], diagonal=False)
    card.paste(inner, (fw * S, fw * S), _round_mask(inner_sz, 22 * S))
    cd = ImageDraw.Draw(card)
    # 그림자
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([(cx + 10) * S, (cy + 18) * S, (cx + cw_ + 10) * S, (cy + ch_ + 18) * S], radius=34 * S, fill=(0, 0, 0, 110))
    from PIL import ImageFilter
    sh = sh.filter(ImageFilter.GaussianBlur(18 * S))
    img.paste(sh, (0, 0), sh)
    # 등급 알약(큰 글자)
    chip = _gradient(92 * S, 92 * S, t["chip"])
    cm = Image.new("L", (92 * S, 92 * S), 0)
    ImageDraw.Draw(cm).ellipse([0, 0, 92 * S - 1, 92 * S - 1], fill=255)
    card.paste(chip, (30 * S, 32 * S), cm)
    gf = _font("Bold", 58)
    gwid = cd.textlength(grade, font=gf)
    cd.text((30 * S + (92 * S - gwid) / 2, 32 * S + 4 * S), grade, font=gf, fill=t["chip_ink"])
    # 지수
    cd.text((140 * S, 34 * S), "종합 지수", font=_font("Regular", 24), fill=t["sub"])
    sf = _font("Bold", 74)
    cd.text((140 * S, 54 * S), score_text, font=sf, fill=t["ink"])
    # 카드 이름
    nf, _, nm = _fit(cd, name, "Bold", 34, 22, cw_ - 56)
    cd.text((28 * S, 150 * S), nm, font=nf, fill=t["ink"])
    cd.text((28 * S, 194 * S), place, font=_font("Regular", 24), fill=t["sub"])
    # 막대 네 개
    yy = 248
    for label, val in stats:
        cd.text((28 * S, yy * S), label, font=_font("Bold", 25), fill=t["ink"])
        bx0, bx1, byy = 28, cw_ - 28 - 2 * fw, yy + 40
        cd.rounded_rectangle([bx0 * S, byy * S, bx1 * S, (byy + 14) * S], radius=7 * S, fill=_mix(t["inner"][1], "#ffffff", .14))
        try:
            v = max(3.0, min(100.0, float(val)))
        except (TypeError, ValueError):
            v = 0.0
        if v:
            bar = _gradient(int((bx1 - bx0) * v / 100 * S), 14 * S, t["bar"], diagonal=False)
            m = _round_mask(bar.size, 7 * S)
            card.paste(bar, (bx0 * S, byy * S), m)
        yy += 58
    cd.text((28 * S, (ch_ - 2 * fw - 44) * S), "◆ " * GEMS[grade], font=_font("Bold", 24), fill=t["accent"])
    # 카드 둥근 모서리로 붙이기
    img.paste(card, (cx * S, cy * S), _round_mask(card.size, 34 * S))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.resize((W, H), Image.Resampling.LANCZOS).save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return True


GEMS = {"S": 5, "A": 4}


def _mix(a: str, b: str, t: float) -> str:
    ca, cb = _hex(a), _hex(b)
    return "#%02x%02x%02x" % tuple(int(ca[i] * (1 - t) + cb[i] * t) for i in range(3))
