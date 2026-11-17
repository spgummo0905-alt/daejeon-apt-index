"""E12: MY '임장' 탭 숫자는 그 칸 안에 실제로 보이는 것(직접 짠 코스 + 다녀온 단지)만 센다. 관심 단지에서 저절로 생긴 코스는 세지 않음."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/my.js").read_text(encoding="utf8")
def test_tab_count_uses_own_course_plus_been_not_auto_course():
    assert 'mj("course", courseN + beenN);' in JS
    assert 'mj("course", DJ.courseStops(d).stops.length);' not in JS
def test_courseN_is_own_course_only_and_been_counts_visit_logs_and_dates():
    assert "!cs0.auto" in JS and 'k.startsWith("visit:")' in JS and "beenSet" in JS
def test_tab_has_title_explaining_the_number_and_no_title_when_empty():
    assert "직접 짠 임장 코스 ${courseN}곳 · 다녀온 집 ${beenN}곳" in JS and ': "";' in JS
def test_first_visit_hint_hidden_when_any_field_note_exists_not_only_dated_visit_logs():
    assert 'if (vEmpty2 && notes.length) vEmpty2.hidden = true;' in JS
    assert "vEmpty.hidden = !!groups.size;" in JS         # 날짜별 방문 기록이 있을 때 숨기던 기존 규칙은 그대로
