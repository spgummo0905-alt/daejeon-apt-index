"""D9: 내 카드 모아보기는 최근에 모은 두 장만 먼저 보이고, 나머지는 '더 보기'(아이콘 포함)로 펼친다. 값·저장·계산은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
def test_two_recent_cards_first_then_twelve_more_each_time():
    assert "draw(2);" in JS and "more = () => draw(12);" in JS
    assert "draw(12);\n" not in JS.replace("more = () => draw(12);", "")
def test_sorted_by_collected_date_newest_first_then_latest_added():
    assert "String(a[y.s]).localeCompare(String(a[x.s])) || order.indexOf(y.s) - order.indexOf(x.s)" in JS
    assert "GRADES.indexOf(x.g) - GRADES.indexOf(y.g) || (y.i ?? -1)" not in JS[JS.index("function album(d)"):JS.index("const box = sec.querySelector")]
def test_more_button_has_count_and_chevron_icon_and_hides_when_all_shown():
    assert 'createTextNode("더 보기")' in JS and "`카드 ${sorted.length - shown}장 더 보기`" in JS and "#i-chev-down" in JS[JS.index("const draw = k"):]
    assert "btn.hidden = shown >= sorted.length;" in JS
def test_filter_chips_and_counts_untouched():
    assert "counts[k]}장`" in JS and "shownSet" in JS and "flt = k; album(d);" in JS
def test_button_is_at_least_44px_and_not_below_14px_text():
    B = CSS[CSS.index("/* D9 내 카드 모아보기"):]
    assert "min-height: 48px" in B and "font-size: 15px" in B and "animation" not in B and "url(" not in B
