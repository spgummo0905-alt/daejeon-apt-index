"""E4: 온보딩(시안 1~4번, 폰). 첫 화면 시작하기/나중에 → 이런 점이 편해요·카드로 쌓여요 → 빠른 설정 1/2 → 2/2. 저장은 기존 내 설정에만, 저장 확인 뒤에만 완료."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/intro.html").read_text(encoding="utf8")
JS = (R / "static/onboard.js").read_text(encoding="utf8")
APP = (R / "static/app.js").read_text(encoding="utf8")
HC = (R / "static/housecard.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E4 온보딩"):]
def test_order_hero_then_feature_then_overlay_and_script_loaded_only_on_region_intro():
    o = [HTML.index(k) for k in ('class="iv-hero"', 'class="iv-feat"', "data-ob ")]
    assert o == sorted(o)
    assert '{% if not landing %}<script src="{{ root }}static/resume.js?v={{ v }}" defer></script><script src="{{ root }}static/onboard.js?v={{ v }}" defer></script>{% endif %}' in HTML
def test_mockup_copy_screens_1_to_4():
    for k in ("시작하기", "나중에", "이런 점이 편해요", "쉽고 정확한 탐색", "똑똑한 비교", "편리한 임장 준비", "살펴본 집이 카드로 쌓여요", "어떤 집을 찾고 있나요?", "지역", "예산", "평형", "목적", "20평대", "30평대", "40평대 이상", "실거주", "아이 키우기", "역세권", "투자", "갈아타기", "기타",
              "더 정확하게 찾을 수 있게 도와드릴게요", "최근 본 집 이어보기", "관심 단지의 새 실거래와 시세 변화를 관심 화면에 표시해요.", "이런 설정으로 시작해요", "집감 시작하기", "지금은 건너뛰기", "다음"):
        assert k in HTML or k in JS, k
def test_stacked_cards_are_real_top_ranked_complexes_not_made_up():
    seg = HTML[HTML.index('class="ac-cards iv-cards"'):HTML.index('class="iv-cap">실제 단지 예시 &middot;')]
    for k in ("hero_cards[1:3]", "c.name", "c.index | score", "c | place", "apt/{{ c.slug }}.html"): assert k in seg, k
def test_settings_saved_only_through_existing_prefs_then_read_back_before_finishing():
    assert "DJ.setPref(\"want\", want)" in JS and "DJ.setPref(\"region\", st.region)" in JS and "DJ.prefs()" in JS
    for bad in ("localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon"): assert bad not in JS, bad
    assert "if (!ok) { $(\"[data-ob-err]\").hidden = false; return; }" in JS            # 저장이 확인 안 되면 완료로 넘어가지 않음
    assert "설정을 저장하지 못했어요" in HTML
def test_find_query_uses_only_existing_finder_params_budget_py_must_stn():
    assert 'q.set("budget"' in JS and 'q.set("py"' in JS and 'q.set("must", "edu")' in JS and 'q.set("stn", "500")' in JS
    fj = (R / "static/finder.js").read_text(encoding="utf8")
    assert '["budget", "py", "gu", "age", "stn", "sch", "must"]' in fj and 'id: "edu"' in fj
def test_switches_really_change_behavior_and_default_on_keeps_old_behavior():
    assert "DJ.prefs().collect === false" in APP and "DJ.prefs().resume === false" in HC
    assert "resume: p.resume !== false, collect: p.collect !== false" in JS
def test_skip_saves_nothing_and_goes_home_and_can_close_with_escape_and_back():
    assert '$("[data-ob-skip]").addEventListener("click", home);' in JS and 'e.key === "Escape"' in JS and "st.step === 2 ? go(1) : close()" in JS
def test_accessibility_dialog_switch_progress_focus():
    assert 'role="dialog" aria-modal="true"' in HTML and HTML.count('role="switch"') == 3 and HTML.count('aria-label="최근 본 집 이어보기" data-ob-sw="resume"') == 1 and 'role="progressbar"' in HTML and 'aria-pressed="false"' in HTML
    assert "h.focus(" in JS and "opener.focus" in JS and 'e.key !== "Tab"' in JS
def test_phone_only_hidden_by_default_taps_44_no_small_text_reduced_motion_no_external():
    assert ".iv-feat, .ob { display: none; }" in B and "@media (max-width: 720px) {" in B
    assert ".ob-chip { min-height: 44px;" in B and ".ob-back { display: grid; place-items: center; width: 44px; height: 44px;" in B and ".ob-switch { flex: none; position: relative; width: 52px; height: 44px;" in B and ".iv-later { display: flex; align-items: center; justify-content: center; min-height: 48px;" in B and "prefers-reduced-motion: reduce" in B and "url(" not in B and "@import" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-3])px", B)
