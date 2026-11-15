"""D5: 카드첩을 시안 A 모양으로(머리 아이콘, '내 카드 모아보기' 제목+수집 알약, 수집 현황 줄, 방패 안내 박스). 값·저장·계산 변경 0."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* D5 카드첩 모양"):]
def test_head_has_icon_and_section_title_is_my_card_collection_with_pill():
    assert 'class="ah-ic"' in HTML and "#i-book" in HTML
    assert '<h2 id="album-title">내 카드 모아보기</h2>' in HTML and "pill-count" in HTML
def test_old_section_title_is_gone_and_best_tiles_have_a_distinct_title():
    assert "살펴본 아파트 카드" not in HTML
    assert "<h3 class=\"album-sub\">등급별 대표 카드</h3>" in HTML
def test_pill_and_progress_use_the_same_existing_counts():
    assert "`${got.length.toLocaleString()}장 수집`" in JS
    assert "pc.textContent = `${got.length.toLocaleString()} / ${all.length.toLocaleString()}장`" in JS
def test_progress_line_and_legend_box_exist_in_order_and_keep_original_copy():
    o = [HTML.index(k) for k in ("album-prog", "album-legend", "수집과 실제 방문 기록은 구분해요.", "다녀옴 도장")]
    assert o == sorted(o)
    assert "내가 직접 현장 기록을 남긴 카드에만 찍혀요." in HTML
def test_note_is_looked_up_in_the_whole_page_not_only_inside_the_section():
    assert 'const note = document.querySelector("[data-album-note]");' in JS
def test_old_standalone_bar_is_hidden_and_dark_mode_colours_exist():
    assert "#album > .album-bar { display: none; }" in B
    assert "@media (prefers-color-scheme: dark)" in B and ".album-legend { background: #12332a;" in B
def test_no_text_below_14px_no_motion_no_external_files():
    assert "url(" not in B and "animation" not in B and "@import" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-3])(?:\.\d+)?px", B)
