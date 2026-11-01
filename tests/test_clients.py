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

    def count(self, lat, lng, category, radius, query=None):
        self.calls += 1
        return 3 if query else 7


def test_enrich_caches(tmp_path):
    factors = [{"key": "subway", "kind": "nearest", "category": "SW8", "radius": 3000},
               {"key": "academy", "kind": "count", "category": "AC5", "radius": 1000},
               {"key": "academy_math", "kind": "count", "category": "AC5", "radius": 1000, "query": "수학"},
               {"key": "hub", "kind": "score", "weight": 0.2}]
    cx = [{"complex_id": "1", "name": "가", "gu": "서구", "dong": "둔산동", "jibun": "1"},
          {"complex_id": "2", "name": "나", "gu": "서구", "dong": "없는동", "jibun": "2"}]
    geo, poi = tmp_path / "geo.json", tmp_path / "poi.json"
    c = FakeKakao()
    kakao.enrich(cx, factors, "대전", geo, poi, c, log=lambda *_: None)
    # 키워드 항목은 그 단어가 들어간 곳만 세고, 점수 항목(hub)은 카카오에 묻지 않습니다.
    assert json.loads(poi.read_text())["1"] == {"subway": 321.0, "academy": 7, "academy_math": 3}
    assert json.loads(geo.read_text())["2"] is None
    first = c.calls
    kakao.enrich(cx, factors, "대전", geo, poi, c, log=lambda *_: None)
    # 두 번째 실행은 찾은 단지는 캐시만 쓰고, 못 찾은 단지(없는동)만 위치를 다시 찾아봅니다.
    assert c.calls == first + 1


def test_all_continues_when_kakao_fails(tmp_path, monkeypatch):
    import requests
    from djdex import cli

    monkeypatch.setenv("KAKAO_REST_KEY", "x")
    calls = []
    monkeypatch.setattr(cli, "cmd_collect", lambda cfg, args: calls.append("collect"))

    def boom(cfg, args):
        raise requests.HTTPError("403 Forbidden")
    monkeypatch.setattr(cli, "cmd_locate", boom)
    monkeypatch.setattr(cli, "cmd_build", lambda cfg, args: calls.append("build"))
    cli.main(["--data", str(tmp_path), "all"])
    assert calls == ["collect", "build"]


def test_enrich_keeps_station_name_and_backfills(tmp_path):
    class NamedKakao(FakeKakao):
        def nearest_place(self, lat, lng, category, radius, name_contains=None):
            self.calls += 1
            return 410.0, "정부청사역 대전1호선"

    factors = [{"key": "subway", "kind": "nearest", "category": "SW8", "radius": 3000, "keep_name": True}]
    cx = [{"complex_id": "1", "name": "가", "gu": "서구", "dong": "둔산동", "jibun": "1"}]
    geo, poi = tmp_path / "geo.json", tmp_path / "poi.json"
    # 예전 캐시: 거리만 있고 이름이 없음 → 한 번 다시 조회해 이름을 채웁니다.
    poi.write_text(json.dumps({"1": {"subway": 400.0}}), encoding="utf-8")
    geo.write_text(json.dumps({"1": [36.35, 127.38]}), encoding="utf-8")
    c = NamedKakao()
    kakao.enrich(cx, factors, "대전", geo, poi, c, log=lambda *_: None)
    assert json.loads(poi.read_text())["1"] == {"subway": 410.0, "subway_name": "정부청사역 대전1호선"}
    n = c.calls
    kakao.enrich(cx, factors, "대전", geo, poi, c, log=lambda *_: None)
    assert c.calls == n


def test_kakao_count_uses_keyword_search_with_query():
    k = kakao.Kakao("x", pause=0)
    seen = []

    def fake_get(path, **params):
        seen.append((path, params.get("query"), params.get("category_group_code")))
        return {"meta": {"total_count": 12}}
    k._get = fake_get
    assert k.count(36.35, 127.38, "AC5", 1000) == 12
    assert k.count(36.35, 127.38, "AC5", 1000, query="수학") == 12
    assert seen == [("category", None, "AC5"), ("keyword", "수학", "AC5")]


def test_clean_name_and_geocode_prefers_apartment():
    assert kakao.clean_name("세종중흥Ｓ클래스　리버뷰２차（Ｍ４블록）") == "세종중흥S클래스 리버뷰2차"
    assert kakao.clean_name("트리풀시티포레(노은3지구 B4블록)") == "트리풀시티포레"
    k = kakao.Kakao("x", pause=0)
    seen = []

    def fake_get(path, **params):
        seen.append(params["query"])
        if path == "address" or "블록" in params["query"]:
            return {"documents": []}
        return {"documents": [{"y": "36.1", "x": "127.1", "category_name": "부동산 > 중개업소"},
                              {"y": "36.5", "x": "127.2", "category_name": "부동산 > 주거시설 > 아파트"}]}
    k._get = fake_get
    assert k.geocode("세종 소담동 BL-M1", ["세종 소담동 리버뷰(M1블록)", "세종 소담동 리버뷰"]) == (36.5, 127.2)
    assert seen == ["세종 소담동 BL-M1", "세종 소담동 리버뷰(M1블록)", "세종 소담동 리버뷰"]


def test_enrich_skips_osm_factor(tmp_path):
    factors = [{"key": "subway", "kind": "nearest", "radius": 3000, "keep_name": True, "osm_route": "^B[0-9]+$"},
               {"key": "academy", "kind": "count", "category": "AC5", "radius": 1000}]
    cx = [{"complex_id": "1", "name": "가", "gu": "", "dong": "도담동", "jibun": "1"}]
    geo, poi = tmp_path / "geo.json", tmp_path / "poi.json"
    kakao.enrich(cx, factors, "세종", geo, poi, FakeKakao(), log=lambda *_: None)
    assert json.loads(poi.read_text())["1"] == {"academy": 7}


