"""UX v2 PR 08: 비교 — 3~4곳은 첫 열 고정 가로 스크롤 표 + 열 이동, 우열 문장 숨김, 카드 접기, 주소 정리."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_wide_table_is_a_labelled_keyboard_scroll_region_with_header_relations():
    js = _r("static/compare.js")
    assert 'wrap.tabIndex = 0; wrap.setAttribute("role", "region")' in js
    assert 'th.scope = "col"' in js and 'rh.scope = "row"' in js


def test_three_or_four_get_scroll_hint_and_column_jumps_but_two_do_not():
    js = _r("static/compare.js")
    assert "if (cs.length >= 3) {" in js and "옆으로 밀어" in js and "열로 이동" in js
    css = _r("static/style.css")
    assert ".cmp-table tbody th, .cmp-table thead th:first-child { position: sticky; left: 0; z-index: 2; background: var(--surface)" in css
    assert ".cmp-jump { min-height: 44px;" in css


def test_no_winner_sentence_on_screen_and_cards_are_folded_not_removed():
    js = _r("static/compare.js")
    assert "verdict.hidden = true;" in js                       # 우열 문장은 화면에 안 보임 (공유 문구 계산용으로만 남김)
    assert 'el("details", "cmp-cards")' in js and "단지별 점수 카드" in js and "DJ.card(c, d.stats" in js


def test_url_cleanup_reports_dropped_and_keeps_old_params():
    js = _r("static/compare.js")
    assert "rawPicked.indexOf(s) === i" in js and "dropped += before - picked.length" in js
    assert 'params.get("a")' in js and 'params.get("b")' in js and 'params.get("s")' in js    # ?s= ?a= ?b= 호환
    assert "slice(0, MAX)" in js
