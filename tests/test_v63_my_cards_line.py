"""MY 시안 A: '내 카드첩'은 한 줄 링크(가로 카드 목록 없음). 숫자 계산·카드첩 화면·저장은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def _r(p): return (R / p).read_text(encoding="utf8")
def test_cards_entry_is_one_line_link_to_cards_page():
    h = _r("templates/my.html")
    assert '<a class="hc-my" href="cards.html" data-hc-my' in h and "data-hc-my-n" in h
    assert "data-hc-my-rail" not in h and "data-hc-my-empty" not in h
def test_summary_numbers_still_counted_from_existing_records():
    j = _r("static/housecard.js")
    assert "DJ.albumCount(all)" in j and "DJ.earned()" in j and "DJ.BADGES.length" in j and "임장 배지" in j and "data-hc-my-rail" not in j   # 호출 모양까지 단언(이름만 닮은 코드로는 통과 못 함)
def test_one_line_css_is_tall_enough_and_reduced_motion_safe():
    c = _r("static/style.css"); t = c[c.index("/* D3 MY 시안 A"):]
    assert "min-height: 56px" in t and "prefers-reduced-motion" in t
    assert "font-size: 16px" in t or "font-size: 14px" in t
def test_cards_page_untouched():
    t = _r("templates/cards.html")
    assert 'id="today"' in t and 'id="badges"' in t and 'id="album"' in t
