"""I2: 영어 꼬리말을 한글로, 홈 빠른 메뉴 파스텔 4색을 한 가지로, 순위 금·은·동 입체 메달과 붉은·푸른 오르내림 글자를 평평한 번호 원과 진한 글자 + ▲▼로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def r(p): return (R / p).read_text(encoding="utf8")
CSS = r("static/style.css"); B = CSS[CSS.index("/* I2 조용한 색"):]

def test_english_kickers_replaced_by_korean_everywhere_they_are_set():
    assert "WEEKEND PLAN" not in r("templates/index.html") + r("static/app.js") and "MY COLLECTION" not in r("templates/cards.html")
    assert "주말 임장 준비" in r("templates/index.html") and "주말 임장 이어하기" in r("static/app.js") and '<p class="ac-label">내 카드첩</p>' in r("templates/cards.html")

def test_quick_menu_uses_one_surface_in_light_and_dark():
    assert ".hm-quick a:nth-child(n) .hm-qi { background: #e6f2e8; }" in B
    assert "@media (prefers-color-scheme: dark) { .hm-quick a:nth-child(n) .hm-qi { background: #12332a !important; } }" in B

def test_podium_numbers_are_flat_circles_not_metal_gradients():
    assert ".pd-medal, .pd1 .pd-medal, .pd2 .pd-medal, .pd3 .pd-medal { background: var(--chip); color: var(--text); box-shadow: none;" in B
    assert "gradient" not in B

def test_up_down_marked_with_triangles_and_neutral_text_and_rank_basis_words_stay():
    assert ".pd.t-up .pd-val, .pd.t-down .pd-val, .rl-val.t-up, .rl-val.t-down { color: var(--text); }" in B
    assert 'content: "▲"' in B and 'content: "▼"' in B and ".pd-val { white-space: nowrap; }" in B
    s = r("djdex/site.py")
    for k in ("1년 전과 비교해 가격이 오른 단지 (변동률 순)", "1년 전과 비교해 가격이 내린 단지 (변동률 순)", "최근 6개월 ㎡당 중간 가격을 1년 전 같은 기간과 비교"): assert k in s

def test_podium_steps_are_flat_too_and_keep_their_height_order():
    assert ".pd1 .pd-step, .pd2 .pd-step, .pd3 .pd-step { background: var(--chip); border: 1px solid var(--border); border-top: 0; }" in B and "gradient" not in B
    assert "--h: 96px" in CSS and "--h: 64px" in CSS and "--h: 40px" in CSS
