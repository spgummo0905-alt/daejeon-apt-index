"""C8: 상세 시안 B(휴대폰만). 카드의 위치 지도·거리·점수 줄은 '입지 보기'로 접고, 카드 아래에 두 칸. 값·문구 변경 0, 단추가 없으면 접지 않음, 데스크톱은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/apt.html").read_text(encoding="utf8")
JS = (R / "static/cardgen.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
BLK = CSS[CSS.index("/* C8 상세 시안 B"):]
def test_two_tiles_exist_and_compare_link_is_unchanged_target():
    t = HTML[HTML.index("data-apt-tiles"):HTML.index("apt-cta-inline")]
    assert "data-loc-toggle" in t and 'aria-expanded="false"' in t and "입지 보기" in t
    assert "compare.html?a={{ c.slug | urlencode }}" in t and "다른 집과 비교" in t
def test_original_location_markup_and_values_are_still_in_the_card():
    for k in ("mc-lochead", "위치 · 직선거리", "mc-fac", "초등학교", "대형마트", "병원 1km 안", "mc-fnote", "data-mc-art", "mc-key", "mc-strip"):
        assert k in HTML, k
def test_fold_only_when_button_exists_and_open_toggles_aria():
    assert 'const locBtn = document.querySelector("[data-loc-toggle]");' in JS and "if (locBtn) {" in JS
    assert 'card.classList.add("loc-fold");' in JS and 'card.classList.toggle("loc-open", on);' in JS
    assert 'locBtn.setAttribute("aria-expanded", on ? "true" : "false");' in JS
def test_css_fold_is_phone_only_and_tiles_hidden_on_desktop():
    assert ".apt-tiles { display: none; }" in BLK
    i = BLK.index("@media (max-width: 719px)")
    assert ".mc.loc-fold:not(.loc-open)" in BLK[i:] and ".mc.loc-fold:not(.loc-open)" not in BLK[:i]
def test_folds_only_location_and_score_rows_never_price_or_grade():
    seg = BLK[BLK.index(".mc.loc-fold:not(.loc-open)"):]
    seg = seg[:seg.index("}")]
    for keep in ("mc-under", "mc-top", "mc-prices", "mc-price", "mc-est", "mc-foot", "mc-more-btn"):
        assert keep not in seg, keep
    for fold in ("mc-lochead", "mc-art", "mc-locline", "mc-fac", "mc-fnote", "mc-key", "mc-strip"):
        assert fold in seg, fold
def test_tiles_touch_target_and_no_motion_no_external_files():
    assert "min-height: 72px" in BLK and "url(" not in BLK and "animation" not in BLK and "@import" not in BLK
