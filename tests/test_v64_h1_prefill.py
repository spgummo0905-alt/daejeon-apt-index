"""H1: 빠른 설정에서 고른 예산·평형(·아이 키우기)을 찾기 첫 방문에만 미리 채움. 이미 찾기를 쓴 기기와 주소 조건은 건드리지 않고, 새로 저장하는 값은 없다."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/finder.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
A = JS[JS.index("let prefilled = false;"):JS.index("const save = () =>")]

def test_prefill_runs_only_when_nothing_saved_and_no_url_condition():
    assert 'if (Object.keys(savedSurvey).length || /[?&](budget|py|gu|age|stn|sch|must)=/.test(location.search)) return;' in A

def test_reads_only_the_saved_want_and_validates_values_before_using_them():
    assert "DJ.prefs().want" in A and "BUDGETS.includes(b)" in A and "ids.every(id => PY.some(x => x.id === id))" in A
    assert 'py === "40" ? ["40", "50"] : [py]' in A                                   # 40평대 이상은 40·50 둘
    assert "DJ.setPref" not in A and "DJ.save" not in A and "save()" not in A         # 새로 저장하지 않음

def test_child_goal_adds_school_condition_only_when_something_was_prefilled():
    assert 'w.goals.includes("아이 키우기") && prefilled) S.must = ["edu"]' in A

def test_user_is_told_and_note_hidden_otherwise():
    assert 'el("p", "sv-prefill", "빠른 설정에서 고른 조건으로 시작했어요. 바꾸거나 아래에서 지울 수 있어요.")' in JS and "pre.hidden = !prefilled" in JS
    B = CSS[CSS.index("/* H1 찾기"):]
    assert ".sv-prefill[hidden] { display: none; }" in B and "font-size: 15px" in B
