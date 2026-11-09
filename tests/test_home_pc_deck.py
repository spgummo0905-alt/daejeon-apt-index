"""UX v2 PR 03: 홈 PC 오른쪽 카드 영역. 901px 이상에서는 넘겨 보기 없이 카드 두 장을 열 안에 다 보여 주고,
900px 이하(휴대폰·태블릿)의 넘겨 보기는 그대로 둔다."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _css():
    return (ROOT / "static" / "style.css").read_text(encoding="utf-8")


def _block():
    css = _css()
    i = css.index("UX v2 · 03 홈 PC")
    return css[i:css.index("\n}\n", i) + 3]


def test_pc_deck_shows_two_cards_inside_the_column():
    b = _block()
    assert "@media (min-width: 901px)" in b
    assert "overflow: visible" in b and "scroll-snap-type: none" in b     # 넘겨 보기 없음
    assert ".hc-collect:nth-child(n+3) { display: none; }" in b          # 두 장만
    assert "margin: 0; padding: 6px 0 16px" in b                          # 열 밖으로 나가는 음수 여백 제거


def test_mobile_swipe_rail_is_untouched():
    css = _css()
    # 휴대폰·태블릿용 규칙(기존)은 그대로 있고, 새 규칙은 min-width 안에만 있다
    assert ".hero-deck[data-hc-deck] .deck-rail { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -16px;" in css
    assert ".hero-deck[data-hc-deck] .hc-collect { flex: 0 0 min(64%, 236px); scroll-snap-align: start; }" in css
    b = _block()
    assert "@media (max-width" not in b


def test_deck_more_link_does_not_overlap_the_album_link():
    css = _css()
    assert ".hero-deck[data-hc-deck] .deck-more { position: static;" in css   # #334 의 겹침 수정이 유지됨
