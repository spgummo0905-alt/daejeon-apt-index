"""앱 아이콘·파비콘·머리글 심볼을 브랜드 원본(assets/brand/jipgam_icon_transparent.png)으로 만듭니다.
홈 화면 아이콘은 흰 바탕에 심볼, 안드로이드용(maskable)은 잘려도 되게 안쪽에 더 작게.
한 번 돌려 static/ 에 넣어 두면 됩니다: python scripts/make_icons.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "brand" / "jipgam_icon_transparent.png"
WHITE = (255, 255, 255, 255)


def fit(img: Image.Image, size: int, pad: float = 0.0, bg=None) -> Image.Image:
    s = int(size * (1 - 2 * pad))
    im = img.copy()
    im.thumbnail((s, s), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return out


if __name__ == "__main__":
    sym = Image.open(SRC).convert("RGBA")
    sym = sym.crop(sym.getbbox())
    icons, brand = ROOT / "static" / "icons", ROOT / "static" / "brand"
    icons.mkdir(parents=True, exist_ok=True)
    brand.mkdir(parents=True, exist_ok=True)
    fit(sym, 192, 0.14, WHITE).save(icons / "icon-192.png")
    fit(sym, 512, 0.14, WHITE).save(icons / "icon-512.png")
    fit(sym, 512, 0.20, WHITE).save(icons / "icon-maskable-512.png")
    fit(sym, 180, 0.14, WHITE).convert("RGB").save(icons / "apple-touch-icon.png")   # 아이폰은 투명 없이 꽉 채운 그림
    fit(sym, 96).save(brand / "symbol-96.png", optimize=True)                        # 머리글·바닥글 (30px 의 3배)
    for n in (48, 96):
        fit(sym, n, 0.04).save(brand / f"favicon-{n}.png", optimize=True)
    print("icons ->", icons, brand)
