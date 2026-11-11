"""UX v2 PR 06: 상세 — 관심 저장 직후 취소, 홈·메뉴 문구를 4묶음에 맞춤. 통합 신분증 구조와 #333 행동 줄 규칙이 유지되는지도 본다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_favorite_save_offers_undo_in_both_toast_variants():
    app = _r("static/app.js")
    assert "const undo = () => { if (DJ.isFav(c.s)) DJ.toggleFav(c.s); paint(DJ.isFav(c.s)); }" in app
    assert '{ label: "취소", onClick: undo }' in app and "href: ROOT" in app and ", undo })" in app
    assert 'action.href && action.label' in app and "action.undo" in app        # 기존 링크 단추는 그대로, 취소가 옆에 추가
    assert "const added = on && !was" in app                                    # 안 담겼으면 알리지 않음


def test_integrated_id_card_and_action_row_rules_are_preserved():
    html = _r("templates/apt.html")
    assert 'class="mc g-{{ c.grade }}"' in html and 'id="pb-t"' in html
    row = html[html.index('class="icon-actions apt-actions"'):html.index('data-course-add')]
    order = [row.index(k) for k in ("data-fav", "data-compare-here", "data-sun-here", "data-field", "data-share-sheet")]
    assert order == sorted(order)                                                # 관심·비교·일조(없으면 입지)·현장 체크·공유
    assert "preview_ok" in row and "data-loc-here" in row
    app = _r("static/app.js")
    assert 'bar.classList.toggle("off", e.intersectionRatio >= 0.95)' in app and "rootMargin: `0px 0px -${tabH}px 0px`" in app   # 고정 CTA 가림 규칙 유지(v3.2: 기준이 카드 아래 같은 버튼)(하단 메뉴 높이를 실제로 잼: 메뉴 뒤에 가린 줄을 '보인다'고 보지 않음)


def test_card_expand_and_deals_expand_are_separate_controls():
    html = _r("templates/apt.html")
    assert 'data-mc-more aria-expanded="false" aria-controls="mc-more"' in html
    assert 'data-deals-toggle aria-expanded="false" aria-controls="mc-deals"' in html
    assert '종합 지수에 들어가는 항목' in html and '참고 지표' in html            # 지수 반영 항목과 참고 항목 구분


def test_finder_copy_matches_four_groups():
    assert "질문 8개" not in _r("templates/index.html") and "질문 8개" not in _r("templates/base.html")
    assert "예산·지역·집·생활" in _r("templates/index.html")
