"""E1: 홈(폰)을 시안 A 구조로. 위에서 아래로 큰 제목 · 한 줄 설명 · 검색 · 아이콘 4개 · 이번 주말 큰 카드 · 최근 눈여겨본 집 · 안내 박스. 큰 화면·값·저장·주소는 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/index.html").read_text(encoding="utf8")
JS = (R / "static/housecard.js").read_text(encoding="utf8")
APP = (R / "static/app.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E1 홈(시안 A 구조"):]
_n3 = B.find("\n/* E3 지역 소개", 5)
if _n3 > 0:
    B = B[:_n3]   # 자기 블록만(뒤에 붙은 E3 소개 화면 블록은 검사 대상이 아님)
def test_order_matches_the_mockup_top_to_bottom():
    keys = ("hm-h1", "hm-sub", "data-search-go", "hm-quick", "hm-hero", "data-hc-feature", "hm-insight", "data-gates")
    o = [HTML.index(k) for k in keys]
    assert o == sorted(o)
def test_mockup_copy_and_four_icons():
    for k in ("좋은 집의 가치를,", "내 기준으로 발견해요.", "실거래·입지·임장 기록까지, 한눈에 살펴보세요.", "단지·지역·예산으로 찾아보기", "집 찾기", "지도", "임장 코스", "내 카드", "주말 임장 준비", "최근 눈여겨본 집", "모두 보기 →", "오늘의 집 찾기, 여기서 이어가세요.", "실제 방문 기록은 완료한 뒤에만 남아요."):
        assert k in HTML, k
    assert HTML.count('class="hm-quick"') == 1 and HTML[HTML.index('class="hm-quick"'):HTML.index('data-hm-hero')].count("<a href") == 4
def test_page_still_has_one_real_h1_for_search_and_screen_readers_and_entries_kept():
    assert HTML.count("<h1") == 1 and 'class="hm-seo"' in HTML
    for k in ("data-gates", "data-gate-compare", "data-gate-visit", "data-resume", 'class="hero-deck"', 'class="browse"', "data-hc-feature"):
        assert k in HTML, k
def test_phone_only_and_old_entry_cards_hidden_not_deleted():
    assert ".hero-main .resume, .hero-main .gates { display: none !important; }" in B
    assert ".hm-h1, .hm-sub, .hm-quick, .hm-hero, .hm-insight { display: none; }" in B and "@media (max-width: 720px) {" in B
def test_hero_card_uses_real_project_record_only_otherwise_start_wording():
    seg = APP[APP.index("E1 홈 큰 카드"):APP.index("const favs = DJ.favs();")]
    for k in ("pj.name", "pj.slugs.length", "DJVisitLog.list"): assert k in seg, k
    for bad in ("Math.random", "localStorage", "예시", "시안용"): assert bad not in seg, bad
    assert "임장 준비 시작하기" in HTML and "관심 단지를 모아 임장 순서를 정해 보세요." in HTML
def test_recent_card_values_come_from_the_complex_itself():
    seg = JS[JS.index("function recentCard"):JS.index("function fcard") if "function fcard" in JS[JS.index("function recentCard"):] else None]
    for k in ("DJ.place(c)", "c.n", "c.i", "c.g", "DJ.href(c)"): assert k in seg, k
    assert "recentCard(c, tag)" in JS and "feature(c, tag)" not in JS[JS.index("const rec = DJ.recent()"):]
def test_text_not_below_12px_tap_44_no_motion_no_external_files():
    assert "min-height: 44px" in B and "animation" not in B and "@import" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px", B)
def test_grade_badge_a_never_gold():
    assert ".hm-rgrade.g-A { background: linear-gradient(145deg, #f1f2f7, #9da9bd);" in B
