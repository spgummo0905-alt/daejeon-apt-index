"""UX v5.3: 표시 일관성. 비교의 가격 차이는 화면에 보이는 값끼리, 찾기의 같은 말 반복 제거."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_compare_price_gap_uses_displayed_rounded_values():
    j = R("static/compare.js")
    assert "Math.round(c.p / 1000) * 1000" in j   # 0.1억 단위로 반올림한 값끼리 뺌(카드에 보이는 자릿수와 일치)
    assert "화면에 보이는 값" in j


def test_finder_idle_has_one_button_not_three_sentences():
    j = R("static/finder.js")
    assert j.count("조건을 고르면 맞는 단지") == 0
    assert "하나만 골라도 맞는 단지가 보여요" in j
    assert ".sv-peek.idle:empty" in R("static/style.css")
