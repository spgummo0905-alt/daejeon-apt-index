"""UX v4.3: Fable 색감 심사 P0·P1. 지도 파랑 제거, 어두운 지도 덮개, 알림 면, 금색 한 가지, 선택 색 한 가지. 등급 색·로고·차트 색 불변."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")
CSS = R("static/style.css")
SEG = CSS[CSS.index("UX v4.3 · 색감 보정"):]


def test_map_cluster_circles_are_green_not_blue():
    for f in ("static/map.js", "static/kmap.js"):
        j = R(f)
        assert "rgba(85,152,231" not in j and "rgba(42,120,214" not in j and "rgba(19,121,91,.94)" in j


def test_dark_map_tiles_are_dimmed_and_toast_is_dark_green_with_mint_border():
    assert ".mp-km img, #kmap img { filter: brightness(.62)" in SEG
    assert "background: #12302a; color: #f0efec; border: 1px solid #6fd1ae" in SEG


def test_gold_is_one_value_on_card_numbers_and_gems_and_not_on_card_back_title():
    assert ".mc-key b, .mc.g-S .mc-key b { color: #d4af52; }" in SEG and ".mcard-memo .mm-title { color: #f0efec; }" in SEG


def test_selection_color_is_one_family_across_tabs_and_toggles():
    assert ".tabbar a.on { color: var(--navy); }" in SEG
    assert '.my-seg button[aria-pressed="true"], .mp-seg button[aria-pressed="true"] { background: var(--navy);' in SEG


def test_grade_colors_logo_and_chart_colors_untouched():
    for t in ("--g-S: #b8912f", "--g-A: #8b95a7", "--g-B: #2f6fb8", "--g-C: #66738a", "--g-D: #b9c0ca", "--s1: #2a78d6", "--s2: #eb6834", "--s3: #1baf7a"):
        assert t in CSS
    assert "brand-sym" in SEG and "static/brand" in R("templates/base.html")


def test_plan_thumbnail_is_navy_inside_card_and_scale_is_blue_white():
    assert ".hc-collect .hc-photo.plan { background: #16305a; }" in SEG  # v4.4 에서 도면 바탕(#0d2145)으로 한 번 더 덮음
    assert "LO = [86, 112, 158], HI = [232, 240, 252]" in R("static/planart.js")
