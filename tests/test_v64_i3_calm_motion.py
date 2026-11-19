"""I3: 누름 크기를 한 규칙으로, 목록 카드의 장식 무한 반복 움직임 정지. 상세 대표 카드 반짝임·로딩·실시간 표시는 그대로."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* I3 누름"):]

def test_press_scales_are_two_steps_only_in_the_i3_rules():
    assert re.findall(r"scale\(([^)]*)\)", B) == [".96", ".98"]
    assert ".icon-btn:active, .hs-step:active, .rail-btn:active:not(:disabled), .rg-item:active, .lm-prev:active, .lm-next:active, .rv-link:active, .jump-field:active, .sheet-act:active i { transform: scale(.96); }" in B
    assert ".mc-price:active, .mc-medal:active, .mc-rank:active, .pay-quick .chip:active { transform: scale(.98); }" in B

def test_decorative_endless_loops_stopped_on_list_cards_badges_and_intro_but_detail_card_and_loading_kept():
    assert ".mc.g-S .mc-in::before, .mc.g-A .mc-in::before, .mcard.g-S::before, .mcard.g-A::before, .grade.big.g-S::after, .grade.big.g-A::after, .it-card, .it-scroll span { animation: none; }" in B
    assert "foil-sweep" in CSS and "twinkle" in CSS                                   # 상세 대표 카드 반짝임은 남김
    for k in (".skel", ".live-dot", ".ticker-track", ".sheet-act[aria-busy"): assert k in CSS, k
