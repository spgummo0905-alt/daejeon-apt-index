"""UX v3.5: 대표 색 B안(딥그린+크림) 1단계 — 토큰과 적용 범위(지역 첫 화면·단지 상세). 등급 카드 색·로고는 그대로."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
CSS = (ROOT / "static/style.css").read_text(encoding="utf-8")


def _lum(h):
    h = h.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def _cr(a, b):
    x, y = sorted([_lum(a), _lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


def test_brand_tokens_exist_and_scope_is_limited():
    for t in ("--jg-green-800: #0f3d33", "--jg-green-600: #13795b", "--jg-cream: #f7f4ec"):
        assert t in CSS
    block = CSS[CSS.index("UX v3.5 · 집감 대표 색 B안"):]
    block = block[: block.index("/* 휴대폰: 구·면적 칩을")]
    scoped = re.findall(r"^(?:@media[^{]*\{ )?(body\[data-page=\"[a-z]+\"\])", block, re.M)
    assert set(scoped) == {'body[data-page="apt"]', 'body[data-page="intro"]'}


def test_grade_card_colors_and_brand_symbol_untouched():
    for t in ("--g-S: #b8912f", "--g-A: #8b95a7", "--g-B: #2f6fb8", "--g-C: #66738a", "--g-D: #b9c0ca", "--brand-sky: #3cbaf6"):
        assert t in CSS


def test_action_green_contrast_meets_aa():
    assert _cr("#ffffff", "#13795b") >= 4.5      # 밝은 화면: 초록 버튼 위 흰 글자
    assert _cr("#13795b", "#f7f4ec") >= 4.5      # 크림 위 초록 글자
    assert _cr("#062018", "#6fd1ae") >= 4.5      # 민트 버튼 위 짙은 글자
    assert _cr("#6fd1ae", "#0a2b24") >= 4.5      # 딥그린 위 민트 글자


def test_brand_doc_lists_dark_pattern_ban():
    d = (ROOT / "docs/design/BRAND.md").read_text(encoding="utf-8")
    assert "다크패턴 금지" in d and "가짜 급박함" in d and "딥그린" in d
