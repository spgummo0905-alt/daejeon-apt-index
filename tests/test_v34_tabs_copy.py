"""UX v3.4: 하단 탭은 어느 화면에서나 켜진 곳이 하나 있고, 어려운/어색한 문구를 쉬운 말로 바꾼다. 값·계산·저장은 그대로."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_every_screen_lights_one_bottom_tab():
    a = _r("static/app.js")
    assert 'const tabbarOf = { rank: "finder", apt: "finder", preview: "finder", intro: "index" }[page] || tabOf;' in a
    # 이미 켜지던 화면(찾기·비교·임장·MY·카드첩·지도·테마·역세권)은 그대로: tabOf 규칙을 건드리지 않음
    assert 'const tabOf = { themes: "finder", stations: "finder", map: "finder", cards: "my" }[page] || page;' in a


def test_plain_words_replace_hard_ones_without_touching_values():
    # v5.3: 같은 뜻의 안내 문장 세 개를 큰 버튼 하나로 줄임(문장은 일부러 지움)
    assert "조건을 고르면 맞는 단지 수가 바뀌어요" not in _r("static/finder.js")
    assert "조건을 고르면 맞는 단지가 바로 보여요" not in _r("static/finder.js")
    assert "하나만 골라도 맞는 단지가 보여요" in _r("static/finder.js")
    assert "개 단지에서 볼 수 있어요" in _r("static/preview.js") and "열려 있어요" not in _r("static/preview.js")
    m = _r("static/map.js")
    assert "지도에 없는 단지" in m and "`위치 미확인" not in m
    assert "점수를 매긴 단지" in _r("templates/intro.html") and "지수 산정 단지" not in _r("templates/intro.html")
    assert "눌러서 단지 보기" not in _r("static/cards.js")   # v5.4: 뒷면(뒤집기) 없앰


def test_no_new_claims_or_numbers_in_new_copy():
    for f in ("static/finder.js", "static/map.js", "static/preview.js", "static/cards.js"):
        s = _r(f)
        for bad in ("수익 보장", "무조건", "추천 1위", "명당", "초품아"):
            assert bad not in s
