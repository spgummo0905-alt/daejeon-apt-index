"""C5: 현장 모드 완료 카드. '오늘 다녀왔어요'가 실제로 저장된 직후에만 보이고, 저장 실패·끄기에는 보이지 않는다. 값·저장 형식 불변."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
FIELD = (R / "static/field.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
def _click():
    i = FIELD.index("been.addEventListener(\"click\"")
    return FIELD[i:FIELD.index("paint();", i + 300)]
def test_done_card_only_after_successful_save_and_only_when_turning_on():
    c = _click()
    assert "if (!persist()) { if (prev) v.d = prev; else delete v.d; paint(); return; }" in c
    assert c.index("if (!persist())") < c.index("showDone()")          # 저장 확인 뒤에만
    assert "if (!was) showDone();" in c and "if (!was) nextAfterVisit();" in c           # 켜는 순간에만(끌 때는 안 보임)
    assert "done.hidden = true;" in c and c.index("done.hidden = true;") < c.index("showDone()")
def test_done_card_starts_hidden_and_is_status_region():
    assert 'const done = el("div", "fm-done"); done.hidden = true; done.setAttribute("role", "status");' in FIELD
def test_first_visit_wording_uses_saved_visit_dates_only():
    assert "n <= 1 ? \"첫 임장 기록이 남았어요!\" : \"임장 기록이 남았어요\"" in FIELD
    assert "(DJ.visit(c.s) || {}).d" in FIELD
def test_done_card_links_to_existing_cards_page_and_sits_before_stamp():
    assert 'doneGo.href = (window.DJ_ROOT || "") + "cards.html"' in FIELD
    assert "s.append(t, saveEl, been, done, stamp, again, dated, note);" in FIELD
def test_css_uses_no_external_files_and_respects_reduced_motion():
    b = CSS[CSS.index("/* C5 완료 카드"):]
    assert "url(" not in b and "@import" not in b
    assert "@media (prefers-reduced-motion: reduce) { .fm-done.in { animation: none; } }" in b
    assert ".fm-done[hidden] { display: none; }" in b
