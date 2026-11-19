"""D7: 카드첩을 시안 A 구조 그대로. 위에서 아래로 내 카드첩 · 제목+책 아이콘 · 민트 띠 · 내 카드 모아보기+알약 · 카드 2열 · 칩 · 수집 현황 · 방패 박스, 그 아래 '더 보기'에 기존 기능.
값(지수·등급·이름·지역·수집 수)과 다녀옴 도장 조건(DJ.been)·저장은 기존 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* D7 카드첩(시안 A 구조 그대로)"):]
def test_order_matches_the_mockup_top_to_bottom():
    keys = ("ac-label", "ac-head", "data-album-note", 'id="album-title"', "data-album-total", "data-album-filter", "data-album-cards", "ac-prog", "ac-insight", "ac-more")
    o = [HTML.index(k) for k in keys]
    assert o == sorted(o)
def test_mint_strip_and_more_section_have_their_own_names_and_start_hidden_or_below():
    assert '<div class="ac-state" data-album-note hidden>' in HTML
    assert '<section class="panel ac-more" aria-labelledby="album-more-title" hidden>' in HTML
    assert '<span class="ac-book" aria-hidden="true">' in HTML and '<span class="ac-pill" data-album-total>' in HTML
def test_mockup_copy_is_used_verbatim():
    for k in ("내 카드첩</p>", "<h1>내가 모은 집들</h1>", "직접 살펴본 단지가 기록으로 남습니다.", "수집한 기록이 차곡차곡", "방문 도장은 실제 임장 기록에만", ">내 카드 모아보기</h2>", "수집 현황", "수집과 실제 방문 기록은 구분해요."):
        assert k in HTML, k
def test_things_not_in_the_mockup_are_hidden_not_deleted():
    assert ".ac-more[hidden] { display: none; }" in B
    more = HTML[HTML.index("ac-more"):HTML.index('id="today"')]
    for k in ("hero-note", "data-album-best", "data-album-grades", "data-album-areas", "data-album-next"):
        assert k in more, k
        assert k not in HTML[:HTML.index("ac-more")], k
def test_old_stand_alone_titles_and_bar_are_gone_from_the_mockup_part():
    top = HTML[:HTML.index("ac-more")]
    assert "살펴본 아파트와 임장 기록" not in HTML and "살펴본 아파트 카드" not in HTML
    assert 'class="album-bar"' not in top and "album-legend" not in top
def test_every_data_hook_the_script_needs_still_exists_exactly_once():
    for k in ("data-album-total", "data-album-prog", "data-album-bar", "data-album-cards", "data-album-more", "data-album-filter", "data-album-note", "data-album-empty ", "data-album-grades", "data-album-areas", "data-album-best "):
        assert HTML.count(k) == 1, k
    assert HTML.count('id="album"') == 1 and HTML.count('id="today"') == 1 and HTML.count('id="badges"') == 1
def test_card_is_built_from_the_collected_card_own_values_only():
    seg = JS[JS.index("function acCard(c)"):JS.index("let more = null")]
    for k in ('"JIPGAM / " + new Date().getFullYear()', '"\\u2726 " + c.g + " TIER"', "DJ.place(c)", "String(c.i)", "c.n", "DJ.been(c)", "DJ.href(c)"):
        assert k in seg, k
    for bad in ("localStorage", "DJ.save", "DJ.records", "Math.random"):
        assert bad not in seg, bad
def test_card_grid_uses_the_card_builder_and_pill_and_progress_use_existing_counts():
    assert "box.append(acCard(c))" in JS and "DJ.miniCard" not in JS[JS.index("function album(d)"):]
    assert "`${got.length.toLocaleString()}장 수집`" in JS
    assert "pc.textContent = `${got.length.toLocaleString()} / ${all.length.toLocaleString()}장`" in JS
def test_stamp_only_when_visited_otherwise_metal_name_only_for_s_and_a():
    assert 'if (b) { const st = el("span", "ac-stamp", "다녀옴");' in JS and 'else bottom.append(el("span", "ac-metal", METAL[c.g] || ""));' in JS
    assert 'const METAL = { S: "GOLD", A: "PLATINUM" };' in JS
def test_chip_shows_only_the_label_and_count_goes_to_the_reader_label():
    assert 'el("button", "chip" + (flt === k ? " on" : ""), label)' in JS and "`${label} ${counts[k]}장`" in JS
def test_a_card_has_no_gold_border_and_text_never_below_12px_no_external_files():
    assert ".ac-card.g-A { border-color: #c3cbd4;" in B                      # A 는 금색 테두리가 아님(백금)
    assert "url(" not in B and "@import" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px", B)
def test_card_numbers_follow_the_mockup():
    for k in ("min-height: 237px; padding: 13px; border: 3px solid #d2b274; border-radius: 20px;", "height: 102px; margin: 8px 0 10px;", "margin: 5px 0; font-size: 14px;", "letter-spacing: -.08em;", "rotate(-7deg)", ".ac-card::before"):
        assert k in B, k
def test_top_is_only_back_line_on_phone_for_the_album_page():
    assert 'body[data-page="cards"] header.site .rg, body[data-page="cards"] header.site .hd-end, body[data-page="cards"] .seg-nav, body[data-page="cards"] .rcd { display: none; }' in CSS
    assert '"cards": "돌아가기"' in (R / "templates/base.html").read_text(encoding="utf8")
    assert 'body[data-page="cards"]' not in CSS[:CSS.index("/* D7 카드첩(시안 A 구조 그대로)")]    # 다른 곳에서 이 화면만 따로 만지지 않음
