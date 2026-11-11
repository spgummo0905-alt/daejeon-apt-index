"""UX v4.6: 비교 화면 '현장에서 확인할 것' = 읽기 전용 제안. 저장 구조·체크·방문을 만들지 않음."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_compare_field_suggestions_are_read_only():
    j = R("static/compare.js")
    seg = j[j.index("function fieldOf(cs)"):j.index("function render(d)")]
    assert "DJ.visitItems" in seg and "#field" in seg and "slice(0, 3)" in seg
    for forbidden in ("DJ.save", "saveVisit", "localStorage", "checkbox", "DJ.toggleFav", "addToCourse"):
        assert forbidden not in seg                                   # 저장·체크·방문을 만들지 않음
    assert "직접 체크해야 기록으로 남아요" in seg


def test_compare_field_has_no_ranking_words_and_is_placed_after_diffs():
    j = R("static/compare.js")
    seg = j[j.index("function fieldOf(cs)"):j.index("function render(d)")]
    for w in ("추천", "더 좋", "유리", "앞섭니다"):
        assert w not in seg
    assert "diffsOf(cs), fieldOf(cs), verdict" in j


def test_compare_field_css_touch_and_text_sizes():
    c = R("static/style.css")
    seg = c[c.index("UX v4.6 · 비교 → 현장 확인"):]
    assert "min-height: 48px" in seg and "font-size: 15px" in seg and "font-size: 13px" in seg
