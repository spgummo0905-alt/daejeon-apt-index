"""UX v2 보조 페이지: 공유 시트 보내는 범위 표시, 산출 방법 첫머리 요약, 홈 신고가 글자 12px."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_every_share_sheet_caller_states_what_is_and_is_not_sent():
    kit = _r("static/sharekit.js")
    assert '$(".ss-scope").textContent = o.scope ? "보내는 내용: " + o.scope : "";' in kit
    for f, must in (("static/compare.js", "내 메모·사진·방문 기록은 보내지 않아요"), ("static/course.js", "내 메모·사진·방문 기록은 보내지 않아요"),
                    ("static/prefs.js", "현장 사진과 날짜별 방문 기록은 보내지 않아요")):
        assert "scope:" in _r(f) and must in _r(f), f


def test_methodology_opens_with_a_summary_that_matches_the_body_wording():
    t = _r("templates/methodology.html")
    assert t.index('class="m-sum"') < t.index('<article class="prose">')
    for s in ("지수에 들어가는 3가지", "참고만 하는 3가지", "미래 가격을 예측하지 않아요", 'href="#m-index"', 'href="#m-ref"', 'href="#m-price"', 'href="#m-limit"'):
        assert s in t, s
    assert "입지 대비 가격 · 거래량 · 신축도" in t and "세 항목(입지·장기 흐름·5년 흐름)" in t.replace("위의 ", "")


def test_home_badge_text_is_not_below_12px_and_legal_pages_are_unchanged():
    css = _r("static/style.css")
    assert "#complex-table .badge-small { margin: 2px 4px 0 0; padding: 0 6px; font-size: 12px;" in css
    import subprocess
    out = subprocess.run(["git", "diff", "--name-only", "origin/main", "--", "templates/privacy.html", "templates/terms.html"], cwd=ROOT, capture_output=True, text=True)
    if out.returncode == 0:
        assert out.stdout.strip() == ""          # 개인정보·약관 법적 내용은 그대로
