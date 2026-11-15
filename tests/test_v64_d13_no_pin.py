"""D13: 카드첩 카드 사진 위 파란 위치 점은 숨기고, 사진 칸과 항공사진은 그대로 둔다."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
JS = (R / "static/cards.js").read_text(encoding="utf8")
def test_pin_hidden_only_in_album_card_photo():
    assert ".ac-art .hc-pin, .ac-art .hc-photo.on .hc-pin { display: none; }" in CSS
def test_photo_box_and_cover_loader_hooks_still_there():
    seg = JS[JS.index("function acCard(c)"):JS.index("let more = null")]
    assert 'el("span", "hc-photo")' in seg and "ph.dataset.la = c.la" in seg and "art.append(ph)" in seg
    assert ".ac-art .hc-photo { position: absolute; inset: 0;" in CSS
