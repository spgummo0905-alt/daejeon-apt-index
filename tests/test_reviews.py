import json

from djdex import reviews


class _Client:
    def __init__(self, docs):
        self.docs, self.calls = docs, 0

    def _get(self, path, **params):
        self.calls += 1
        return {"documents": self.docs}


def test_kakao_place_prefers_similar_apartment(tmp_path):
    docs = [{"id": "1", "place_name": "열매마을7단지 상가", "category_name": "부동산 > 상가", "distance": "20"},
            {"id": "2", "place_name": "한빛아파트", "category_name": "부동산 > 주거시설 > 아파트", "distance": "90"},
            {"id": "3", "place_name": "열매마을7단지현대아파트", "category_name": "부동산 > 주거시설 > 아파트", "distance": "120"}]
    path = tmp_path / "reviews.json"
    cx = [{"complex_id": "A", "name": "열매7단지현대"}, {"complex_id": "B", "name": "없는단지"}]
    cl = _Client(docs)
    reviews.kakao_places(cx, {"A": [36.3, 127.4]}, path, cl, log=lambda *_: None)
    assert reviews.load(path) == {"A": {"kp": ["3", "열매마을7단지현대아파트"]}}   # 좌표 없는 단지는 건너뜀
    reviews.kakao_places(cx, {"A": [36.3, 127.4]}, path, cl, log=lambda *_: None)
    assert cl.calls == 1   # 이미 이은 단지는 다시 찾지 않음


class _Resp:
    def __init__(self, items):
        self.items = items

    def raise_for_status(self):
        pass

    def json(self):
        return {"items": self.items}


class _Sess:
    def __init__(self, items):
        self.items = items

    def get(self, *a, **k):
        return _Resp(self.items)


def test_naver_posts_skip_listings_and_other_complexes():
    items = [{"title": "<b>열매7단지현대</b> 급매 나왔어요", "description": "중개사무소", "link": "u1"},
             {"title": "둔산 크로바 후기", "description": "다른 단지", "link": "u2"},
             {"title": "<b>열매7단지</b> 3년 살아 보니", "description": "조용하고 &amp; 주차 넉넉", "link": "u3",
              "bloggername": "동네 기록", "postdate": "20260912"}]
    got = reviews._posts(_Sess(items), "blog", "q", "열매7단지현대")
    assert got == [{"t": "열매7단지 3년 살아 보니", "d": "조용하고 & 주차 넉넉", "u": "u3", "s": "동네 기록", "at": "20260912"}]
