"""실제 API에 닿지 않고 페이지 넘김과 캐시 로직만 확인합니다."""
import json

from djdex import kakao, molit


def _page(n_items, total):
    items = "".join(f"<item><aptNm>A{i}</aptNm></item>" for i in range(n_items))
    return (f"<response><header><resultCode>000</resultCode></header><body><items>{items}</items>"
            f"<totalCount>{total}</totalCount></body></response>")


class FakeSession:
    def __init__(self, pages):
        self.pages, self.calls = pages, []

    def get(self, url, params, timeout):
        self.calls.append(params["pageNo"])
        text = self.pages[params["pageNo"] - 1]
        return type("R", (), {"text": text, "raise_for_status": lambda self: None})()


def test_fetch_month_paginates():
    s = FakeSession([_page(2, 5), _page(2, 5), _page(1, 5)])
    items = molit.fetch_month("k", "30200", "202601", "http://x", rows=2, session=s)
    assert len(items) == 5 and s.calls == [1, 2, 3]


class FakeKakao:
    def __init__(self):
        self.calls = 0

    def geocode(self, address, keyword=None):
        self.calls += 1
        return None if "없는" in address else (36.35, 127.38)

    def nearest(self, lat, lng, category, radius, name_contains=None):
        self.calls += 1
        return 321.0

    def count(self, lat, lng, category, radius):
        self.calls += 1
        return 7


def test_enrich_caches(tmp_path):
    factors = [{"key": "subway", "kind": "nearest", "category": "SW8", "radius": 3000},
               {"key": "academy", "kind": "count", "category": "AC5", "radius": 1000}]
    cx = [{"complex_id": "1", "name": "가", "gu": "서구", "dong": "둔산동", "jibun": "1"},
          {"complex_id": "2", "name": "나", "gu": "서구", "dong": "없는동", "jibun": "2"}]
    geo, poi = tmp_path / "geo.json", tmp_path / "poi.json"
    c = FakeKakao()
    kakao.enrich(cx, factors, "대전", geo, poi, c, log=lambda *_: None)
    assert json.loads(poi.read_text())["1"] == {"subway": 321.0, "academy": 7}
    assert json.loads(geo.read_text())["2"] is None
    first = c.calls
    kakao.enrich(cx, factors, "대전", geo, poi, c, log=lambda *_: None)
    assert c.calls == first  # 두 번째 실행은 캐시만 사용
