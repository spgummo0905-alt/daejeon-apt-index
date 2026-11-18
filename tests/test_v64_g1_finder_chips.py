"""G1: 찾기·임장 위쪽 칩 줄은 잘리지 않고, 찾기 아래 큰 버튼은 조건을 고른 뒤에만 아래에 붙는다."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
FIND = (R / "templates/_seg_find.html").read_text(encoding="utf8")
PJ = (R / "templates/_seg_pj.html").read_text(encoding="utf8")
JS = (R / "static/finder.js").read_text(encoding="utf8")
B = CSS[CSS.index("/* G1 찾기"):]

def test_find_chip_row_has_no_cross_links_and_keeps_the_four_ways():
    assert FIND.count("<a href=") == 4 and "순위로" not in FIND                       # 조건·테마·역 주변·지도만(순위는 둘러보기 메뉴에 있음)
    for k in ("finder.html", "themes.html", "map.html"): assert k in FIND
    assert PJ.count("<a href=") == 3 and "관심 단지" not in PJ                          # 프로젝트·비교·카드첩만(관심 단지는 MY)

def test_chip_row_fits_without_sideways_scroll_on_phone_and_keeps_44px():
    assert "@media (max-width: 720px) {" in B and ".seg-nav { gap: 6px; overflow-x: visible; }" in B
    assert "flex: 1 1 auto; justify-content: center; padding: 0 10px; white-space: nowrap; }" in B
    assert "@media (max-width: 340px) { .seg-nav a { padding: 0 6px; font-size: 14px; }" in B
    assert "min-height: 44px" in CSS[CSS.index(".seg-nav a {"):CSS.index(".seg-nav a {") + 200]   # 터치 칸 44px 그대로

def test_finder_main_button_sticks_only_after_a_condition_is_chosen():
    assert 'el("div", "sv-quick-dock" + (idle || !n ? " idle" : ""))' in JS
    assert ".sv-quick-dock.idle { position: static; margin: 0; padding: 0; background: none; border: 0; border-radius: 0; }" in B

def test_narrowest_phone_budget_chips_use_two_columns_so_labels_do_not_wrap():
    assert "@media (max-width: 340px) { .sv-qg .sv-opts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }" in B
