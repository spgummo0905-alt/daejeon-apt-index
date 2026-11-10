"""UX v2 PR 09: 임장 — 다음 방문 띠, 끌어서 순서 바꾸기(버튼 병행), 현장 저장 상태(기기/계정/실패+다시 보내기), 도장·다시 비교, 방문 초안 보관."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_project_top_shows_next_visit_order_and_progress_from_real_records():
    js, html = _r("static/projects.js"), _r("templates/projects.html")
    assert 'data-pj-nv' in html and "function nextVisit(n, logs, went)" in js
    assert "DJVisitLog.list({ region: REGION, slug: s, projectId: current.id })" in js[js.index("function nextVisit"):js.index("function dragReorder")]
    assert "다녀온 단지 ${went}/${usable.length}곳" in js and "방문 예정일 없음" in js
    assert "후보를 모두 다녀왔어요" in js and "기록으로 다시 비교하기" in js


def test_reorder_has_drag_handle_and_keeps_up_down_buttons():
    js = _r("static/projects.js")
    assert "function dragReorder(e, wrap, from, cards)" in js and "setPointerCapture" in js
    assert '끌어서 순서 바꾸기. 키보드는 위·아래 버튼을 쓰세요' in js
    assert '[["↑", -1, "위로"], ["↓", 1, "아래로"]]' in js                  # 기존 버튼 경로 그대로
    assert "mutate({ slugs: a })" in js                                       # 저장은 후보 순서 하나뿐
    assert ".pj-grab { cursor: grab; touch-action: none; }" in _r("static/style.css")


def test_field_mode_reports_real_save_result_and_offers_retry_without_losing_checks():
    f, s = _r("static/field.js"), _r("static/sync.js")
    assert "계정에는 보내지 못했어요. 이 기기에는 저장돼 있어요." in f and "이 기기에 저장됨 · 계정에 보내는 중…" in f and "이 기기와 내 계정에 저장됐어요." in f
    assert 'const keep = () => { const ok = DJ.saveVisit(slug, v); if (ok) saveMark(); return ok; };' in f   # 저장 성공 뒤에만 표시
    assert "if (!persist()) { set(was); cb.checked = was; }" in f                                          # 실패하면 체크 되돌림(기존)
    assert 'new CustomEvent("dj:sync-state"' in s and "DJ.syncRetry = () => sync(false);" in s
    assert 'role", "status"' in f[f.index("saveEl = el"):f.index("saveEl = el") + 120]


def test_stamp_and_recompare_only_after_saved_visit_and_motion_is_calm():
    f, css = _r("static/field.js"), _r("static/style.css")
    assert "stamp.hidden = again.hidden = !v.d;" in f and "paint(!was);" in f
    assert 'compare.html?a=" + encodeURIComponent(slug)' in f
    assert "animation: fm-pop 380ms" in css and "@media (prefers-reduced-motion: reduce) { .fm-stamp.pop { animation: none; }" in css


def test_visit_draft_survives_leaving_and_is_cleared_after_saving_and_data_layers_untouched():
    v = _r("static/visit-log-ui.js")
    assert 'sessionStorage.getItem(DK)' in v and 'sessionStorage.removeItem(DK)' in v
    for f in ("static/project-store.js", "static/visit-log.js"):
        assert "djdex-vl-draft" not in _r(f)                                  # 데이터 의미를 담은 파일은 그대로
