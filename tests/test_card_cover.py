"""UX v2 카드 표지: 모든 단지에 똑같던 밤 건물 그림 대신, 등급 색 글자 표지(동 이름 크게 + 그 단지만의 숫자)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_collect_card_has_text_cover_instead_of_night_art_in_server_and_phone_templates():
    t, j = _r("templates/_card.html"), _r("static/housecard.js")
    seg = t[t.index("macro collect"):]
    assert 'class="hc-plate"' in seg and 'class="hc-dong"' in seg and "art(c.rank or k, true)" not in seg
    assert "JIPGAM" not in seg and "TIER" not in seg and "JIPGAM" not in j and "TIER" not in j     # 작은 영어 라벨 제거
    assert 'const plate = el("span", "hc-plate")' in j and "nightArt" not in j and "drawArt" not in j


def test_cover_numbers_come_from_existing_values_only():
    t, j = _r("templates/_card.html"), _r("static/housecard.js")
    assert "c.build_year" in t and "c.hh" in t and "c.subway_raw" in t
    assert "c.y ?" in j and "c.hh ?" in j and "c.f.subway" in j and "c.i == null" in j          # 지수·가격은 기존 값 그대로


def test_grade_colors_follow_existing_tokens_and_unrated_is_dashed():
    css = _r("static/style.css")
    tail = css[css.index("UX v2 · 카드 표지"):]
    assert ".hc-collect.g-S { --plate: #e3c576" in tail and ".hc-collect.g-A { --plate: #ccd3dc" in tail     # 금은 S, A는 백금
    assert ".hc-collect.g-B { --plate: #244c94" in tail and ".hc-collect.g-C { --plate: #4e5e6e" in tail
    assert ".hc-collect.g-- .hc-plate { border: 1.5px dashed var(--sub); }" in tail
    assert ".hc-art.hc-night" not in css                                                                    # 쓰지 않는 밤 그림 CSS 정리
