"""UX v3 상세: 아래 고정 버튼(임장 코스에 넣기)은 관심·비교 행동 줄이 하단 메뉴 위에 실제로 보일 때만 비켜 준다.
짧은 폰(375×667)에서 행동 줄이 하단 메뉴 뒤에 가려졌는데도 '보인다'고 판단해 둘 다 안 보이던 문제를 막는다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_cta_hides_only_when_action_row_is_mostly_visible_above_the_real_tab_bar_height():
    app = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
    seg = app[app.index("function aptCta()"):app.index("function courseButton()")]
    assert 'document.querySelector(".tabbar")' in seg and "getBoundingClientRect().height" in seg      # 메뉴 높이를 실제로 잼
    assert "e.intersectionRatio >= 0.6" in seg and "threshold: [0, 0.6, 1]" in seg                    # 60% 이상 보일 때만
    assert "e.isIntersecting" not in seg and "-64px" not in seg                                        # 고정 숫자·단순 교차 판정 제거
    assert '.observe(inline)' in seg and '.observe(row)' not in seg                                    # v3.2: 카드 아래 같은 버튼이 기준(행동 줄이 아님)
