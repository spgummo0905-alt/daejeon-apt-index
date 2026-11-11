"""UX v4.2: 첫 화면 이어서 하기(읽기만) + MY 단계 표시. 저장 키·값 형식 불변."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_resume_name_does_not_collide_with_list_page_resume_row():
    assert "data-resume" not in R("static/resume.js").replace("data-it-resume", "")
    assert "data-resume " not in R("templates/intro.html").replace("data-it-resume", "")


def test_resume_slot_only_on_region_start_and_hidden_by_default():
    h = R("templates/intro.html")
    assert 'data-it-resume hidden' in h and h.index("data-it-resume") < h.index("data-it-search")
    assert '{% if not landing %}<script src="{{ root }}static/resume.js' in h


def test_resume_js_reads_only_and_never_writes_or_navigates_by_itself():
    j = R("static/resume.js")
    assert "DJ.recent()" in j and "DJ.favs()" in j
    assert not re.search(r"DJ\.save|records\.put|localStorage|sessionStorage|location\.(href|replace|assign)\s*=", j)


def test_my_stats_keep_contract_and_only_add_state_labels():
    h = R("templates/my.html")
    assert '<dt>관심 단지</dt><dd data-ms="favs">' in h and '<dt>임장 코스</dt><dd data-ms="course">' in h and '<dt>방문 기록</dt><dd data-ms="visits">' in h
    css = R("static/style.css")
    assert '1 · 담아 둔 집' in css and '3 · 다녀옴' in css
    assert 'classList.toggle("zero"' in R("static/my.js")
