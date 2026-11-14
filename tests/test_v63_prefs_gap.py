"""나의 집감: '내 설정' 박스가 위 박스에 붙지 않게(다른 박스와 같은 위쪽 간격 16px)."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def test_prefs_has_top_gap_like_other_panels():
    c = (R / "static/style.css").read_text(encoding="utf8")
    assert ".prefs { padding: 0; margin: 0 0 16px; }" in c            # 옛 규칙은 그대로(아래 간격)
    i = c.index(".panel { background: var(--surface)")
    assert "margin-top: 16px" in c[i:i + 200]                           # 다른 박스(.panel)의 위쪽 간격과 같은 값
    assert c[c.index("/* D3 나의 집감: '내 설정'"):].count(".prefs { margin-top: 16px; }") == 1
