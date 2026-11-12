"""v6.2 PR-A: 찾기 조건을 링크로 보내기. 지도는 링크 조건을 우선 쓰되 이 기기의 저장된 설문은 읽지도 쓰지도 않음."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_condition_link_helpers_are_pure_and_leave_survey_alone():
    c = R("static/findcond.js")
    i, j = c.index("DJ.condQuery = function"), c.index("DJ.cond = function (all, over)")
    seg = c[i:j]
    for w in ("DJ.save", "DJ.load", "localStorage", "setItem", "removeItem"):
        assert w not in seg                       # 링크 조건을 만들고 읽는 곳은 저장소를 건드리지 않음
    assert 'qs.has(k)' in seg and "PY.some(p => p.id === id)" in seg and "MUST.some(m => m.id === id)" in seg
    assert "works" not in seg.replace("works: []", "")   # 직장·내 위치(개인 정보)는 링크에 넣지 않음


def test_override_replaces_saved_survey_only_for_this_view():
    c = R("static/findcond.js")
    assert 'saved = over ? {} : (DJ.load("survey", {}) || {})' in c and "fromLink: !!over" in c
    assert "DJ.save" not in c and "localStorage" not in c


def test_map_reads_link_condition_and_labels_it():
    m = R("static/map.js")
    assert "DJ.condFromQuery(location.search)" in m
    assert "링크 조건" in m and "받은 링크의 조건이에요" in m and "저장된 찾기 조건과는 별개" in m
    assert 'DJ.condQuery(cond.saved)' in m          # 조건 바꾸기에서 링크 조건을 찾기로 가져감
    assert "DJ.save" not in m[m.index("function condBar"):m.index("function buildList")]


def test_finder_has_copy_link_button_and_map_link_carries_condition():
    h, f = R("templates/finder.html"), R("static/finder.js")
    assert "data-sv-share" in h and "이 조건 링크 복사" in h and 'static/findcond.js' in h
    assert h.index("static/findcond.js") < h.index("static/finder.js")
    assert 'DJ.condQuery(S)' in f and '"map.html" + (qstr && !works(S).length' in f
    assert "직장 위치 조건은 개인 정보라 링크에 담지 않았어요" in f
    assert 'DJ.copy(url)' in f
