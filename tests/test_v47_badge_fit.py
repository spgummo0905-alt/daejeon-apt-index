"""UX v4.7: 상세 큰 카드 배지(가격+메달)가 좁은 화면에서 잘리지 않게 두 줄로, 지도 칸은 그만큼 키움."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_badges_wrap_instead_of_clipping_and_map_grows():
    g = R("static/cardgen.js")
    assert 'row.classList.remove("tight", "tighter", "wrap")' in g and 'row.classList.add("wrap")' in g
    assert 'card.querySelector(".mc-badges.wrap")' in g and "H = tall ? 600 : 480" in g and "bot: tall ? 310 : 190" in g
    c = R("static/style.css")
    assert ".mc-badges.wrap { flex-wrap: wrap-reverse;" in c and "650 / 600" in c
    assert ".mc-locline { color: var(--sub); }" in c
