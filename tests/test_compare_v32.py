"""UX v3.2 비교: '먼저 볼 차이'는 가격 → 종합 지수 → 입지 점수 순서로 앞에 두고(사용자가 가장 먼저 보는 세 가지),
각 줄은 '얼마나 차이 나는지'를 먼저, 값은 뒤에 적는다. 우열·추천 문구는 없다. 작은 폰에서는 큰 제목·위쪽 칩 메뉴를 접는다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def _seg():
    js = _r("static/compare.js")
    return js[js.index("function diffsOf(cs)"):js.index("function render(d)")]


def test_diff_order_is_price_then_overall_index_then_location_and_includes_overall_index():
    seg = _seg()
    keys = ["\"가격\"", "\"종합 지수\"", "\"입지 점수\"", "\"지하철역 거리\"", "\"학군 점수\""]
    pos = [seg.index(k) for k in keys]
    assert pos == sorted(pos)                      # 가격 → 종합 지수 → 입지 점수 → (부족하면) 역 거리 → 학군
    assert "cand.slice(0, 3)" in seg                # 최대 3개
    assert "c.i," in seg or "c => c.i" in seg       # 종합 지수는 기존 자료값 그대로


def test_diff_line_leads_with_how_big_the_gap_is_and_keeps_estimate_label_and_no_verdict():
    seg = _seg()
    assert '" 차이"' in seg and "x.k + \" \" + x.head" in seg          # '가격 약 1.7억 차이' 형태
    assert "84㎡ 추정" in seg                                            # 가격은 추정임을 적음
    for bad in ("추천", "우수", "더 좋", "더 낫", "유리"):
        assert bad not in seg
    assert "어느 집이 낫다는 판단은 하지 않아요" in seg


def test_small_phone_collapses_hero_and_chip_menu_so_diff_comes_before_cards():
    css = _r("static/style.css")
    seg = css[css.index("UX v3.2 · 비교"):]
    assert "@media (max-width: 719px) and (max-height: 760px)" in seg
    assert "body.cmp-ready .page-hero, body.cmp-ready .seg-nav { display: none; }" in seg
    assert "body.cmp-ready .vs-result > .cmp-diff { order: -2; }" in seg
    assert "body.cmp-ready .vs-result > .cmp-deck { order: -1; }" in seg
    assert "#pick" not in seg                                            # 단지 추가 입력은 건드리지 않음(기존 규칙 그대로)
