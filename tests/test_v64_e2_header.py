"""E2: 홈(폰) 맨 위 헤더를 시안 A처럼(로고·지역·검색·카드첩 둥근 버튼). 홈에서만, 다른 화면·큰 화면은 그대로. 지역 선택·검색 기능은 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
BASE = (R / "templates/base.html").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E2 홈 맨 위 헤더"):]
_n3 = B.find("\n/* E3 지역 소개", 5)
if _n3 > 0:
    B = B[:_n3]   # 자기 블록만(뒤에 붙은 E3 소개 화면 블록은 검사 대상이 아님)
def test_cards_button_exists_hidden_by_default_and_links_to_album():
    assert 'class="hd-cards" href="{{ root }}cards.html" aria-label="내 카드첩"' in BASE and ".hd-cards { display: none; }" in B
def test_only_home_phone_is_restyled():
    assert B.count('body[data-page="index"]') >= 8 and "@media (max-width: 720px)" in B
    assert 'body[data-page="index"] .hd-cards { display: inline-grid;' in B
    assert re.search(r"^(?!.*body\[data-page=\"index\"\]).*header\.site \{", B, re.M) is None
def test_search_and_region_functions_untouched_and_taps_44():
    assert "data-hs-open" in BASE and "data-rg-open" in BASE and "height: 44px; min-width: 44px" in B
def test_no_small_text_no_motion():
    assert "animation" not in B and not re.search(r"font-size:\s*(?:[0-9]|1[0-3])px", B)
