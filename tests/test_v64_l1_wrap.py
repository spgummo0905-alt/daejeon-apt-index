"""L1: 한글 줄바꿈. 문장은 줄 끝에 한두 글자만 남지 않게, 짧은 이름표는 줄 길이를 고르게. 문구·글자 크기는 그대로, 지원 안 하는 폰은 지금과 같음."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def r(p): return (R / p).read_text(encoding="utf8")
CSS = r("static/style.css"); B = CSS[CSS.index("/* L1 한글"):]

def test_sentences_use_pretty_wrap_and_short_labels_use_balance():
    assert "p, li, dd, small, .muted, .lead, .pc-meta, .pb-s, .ki-note, .fl-tip, .fl-note, .it-sub, .acct-fine { text-wrap: pretty; }" in B
    assert ".cat-v, .cat-row b, .seg-btn, .ac-meta, .it-grades span, .badge-name, .ls em, .pt-s, .nb, .tc-why, .pc-now > span { text-wrap: balance; }" in B
    assert "font-size" not in B and "animation" not in B and "transition" not in B

def test_percent_and_dot_are_glued_so_a_lone_percent_or_dot_cannot_start_a_line():
    assert "곳&nbsp;·&nbsp;{{ \"%.0f\" | format(d.pct) }}%" in r("templates/intro.html")
    assert '사용합니다 ·&nbsp;<a href="privacy.html" class="nw">개인정보처리방침</a>' in r("templates/my.html")
