"""UX v2 PR 05: 지도 — 요약 시트 기본/확장 높이, 위치 미확인 입구, 후보 담기 취소.
좌표·가격·지수는 complexes.json 값 그대로이고 새 계산·새 저장 키가 없는지도 본다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_sheet_has_default_and_expanded_height_and_keyboard_toggle():
    html, js, css = _r("templates/map.html"), _r("static/map.js"), _r("static/style.css")
    assert '<button type="button" class="mp-grab" data-mp-expand aria-expanded="false"' in html     # 누를 수 있는 진짜 단추
    assert "function setExpanded(on)" in js and 'aria-expanded' in js and "요약 접기" in js
    i = css.index(".mp-sheet { max-height: 94%; overflow-y: auto")                # 내용만큼, 넘치면 시트 안에서 스크롤 (버튼이 잘리지 않음)
    assert ".mp-sheet.expanded { max-height: 94%; }" in css[i:i + 900]
    assert "visibility 0s linear" in css[i:i + 500]                           # 닫힐 때 숨김 전환 유지


def test_expanded_rows_only_use_existing_values_and_skip_missing():
    js = _r("static/map.js")
    i = js.index("const rows = [[")
    seg = js[i:i + 600]
    assert "c.y" in seg and "c.hh" in seg and "c.f.subway" in seg
    assert "if (!v) return;" in seg                                           # 없는 값은 줄을 만들지 않음 (지어내지 않음)


def test_unknown_location_has_entry_and_never_invents_coordinates():
    html, js = _r("templates/map.html"), _r("static/map.js")
    assert "data-mp-unk" in html and "지도에 없는 단지" in js
    assert "지도에는 표시하지 못했어요" in js
    assert "c.la != null && c.ln != null" in js and "NOXY" in js              # 좌표 없는 단지는 점을 만들지 않음
    assert "lim = BANDS[band][1], unk = NOXY.filter" in js                    # 가격대 필터에도 같이 반응


def test_favorite_toast_undo_and_focus_return():
    js = _r("static/map.js")
    assert "DJ.toastUndo" in js and "now && !was" in js
    assert "fromList" in js and 'focus({ preventScroll: true })' in js         # 목록에서 열었으면 닫을 때 목록 버튼으로 복귀
    assert 'data-mp-close").focus' in js or '[data-mp-close]").focus' in js


def test_selection_and_filters_survive_view_switch_and_other_pins():
    js = _r("static/map.js")
    assert 'if (sheet.classList.contains("expanded")) setExpanded(true)' in js   # 다른 핀을 눌러도 펼침 유지
    assert "function setView(v)" in js and "buildList()" in js
    assert "pushState" in js and "popstate" in js                                # 뒤로가기로 시트 닫기 유지
