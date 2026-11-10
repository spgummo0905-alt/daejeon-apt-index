"""UX v2 PR 07: 일조 — 동 고르기(적으면 메뉴·많으면 시트), 관심 담기 취소, 자료 없음/불러오기 실패 구분.
계산 파일(shadow.js·preview-calc.js·preview-iso.js)과 자료는 바뀌지 않았는지도 함께 본다."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_calculation_files_are_unchanged_from_main():
    out = subprocess.run(["git", "diff", "--name-only", "origin/main", "--", "static/shadow.js", "static/preview-calc.js", "static/preview-iso.js", "data/preview"],
                         cwd=ROOT, capture_output=True, text=True)
    if out.returncode == 0:                      # git 기록이 있는 환경에서만 비교 (압축본 CI 에서는 건너뜀)
        assert out.stdout.strip() == ""


def test_dong_pick_uses_menu_for_few_and_sheet_for_many():
    js = _r("static/preview.js")
    i = js.index("function openDongPick(anchor)")
    seg = js[i:i + 700]
    assert "dongs.length >= 2 && dongs.length <= 5" in seg and "DJ.menu.open(anchor" in seg
    assert "openDongSheet();" in seg                                              # 많으면 기존 시트 그대로
    assert "onPick: id => { if (id !== st.tid) select(id); }" in seg              # 고르는 동작은 기존 select()
    assert "else if (bt.id === 'dongBtn') openDongPick(bt);" in js


def test_slider_and_render_batching_are_preserved():
    js = _r("static/preview.js")
    assert "tickRaf = requestAnimationFrame" in js and "if (tickRaf) return;" in js   # 드래그 중 프레임마다 한 번만 그림
    assert "aria-valuetext" in js                                                      # 시각·가림 상태를 읽어 줌


def test_save_has_undo_and_missing_vs_failed_are_different_messages():
    js = _r("static/preview.js")
    assert "DJ.toastUndo('관심 단지에 담았어요'" in js
    assert "e.status === 404" in js
    assert "아직 일조 미리보기가 열려 있지 않아요" in js and "건물 자료를 불러오지 못했어요" in js
    html = _r("templates/preview.html")
    assert "추정" in html and "법적 일조권" in _r("static/preview.js")               # 추정 참고용 안내 접근 가능


def test_shared_menu_follows_its_button_instead_of_closing_on_every_scroll():
    js = _r("static/ux-overlays.js")
    assert "const follow = () => { if (mcur && !mcur.place()) menu.close(); };" in js
    assert 'addEventListener("scroll", follow' in js and 'addEventListener("scroll", () => menu.close()' not in js
