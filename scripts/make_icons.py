"""앱 아이콘(홈 화면에 추가)을 '집감' 글자 로고로 그립니다: 남색 바탕에 '집'은 흰색, '감'은 금색.
글꼴은 Pretendard(굵게)를 씁니다. 이 폴더에 PretendardVariable.ttf 를 두고 한 번 돌려 static/icons/ 에 넣어 두면 됩니다:
python scripts/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "static" / "icons"
NAVY, WHITE, GOLD = (19, 41, 75), (255, 255, 255), (232, 191, 90)


def font(px: int):
    f = ImageFont.truetype(str(HERE / "PretendardVariable.ttf"), px)
    try:
        f.set_variation_by_axes([900])
    except Exception:   # 굵기 축이 없는 글꼴
        pass
    return f


def draw(size: int, maskable: bool) -> Image.Image:
    s = 4   # 크게 그린 뒤 줄여 가장자리를 매끈하게
    big = size * s
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:   # 안드로이드가 원·둥근 사각으로 자르므로 꽉 채우고 글자는 안쪽에
        d.rectangle([0, 0, big, big], fill=NAVY)
        px = int(big * 0.27)
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=NAVY)
        px = int(big * 0.34)
    f = font(px)
    w1, w2 = d.textlength("집", font=f), d.textlength("감", font=f)
    gap = -px * 0.06
    x = (big - (w1 + w2 + gap)) / 2
    top, bottom = f.getbbox("집감")[1], f.getbbox("집감")[3]
    y = (big - (bottom - top)) / 2 - top
    d.text((x, y), "집", font=f, fill=WHITE)
    d.text((x + w1 + gap, y), "감", font=f, fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192, False).save(OUT / "icon-192.png")
    draw(512, False).save(OUT / "icon-512.png")
    draw(512, True).save(OUT / "icon-maskable-512.png")
    draw(180, True).convert("RGB").save(OUT / "apple-touch-icon.png")   # 아이폰은 투명 없이 꽉 채운 그림
    draw(64, False).save(OUT / "favicon-64.png")
    print("icons ->", OUT)
