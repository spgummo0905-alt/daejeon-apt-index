"""D3: 내 카드 모아보기 타일의 단지 이름은 두 줄까지만. 전체 이름은 잃지 않음(title·aria-label)."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8"); JS = (R / "static/cards.js").read_text(encoding="utf8")
B = CSS[CSS.index("/* D3 내 카드 모아보기 타일"):]
def test_name_is_clamped_to_two_lines_with_overflow_hidden():
    rule = B[B.index(".best-tile b {"):B.index("}", B.index(".best-tile b {"))]
    assert "-webkit-line-clamp: 2;" in rule and "line-clamp: 2;" in rule and "overflow: hidden;" in rule and "display: -webkit-box;" in rule
    assert "word-break: keep-all;" in rule and "overflow-wrap: break-word;" in rule   # 단어 중간에서 끊지 않되 너무 길면 끊음
def test_full_name_is_still_available_to_everyone():
    assert 'el("b", "", c.n)' in JS      # 보이는 이름은 원래 이름 그대로(줄임은 CSS만)
    assert "a.title = c.n;" in JS and "`${c.g}등급 ${c.n} 카드 보기`" in JS
def test_text_size_not_reduced_and_no_motion():
    assert not re.search(r"font-size", B) and "animation" not in B and "url(" not in B
