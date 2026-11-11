"""UX v3.3: (1) 낮은 폰(높이 700 이하) 단지 상세에서 아래 고정 버튼이 '전체 평가 펼치기'를 덮지 않게,
(2) MY 통계 세 칸이 같은 화면 아래 숫자와 어긋나지 않게(프로젝트 → 임장 코스). 저장 키·계산은 그대로."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_low_phone_detail_collapses_tag_strip_to_one_scroll_row_and_keeps_art_height():
    css = _r("static/style.css")
    seg = css[css.index("UX v3.3 · 낮은 폰"):]
    assert "@media (max-width: 719px) and (max-height: 700px)" in seg
    assert ".pb .mc-strip { flex-wrap: nowrap; overflow-x: auto;" in seg      # 태그는 한 줄로 옆으로 넘김(내용은 그대로)
    assert ".mc-art" not in seg                                              # 사진 높이는 건드리지 않음(가격 칩이 순위 배지를 가리지 않게)


def test_fixed_course_button_yields_only_when_inline_button_is_fully_visible():
    a = _r("static/app.js")
    seg = a[a.index("function aptCta()"):a.index("function courseButton()")]
    assert "e.intersectionRatio >= 0.95" in seg and "threshold: [0, 0.95, 1]" in seg
    assert ".observe(inline)" in seg and "base.click()" in seg and "localStorage" not in seg


def test_my_stats_count_course_not_projects_and_use_same_rule_as_the_next_step_line():
    h, m = _r("templates/my.html"), _r("static/my.js")
    assert '<dt>임장 코스</dt><dd data-ms="course">' in h and 'data-ms="proj"' not in h
    assert 'ms("course").textContent = courseN' in m and 'ms("proj")' not in m
    # 아래 안내 문구('임장 코스 N곳이 있어요')와 같은 기준: 직접 짠 코스만(자동 코스 제외)
    assert "!cs0.auto && Array.isArray(cs0.list) && cs0.list.length && stops0" in m
    assert "!cs.auto && Array.isArray(cs.list) && cs.list.length && stops" in m
