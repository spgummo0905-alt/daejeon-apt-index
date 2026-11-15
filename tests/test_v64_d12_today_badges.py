"""D12: 오늘의 비교 후보의 배지(새 단지·신고가)는 카드 위에 겹치지 않고 설명 글 위 한 줄. 카드 안 지역·이름은 잘리지 않게. 값·저장·링크 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* D12 오늘의 비교 후보"):]
_n = B.find("\n/* E1 홈", 5)
if _n > 0:
    B = B[:_n]   # 자기 블록만
def test_badges_are_built_beside_the_text_not_inside_the_card():
    assert 'front.append(card);' in JS and 'front.append(card, tag)' not in JS
    assert 'badges.append(tag); if (c.h) badges.append(el("span", "tc-tag high", "신고가"));' in JS
    assert 'side.append(badges, why); col.append(slot, side);' in JS.replace("\n      ", " ")
def test_old_overlay_badge_hidden_and_region_wraps_two_lines():
    assert ".tc .mcard-high { display: none; }" in B and "-webkit-line-clamp: 2" in B and "white-space: normal" in B
def test_new_tag_label_and_click_save_unchanged():
    assert 'tag.textContent = have ? "이미 살펴본 단지" : "새 단지";' in JS and "DJ.collect(c.s);" in JS and "DJ.markDay();" in JS
def test_no_text_below_13px_no_motion():
    import re
    assert "animation" not in B and not re.search(r"font-size:\s*(?:[0-9]|1[0-2])px", B)
