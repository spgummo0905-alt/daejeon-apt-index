"""UX v4.4: 배치도 도면 스타일(planart.js) + 상세 큰 카드 그림을 배치도로. 자료에 없는 값은 그리지 않음."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_planart_is_shared_and_loaded_before_cover_and_cardgen():
    b = R("templates/base.html")
    assert b.index("static/planart.js") < b.index("static/cover.js")
    j = R("static/planart.js")
    for t in ("DJ.planSvg", "DJ.getPlans", "DJ.planBlank", '"N"', "(f - 5) / 45"):
        assert t in j


def test_planart_draws_only_from_plan_data_no_random_or_invented_values():
    j = R("static/planart.js")
    assert not re.search(r"Math\.random|crypto|hash", j)
    assert "건축물 자료가 없어 배치도를 그리지 않았어요" in j                    # 자료 없으면 가짜 건물 대신 안내


def test_detail_card_uses_plan_not_night_building_art():
    g = R("static/cardgen.js")
    assert "DJ.planSvg" in g and "cv.hidden = true" in g and "배치도 · 건축물 자료" in g and "배치도 · 일부 추정" in g
    assert "drawArt(cv, c)" not in g


def test_plan_labels_keep_12px_minimum_and_card_cover_uses_planart():
    c = R("static/style.css")
    seg = c[c.index("UX v4.4 · 배치도 도면 스타일"):]
    assert ".mc-plantag" in seg and "font-size: 12px" in seg
    assert "DJ.planSvg" in R("static/cover.js") and "DJ.getPlans()" in R("static/cover.js")
