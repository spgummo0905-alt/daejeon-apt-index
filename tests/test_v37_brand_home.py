"""UX v3.7: 공용 색 전체 통일(딥그린+크림) + 지역 첫 화면 구조. 등급 카드 색·로고 심볼·차트 색은 그대로."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = (ROOT / "static/style.css").read_text(encoding="utf-8")


def test_global_tokens_use_brand_green_and_cream():
    head = CSS[: CSS.index("* { box-sizing")]
    assert "--accent: #13795b" in head and "--bg: #f7f4ec" in head and "--chip: #efe9db" in head
    assert "--accent: #6fd1ae" in head and "--bg: #0b1f1a" in head           # 어두운 화면
    assert "#1f66c1" not in head.split("@media (prefers-color-scheme: dark)")[0].split("--accent:")[1][:12]


def test_grade_colors_logo_and_chart_colors_untouched():
    for t in ("--g-S: #b8912f", "--g-A: #8b95a7", "--g-B: #2f6fb8", "--g-C: #66738a", "--g-D: #b9c0ca",
              "--brand-sky: #3cbaf6", "--s1: #2a78d6", "--s2: #eb6834", "--s3: #1baf7a"):
        assert t in CSS


def test_first_screen_structure_hides_copy_and_puts_card_before_buttons_on_phone():
    seg = CSS[CSS.index("UX v3.7 · 공용 색 전체 통일"):]
    seg = seg[: seg.index("/* 휴대폰: 구·면적 칩을")]
    assert ".it-start .it-copy { display: contents; }" in seg
    assert ".it-start .it-lead, .it-start .it-nums { display: none; }" in seg.replace(".it-start .it-eyebrow, ", "")
    assert ".it-start .it-fan { order: 4;" in seg and ".it-start .it-cta { order: 5;" in seg
    assert "width: 100vw" in seg and "#f7f4ec" in seg                           # 카드 뒤 크림 판
    assert 'body[data-page="intro"] .it-start .it-btn.primary { background: #13795b; color: #fff;' in seg


def test_more_button_is_action_green_and_controls_have_visible_border():
    assert ".mc-more-btn { background: #13795b; border-color: #13795b; color: #fff; min-height: 56px; }" in CSS
    assert "--ctl-line: #5e9483" in CSS and "--ctl-line: #4f8f7a" in CSS


def test_theme_color_follows_brand_and_no_violet_left_in_brand_dot():
    base = (ROOT / "templates/base.html").read_text(encoding="utf-8")
    assert 'content="#f7f4ec" media="(prefers-color-scheme: light)"' in base and 'content="#0b1f1a" media="(prefers-color-scheme: dark)"' in base
    # 로고 옆 점·브랜드 변수에서 보라 제거 (옥상 화면 .roof-* 의 밤 색은 이번 대상이 아니라 그대로)
    assert "--brand-violet: #7b5cf8" not in CSS and 'body[data-page="intro"] .brand-dot { background: #a28cff; }' not in CSS
    assert 'body[data-page="intro"] .brand-dot { background: #6fd1ae; }' in CSS


def test_existing_copy_and_buttons_kept_in_markup():
    h = (ROOT / "templates/intro.html").read_text(encoding="utf-8")
    assert "좋은 집의 가치" in h and 'href="finder.html">조건으로 찾기' in h and "지도로 보기" in h and "점수를 매긴 단지" in h
