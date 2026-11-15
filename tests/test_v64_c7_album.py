"""C7: 카드첩 시안 모양 — 안내 띠 + 내 카드 모아보기 타일. 모은 카드가 있을 때만 보이고, 타일은 모은 카드에서 등급마다 지수 최고 한 장(최대 3). 값·계산 변경 없음."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
def test_note_and_tiles_markup_start_hidden_with_original_copy():
    assert 'data-album-note hidden>' in HTML and "수집한 기록이 차곡차곡" in HTML and "방문 도장은 실제 임장 기록에만" in HTML
    assert 'data-album-best hidden>' in HTML and "내 카드 모아보기" in HTML
    assert HTML.index("data-album-been") < HTML.index("data-album-note") < HTML.index("data-album-best") < HTML.index("album-legend")
def test_both_show_only_when_cards_are_collected():
    assert "note.hidden = !got.length;" in JS and "best.hidden = !tops.length;" in JS
def test_tiles_come_only_from_collected_cards_best_index_per_grade_max_three():
    i = JS.index("const tops = GRADES.map(")
    s = JS[i:i + 260]
    assert "got.filter(c => c.g === g)" in s and "(y.i ?? -1) - (x.i ?? -1)" in s and ".slice(0, 3)" in s
    assert "all.filter" not in s                                   # 모으지 않은 카드는 절대 안 뽑음
def test_tile_is_a_real_link_with_label_and_grade_colour_class():
    assert 'a.href = DJ.href(c)' in JS and "`${c.g}등급 ${c.n} 카드 보기`" in JS and '"best-tile g-" + c.g' in JS
def test_css_no_motion_no_external_files_and_a_has_no_gold():
    b = CSS[CSS.index("/* C7 카드첩"):]
    assert "url(" not in b and "animation" not in b and "@import" not in b
    assert ".best-tile.g-S { box-shadow: inset 0 0 0 1.5px #c9a34e; }" in b
    assert ".best-tile.g-A" not in b                               # A 는 금색을 쓰지 않음(S만 금)
