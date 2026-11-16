"""E7: 홈 헤더(폰 ≤380)도 한 줄. 글자 크기·터치칸 44px은 그대로, 여백과 간격만 줄임."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E7 홈 헤더"):]
def test_narrow_phone_header_stays_one_row_without_shrinking_taps_or_text():
    assert "@media (max-width: 380px) {" in B
    assert 'body[data-page="index"] header.site { flex-wrap: nowrap; padding-inline: 8px; gap: 4px; }' in B
    assert 'body[data-page="index"] .hd-end { flex: none; gap: 4px; }' in B
    assert 'body[data-page="index"] .rg-btn { padding: 0 8px; max-width: 92px; }' in B
    assert not re.search(r"(?:height|min-width|width):\s*(?:[0-3]?\d|4[0-3])px", B)       # 44px 아래로 줄이지 않음
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-7])px", B)                             # 글자는 18px 아래로 줄이지 않음(로고 글자)
def test_scoped_to_home_page_only():
    assert B.count('body[data-page="index"]') >= 5 and "header.site {" not in B.replace('body[data-page="index"] header.site {', "")
