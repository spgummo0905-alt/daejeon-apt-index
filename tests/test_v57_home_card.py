"""v5.7 홈 '카드 한 장에' 번호 설명을 짧게(뜻은 그대로: 등급 기준·상대 점수·비교용 가격 안내 유지)."""
import pathlib, re
H = (pathlib.Path(__file__).resolve().parent.parent / "templates/intro.html").read_text(encoding="utf8")
SEG = H[H.index('class="it-ana-list"'):H.index("</ol>", H.index('class="it-ana-list"'))]


def test_four_short_notes_keep_meaning():
    d = re.findall(r"</i>[^<]*</b><span>([^<]*)", SEG)
    assert len(d) == 4 and all(len(x) <= 52 for x in d), d
    assert "80점" in d[0] and "65점" in d[0]
    assert "상대 점수" in d[1]
    assert "비교용 가격" in d[3] and "평형" in d[3]   # 실제 가격과 다르다는 안내는 남김
