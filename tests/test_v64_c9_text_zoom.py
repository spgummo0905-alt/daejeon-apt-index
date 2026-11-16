"""C9: 글자 크기를 키워도(125%·200%) 가로로 넘치지 않게. 줄바꿈을 막던 규칙 풀기, 긴 이름 윗줄 재배치. 값·문구 변경 0."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
BLK = CSS[CSS.index("/* C9 글자 크기 키움 대응"):]
_n3 = BLK.find("\n/* E3 지역 소개", 5)
if _n3 > 0:
    BLK = BLK[:_n3]   # 자기 블록만(뒤에 붙은 E3 소개 화면 블록은 검사 대상이 아님)
def test_price_cells_cannot_widen_the_grid():
    assert ".mc-prices { grid-template-columns: repeat(2, minmax(0, 1fr)); }" in BLK
    assert ".mc-prices > *, .mc-under .mc-price, .mc-est { min-width: 0; }" in BLK
def test_long_name_header_moves_score_below_name_on_narrow_phones():
    i = BLK.index("@media (max-width: 400px)")
    s = BLK[i:BLK.index("}\n}", i)]
    assert ".mc-top { grid-template-columns: auto minmax(0, 1fr);" in s
    assert "grid-column: 1 / -1;" in s                                  # 점수 칸이 이름 옆이 아니라 아래 한 줄
def test_nowrap_rules_that_pushed_cells_out_are_released():
    for rule in (".pt-v { overflow-wrap: anywhere; min-width: 0; white-space: normal;", ".pt-k { white-space: normal;",
                 ".ls em, .loc-pct { white-space: normal; }", ".mc-price .ar-m", ".qt th, .qt td { white-space: normal;"):
        assert rule in BLK, rule
def test_chip_row_and_bottom_tabs_can_shrink():
    assert ".chips { flex-wrap: wrap; min-width: 0; }" in BLK
    assert ".tabbar { grid-template-columns: repeat(5, minmax(0, 1fr)); }" in BLK
def test_no_text_size_lowered_no_motion_no_external_files():
    import re
    assert "url(" not in BLK and "animation" not in BLK and "@import" not in BLK
    assert not re.search(r"font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px", BLK)     # 글자를 줄여서 해결하지 않음
