"""UX v3.6: 빈 화면마다 '다음에 누를 것 하나', 로딩은 스켈레톤. 저장·계산·값은 그대로."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_empty_states_offer_one_next_action():
    assert "아파트 찾으러 가기" in _r("static/projects.js") and "empty-next" in _r("static/projects.js")
    assert 'class="album-empty empty-next"' in _r("templates/cards.html") and "아파트 찾아보기" in _r("templates/cards.html")
    assert "지도에서 찾아보기" in _r("static/my.js")
    # 기존 안내 문장은 그대로 유지
    assert "아직 담은 후보가 없어요" in _r("static/projects.js")
    assert "아직 살펴본 단지가 없습니다" in _r("static/my.js")


def test_skeleton_replaces_loading_text_and_respects_reduced_motion():
    assert "skel-block" in _r("templates/apt.html") and "불러오는 중…</p></div>" not in _r("templates/apt.html")
    assert 'role="status" aria-label="불러오는 중"' in _r("templates/apt.html")
    css = _r("static/style.css")
    assert ".skel {" in css and "@media (prefers-reduced-motion: reduce) { .skel { animation: none; } }" in css
    f = _r("static/finder.js")
    assert 'skel skel-card' in f and 'gridBox.removeAttribute("aria-busy")' in f


def test_new_copy_has_no_pressure_or_claims():
    new = ["아파트 찾으러 가기", "아파트 찾아보기", "지도에서 찾아보기"]   # 이번에 새로 넣은 버튼 문구
    for s in new:
        for bad in ("곧 마감", "놓치지", "지금 바로", "무조건", "한정"):
            assert bad not in s
