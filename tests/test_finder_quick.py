"""UX v3 찾기 빠른 모드: 예산·평형·지역 세 가지만으로 바로 결과가 나오고, 기존 7개 질문(직장·연식·역·학교·필수 조건 등)은 '더 자세한 조건'으로 접는다.
설문 저장 키·질문 순서·주소 조건·계산은 그대로여야 한다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_quick_panel_and_advanced_fold_are_in_the_survey_markup():
    t = _r("templates/finder.html")
    assert "data-sv-fast" in t and "<details class=\"sv-adv\" data-sv-adv>" in t and "더 자세한 조건" in t
    adv_open, adv_close = t.index('<details class="sv-adv" data-sv-adv>'), t.index("</details>", t.index('<details class="sv-adv" data-sv-adv>'))
    assert t.index("data-sv-fast") < adv_open                                                                         # 빠른 찾기가 위
    assert adv_open < t.index("data-sv-steps") < t.index("data-sv-q aria-live") < t.index("data-sv-next") < adv_close   # 기존 질문·버튼은 접힌 곳 안에
    assert adv_close < t.index('id="results"')


def test_quick_mode_uses_same_survey_state_and_keeps_storage_and_calculation():
    js = _r("static/finder.js")
    for sig in ("function maxPrice(equity, loanDsr, ltv)", "function works(s)", "function fit(c, s)", "function pass(c, s)"):
        assert sig in js
    assert 'DJ.load("survey", {})' in js and 'DJ.save("survey", S)' in js
    seg = js[js.index("function drawQuick()"):js.index("// ---------- 고른 조건 꼬리표")]
    assert "S.budget" in seg and "S.py" in seg and "S.gus" in seg and "DJ.save" not in seg and "localStorage" not in seg    # 새 저장 없음
    assert 'S.bmode = "price"' in seg                                                                                     # 예산을 고르면 가격대 방식으로
    for sid in ("work", "age", "near", "must"):
        assert f'"{sid}"' in js[js.index("ADV = ["):js.index("ADV = [") + 60]


def test_quick_main_button_is_56px_names_the_count_and_is_disabled_until_a_condition_is_chosen():
    js, css = _r("static/finder.js"), _r("static/style.css")
    assert "맞는 단지 ${n.toLocaleString()}곳 보기" in js and 'setAttribute("aria-disabled", String(idle || !n))' in js
    tail = css[css.index("UX v3 · 찾기 빠른 모드"):]
    assert ".sv-quick-go { display: flex; align-items: center; justify-content: center; text-align: center; min-height: 56px" in tail
    assert ".sv-qg .sv-opt { min-height: 64px; }" in tail and ".sv-quick-clear { min-height: 44px" in tail


def test_advanced_fold_opens_when_an_advanced_condition_is_already_chosen_or_a_chip_points_to_it():
    js = _r("static/finder.js")
    assert "if (adv && ADV.some(id => STEPS[idx(id)].on())) adv.open = true;" in js
    assert "if (adv && ADV.includes(step)) adv.open = true;" in js
    assert "S.step = Math.max(0, STEPS.findIndex(x => x.id === step))" in js                                               # 기존 칩 동작 유지


def test_quick_main_button_sticks_above_the_tab_bar_on_phones():
    css, js = _r("static/style.css"), _r("static/finder.js")
    tail = css[css.index("UX v3 · 찾기 빠른 모드"):]
    assert ".sv-quick-dock { position: sticky; bottom: calc(66px + env(safe-area-inset-bottom))" in tail and "dock.append(go)" in js
