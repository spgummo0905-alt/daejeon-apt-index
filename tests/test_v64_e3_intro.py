"""E3: 지역 소개 화면(폰) 새 첫 화면. 크림 바탕, 제목 한 줄 + 한 문장 + 등급 카드 부채(S~D) + 버튼 둘. 검색·예산 칩은 아래로. 큰 화면·맨 앞 주소(landing)는 기존 그대로. 값은 실제 1위 카드만."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/intro.html").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E3 지역 소개"):]
def test_new_hero_only_for_region_intro_not_landing_and_before_old_hero():
    assert "{% if not landing and top %}" in HTML and HTML.index("iv-hero") < HTML.index('class="it-hero')
def test_order_title_sentence_fan_caption_buttons():
    o = [HTML.index(k) for k in ('class="iv-k"', 'class="iv-h"', 'class="iv-s"', 'class="iv-fan"', 'class="iv-cap"', 'class="iv-cta"')]
    assert o == sorted(o)
def test_copy_from_the_direction_brief():
    for k in ("임장 전에, 카드 한 장.", "실거래·입지·임장 정보를 S부터 D까지 등급 카드로 정리했어요.", "시작하기", "나중에", "아파트 임장 지수", "실제 단지 예시"):
        assert k in HTML, k
def test_five_grades_back_cards_show_letters_only_front_card_uses_real_values():
    assert '[("D", -10, -116), ("C", -5, -64), ("B", 5, 64), ("A", 10, 116)]' in HTML
    seg = HTML[HTML.index('class="iv-card iv-front'):HTML.index('class="iv-cap"')]
    for k in ("<strong>{{ top.name }}</strong>", '<span class="iv-place">{{ top | place }}</span>', "<em>{{ top.index | score }}</em>", "top.slug"): assert k in seg, k
    back = HTML[HTML.index("for g, r, x in back"):HTML.index('<a class="iv-card iv-front')]
    assert "top.index" not in back and "top.name" not in back          # 뒤 카드에는 숫자·이름을 넣지 않음
def test_old_hero_search_budget_and_all_sections_kept_not_deleted():
    for k in ("data-it-search", "it-budget", "it-anatomy", "it-uses", "it-tools", "it-live", "it-end", "data-search-go", "어느 지역부터 볼까요?"):
        assert k in HTML, k
    assert HTML.count("<h1") == 1                                    # 제목(h1)은 하나, 화면 읽기용으로 남김
def test_phone_only_cream_no_dark_sections_no_hidden_reveal():
    assert "@media (max-width: 720px) {" in B and "background: #f7f4ec" in B
    assert '.js body[data-page="intro"]:has(.it-start) [data-reveal]' in B and "opacity: 1; transform: none; transition: none;" in B
    assert ".iv-hero { display: none; }" in B
def test_a_card_is_platinum_never_gold_and_grade_colors_present():
    assert ".iv-card.g-A { --gc: #c9ced3; --gk: #4e5660; }" in B and ".iv-card.g-S { --gc: #c9a24a;" in B
    assert ".iv-card.g-B { --gc: #3e6fb0;" in B and ".iv-card.g-C { --gc: #5e6b78;" in B and ".iv-card.g-D { --gc: #d9dcdf;" in B
def test_motion_once_with_reduced_motion_fallback_and_buttons_56():
    assert "animation: iv-open 650ms cubic-bezier(.2, .8, .2, 1) both" in B and "@media (prefers-reduced-motion: reduce) { .iv-card { animation: none; } }" in B
    assert "min-height: 56px" in B and "iteration-count" not in B and "infinite" not in B
def test_text_not_below_14px_and_no_external_files():
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-3])px", B) and "url(" not in B and "@import" not in B
def test_intro_cards_use_the_album_card_look_navy_metal_border_top_line_big_index():
    assert '<span class="iv-top"><span>JIPGAM</span><span>&#10022; {{ top.grade }} TIER</span></span>' in HTML and "<small>TIER</small>" in HTML
    seg = B[B.index("/* E3b 소개 화면 카드도"):]
    for k in ("border: 3px solid var(--bc, #d2b274)", "linear-gradient(155deg, #1c4152, #0e2635)", ".iv-card.g-A { --bc: #c3cbd4;", ".iv-front em { color: var(--gl); }"):
        assert k in seg, k
    assert "#d2b274" not in seg[seg.index(".iv-card.g-A"):seg.index(".iv-card.g-B")]      # A 는 금색 테두리가 아님
