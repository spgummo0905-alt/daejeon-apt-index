"""E6: 움직임 시간 정리(120/220/300) + 홈의 끝없는 반짝임 멈춤. 큰 화면 포함 전체에 적용되는 시간 값."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E6 움직임 정리"):CSS.index("/* E6b 홈(폰)")]      # 반짝임 블록만
B2 = CSS[CSS.index("/* E6b 홈(폰)"):]
def test_time_variables_are_120_220_300_and_old_values_are_gone_from_transitions():
    assert "--t-fast: 120ms; --t-med: 220ms; --t-slow: 300ms;" in CSS
    for old in ("160ms", "260ms", "520ms"):
        assert not re.search(r"(?:transition|animation)[^;{}]*[^0-9]" + old, CSS), old
    assert "transform 300ms var(--ease-out)" in CSS           # 아래에서 올라오는 창은 300ms
def test_home_sparkle_loops_are_stopped_only_on_home_page_and_scoped_to_own_block():
    for k in (".grade.big.g-S::after", ".gcard.g-S::after", ".mc.g-S .mc-in::before", ".mcard.g-A::before"):
        assert 'body[data-page="index"] ' + k in B, k
    assert B.rstrip().endswith("animation: none; }") and "infinite" not in B
def test_reduced_motion_rules_still_exist():
    assert CSS.count("prefers-reduced-motion") >= 5
def test_old_home_boxes_hidden_on_phone_only_not_deleted():
    assert "@media (max-width: 720px) { .hero-main .browse, .hero-main .hero-deck { display: none; } }" in B2
    h = (R / "templates/index.html").read_text(encoding="utf8")
    assert 'class="browse"' in h and 'class="hero-deck"' in h and "data-hc-deck" in h      # 마크업은 그대로(큰 화면·검색엔진용)