def test_school_command_collects_only_school_and_macro(tmp_path, monkeypatch):
    from djdex import cli, ecos, school

    monkeypatch.setenv("SCHOOLINFO_KEY", "x")
    monkeypatch.delenv("ECOS_KEY", raising=False)
    got = []
    monkeypatch.setattr(school, "collect", lambda key, cfg, sggs, out, year: got.append((cfg["sido"], len(sggs), out.name)))
    monkeypatch.setattr(ecos, "fetch", lambda *a: (_ for _ in ()).throw(AssertionError("ECOS 키가 없으면 부르지 않음")))
    monkeypatch.setattr(cli, "cmd_build", lambda cfg, args: (_ for _ in ()).throw(AssertionError("사이트는 만들지 않음")))
    cli.main(["--config", "config.seoul.toml", "--data", str(tmp_path), "school"])
    assert got == [("11", 25, "school")]


def test_slow_puts_supply_area_last_with_time_limits(tmp_path, monkeypatch):
    # 공급면적(건축물대장)이 한도에 걸려 시간을 다 써도 관리비·후기는 먼저 받게
    from djdex import bldg, cli, fee, kapt

    monkeypatch.setenv("DATA_GO_KR_KEY", "x")
    monkeypatch.setenv("KAKAO_REST_KEY", "x")
    (tmp_path / "kapt").mkdir()
    (tmp_path / "trades.csv").write_text("complex_id\n1\n", encoding="utf-8")
    order = []
    monkeypatch.setattr(kapt, "collect", lambda *a, **k: order.append(("kapt", k.get("time_limit"))))
    monkeypatch.setattr(fee, "collect", lambda *a, **k: order.append(("fee", k.get("time_limit"))))
    monkeypatch.setattr(cli, "_outside_reviews", lambda cfg: order.append(("reviews", None)))
    monkeypatch.setattr(bldg, "collect", lambda *a, **k: order.append(("bldg", k.get("time_limit"))))
    cli.main(["--data", str(tmp_path), "slow"])
    assert [n for n, _ in order] == ["fee", "kapt", "reviews", "bldg"]   # 관리비를 단지 정보보다 먼저
    assert sum(t or 0 for _, t in order) < 45 * 60   # 단계별 상한 합이 워크플로 45분 제한 안


def test_slow_catchup_picks_stages_and_raises_limits(tmp_path, monkeypatch):
    # 몰아받기(catchup.yml): 고른 단계만, 평소보다 많은 호출·긴 시간으로. 고르지 않으면 평소 그대로
    from djdex import bldg, cli, fee, kapt

    monkeypatch.setenv("DATA_GO_KR_KEY", "x")
    monkeypatch.setenv("KAKAO_REST_KEY", "x")
    (tmp_path / "kapt").mkdir()
    (tmp_path / "trades.csv").write_text("complex_id\n1\n", encoding="utf-8")
    got = []
    monkeypatch.setattr(kapt, "collect", lambda *a, **k: got.append(("kapt", k.get("time_limit"), None)))
    monkeypatch.setattr(fee, "collect", lambda *a, **k: got.append(("fee", k.get("time_limit"), k.get("budget"))))
    monkeypatch.setattr(cli, "_outside_reviews", lambda cfg: got.append(("reviews", None, None)))
    monkeypatch.setattr(bldg, "collect", lambda *a, **k: got.append(("bldg", k.get("time_limit"), k.get("budget"))))
    cli.main(["--data", str(tmp_path), "slow", "--only", "fee,bldg", "--fee-calls", "4000", "--fee-minutes", "30",
              "--bldg-calls", "7500", "--bldg-minutes", "210"])
    assert got == [("fee", 1800, 4000), ("bldg", 12600, 7500)]
    got.clear()
    cli.main(["--data", str(tmp_path), "slow", "--only", "kapt", "--kapt-minutes", "25"])
    assert got == [("kapt", 1500, None)]
    got.clear()
    cli.main(["--data", str(tmp_path), "slow"])
    assert [g[0] for g in got] == ["fee", "kapt", "reviews", "bldg"] and got[0][1:] == (480, 2400) and got[3][1:] == (900, 4500)
    wf = (cli.config_mod.ROOT / ".github" / "workflows" / "catchup.yml").read_text(encoding="utf-8")
    # 대전을 먼저 마무리하고 서울, 캐시는 배포와 같은 이름 앞부분으로 (다음 배포가 이어 씀), 입력은 환경 변수로만
    assert wf.index("python -m djdex slow --only fee,bldg") < wf.index("config.seoul.toml slow --only fee,bldg")
    for k in ("djdex-rent2-${{ github.run_id }}-catchup", "djdex-bldg2-${{ github.run_id }}-catchup", "djdex-seoul-${{ github.run_id }}-catchup"):
        assert k in wf
    assert "${{ inputs." not in wf.split("run: |")[-1]


def test_catchup_and_deploy_never_overlap():
    # 몰아받기와 배포는 같은 호출 한도·캐시를 쓰므로 같은 concurrency 이름으로 차례를 기다림
    from djdex import config
    wf = config.ROOT / ".github" / "workflows"
    for name in ("build.yml", "catchup.yml"):
        assert "group: data-collect" in (wf / name).read_text(encoding="utf-8"), name
