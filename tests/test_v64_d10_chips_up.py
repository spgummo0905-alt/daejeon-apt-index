"""D10: 등급 칩(걸러 보기)은 '내 카드 모아보기' 제목 바로 아래, 카드보다 위. 더 보기 버튼 글자는 '더 보기'."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
JS = (R / "static/cards.js").read_text(encoding="utf8")
def test_chips_sit_right_under_title_above_cards_and_progress():
    o = [HTML.index(k) for k in ('id="album-title"', "data-album-filter", "data-album-shown", "data-album-cards", "data-album-more", "ac-prog")]
    assert o == sorted(o)
def test_each_hook_exactly_once():
    for k in ("data-album-filter", "data-album-shown", "data-album-more", "data-album-cards"):
        assert HTML.count(k) == 1, k
def test_more_button_says_just_more_and_count_is_for_screen_readers():
    assert 'createTextNode("더 보기")' in JS and "`카드 ${sorted.length - shown}장 더 보기`" in JS and "장 더 보기`));" not in JS
