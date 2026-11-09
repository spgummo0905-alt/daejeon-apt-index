"""UX v2 PR 04: 찾기 — 조건 칩 다시 고치기, 비교 담기(관심과 구분), 비교함 막대, 취소 알림, 목록 불러오기 실패 안내.
기존 계산(pass/fit/works/maxPrice)·저장 키·설문 형식은 건드리지 않았는지도 함께 본다."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_filter_logic_and_storage_are_untouched():
    js = _r("static/finder.js")
    for sig in ("function maxPrice(equity, loanDsr, ltv)", "function works(s)", "function fit(c, s)", "function pass(c, s)"):
        assert sig in js, sig
    assert 'DJ.load("survey", {})' in js and 'DJ.save("survey", S)' in js     # 설문 저장 키 그대로
    assert "survey" in js and "djdex:cmp" not in js                            # 비교함은 새 저장 키를 만들지 않음
    for step_id in ("status", "gu", "work", "budget", "py", "age", "near", "must"):
        assert f'{{ id: "{step_id}", pick:' in js, step_id


def test_condition_chips_are_buttons_that_return_to_the_question():
    js, css = _r("static/finder.js"), _r("static/style.css")
    assert "function tagItems()" in js and 'step: ' in js or "add(" in js
    assert '"chip sm sv-tag"' in js and "조건 고치기" in js and "S.step = Math.max(0, STEPS.findIndex(x => x.id === step))" in js
    assert ".sv-tags .sv-tag { min-height: 44px" in css


def test_compare_basket_limits_to_four_and_warns_before_adding():
    js = _r("static/finder.js")
    assert "const CMP_MAX = 4" in js
    i = js.index("function toggleCmp(c)")
    body = js[i:i + 900]
    assert "basket.length >= CMP_MAX" in body and "DJ.toast(" in body and "return;" in body     # 5번째는 담기 전에 알림 후 중단
    assert "DJ.toastUndo" in body                                                              # 담기·빼기 모두 취소 가능
    assert '"compare.html?s="' in js                                                           # 기존 비교 화면 주소 그대로


def test_favorite_and_compare_are_separate_actions_with_undo():
    hc = _r("static/housecard.js")
    assert 'el("button", "hc-cmp")' in hc and "o.cmp" in hc and "DJ.toggleFav(c.s)" in hc
    assert "DJ.toastUndo(c.n + \" 관심 단지에 담았어요\"" in hc
    assert "now && !was" in hc          # 로그인 안내 등으로 안 담겼으면 '담았어요'를 말하지 않음


def test_zero_results_shows_before_after_counts_without_auto_relax():
    js = _r("static/finder.js")
    assert "빼면 0곳 → " in js
    i = js.index("function relax()")
    assert ".clear()" in js[i:i + 1600] and "addEventListener(\"click\"" in js[i:i + 1600]     # 눌렀을 때만 조건을 뺌


def test_data_load_failure_has_message_and_retry_and_keeps_conditions():
    js = _r("static/finder.js")
    assert "단지 목록을 불러오지 못했어요" in js and "다시 시도" in js and "골라 둔 조건은 그대로" in js


def test_compare_bar_does_not_cover_tabbar_or_keyboard():
    css = _r("static/style.css")
    i = css.index(".fd-cmpbar {")
    assert "var(--tabbar-height" in css[i:i + 300]
    assert ".kb-open .fd-cmpbar { display: none; }" in css
