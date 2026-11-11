"""UX v4.5: 수집 카드는 항공 사진 그대로(배치도 접음). v3.8 의 배치도 코드가 남아 있지 않음을 확인."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_collect_card_uses_aerial_photo_only_no_plan_code_left():
    j = R("static/cover.js")
    assert "tile?lat=" in j and "photo(box)" in j
    for dead in ("plans.json", "drawPlan", "getPlans", "hc-plantag", "hc-plannorth"):
        assert dead not in j
    css = R("static/style.css")
    assert ".hc-collect .hc-plantag" not in css and ".hc-collect .hc-plannorth" not in css and ".hc-photo.plan" not in css
    assert "plans.json" not in R("djdex/site.py")
    assert 'photo = el("span", "hc-photo")' in R("static/housecard.js")
