"""현장 모드 안 2: 체크리스트가 맨 위, 맨 아래 고정 줄(진행·저장 상태·다녀왔어요). 저장·체크·다녀옴 규칙은 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
def _r(p): return (R / p).read_text(encoding="utf8")
def test_checklist_comes_first_then_quotes_course_where():
    f = _r("static/field.js")
    assert "body.replaceChildren(...[checks(c), quotes(c), course(c, d), where(c), photos(), memo(), journal.element].filter(Boolean));" in f
    assert "buildBar();" in f
def test_bar_mirrors_existing_widgets_and_never_saves_by_itself():
    f = _r("static/field.js"); bar = f[f.index("function buildBar()"):f.index("document.addEventListener(\"dj:sync-state\"")]
    assert "beenBtn.click()" in bar and "retryBtn.click()" in bar            # 새 저장 경로 없이 기존 단추를 누를 뿐
    for bad in ("DJ.saveVisit", "persist(", "localStorage", "DJ.save("):
        assert bad not in bar, bad
    assert 'save.setAttribute("aria-hidden", "true")' in bar                  # 같은 문구를 화면 읽기 도구가 두 번 읽지 않게
def test_bar_repaints_on_check_save_state_and_been_changes():
    f = _r("static/field.js")
    assert "fmProg = [n, all]; paintBar();" in f and "beenBtn = been; paintBar();" in f
    assert "retryBtn.hidden = !bad;\n    paintBar();" in f
def test_existing_save_rules_still_in_place():
    f = _r("static/field.js")
    assert "if (!persist())" in f and "cb.checked = was" in f and "nextAfterVisit()" in f
    assert "계정에는 보내지 못했어요. 이 기기에는 저장돼 있어요." in f and "이 기기와 내 계정에 저장됐어요." in f
def test_bar_css_touch_size_keyboard_and_embed():
    c = _r("static/style.css"); t = c[c.index("/* D3 현장 모드 안 2"):]
    assert "position: sticky" in t and "min-height: 52px" in t and ".kb-open .fm-bar { display: none; }" in t
    assert ".pj-embed-field .fm-bar { display: none; }" in t and ".fm-bar.bad { flex-wrap: wrap; }" in t
    assert min(int(x) for x in re.findall(r"font-size: (\d+)px", t)) >= 14
