"""UX v5.1: Fable 디자인 평가 반영. 인트로 템플릿 요소 제거, 청록 남색, 금 한 가지, 보조 글자 12px 이상."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def _blk():
    c = R("static/style.css")
    s = c[c.index("UX v5.1 · Fable 디자인 평가 반영"):]
    n = s.find("/* ===== UX ", 10)   # 다음 버전 블록 전까지만
    return s[:n] if n > 0 else s


def test_v51_block_comes_after_older_rules_so_it_wins_the_cascade():
    c = R("static/style.css")
    assert c.count("UX v5.1 · Fable 디자인 평가 반영") == 1
    i = c.index("UX v5.1 · Fable 디자인 평가 반영")
    # 앞선 버전 블록(v3.x~v5.0)은 모두 v5.1 앞에 있고, v5.1 뒤에는 더 새로운 v5.2 이상만 붙는다
    assert c.rindex("UX v5.0 · Impeccable 비평 반영") < i
    assert "UX v3.3 · 낮은 폰" in c[:i]
    assert c.rstrip().endswith("}")


def test_intro_template_tells_removed():
    t = R("templates/intro.html")
    assert "it-eyebrow" not in t and "live-dot" not in t
    assert not any(f"{n:02d} · " in t for n in range(1, 10))
    b = _blk()
    assert 'body[data-page="intro"] .it-hero h1 em { background: none;' in b and ".it-glow { display: none; }" in b


def test_card_navy_is_teal_not_violet_and_gold_is_single_flat():
    b = _blk()
    assert "--in1: #0c2230; --in2: #12344a; --in3: #0a1b26;" in b
    assert "#c9a24a" in b and "#d9b45a" in b
    js = R("static/locmap.js")
    assert "#0c2230" in js and "#0f2447" not in js


def test_area_note_not_below_12px():
    assert ".mc .ar small, .mcard .ar small { font-size: 12px;" in _blk()
