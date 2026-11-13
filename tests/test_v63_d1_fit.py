"""D1: 좁은 폰(320px)에서 카드 칸이 넘치지 않고, 찾기 직접 입력칸이 터치 높이 44px 이상. 값·저장·문구는 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def _tail():
    c = (R / "static/style.css").read_text(encoding="utf8")
    return c[c.index("/* D1 좁은 폰"):]
def test_card_grid_never_wider_than_container():
    assert "minmax(min(290px, 100%), 1fr)" in _tail()
def test_custom_budget_input_touch_height():
    assert ".sv-own input { height: 44px; }" in _tail()
def test_no_markup_or_storage_change():
    # 이번 변경은 CSS 두 줄뿐: 화면 코드(my.js, finder.js)의 저장 키·문구를 건드리지 않는다
    assert "눈여겨본 단지를 담아 보세요" in (R / "static/my.js").read_text(encoding="utf8")
    assert "예: 6.5" in (R / "static/finder.js").read_text(encoding="utf8")
