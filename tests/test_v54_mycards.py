"""UX v5.4: 카드첩 후보 카드 뒷면 제거(바로 앞면+고른 이유), MY·카드첩 번호 머리말·반복 설명 정리, 굵기 단계 줄이기."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_today_cards_show_front_and_reason_without_flip_but_keep_collect_path():
    j = R("static/cards.js")
    import re
    seg = re.sub(r"//[^\n]*", "", j[j.index("function today(d)"):j.index("// ---------- 임장 배지")])   # 주석은 빼고 코드만 본다
    assert "tc-back" not in seg and "flip" not in seg
    assert "DJ.collect(c.s)" in seg   # 후보를 누를 때 카드첩에 모음(예전엔 뒤집을 때): 저장 방식은 그대로
    assert "tc-why" in seg and "DJ.markDay()" in seg and "DJ.album()" in seg
    a = R("static/app.js")
    assert "const got = DJ.collect(c.s);" in a   # 단지를 열면 카드첩에 모이는 길은 그대로


def test_dead_flip_css_removed():
    c = R("static/style.css")
    for dead in (".tc-back", ".tc-mark", "@keyframes tc-glint", "@keyframes tc-sweep", ".tc.shine"):
        assert dead not in c, dead
    assert ".tc-front { position: absolute; inset: 0; display: flex;" in c


def test_numbered_stat_labels_gone_and_summaries_are_not_repeating_titles():
    c = R("static/style.css")
    assert "::before" not in c[c.index(".my-stats {"):c.index(".my-stats {") + 900] or "담아 둔 집" not in c
    assert "내 기록은 어디에 저장되나요?" in R("templates/my.html") and "data-storage-summary" in R("templates/my.html")
    assert "카드와 배지는 어떻게 모이나요?" in R("templates/cards.html")


def test_font_weight_steps_reduced():
    c = R("static/style.css")
    t = c[c.index("UX v5.4"):]
    assert "h2, h3 { font-weight: 700; }" in t and ".sv-opt b" in t and "font-weight: 600" in t
