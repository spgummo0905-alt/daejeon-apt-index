"""UX v3 비교: 2곳 비교에서 '먼저 볼 차이' 3개가 첫 화면에 모두 들어오도록, 비교 카드의 똑같은 건물 그림을 빼고 글자(이름·등급·지역·가격·지수)만 둔다.
우열·추천 표현은 여전히 없고, 값은 기존 자료 그대로다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_compare_column_card_has_no_repeated_building_art_but_keeps_text_values():
    j = _r("static/housecard.js")
    seg = j[j.index("function col(c)"):j.index("DJ.hc = {")]
    assert "art(c.rk)" not in seg and 'el("strong", "", c.n), grade(c.g)' in seg
    assert "price(c)" in seg and "지수 " in seg and "DJ.place(c)" in seg


def test_dead_compare_art_css_removed_and_diff_block_keeps_no_verdict_wording():
    css, js = _r("static/style.css"), _r("static/compare.js")
    assert ".hc-col .hc-art" not in css
    seg = js[js.index("function diffsOf(cs)"):js.index("function render(d)")]
    assert "어느 집이 낫다는 판단은 하지 않아요" in seg and "cand.slice(0, 3)" in seg
    assert "추천" not in seg and "우수" not in seg and "더 좋" not in seg
