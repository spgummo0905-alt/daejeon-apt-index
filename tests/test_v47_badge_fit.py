"""UX v4.7: 상세 큰 카드 배지(가격+메달)가 좁은 화면에서 잘리지 않게 두 줄로, 지도 칸은 그만큼 키움."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_badges_no_longer_sit_on_the_map_so_no_wrapping_logic_needed():
    """v4.7은 지도 위 배지가 잘리지 않게 두 줄로 올렸다. v5.2에서 배지·가격을 지도 밖으로 옮겨 그 문제 자체가 사라졌다(이 시험은 그 상태를 고정)."""
    g = R("static/cardgen.js")
    assert "H: 400" in g and "bot:" not in g.split("DJ.locSvg(")[1].split(")")[0]
    h = R("templates/apt.html")
    art = h[h.index('class="mc-art"'):h.index('class="mc-under"')]
    assert "mc-price" not in art and "mc-rank" not in art and "mc-medal" not in art
    c = R("static/style.css")
    assert ".mc-locline { color: var(--sub); }" in c
