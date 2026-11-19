"""I1: 소개 화면·홈 '이번 주말' 카드의 그려 놓은 건물·해·나무 그림 제거(가짜 건물 그림 금지). 글과 버튼·카드는 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
INTRO = (R / "templates/intro.html").read_text(encoding="utf8")
IDX = (R / "templates/index.html").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* I1 건물"):]

def test_drawn_scenery_is_gone_from_both_screens_and_css():
    for k in ("sky-hm", "sky-iv", "wall-hm", "iv-ground", "hm-art", "set scn"):
        assert k not in INTRO and k not in IDX and k not in CSS, k

def test_intro_keeps_card_fan_and_buttons_and_home_keeps_hero_text_and_button():
    assert 'class="iv-fan"' in INTRO and INTRO.count("data-ob-open") >= 1 and "iv-cta" in INTRO
    for k in ("data-hm-hero", "hm-hero-copy", "data-hm-btn", "data-hm-h", "data-hm-small"): assert k in IDX, k

def test_home_hero_text_uses_full_width_on_phone():
    assert "@media (max-width: 720px) { .hm-hero-copy { max-width: none; } }" in B
