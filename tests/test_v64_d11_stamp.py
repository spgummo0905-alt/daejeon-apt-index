"""D11: 다녀옴 도장은 시안처럼 두 줄(다녀옴 / 날짜)로 좁게, 위 글자와 겹치지 않게 아래 줄 자리 확보. 도장 조건(DJ.been)은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* D11 다녀옴 도장"):]
_n = B.find("\n/* D12", 5)
if _n > 0:
    B = B[:_n]   # 자기 블록만
def test_stamp_is_two_lines_and_only_for_visited_cards():
    seg = JS[JS.index("function acCard(c)"):JS.index("let more = null")]
    assert 'el("span", "ac-stamp", "다녀옴")' in seg and 'document.createElement("br"), b.d.slice(5).replace("-", ".")' in seg
    assert "const bottom = el(\"span\", \"ac-bottom\"), b = DJ.been && DJ.been(c);" in seg and "if (b) {" in seg
def test_bottom_row_keeps_room_so_stamp_never_touches_text_above():
    assert "min-height: 44px; padding-top: 12px;" in B
def test_stamp_still_tilted_like_the_mockup_and_text_not_small():
    assert "rotate(-7deg)" in CSS[CSS.index(".ac-stamp {"):] and "font-size" not in B
