"""UX v5.0: Impeccable 비평 반영. 알림은 휴대폰에서 하단 메뉴 위로, 떠 있는 버튼은 큰 버튼 위로, 카드 가격엔 '추정' 표시."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_toast_goes_above_bottom_nav_on_phones_and_above_fixed_cta():
    c = R("static/style.css")
    seg = c[c.index("UX v5.0 · Impeccable 비평 반영"):]
    seg = seg[: seg.index("UX v3.3")] if "UX v3.3" in seg else seg
    assert ".toast-zone { top: auto; bottom: calc(76px + env(safe-area-inset-bottom));" in seg
    assert "body.cmp-ready .toast-zone" in seg and "body.cmp-ready .rcd" in seg and "148px" in seg


def test_card_price_always_carries_estimate_label():
    assert "{{ ref_area }}㎡ 추정" in R("templates/_card.html")
    j = R("static/housecard.js")
    seg = j[j.index("function collect(c, opt)"):j.index("DJ.hc = {")]
    assert '"84㎡ 추정"' in seg and "hc-fp" in seg
    assert ".hc-fp small { font-size: 12px;" in R("static/style.css")
