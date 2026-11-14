"""320px 폰: 시세 표(.qt)와 자주 묻는 질문(.faq-it)이 화면 밖으로 넘치지 않게. 값·문구·열 구성은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def _tail():
    c = (R / "static/style.css").read_text(encoding="utf8")
    return c[c.index("/* D3 좁은 폰(320px)"):]
def test_quote_table_can_wrap_on_narrow_phones_only():
    t = _tail()
    assert "@media (max-width: 380px)" in t and ".qt th, .qt td { white-space: normal;" in t
    base = (R / "static/style.css").read_text(encoding="utf8")
    assert "th, td { padding: 9px 12px; text-align: right; white-space: nowrap;" in base     # 넓은 화면은 원래대로 한 줄
def test_faq_long_names_wrap_anywhere():
    t = _tail()
    assert ".faq-it summary, .faq-it p { overflow-wrap: anywhere; min-width: 0; }" in t
def test_table_markup_unchanged():
    h = (R / "templates/apt.html").read_text(encoding="utf8")
    assert "전세가율" in h and "건 중 가운데" in h and "has_rent" in h and '<table class="qt">' in h
