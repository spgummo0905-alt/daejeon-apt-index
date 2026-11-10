"""UX v2 PR 10: 카드첩 — 등급·다녀옴 걸러 보기(수집 수와 일치), 등급(지수)과 도장(행동 기록) 구분 안내."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_album_filter_counts_come_from_collected_cards_and_default_to_all():
    js = _r("static/cards.js")
    assert 'let more = null, flt = "all";' in js
    assert "const counts = { all: got.length, been: beenN };" in js
    assert 'GRADES.forEach(g => { counts[g] = got.filter(c => c.g === g).length; });' in js
    assert 'if (flt !== "all" && !counts[flt]) flt = "all";' in js            # 없는 필터에 머물지 않음
    assert 'b.setAttribute("aria-pressed", flt === k ? "true" : "false")' in js
    assert "장 중 ${shownSet.length.toLocaleString()}장 보는 중" in js          # 보이는 수를 글로 알림


def test_grade_vs_stamp_meaning_is_explained_and_nothing_is_faked():
    html, js = _r("templates/cards.html"), _r("static/cards.js")
    assert "등급(S~D)은 단지의 지수로 정해지고" in html and "다녀옴 도장" in html and 'data-album-filter role="group"' in html
    assert 'role="status"' in html[html.index("data-album-shown") - 40:html.index("data-album-shown") + 40]
    assert "all.length" in js and "d.complexes.filter(c => GRADES.includes(c.g))" in js    # 분모는 실제 지역 데이터


def test_collection_data_layers_untouched():
    js = _r("static/cards.js")
    assert "DJ.collect(c.s)" in js and "DJ.album()" in js           # 수집 저장 방식 그대로
    assert "DJ.records.put" not in js                                  # 카드첩 화면은 새 저장을 만들지 않음
