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
    c = {"name": "열매7단지현대", "dong": "노은동", "gu": "유성구"}
    got = reviews._posts(_Sess(items), "blog", "q", c, 3, "대전")
    assert got == []   # '열매7단'만 맞고 동·구·지역 이름이 없으면 같은 이름의 다른 지역 단지일 수 있음
    items[2]["description"] = "노은동 조용하고 &amp; 주차 넉넉"
    got = reviews._posts(_Sess(items), "blog", "q", c, 3, "대전")
    assert got == [{"t": "열매7단지 3년 살아 보니", "d": "노은동 조용하고 & 주차 넉넉", "u": "u3", "s": "동네 기록", "at": "20260912"}]


def test_naver_posts_keep_only_lived_stories():
    """단지 이름만 들어간 시공·수리 업체, 가게 홍보, 다른 지역 글은 빼고 사는 이야기만 (실제로 걸렸던 글들)."""
    c = {"name": "누리", "dong": "월평동", "gu": "서구"}
    items = [
        {"title": "대전 월평동 주방후드 교체 누리아파트 하츠 후드", "description": "누리아파트 주방 후드 교체 시공했습니다", "link": "a"},
        {"title": "대전변기교체 대전세면대교체 월평동 누리아파트", "description": "욕실 리모델링 문의 주세요", "link": "b"},
        {"title": "잠실에서 비타스틱 파는 곳", "description": "누리 약국 월평동 지점", "link": "c"},
        {"title": "누리아파트 거실 인테리어", "description": "월평동 누리아파트 32평", "link": "d"},
        {"title": "서울 누리아파트 살아보니", "description": "강서구 누리아파트 장단점", "link": "e"},
        {"title": "누리아파트 근처 맛집", "description": "월평동 누리아파트 앞", "link": "f"},
        {"title": "누리아파트 5년 살아 보니", "description": "월평동이라 갑천 산책이 좋고 주차는 조금 빠듯", "link": "g", "bloggername": "갑천 산책"},
        {"title": "월평동 누리아파트 임장 다녀왔어요", "description": "언덕이 조금 있고 초등학교가 가까워요", "link": "h", "bloggername": "주말 임장"},
        {"title": "누리아파트 이사 왔어요", "description": "월평동 첫 집, 층간소음은 아직 없어요", "link": "i", "bloggername": "갑천 산책"},
        {"title": "누리 마을 산책", "description": "누리 공원", "link": "j"},
    ]
    got = reviews._posts(_Sess(items), "blog", "q", c, 5, "대전")
    assert sorted(x["u"] for x in got) == ["g", "h"]   # 같은 블로그(갑천 산책)는 한 글만, 이름이 짧은데 동네가 안 나온 글도 뺌
    # 한 번 받아 둔 글도 화면에 낼 때 다시 거름
    assert reviews._story("대전 월평동 주방후드 교체 누리아파트", "") == 0
    assert reviews._story("누리아파트 5년 살아 보니", "주차는 조금 빠듯") > 0
    assert reviews._story("트리풀시티 9단지", "단지 사진") == 0   # 사는 이야기 낱말이 없음


def test_naver_posts_refetch_after_rule_change(tmp_path, monkeypatch):
    """글 고르는 방법이 바뀌면(NV_VERSION) 일주일이 안 지났어도 다시 받고, 모자라면 '살아보니'로 한 번 더 찾음."""
    path = tmp_path / "reviews.json"
    path.write_text(json.dumps({"A": {"nv_at": "2999-01-01", "posts": [{"t": "옛 글", "u": "x"}]},
                                "B": {"nv_at": "2999-01-01", "nv_v": reviews.NV_VERSION, "posts": []}}))
    queries = []

    class S(_Sess):
        headers = {}

        def get(self, url, params=None, **k):
            queries.append(params["query"])
            return _Resp([{"title": "도안 트리풀시티 9단지 2년 살아 보니", "description": "주차 넉넉", "link": "p" + str(len(queries))}])

    monkeypatch.setattr(reviews.requests, "Session", lambda: S([]))
    monkeypatch.setattr(reviews.time, "sleep", lambda *_: None)
    cx = [{"complex_id": "A", "name": "트리풀시티9단지", "dong": "도안동", "gu": "유성구"},
          {"complex_id": "B", "name": "가람", "dong": "도안동", "gu": "유성구"}]
    reviews.naver_posts(cx, path, "id", "sec", log=lambda *_: None, region="대전")
    assert queries == ["도안동 트리풀시티9단지 아파트 후기", "도안동 트리풀시티9단지 아파트 살아보니"]   # B 는 이미 새 방법으로 받음
    got = json.loads(path.read_text())["A"]
    assert got["nv_v"] == reviews.NV_VERSION and [p["u"] for p in got["posts"]] == ["p1", "p2"]


def test_load_drops_cafe_posts_that_need_login(tmp_path):
    import json
    p = tmp_path / "reviews.json"
    p.write_text(json.dumps({
        "A": {"kp": ["1", "가"], "nv_at": "2026-10-01",
              "posts": [{"t": "카페 글", "u": "https://cafe.naver.com/x/1"}] + [{"t": f"블로그 {i} 살아 보니", "u": f"https://blog.naver.com/a/{i}"} for i in range(7)]},
        "B": {"nv_at": "2026-10-01", "posts": [{"t": "카페만", "u": "https://cafe.naver.com/x/2"}]}}, ensure_ascii=False))
    got = reviews.load(p)
    assert got["A"]["kp"] == ["1", "가"] and [x["t"] for x in got["A"]["posts"]] == [f"블로그 {i} 살아 보니" for i in range(5)]
    assert "B" not in got   # 카페 글만 있던 단지는 보여 줄 글이 없음


def test_kakao_place_stops_at_time_limit(tmp_path, monkeypatch):
    clock = iter([0.0, 0.0, 1000.0, 1000.0])   # 첫 단지는 바로, 둘째 단지 앞에서 시간이 다 됨
    monkeypatch.setattr(reviews.time, "monotonic", lambda: next(clock))
    cl, lines = _Client([]), []
    cx = [{"complex_id": "A", "name": "한빛"}, {"complex_id": "B", "name": "가람"}]
    reviews.kakao_places(cx, {"A": [36.3, 127.4], "B": [36.3, 127.4]}, tmp_path / "r.json", cl, log=lines.append, time_limit=900)
    assert cl.calls == 1 and "다음 실행" in lines[0] and "이번에 1곳 찾아" in lines[-1]
