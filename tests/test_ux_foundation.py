"""UX v2 PR 01: 공통 동작 부품(시트·메뉴·취소 알림·모션 수치)이 모든 화면에 '한 번만' 실리고, 약속한 수치·접근성 장치를 갖는지 확인한다.
저장 키·계산에는 관여하지 않는 부품이므로, 파일 내용과 로드 위치만 본다 (동작은 브라우저 점검으로 따로 확인)."""
import re
from pathlib import Path

from djdex import cli

ROOT = Path(__file__).resolve().parent.parent


def _read(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_ux_parts_are_loaded_once_after_app_js(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    for name in ("index.html", "finder.html", "my.html", "cards.html", "compare.html"):
        html = (out / name).read_text(encoding="utf-8")
        assert html.count("static/ux-motion.js") == 1 and html.count("static/ux-overlays.js") == 1, name
        assert html.index("static/app.js") < html.index("static/ux-motion.js") < html.index("static/ux-overlays.js"), name
    apt = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert apt.count("static/ux-motion.js") == 1 and apt.count("static/ux-overlays.js") == 1
    assert (out / "static" / "ux-motion.js").exists() and (out / "static" / "ux-overlays.js").exists()


def test_motion_tokens_match_the_agreed_spec():
    js, css = _read("static/ux-motion.js"), _read("static/style.css")
    for k, v in (("press", 120), ("change", 220), ("sheet", 300), ("flip", 440), ("undo", 3500)):
        assert re.search(rf"{k}:\s*{v}\b", js), k
    for v in ("--ux-press: 120ms", "--ux-change: 220ms", "--ux-sheet: 300ms", "--ux-flip: 440ms", "--ux-ease: cubic-bezier(.2, .8, .2, 1)"):
        assert v in css, v
    assert "scale(.98)" in css and "--tabbar-height" in css and "--actionbar-height" in css
    assert "__uxMotion" in js           # 두 번 실려도 전역 핸들러가 겹치지 않음


def test_sheet_is_a_real_dialog_with_focus_and_escape_handling():
    js = _read("static/ux-overlays.js")
    assert 'el("dialog", "ux-sheet")' in js and "showModal" in js                 # 진짜 <dialog>: 뒷배경 자동 비활성
    assert 'aria-labelledby' in js and 'addEventListener("cancel"' in js           # 스크린리더 제목, Esc
    assert "returnFocus" in js and "trigger.focus" in js                          # 닫으면 눌렀던 곳으로 포커스 복귀
    assert 'e.key !== "Tab"' in js                                                # Tab 은 시트 안에서만
    assert "closeLegacyPopups" in js and "rg-pop" in js and "acct-pop" in js      # 기존 팝업과 겹치지 않음
    assert "DJ.calm" in js                                                        # 모션 줄이기: 즉시 닫힘


def test_menu_has_keyboard_support_and_44px_items():
    js, css = _read("static/ux-overlays.js"), _read("static/style.css")
    for k in ("ArrowDown", "ArrowUp", "Escape", "Home", "End"):
        assert k in js, k
    assert 'role", "menuitemradio"' in js and "aria-checked" in js
    assert ".ux-menu-item" in css and "min-height: 44px" in css[css.index(".ux-menu-item {"):css.index(".ux-menu-item {") + 400]


def test_undo_toast_keeps_old_href_action_and_adds_a_button():
    app = _read("static/app.js")
    assert "action.href && action.label" in app          # 기존 '링크 단추'는 그대로
    assert "action.onClick" in app and "toast-act" in app
    assert "DJ.toastUndo" in _read("static/ux-motion.js")


def test_reduced_motion_removes_movement():
    css = _read("static/style.css")
    block = css[css.index("/* 모션 줄이기: 이동·눌림 크기 변화 없이"):]
    assert "prefers-reduced-motion: reduce" in block and ".ux-sheet" in block and "transition: none" in block
