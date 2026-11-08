"""Android 앱(TWA)·휴대폰 화면 셸 설정 시험: 접근성 확대는 막지 않고, 의도하지 않은 확대·밀림 원인만 막는다."""
import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def _read(p):
    return (ROOT_DIR / p).read_text(encoding="utf-8")


def test_viewport_never_blocks_user_zoom():
    base = _read("templates/base.html")
    vp = re.search(r'<meta name="viewport" content="([^"]+)"', base).group(1)
    assert "user-scalable" not in vp and "maximum-scale" not in vp          # 접근성 확대 전면 차단 금지


def test_double_tap_zoom_blocked_but_pinch_kept_and_text_not_inflated():
    css = _read("static/style.css")
    html_rule = re.search(r"\nhtml \{([^}]*)\}", css).group(1)
    assert "touch-action: manipulation" in html_rule                         # 더블탭 확대만 막음(핀치는 manipulation 에서 허용)
    assert "text-size-adjust: 100%" in html_rule
    assert "pan-x" not in html_rule and "touch-action: none" not in html_rule


def test_android_manifest_theme_and_system_bar_colors_follow_light_and_dark():
    m = _read("android/app/src/main/AndroidManifest.xml")
    for key in ("STATUS_BAR_COLOR", "STATUS_BAR_COLOR_DARK", "NAVIGATION_BAR_COLOR", "NAVIGATION_BAR_COLOR_DARK"):
        assert f"customtabs.trusted.{key}\"" in m
    assert "android:theme=\"@style/AppLaunch\"" in m
    assert "user-scalable" not in m
    assert (ROOT_DIR / "android/app/src/main/res/values-night/colors.xml").exists()
    base = _read("templates/base.html")
    assert 'name="theme-color" content="#f6f8fb" media="(prefers-color-scheme: light)"' in base
    assert 'name="theme-color" content="#111110" media="(prefers-color-scheme: dark)"' in base


def test_detail_page_cannot_push_the_whole_page_sideways():
    css = _read("static/style.css")
    assert re.search(r"\.pc-tables \{[^}]*grid-template-columns: minmax\(0, 1fr\)", css)    # 표가 넓어도 칸이 늘지 않게
    assert ".pc-tables > .pc-sec { min-width: 0; }" in css
    assert re.search(r"\.ki-note \{ white-space: normal;", css)                                # 긴 안내는 줄바꿈


def test_shell_script_is_loaded_and_keeps_to_session_storage():
    base = _read("templates/base.html")
    assert "static/shell.js" in base
    js = _read("static/shell.js")
    assert "sessionStorage" in js and "localStorage" not in js                # 위치 기억은 이 탭 안에서만, 기록 저장소는 건드리지 않음
