"""v6.2 PR-B: 임장 코스 맨 위 '현장 체크 시작' 버튼. 기존 현장 체크 버튼과 같은 주소로만 이어지고 저장은 건드리지 않음."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_top_button_sits_before_controls_and_hidden_until_course_exists():
    h = R("templates/_course.html")
    assert "data-cs-top-go" in h and "data-cs-top-sum" in h
    assert h.index("data-cs-top") < h.index('class="cs-ctl"')      # 설명 바로 아래, 단지 검색칸보다 위
    assert 'data-cs-top hidden' in h


def test_top_button_uses_same_href_as_stop_button_and_saves_nothing():
    js = R("static/course.js")
    i, j = js.index("맨 위 \"현장 체크 시작\""), js.index("map(stops);")
    seg = js[i:j]
    assert 'a.href = DJ.href(c0) + "#field"' in seg and "stops[0]" in seg
    assert "현장 체크 이어서 하기" in seg and "첫 단지" in seg
    for w in ("DJ.save", "localStorage", "setItem"):
        assert w not in seg
    assert 'go.href = DJ.href(c) + "#field"' in js                  # 기존 단지별 버튼은 그대로


def test_top_button_is_hidden_when_course_is_short():
    js = R("static/course.js")
    assert "if (top) top.hidden = true;" in js and js.index("if (top) top.hidden = true;") < js.index("if (!enough) return;")


def test_top_button_is_at_least_56px_and_text_not_under_12px():
    css = R("static/style.css")
    blk = css[css.index("v6.2 PR-B"):]
    assert "min-height: 56px" in blk and "font-size: 18px" in blk
    assert "font-size: 14px" in blk
