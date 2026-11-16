"""D2: 현장 체크 위쪽 진행 카드(시안). 체크 수만 비추고, 저장 성공 표시·저장 로직과 무관."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/field.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* D2 현장 체크 진행 카드"):]
_n3 = B.find("\n/* E3 지역 소개", 5)
if _n3 > 0:
    B = B[:_n3]   # 자기 블록만(뒤에 붙은 E3 소개 화면 블록은 검사 대상이 아님)
def test_card_reads_the_existing_check_count_only():
    assert "const [n, all] = fmProg; pcard.hidden = !all;" in JS
    assert "Math.round(n / all * 100)" in JS
def test_card_is_hidden_until_there_are_items_and_placed_above_the_body():
    assert 'pcard = el("div", "fm-pcard");' in JS and "pcard.hidden = true;" in JS and "body.before(pcard);" in JS
def test_card_never_touches_save_state_success_or_storage():
    i = JS.index("// 시안(D2): 위쪽 진행 카드"); mk = JS[i:JS.index("paintBar();\n  }", i)]
    j = JS.index("if (pcard) {"); pt = JS[j:JS.index("\n    }\n", j) + 7]
    for seg in (mk, pt):
        for bad in ("saveEl", "persist", "keep(", "saveVisit", "\"ok\"", "fm-done", "localStorage", "DJ.save"):
            assert bad not in seg, bad
def test_copy_says_it_counts_checks_and_save_state_is_separate():
    assert "확인한 항목 수예요. 저장 상태는 아래 줄에 따로 표시해요." in JS and "오늘의 현장 체크" in JS
def test_bar_is_decorative_and_motion_respects_reduced_motion():
    assert 'rail.setAttribute("aria-hidden", "true")' in JS
    assert "@media (prefers-reduced-motion: reduce) { .fm-rail i { transition: none; } }" in B
def test_css_no_external_files_and_text_not_tiny():
    import re
    assert "url(" not in B and "@import" not in B and "animation" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px", B)
