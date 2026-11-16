"""F2: 지도 가격대는 칩 여러 개(옆으로 잘림) 대신 버튼 하나 + 펼침 목록. 전체 단지 수는 지금 검색·찾기 조건으로 계산."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/map.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* F2 지도 가격대"):]
def test_one_button_opens_a_listbox_with_all_bands_and_old_chip_row_is_gone():
    assert 'bandBtn.setAttribute("aria-haspopup", "listbox")' in JS and 'bandList.setAttribute("role", "listbox")' in JS and 'x.setAttribute("role", "option")' in JS
    assert "BANDS.forEach((b, i) => { const x = document.createElement(\"button\"); x.type = \"button\"; x.className = \"chip\"" not in JS
    assert 'textContent: "가격 " + BANDS[band][0]' in JS
def test_choosing_a_band_filters_closes_the_list_and_returns_focus():
    assert "band = +b.dataset.band; paintBand(); bandOpen(false); bandBtn.focus({ preventScroll: true }); build();" in JS
    assert "lim = BANDS[band][1]; return (!lim || (c.p != null && c.p <= lim))" in JS       # 거르는 규칙은 그대로
def test_counts_use_current_search_and_find_conditions_not_made_up_numbers():
    seg = JS[JS.index("function bandCounts()"):JS.index("function bandOpen(")]
    assert "norm(q)" in seg and "cond.pass(c)" in seg and "ALL.filter(" in seg and '"곳"' in seg
def test_keyboard_escape_outside_click_and_aria_state():
    for k in ('e.key === "ArrowDown" || e.key === "ArrowUp"', 'e.key === "Escape"', "bandOpen(false); bandBtn.focus();", "!chips.contains(e.target)", 'setAttribute("aria-expanded"', 'setAttribute("aria-selected"'): assert k in JS, k
def test_css_44px_48px_rows_no_overflow_clipping_and_floats_above_map():
    assert ".mp-chips { position: relative; overflow: visible;" in B and ".mp-bar { flex-wrap: wrap;" in B
    assert ".mp-bandbtn { display: inline-flex; align-items: center; gap: 8px; min-height: 44px;" in B and "min-height: 48px; padding: 0 14px;" in B
    assert ".mp-bandlist { position: absolute;" in B and "z-index: 40" in B and "prefers-reduced-motion: reduce" in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-4])px", B)
