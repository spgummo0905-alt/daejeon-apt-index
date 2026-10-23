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


def test_load_drops_cafe_posts_that_need_login(tmp_path):
    import json
    p = tmp_path / "reviews.json"
    p.write_text(json.dumps({
        "A": {"kp": ["1", "가"], "nv_at": "2026-10-01",
              "posts": [{"t": "카페 글", "u": "https://cafe.naver.com/x/1"}] + [{"t": f"블로그 {i}", "u": f"https://blog.naver.com/a/{i}"} for i in range(7)]},
        "B": {"nv_at": "2026-10-01", "posts": [{"t": "카페만", "u": "https://cafe.naver.com/x/2"}]}}, ensure_ascii=False))
    got = reviews.load(p)
    assert got["A"]["kp"] == ["1", "가"] and [x["t"] for x in got["A"]["posts"]] == [f"블로그 {i}" for i in range(5)]
    assert "B" not in got   # 카페 글만 있던 단지는 보여 줄 글이 없음


def test_kakao_place_stops_at_time_limit(tmp_path, monkeypatch):
    clock = iter([0.0, 0.0, 1000.0, 1000.0])   # 첫 단지는 바로, 둘째 단지 앞에서 시간이 다 됨
    monkeypatch.setattr(reviews.time, "monotonic", lambda: next(clock))
    cl, lines = _Client([]), []
    cx = [{"complex_id": "A", "name": "한빛"}, {"complex_id": "B", "name": "가람"}]
    reviews.kakao_places(cx, {"A": [36.3, 127.4], "B": [36.3, 127.4]}, tmp_path / "r.json", cl, log=lines.append, time_limit=900)
    assert cl.calls == 1 and "다음 실행" in lines[0] and "이번에 1곳 찾아" in lines[-1]
