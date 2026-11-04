#!/usr/bin/env python3
"""사이트 글꼴(Pretendard Variable)을 쓰는 글자만 남겨 두 조각으로 줄이고, static/style.css 의 @font-face 블록을 갱신합니다.

왜: 외부 CDN 의 조각 글꼴은 휴대폰에서 14개 안팎의 요청(약 370KB)을 따로 받습니다. 자체 파일 하나(A)에 쓰는 글자를 담고,
    흔한 한글 2350자 중 나머지(B)는 그 글자가 화면에 있을 때만 받게 해서 요청 수와 전송량을 줄입니다.
쓰는 법:
  python scripts/build_font.py <PretendardVariable.woff2 또는 .ttf> --extra-file 글자목록.txt
  글자목록.txt 는 단지 이름·동·역 이름처럼 데이터에서 오는 글자들을 이어 붙인 텍스트(complexes.json 의 n, gu, d, stn, hn 등).
  templates/, static/*.js, djdex/*.py 안의 한글은 스크립트가 알아서 모읍니다. 새 단지가 늘면 다시 돌리세요(빠지면 B 조각 또는 시스템 글꼴로 대신 보여요).
라이선스: SIL OFL 1.1 (Pretendard). 수정본이므로 글꼴 안의 이름을 'Jipgam Sans' 로 바꾸고, 라이선스 전문을 static/fonts/ 에 함께 둡니다.
"""
import argparse, glob, os, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("--extra-file", default=""); ap.add_argument("--wght", default="400:900")
a = ap.parse_args()

def ranges(cps):
    cps = sorted(cps); out = []; s = p = None
    for c in cps:
        if s is None: s = p = c
        elif c == p + 1: p = c
        else: out.append((s, p)); s = p = c
    if s is not None: out.append((s, p))
    return ",".join(f"U+{x:X}" if x == y else f"U+{x:X}-{y:X}" for x, y in out)

def ksx():
    out = set()
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try: out.add(ord(bytes([hi, lo]).decode("euc-kr")))
            except Exception: pass
    return out

used = set(range(0x20, 0x7F)) | {0xA0, 0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2192, 0xD7, 0x2190, 0x2191, 0x2193, 0x203A, 0x2039}
for pat in ("templates/*.html", "static/*.js", "djdex/*.py"):
    for f in glob.glob(os.path.join(ROOT, pat)):
        try: used |= {ord(c) for c in open(f, encoding="utf8").read() if ord(c) > 0x7F}
        except Exception: pass
if a.extra_file: used |= {ord(c) for c in open(a.extra_file, encoding="utf8").read() if ord(c) > 0x7F}
hangul = lambda c: 0xAC00 <= c <= 0xD7A3
A = used
B = {c for c in ksx() if c not in A}

def make(cps, out):
    # 순서가 중요: 글자를 먼저 줄인 뒤 굵기 범위를 제한합니다 (반대로 하면 '전체 글꼴'을 굵기 변환하다 오류가 남)
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk", "tnum"]
    opts.name_IDs = [1, 2, 3, 4, 6]; opts.notdef_outline = True; opts.glyph_names = False
    font = TTFont(a.src, lazy=False)
    s = subset.Subsetter(opts); s.populate(unicodes=sorted(cps)); s.subset(font)
    tmp = out + ".tmp.ttf"; font.save(tmp); font = TTFont(tmp)
    lo, hi = [float(x) for x in a.wght.split(":")]
    if "fvar" in font: font = instancer.instantiateVariableFont(font, {"wght": (lo, hi)})
    for rec in font["name"].names:   # OFL: 수정본은 예약 글꼴 이름(Pretendard)을 쓰지 않음
        if rec.nameID in (1, 4, 16): rec.string = "Jipgam Sans"
        elif rec.nameID == 6: rec.string = "JipgamSans"
        elif rec.nameID == 3: rec.string = "Jipgam Sans subset"
    font.flavor = "woff2"; font.save(out); os.remove(tmp)
    return os.path.getsize(out)

fd = os.path.join(ROOT, "static", "fonts"); os.makedirs(fd, exist_ok=True)
na = make(A, os.path.join(fd, "pv-a.woff2")); nb = make(B, os.path.join(fd, "pv-b.woff2"))
print(f"A {na/1024:.0f}KB ({len(A)}자)  B {nb/1024:.0f}KB ({len(B)}자)")

face = lambda f, rng: ("@font-face{font-family:'Pretendard Variable';font-style:normal;font-display:swap;font-weight:400 900;"
                       f"src:url({f}) format('woff2');unicode-range:{rng}}}")
# B 는 한글 음절 전체 범위(먼저 선언 = 나중에 확인), A 는 정확한 글자 범위(나중 선언 = 먼저 확인): A 에 있는 글자는 A, 나머지 한글은 B
css = ("/* font-faces:start (scripts/build_font.py 가 만든 블록: 직접 고치지 마세요) */\n"
       + face("fonts/pv-b.woff2", "U+AC00-D7A3") + "\n" + face("fonts/pv-a.woff2", ranges(A)) + "\n/* font-faces:end */\n")
p = os.path.join(ROOT, "static", "style.css"); s = open(p, encoding="utf8").read()
if "/* font-faces:start" in s:
    s = re.sub(r"/\* font-faces:start.*?/\* font-faces:end \*/\n", lambda m: css, s, flags=re.S)
else:
    s = css + s
open(p, "w", encoding="utf8").write(s)
print("style.css 갱신")
