"""C9b: 글자 200%에서 남은 가로 넘침(상세 위쪽 가격 칸·후기 검색어 줄). 글자는 줄이지 않고 줄바꿈 허용."""
import pathlib, re
CSS = (pathlib.Path(__file__).resolve().parent.parent / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* C9b 글자 200%"):]
_n3 = B.find("\n/* E3 지역 소개", 5)
if _n3 > 0:
    B = B[:_n3]   # 자기 블록만(뒤에 붙은 E3 소개 화면 블록은 검사 대상이 아님)
def test_price_columns_can_shrink_below_text_width():
    assert ".pb-prices { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }" in B
def test_price_text_and_review_query_wrap_anywhere():
    assert ".pb-p strong, .pb-p span, .pb-p small { overflow-wrap: anywhere; }" in B and ".rv-q { overflow-wrap: anywhere; }" in B
def test_no_font_shrink_no_motion_no_external():
    assert "url(" not in B and "animation" not in B and "@import" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px", B)
