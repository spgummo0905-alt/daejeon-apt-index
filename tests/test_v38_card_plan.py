"""UX v3.8: 카드 그림 = 건축물 자료로 그린 단지 배치도 (없으면 항공 사진 그대로). 새로 지어낸 값 없음."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_build_writes_plans_from_preview_data_only():
    s = R("djdex/site.py")
    seg = s[s.index("카드 그림용 단지 배치도"):]
    seg = seg[: seg.index("(dst / \"list.json\")")]
    assert 'b.get("k") == "own"' in seg and "plans.json" in seg and "추정 여부" in seg
    assert "random" not in seg and "hash" not in seg           # 값을 만들어 내지 않음


def test_card_photo_slot_carries_slug_and_cover_js_falls_back_to_photo():
    assert 'data-s="{{ c.slug }}"' in R("templates/_card.html")
    assert "photo.dataset.s = c.s;" in R("static/housecard.js")
    j = R("static/cover.js")
    assert 'plans.json' in R("static/planart.js") and "drawPlan" in j and "else photo(box)" in j          # 자료 없으면 항공 사진
    assert "실제 외관은 아니에요" in j and "배치도 · 일부 추정" in j                  # 오해 막는 문구
    assert "DJ.planSvg" in j and "밝을수록 높은 동" in j and "(f - 5) / 45" in R("static/planart.js") and "\"N\"" in R("static/planart.js")                                       # 층수→색 농도, 모든 단지 같은 기준


def test_plan_css_keeps_label_and_hides_label_on_tiny_cards():
    c = R("static/style.css")
    assert ".hc-collect .hc-photo.plan" in c and ".tc .mcw-hc .hc-plantag, .tc .mcw-hc .hc-plannorth { display: none; }" in c
    assert ".hc-collect .hc-photo.plan .hc-pin { display: none; }" in c


def test_existing_aerial_photo_rules_still_present():
    assert 'photo = el("span", "hc-photo")' in R("static/housecard.js") and "tile?lat=" in R("static/cover.js")
