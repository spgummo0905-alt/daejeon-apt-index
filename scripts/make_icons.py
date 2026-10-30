"""앱 아이콘(홈 화면에 추가)을 favicon.svg 와 같은 모양(파란 바탕에 흰 막대 셋)으로 그립니다.
한 번 돌려 static/icons/ 에 넣어 두면 됩니다: python scripts/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "static" / "icons"
BLUE, WHITE = (42, 120, 214), (255, 255, 255)
BARS = [(7, 17, 4, 8), (14, 11, 4, 14), (21, 6, 4, 19)]   # favicon.svg 의 막대 (32 격자)


def draw(size: int, maskable: bool) -> Image.Image:
    s = 4   # 크게 그린 뒤 줄여 가장자리를 매끈하게
    big = size * s
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:   # 안드로이드가 원·둥근 사각으로 자르므로 꽉 채우고 막대는 안쪽 80%에
        d.rectangle([0, 0, big, big], fill=BLUE)
        pad, unit = big * 0.1, big * 0.8 / 32
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 7 / 32, fill=BLUE)
        pad, unit = 0, big / 32
    for x, y, w, h in BARS:
        d.rounded_rectangle([pad + x * unit, pad + y * unit, pad + (x + w) * unit, pad + (y + h) * unit], radius=unit, fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192, False).save(OUT / "icon-192.png")
    draw(512, False).save(OUT / "icon-512.png")
    draw(512, True).save(OUT / "icon-maskable-512.png")
    draw(180, True).convert("RGB").save(OUT / "apple-touch-icon.png")   # 아이폰은 투명 없이 꽉 채운 그림
    print("icons ->", OUT)
