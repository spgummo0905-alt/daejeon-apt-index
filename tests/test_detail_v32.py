"""UX v3.2 단지 상세: 가장 중요한 행동(임장 코스에 넣기)이 첫 화면에 보이고, 담긴 뒤 상태와 다음 행동이 분명하며,
카드의 실거래 가격 옆에 거래 면적이 붙어 아래 추정가(전용 84㎡ 환산)와 숫자가 다른 이유가 첫 화면에서 보인다.
저장은 원래 버튼이 하고(새 저장 없음), 계산·가격 값은 바뀌지 않는다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_inline_course_button_sits_between_card_and_action_row_and_reuses_original_button():
    h = _r("templates/apt.html")
    assert h.index("data-apt-cta-inline") < h.index('class="icon-actions apt-actions"')
    assert h.index('class="mc g-') < h.index("data-apt-cta-inline")                    # 카드 바로 아래
    a = _r("static/app.js")
    seg = a[a.index("function aptCta()"):a.index("function courseButton()")]
    assert "base.click()" in seg and "localStorage" not in seg and "DJ.addToCourse" not in seg   # 저장은 원래 버튼이 함
    assert '.observe(inline)' in seg and "e.intersectionRatio >= 0.6" in seg            # 카드 아래 버튼이 보이는 동안 고정 버튼이 비켜 줌


def test_after_adding_shows_check_mark_and_a_next_step_link_without_new_storage():
    a = _r("static/app.js")
    assert 'on ? "✓" : "＋"' in a                                                       # 담긴 뒤 ＋ 대신 ✓
    assert 'label: "코스 보기"' in a and 'my.html#course' in a                           # 알림에 다음 행동
    assert "DJ.addToCourse([slug]) < 0" in a                                           # 8곳 제한 등 기존 동작 그대로
    css = _r("static/style.css")
    assert 'body[data-page="apt"] .toast-zone { top: auto; bottom: calc(76px' in css   # 알림이 가격 숫자를 가리지 않게 아래로


def test_card_price_chip_shows_deal_area_and_keeps_two_price_note_and_values():
    h = _r("templates/apt.html")
    assert 'class="mc-pr-a">{{ ar(c, t0.area) }} 거래' in h                              # 거래 면적(㎡/평 전환 그대로)
    assert "전용 기준, 거래 내역 펼치기" in h                                             # 스크린리더 이름에도 면적
    assert "<b>{{ t0.price | price }}</b>" in h                                          # 가격 값은 그대로
    assert "면적 기준이 달라요." in h and "pb-est" in h and "pb-real" in h               # 실거래와 추정의 구분·설명 유지
    css = _r("static/style.css")
    assert ".mc-badges.tight .mc-price > .mc-pr-a { display: inline; }" in css           # 좁은 화면에서도 면적은 접지 않음
