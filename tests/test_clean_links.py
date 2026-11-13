import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from clean_links import clean


def test_internal_links_lose_html():
    assert clean('<a href="rank.html">') == '<a href="rank">'
    assert clean('<a href="../index.html">') == '<a href="../">'
    assert clean('<a href="compare.html?a=1">') == '<a href="compare?a=1">'
    assert clean('<a href="https://www.jipgam.kr/x/y.html">') == '<a href="https://www.jipgam.kr/x/y">'


def test_external_untouched():
    s = '<a href="https://example.com/a.html">'
    assert clean(s) == s
