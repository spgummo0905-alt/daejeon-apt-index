"""땅 높이 차트(역→단지 단면): 폰 폭에서 글자가 너무 작아지지 않게(그림 기준 폭 360), 3자리 눈금도 안 잘리게. 높이 값·계산·문구는 그대로."""
import math, re
from djdex.site import hill_svg

def _svg(pf, dist=800, name="정부청사역"):
    return str(hill_svg(pf, float(dist), name))

def _prof(base, amp, n=24):
    return [base + amp * math.sin(k / n * 3.1) for k in range(n)]

def test_viewbox_is_phone_sized_not_560_wide():
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', _svg(_prof(60, 18)))
    assert m and int(m.group(1)) == 360                       # 560 이면 폰에서 0.4배로 줄어 글자가 7~9px 가 됨

def test_left_margin_grows_for_three_digit_labels_so_labels_are_not_cut():
    def first_axis_x_and_left(svg):
        xs = [float(x) for x in re.findall(r'class="hl-ax" x="([\d.]+)"', svg)]
        line = re.search(r'class="hl-grid" x1="(\d+)"', svg)
        return xs, int(line.group(1))
    two, l2 = first_axis_x_and_left(_svg(_prof(40, 10)))      # 두 자리(예: 40m)
    three, l3 = first_axis_x_and_left(_svg(_prof(180, 40)))   # 세 자리(예: 180m)
    assert l3 > l2                                            # 눈금 글자가 길면 왼쪽 여백이 더 넓다
    assert min(three) >= 40 and all(x == l3 - 6 for x in three)   # 눈금 글자의 오른쪽 끝은 여백 안쪽에 고정

def test_values_and_labels_unchanged():
    s = _svg(_prof(60, 18), dist=620)
    assert "정부청사역" in s and "이 단지" in s
    assert s.count('class="hl-hit"') == 24 and 'class="hl-line"' in s and 'class="hl-area"' in s
    assert "직선 620m" in s and "해발 약" in s

def test_grid_step_rule_kept():
    s = _svg(_prof(100, 200))                                 # 높이 차이가 큰 곳은 50m 간격
    labs = [int(x) for x in re.findall(r'class="hl-ax"[^>]*>(\d+)m<', s)]
    assert labs and all(b - a == 50 for a, b in zip(labs, labs[1:]))
