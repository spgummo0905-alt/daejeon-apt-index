"""v5.8 빈 화면: 아이콘+한 줄+버튼 하나, 비교 빈 칸 ＋ 표시, 홈 소개글 짧게. 저장·계산 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def _t(p): return (R / p).read_text(encoding="utf8")

def test_my_empty_state_one_icon_one_line_one_button():
    j = _t("static/my.js")
    assert "empty-ic" in j and "눈여겨본 단지를 담아 보세요" in j and '"아파트 찾아보기"' in j
    assert "먼저, 눈여겨본 단지 두 곳을" not in j

def test_compare_empty_slots_plus_and_labels():
    c = _t("static/compare.js")
    assert '"＋"' in c and "비어 있는 칸(필수)" in c and "비어 있음" not in c
    assert "2 - cs.length" in c   # 진행 계산은 그대로

def test_home_lead_is_short_and_no_pressure():
    h = _t("templates/intro.html")
    assert "집 볼 때 필요한 감을 한곳에서" in h
    for bad in ("곧 마감", "놓치지 마", "지금 바로", "무조건"):
        assert bad not in h[h.index("it-lead"):h.index("it-lead") + 200]

def test_empty_css_touch_size():
    c = _t("static/style.css"); seg = c[c.index("/* v5.8 빈 화면"):]
    assert "min-height: 48px" in seg
