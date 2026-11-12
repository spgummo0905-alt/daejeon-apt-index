"""UX v4.5: 상세 큰 카드 그림 = 단지 입지 지도. 값은 설정·구 경계 자료 그대로, 좌표 없는 곳은 그리지 않음."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_build_writes_locmap_from_boundary_and_config_only():
    s = R("djdex/site.py")
    seg = s[s.index("def _write_locmap"):s.index("def _preview_setup")]
    assert "boundary.json" in seg and "cfg.districts" in seg and '"lat" in w' in seg and '"lat" in h' in seg
    assert not re.search(r"random|hash\(", seg)
    assert "_write_locmap(cfg, out_dir)" in s


def test_locmap_js_draws_only_real_coordinates_and_honest_labels():
    j = R("static/locmap.js")
    for t in ("DJ.locSvg", "DJ.getLocMap", "locmap.json", "직선거리", "구 경계는 대략적인 위치", "역·학교·마트·병원은 좌표가 없어"):
        assert t in j
    assert "Math.random" not in j
    assert "자리가 없으면 이름표는 그리지 않음" in j
    # v5.2: 이름 없는 점·마름모·점선은 그리지 않는다(모든 표시 옆에는 이름)
    assert "stroke-dasharray" not in j and "pts.forEach" not in j


def test_detail_card_falls_back_to_old_art_and_shows_distance_line():
    g = R("static/cardgen.js")
    assert "DJ.locSvg" in g and "fallback" in g and "mc-locline" in g and "(직선거리)" in g
    h = R("templates/apt.html")
    assert 'data-la="{{ latlng[0] }}"' in h and "static/locmap.js" in h
    assert h.index("static/locmap.js") < h.index("static/cardgen.js")


def test_loc_css_keeps_12px_and_badge_room():
    c = R("static/style.css")
    seg = c[c.index("UX v4.5 · 상세 큰 카드 그림"):]
    assert ".mc-loctag" in seg and "font-size: 12px" in seg and "font-size: 14px" in seg
    assert ".mc-art.loc, .pb .mc-art.loc { aspect-ratio: 650 / 400; }" in c[c.index("UX v5.2"):]   # 지도 칸은 배지가 빠져 더 낮아짐
