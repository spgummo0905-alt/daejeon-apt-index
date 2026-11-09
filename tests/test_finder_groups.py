"""UX v2 PR 04b: 찾기 질문을 4묶음(예산 / 생활권 / 집 / 생활)으로 보여 주되,
STEPS 8개의 id·순서와 저장된 설문의 step 번호, 계산 함수, URL 조건은 그대로인지 확인한다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _js():
    return (ROOT / "static" / "finder.js").read_text(encoding="utf-8")


def test_steps_array_and_survey_storage_are_unchanged():
    js = _js()
    order = [js.index(f'{{ id: "{i}", pick:') for i in ("status", "gu", "work", "budget", "py", "age", "near", "must")]
    assert order == sorted(order)                                   # STEPS 의 id 순서(= 저장된 step 번호) 그대로
    assert 'DJ.load("survey", {})' in js and 'DJ.save("survey", S)' in js
    for sig in ("function maxPrice(equity, loanDsr, ltv)", "function works(s)", "function fit(c, s)", "function pass(c, s)"):
        assert sig in js


def test_groups_are_budget_area_home_life_and_cover_all_questions():
    js = _js()
    i = js.index("const GROUPS = [")
    seg = js[i:i + 400]
    assert '"예산", ids: ["budget"]' in seg and '"생활권", ids: ["gu", "work"]' in seg
    assert '"집", ids: ["py", "age"]' in seg and '"생활", ids: ["near", "must"]' in seg
    assert "const ORDER = GROUPS.flatMap" in js


def test_status_is_asked_only_when_loan_calculation_is_chosen():
    js = _js()
    assert 'if (S.bmode === "calc") { q.append(label("지금 어떤 상황인가요?' in js and "drawStatus()" in js
    assert 'STEPS[S.step].id === "status") S.step = idx("budget")' in js          # 옛 설문의 상황 단계는 예산으로
    assert 'add(st.label, "budget")' in js                                          # 상황 칩을 누르면 예산 질문으로


def test_navigation_follows_group_order_and_url_conditions_land_on_last_group():
    js = _js()
    assert "ORDER[ord + 1]" in js and "ORDER[ord - 1]" in js
    assert "ORDER[Math.max(...at.map(id => ORDER.indexOf(id)))]" in js


def test_steps_row_shows_four_groups_on_one_line_at_44px():
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    i = css.index("UX v2 · 04b")
    assert ".sv-step { min-height: 44px" in css[i:i + 600]
    assert "@media (max-width: 374px)" in css[i:]
