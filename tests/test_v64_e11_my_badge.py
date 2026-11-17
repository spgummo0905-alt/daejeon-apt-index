"""E11: MY 탭 숫자는 새 소식(빨강)일 때만 보이고, 화면 읽기에는 무슨 숫자인지 글자가 같이 있음."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/app.js").read_text(encoding="utf8")
BASE = (R / "templates/base.html").read_text(encoding="utf8")
def test_tab_badge_shows_only_news_while_menu_keeps_favorite_count():
    assert 'const tab = !!b.closest(".tabbar"), k = tab ? news : (news || n);' in JS
def test_every_number_has_a_spoken_label_and_title_saying_what_it_counts():
    assert "관심 단지 새 소식 ${news}곳" in JS and "담아 둔 관심 단지 ${n}곳" in JS and 'sr.className = "sr-only"' in JS
    assert "b.replaceChildren(document.createTextNode(num), sr);" in JS
def test_tab_badge_is_a_red_dot_without_number_and_phone_tab_only():
    css = (R / "static/style.css").read_text(encoding="utf8"); b = css[css.index("/* E11 아래 탭"):]
    assert 'b.classList.toggle("dot", tab)' in JS and ".tabbar .fav-count.dot { width: 10px; min-width: 10px; height: 10px;" in b and "text-indent: -999px" in b
def test_markup_still_has_both_badges():
    assert BASE.count("data-fav-count") == 2
