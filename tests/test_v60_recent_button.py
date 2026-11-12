"""v6.0 폰에서 '최근 본' 단추: 둥근 44px 아이콘, 가만히 있으면 흐려짐. 기능·저장은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def _t(p): return (R / p).read_text(encoding="utf8")

def test_recent_button_compact_and_fades_when_idle():
    c = _t("static/style.css"); seg = c[c.index("/* v6.0 폰에서"):]
    assert "width: 44px" in seg and "height: 44px" in seg and ".rcd.idle:not(.open)" in seg and "opacity: .55" in seg
    assert "prefers-reduced-motion" in seg

def test_idle_timer_in_scroll_handler_and_clear_kept():
    a = _t("static/app.js")
    i = a.index("idleT = setTimeout")
    assert 'dock.classList.add("idle")' in a and "pop.hidden" in a[i:i + 120]
    assert 'save("recent", [])' in a
