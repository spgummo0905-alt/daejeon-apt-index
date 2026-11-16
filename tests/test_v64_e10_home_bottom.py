"""E10: 홈(폰) 아래쪽 정리. 옛 지도 구역 숨김, 전체 단지는 접어 두고 버튼으로 펼침. 지우지 않음, 큰 화면 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
IDX = (R / "templates/index.html").read_text(encoding="utf8")
FOLD = (R / "static/home-fold.js").read_text(encoding="utf8")
TBL = (R / "static/table.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E10 홈(폰)"):]
def test_markup_kept_and_button_added_inside_list_section_before_table():
    assert 'id="map"' in IDX and '<section id="list"' in IDX                       # 지우지 않음
    s = IDX[IDX.index('<section id="list"'):]
    assert s.index("data-hm-list") < s.index('id="table-wrap-box"') and 'aria-expanded="false" aria-controls="table-wrap-box"' in s
    assert '<script src="static/home-fold.js?v={{ v }}" defer></script>' in IDX
def test_count_in_button_is_the_real_count_not_made_up():
    assert '전체 단지 {{ "{:,}".format(meta.n_complexes) }}곳 보기' in IDX
def test_list_opens_from_hash_nav_link_and_area_pick_and_show_area():
    for k in ('location.hash === "#list"', 'a[href=\"#list\"]'.replace("\\", ""), 'addEventListener("hashchange", fromHash)', "DJ.openList()"): assert k in FOLD, k
    assert "DJ.openList = openList;" in TBL and TBL.count("openList();") >= 2
    i = TBL.index("DJ.showArea = function (area, dong) {"); assert "openList();" in TBL[i:i + 120]
def test_aria_state_and_label_follow_open_close():
    assert 'setAttribute("aria-expanded", String(on))' in FOLD and 'on ? "접기" : closed' in FOLD
def test_phone_only_hides_old_map_section_and_folds_list_but_big_screen_untouched():
    assert '@media (max-width: 720px) {' in B and 'body[data-page="index"] #map { display: none; }' in B
    assert "#list:not(.hm-open) > *:not(.panel-head):not(.hm-listbtn) { display: none; }" in B
    assert ".hm-listbtn { display: none; }" in B.split("@media")[0]
    assert ".hm-listbtn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 56px;" in B and ".hm-listbtn[aria-expanded=\"true\"] { margin: 0 0 14px; min-height: 48px;" in B and not re.search(r"font-size:\s*(?:[0-9]|1[0-5])px", B)
def test_old_map_link_in_jump_bar_hidden_only_on_phone_and_jump_order_kept():
    assert '.jump a[href="#map"] { display: none; }' in B
    j = IDX[IDX.index('<nav class="jump"'):IDX.index("</nav>", IDX.index('<nav class="jump"'))]
    assert j.index('href="#map"') < j.index('href="#list"') < j.index('href="#heat"')
