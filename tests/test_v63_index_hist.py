"""지수 분포 차트: 폰용 그림 기준 폭 280(전 360)으로 눈금 글자를 키우고, 오른쪽 여백으로 '100' 눈금이 안 잘리게. 값·계산 그대로."""
import pathlib, re
from djdex import charts
R = pathlib.Path(__file__).resolve().parent.parent
VALS = [10 + (i * 7) % 80 for i in range(200)]
def test_mobile_histogram_is_280_wide():
    s = (R / "djdex/site.py").read_text(encoding="utf8")
    assert re.search(r'"hist": charts\.responsive\(charts\.histogram, index_values, highlight=c\.get\("index"\), height=180,\s+mob=\{"width": 280\}\)', s)
def test_right_margin_keeps_last_tick_inside():
    svg = charts.histogram(VALS, highlight=41.0, width=280, height=180)
    last = [float(x) for x in re.findall(r'<text x="([\d.]+)"[^>]*class="axis">100<', svg)]
    assert last and last[0] + 12 <= 280                       # '100' 글자(약 3자 x 6px 절반 이상)가 폭 안
def test_bins_and_highlight_unchanged():
    svg = charts.histogram(VALS, highlight=41.0, width=720, height=180)
    assert svg.count('class="mark"') == 20 and svg.count(" dim") == 19
