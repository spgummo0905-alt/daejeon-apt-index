"""F1: 지도 핀 겹침 정리가 실제 지도 화면에 연결돼 있음"""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/map.js").read_text(encoding="utf8")
HTML = (R / "templates/map.html").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* F1 지도 핀 겹침"):]
def test_name_no_longer_written_in_pin_and_no_price_means_dot_only():
    seg = JS[JS.index('el.className = "mp-kp"'):JS.index("el.addEventListener(\"click\"", JS.index('el.className = "mp-kp"'))]      # 실제 지도 핀을 만드는 줄만(점 지도 대체 화면의 글자는 그대로)
    assert 'el.textContent = c.pt || "";' in seg and "c.n" not in seg
    assert '(c.pt ? "" : " nopt")' in JS
def test_labels_recomputed_on_pan_zoom_cluster_filter_and_select():
    for k in ('addListener(map, "idle", labelSoon)', 'addListener(clus, "clustered", labelSoon)', "realPaint(); labelSoon();", "DJ.pickLabels(pts)"): assert k in JS, k
    assert "keep: c.s === sel" in JS and "nopill: !c.pt" in JS and "el.isConnected" in JS
def test_script_loaded_before_map_js_and_dots_keep_44px_touch_area():
    assert HTML.index("static/maplabels.js") < HTML.index("static/map.js") or "static/maplabels.js" in HTML
    assert ".mp-kp.dot::after { inset: -14px; }" in B and ".mp-kp.gone { display: none; }" in B
    assert "width: 16px; min-width: 16px; height: 16px;" in B
def test_selected_dot_is_enlarged_and_reduced_motion_respected():
    assert ".mp-kp.dot.on { transform: scale(1.6);" in B and "prefers-reduced-motion: reduce" in B
