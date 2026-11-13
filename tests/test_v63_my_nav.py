"""나의 집감: 숫자 칸을 누르면 목록으로, 탭을 누르면 맨 위가 아니라 탭 내용으로, 카드첩 중복 카드 제거. 저장 키·숫자 계산은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def _r(p): return (R / p).read_text(encoding="utf8")
def test_stat_cells_become_links_to_lists():
    j = _r("static/my.js")
    assert "DJ.myGo = (g, ids) =>" in j and 'el("a", "ms-go"' in j and "DJ.myGo(g[0], g[1])" in j   # 정의와 호출이 모두 있어야 함
    for sec in ("my-favs", "course", "visit-history", "notes"):
        assert sec in j
    h = _r("templates/my.html")
    assert 'id="my-favs"' in h and 'id="course"' in _r("templates/_course.html") and 'id="visit-history"' in h
def test_tab_tap_no_longer_jumps_to_page_top():
    j = _r("static/my.js")
    assert "scrollTo(0, 0)" not in j and "DJ.myTabsTop = toTabs" in j and "DJ.myTabsTop && DJ.myTabsTop()" in j and "data-my-top" in j
    assert "data-my-top" in _r("templates/my.html")
def test_duplicate_cards_entry_removed_but_summary_kept_on_top():
    h = _r("templates/my.html")
    assert "to-cards" not in h and "카드첩 · 임장 배지" not in h and "data-cards-sum" not in h
    assert "data-hc-my" in h and "카드첩 열기" in h
    assert "임장 배지" in _r("static/housecard.js")   # 위 카드첩 줄의 '임장 배지 n/14개'는 그대로
def test_counts_and_storage_untouched():
    j = _r("static/my.js")
    for k in ('ms("favs").textContent = favs.length', "courseN", "beenN"):
        assert k in j
    assert "localStorage.setItem" not in _r("static/my.js").split("DJ.myGo")[0][-4000:]
def test_press_feedback_respects_reduced_motion():
    c = _r("static/style.css"); tail = c[c.index("/* D3 나의 집감"):]
    assert "prefers-reduced-motion" in tail and ".ms-go::after" in tail and "inset: 0" in tail
    assert ".my-stats dd { pointer-events: none; }" in tail   # 0인 칸(흐림)에서도 눌림이 링크로 가게
