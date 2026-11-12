"""UX v4.9: MY '다녀온 집' 은 도장·방문 일지가 있는 단지를 단지마다 한 번 셈(세기만, 저장 불변). 도장은 글씨 위에 얹지 않음."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_my_counts_been_homes_read_only():
    m = R("static/my.js")
    seg = m[m.index("const beenSet"):m.index("const nx = ")]
    assert "new Set(visits.map(v => v.slug))" in seg and "v.d" in seg and "beenN" in seg
    for w in ("DJ.save", "setItem", "removeItem"):
        assert w not in seg
    assert '<dt>다녀온 집</dt><dd data-ms="visits">' in R("templates/my.html")


def test_stamp_flows_above_name_not_floating_over_text():
    c, j = R("static/style.css"), R("static/housecard.js")
    assert ".hc-collect .cs-stamp { position: static;" in c
    assert "position: absolute; left: 16px; top: 52px" not in c
    seg = j[j.index("function collect(c, opt)"):j.index("DJ.hc = {")]
    assert seg.index('"cs-stamp"') < seg.index('el("strong", "hc-cname", c.n)')


def test_impeccable_fixes_contrast_and_static_live_dot():
    c = R("static/style.css")
    assert "--muted: #aeada3;" in c and "--muted: #9a998f;" not in c
    assert ".live-dot { animation: none; box-shadow: none; }" in c
