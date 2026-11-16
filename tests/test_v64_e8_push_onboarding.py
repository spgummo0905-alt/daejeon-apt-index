"""E8: 빠른 설정 2/2에서 휴대폰 알림(웹 푸시)을 직접 켤 수 있음. 자동으로 켜지 않음, 로그인·아이폰·미지원은 안내만."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/intro.html").read_text(encoding="utf8")
JS = (R / "static/onboard.js").read_text(encoding="utf8")
MY = (R / "templates/my.html").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* E8 빠른 설정"):]
def test_permission_is_asked_only_inside_the_button_click_never_on_open_or_finish():
    assert JS.count("Notification.requestPermission()") == 1 and JS.count("pushManager.subscribe(") == 1
    seg = JS[JS.index("pushB.addEventListener(\"click\""):JS.index("document.addEventListener(\"dj:auth\"")]
    assert "Notification.requestPermission()" in seg and "pushManager.subscribe(" in seg
    assert "requestPermission" not in JS[JS.index("function finish()"):JS.index("// 휴대폰 알림(웹 푸시)")]      # '집감 시작하기'로는 허용을 묻지 않음
def test_same_save_path_as_my_settings_and_verified_by_reading_back():
    for k in ('rpc("push_key")', 'rpc("push_sub_put"', 'rpc("push_sub_has"', "userVisibleOnly: true"): assert k in JS, k
    assert "if (await rpc(\"push_sub_has\"" in JS and "알림을 저장하지 못했어요" in JS
    for bad in ("localStorage", "sessionStorage", "fetch("): assert bad not in JS, bad
def test_logged_out_ios_and_unsupported_show_guidance_not_a_broken_button():
    assert "카카오 로그인 뒤 ‘내 설정’에서 켤 수 있어요" in JS and "홈 화면에 추가" in JS and "if (!can) { pushBox.hidden = true; return; }" in JS
    assert 'data-ob-push hidden' in HTML and "data-ob-push-btn hidden" in HTML and "휴대폰 알림 켜기" in HTML
def test_copy_no_longer_says_no_alerts_are_sent_and_has_no_pressure_words():
    assert "알림을 따로 보내지는 않습니다" not in MY and "하루 한 번 알려 드려요" in MY
    PB = HTML[HTML.index('class="ob-push"'):HTML.index('class="ob-sum"')]      # 새로 넣은 알림 줄만(옛 소개 문구는 대상 아님)
    for bad in ("놓치", "지금 바로", "마감", "곧 끝", "서두"): assert bad not in JS + PB + MY[MY.index("data-news-n"):MY.index("data-news-done")], bad
def test_phone_only_tap_48_no_small_text_light_scheme():
    assert ".ob-push { display: none; }" in B and ".ob-pushbtn { min-height: 48px;" in B and "@media (max-width: 720px)" in B
    assert not re.search(r"font-size:\s*(?:[0-9]|1[0-3])px", B)
