"""UX v2 PR 02: 카드 언어 통일. 등급 색(S 금·A 백금·B 청·C 슬레이트·D 밝은 중성), 미산정은 D가 아닌 별도 상태,
기울기는 정밀 포인터에서만 ±4도. 값·계산은 건드리지 않고 표기와 스타일만 본다."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _read(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_a_grade_is_platinum_not_gold():
    css = _read("static/style.css")
    # 수집 카드 금 그라디언트는 S 에만
    assert ".hc-collect.g-S { background: linear-gradient(135deg, #f9eac6" in css
    assert ".hc-collect.g-S, .hc-collect.g-A { background: linear-gradient(135deg, #f9eac6" not in css
    # A 칩은 백금(밝은 회청), 금빛 배경이 아님
    m = re.search(r"\.hc-grade\.g-A \{([^}]*)\}", css)
    assert m and "#f4e2b8" not in m.group(1) and "#d5dbe5" in m.group(1)
    # 다크에서도 A 칩이 금색(#4a3d1c)이 아님
    assert "#4a3d1c" not in css
    # 카드 토큰: S 금, A 백금은 cardgen TIER 와 같은 방향
    assert re.search(r"\.mc\.g-A[^{]*\{ --f1: #ffffff; --f2: #c9d0db", css)


def test_unrated_is_a_separate_state_not_d():
    html, js, card = _read("static/style.css"), _read("static/housecard.js"), _read("templates/_card.html")
    assert ".hc-grade.g--" in html and "dashed" in html[html.index(".hc-grade.g--"):html.index(".hc-grade.g--") + 200]
    assert ".hc-collect.g--" in html
    for src in (js, card):
        assert "미산정" in src
    assert '"지수 미산정"' in js
    assert "미산정" in _read("templates/apt.html") and "mc-na" in _read("templates/apt.html")
    cg = _read("static/cardgen.js")
    assert 'name: "미산정"' in cg and "산정 전" in cg          # 공유 이미지도 D(아쉬움)로 읽히지 않음


def test_tilt_is_pointer_only_and_at_most_4_degrees():
    holo, css = _read("static/holo.js"), _read("static/style.css")
    assert re.search(r"const MAX = 4\b", holo)
    assert "hover: hover" in holo and "pointerType" in holo and "prefers-reduced-motion" in holo
    assert "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)" in css


def test_only_s_and_a_collect_cards_get_the_tilt_attribute():
    card, js = _read("templates/_card.html"), _read("static/housecard.js")
    assert '{% if c.grade in ("S", "A") %} data-holo{% endif %}' in card
    assert 'c.g === "S" || c.g === "A"' in js and 'setAttribute("data-holo"' in js
