"""D2: 단지 상세 차트 글자가 폰 폭에 맞춰 줄어도 너무 작아지지 않게. 차트 값·계산·문구는 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
def _tail():
    c = (R / "static/style.css").read_text(encoding="utf8")
    return c[c.index("/* D2 차트 글자"):]
def test_chart_text_sizes_raised_and_never_below_14():
    t = _tail()
    assert ".chart .axis { font-size: 15px; }" in t and ".pc-ylab { font-size: 14px; }" in t
    assert ".chart .lbl, .chart .val { font-size: 14px; }" in t
    assert min(int(x) for x in re.findall(r"font-size: (\d+)px", t)) >= 14   # 맨 끝 블록 규칙(v5.2 시험)과 같은 기준
def test_chart_code_and_numbers_untouched():
    src = (R / "djdex/charts.py").read_text(encoding="utf8")
    assert 'class="axis"' in src and "입지점수 →" in src   # 이번 변경은 CSS 한 블록뿐
