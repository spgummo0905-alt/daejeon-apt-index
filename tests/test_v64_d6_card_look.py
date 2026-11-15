"""D6: 카드첩 카드를 시안 A 모양으로(카드첩 격자만). 값·링크·뒤집기·다녀옴 도장 조건은 그대로, 자리만 옮김."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* D6 카드첩 카드 모양"):]
def test_look_is_applied_only_to_album_grid_cards_not_other_screens():
    assert "albumLook(w, c); box.append(w);" in JS
    assert JS.count("albumLook(") == 2               # 정의 1 + 카드첩 격자 호출 1
    assert "albumLook" not in (R / "static/app.js").read_text(encoding="utf8")
    assert "albumLook" not in (R / "static/housecard.js").read_text(encoding="utf8")
def test_top_line_is_brand_and_tier_built_from_the_cards_own_grade():
    assert 'el("b", "al-brand", "JIPGAM"), el("b", "al-tier", "\\u2726 " + c.g + " TIER")' in JS
def test_values_are_moved_not_recomputed_or_recreated():
    seg = JS[JS.index("function albumLook"):JS.index("let more = null")]
    assert "foot.prepend(st)" in seg and "pl.append(hi)" in seg and "DJ.place(c)" in seg
    assert 'name.after(pl);' in seg and 'el("span", "al-place", DJ.place(c))' in seg      # 이름 바로 아래 지역 줄
    for bad in ("DJ.been(", "new Date", "c.i ", "c.pt", "localStorage", "DJ.save"):
        assert bad not in seg, bad                   # 도장 조건·지수·가격을 여기서 다시 만들거나 저장하지 않음
def test_stamp_and_high_badge_do_not_cover_text_and_flip_button_has_room():
    assert ".album-cards .al-look .hc-foot { padding-bottom: 32px !important;" in B
    assert ".album-cards .al-look .al-place .mcard-high { position: static;" in B
    assert "transform: rotate(-7deg)" in B
def test_big_number_is_gold_for_dark_cards_and_ink_for_light_d_card():
    assert "color: #f2d694" in B and ".hc-collect.g-D.al-look .hc-foot > span:not(.cs-stamp):not(.hc-fp) b { color: var(--hc-ink); }" in B
def test_text_never_below_14px_no_motion_no_external_files():
    assert "url(" not in B and "animation" not in B and "@import" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-3])(?:\.\d+)?px", B)
