"""E5: 홈 '맞춤 설정 이어하기' 배너(시안 5·6번, 폰). 설정을 끝냈거나 닫으면 다시 안 뜸. 저장은 기존 내 설정에만."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
IDX = (R / "templates/index.html").read_text(encoding="utf8")
BN = (R / "static/onb-banner.js").read_text(encoding="utf8")
OB = (R / "static/onboard.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E5 홈"):]
def test_banner_markup_copy_and_position_above_eyebrow_with_resume_link_to_quick_setup():
    assert "3분만에 맞춤 설정 완료하기" in IDX and "내게 맞는 아파트를 더 정확하게 찾아드려요." in IDX and "이어하기" in IDX
    assert 'href="intro.html?ob=1" data-ob-resume' in IDX and 'aria-label="맞춤 설정 안내 닫기"' in IDX and "data-ob-banner hidden" in IDX
    assert IDX.index("data-ob-banner hidden") < IDX.index('<p class="eyebrow">국토교통부 실거래 기준')
    assert '<script src="static/onb-banner.js?v={{ v }}" defer></script>' in IDX
def test_banner_shows_only_until_setup_done_or_closed_and_close_is_saved_then_hidden():
    assert "if (!p.onb && !p.onbHide) el.hidden = false;" in BN
    assert 'DJ.setPref("onbHide", 1);' in BN and "if (DJ.prefs().onbHide === 1) el.hidden = true;" in BN
    for bad in ("localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "sendBeacon"): assert bad not in BN, bad
def test_finishing_quick_setup_saves_done_flag_and_checks_it_when_reading_back_and_resume_link_opens_it():
    assert 'DJ.setPref("onb", 1);' in OB and "&& p.onb === 1;" in OB
    assert "/[?&]ob=1(&|$)/.test(location.search)" in OB and "openers[0].click()" in OB
def test_phone_only_44_taps_narrow_phone_stacks_dark_theme_no_small_text():
    assert ".ob-banner { display: none; }" in B and ".ob-banner:not([hidden]) { display: flex;" in B
    assert ".ob-bn-go { flex: none; display: inline-flex; align-items: center; gap: 2px; min-height: 44px;" in B and ".ob-bn-x { flex: none; display: grid; place-items: center; width: 44px; height: 44px;" in B
    assert "/* E5b:" in B and "@media (max-width: 360px)" in B and ".ob-bn-go { order: 3; flex: 1 1 100%;" in B
    assert ".ob-bn-go { background: #59e3ad; color: #0b2a21; }" in B and "url(" not in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-3])px", B)
