from djdex import charts


def test_grade_bands():
    assert charts.grade(80) == ("S", "최상위")
    assert charts.grade(64.9)[0] == "B"
    assert charts.grade(0)[0] == "D"
    assert charts.grade(float("nan"))[0] == "-"


def test_tooltip_text_is_escaped():
    pts = [{"lat": 36.3 + i / 100, "lng": 127.3 + i / 100, "index": 50, "gu": "서구", "dong": "둔산동",
            "name": '<script>alert(1)</script>"', "href": f"apt/{i}.html"} for i in range(5)]
    svg = charts.dot_map(pts)
    assert "<script>" not in svg and "&lt;script&gt;" in svg


def test_charts_render_and_handle_empty_input():
    assert "chart-empty" in charts.dot_map([])
    assert "chart-empty" in charts.line_compare([(2020, 1.0)], [], "a", "b")
    svg = charts.line_compare([(2016, 40000), (2020, 50000)], [(2016, 30000), (2020, 35000)], "이 단지", "대전 중위")
    assert svg.count('class="col"') == 2 and "이 단지 5.0억" in svg
    hist = charts.histogram([10, 55, 57, 90], highlight=56)
    # 5점 간격 20칸, 막대 색은 등급 (55점 칸은 B), 이 단지 칸 말고는 흐리게
    assert "이 단지" in hist and hist.count(" dim") == 19 and 'class="bar g-B"' in hist and "bar g-S dim" in hist


def test_responsive_renders_both_sizes():
    out = charts.responsive(charts.histogram, [10, 20, 30], mob={"width": 360})
    assert 'viewBox="0 0 720' in out and 'viewBox="0 0 360' in out
