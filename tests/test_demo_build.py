from djdex import cli


def test_demo_builds_site(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert "데모 화면" in index and "데모단지" in index
    pages = list((out / "apt").glob("*.html"))
    assert len(pages) == 61
    assert (out / "methodology.html").exists() and (out / "static" / "style.css").exists()


def test_build_handles_missing_build_year_and_floor(tmp_path):
    import pandas as pd
    from djdex import config, metrics, site

    rows = []
    for cid, by in (("A", 2004), ("B", None)):
        for d in ("2026-03-01", "2026-04-01"):
            rows.append({"complex_id": cid, "name": cid, "gu": "서구", "dong": "둔산동", "jibun": "1",
                         "build_year": by, "area": 84.0, "price": 50000, "date": d,
                         "floor": None if cid == "B" else 7, "cancelled": False, "direct": False})
    trades = pd.DataFrame(rows)
    cfg = config.load()
    table, hist, meta = metrics.compute(trades, cfg.metrics, cfg.filters)
    site.build(table, hist, trades, meta, cfg, tmp_path / "s")
    a = (tmp_path / "s" / "apt" / "A.html").read_text(encoding="utf-8")
    b = (tmp_path / "s" / "apt" / "B.html").read_text(encoding="utf-8")
    assert "2004년 준공" in a and "2004.0" not in a and "<td>7</td>" in a
    assert "nan" not in b.lower().replace("nanum", "")


def test_share_tags_and_sitemap(tmp_path):
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    base = "https://spgummo0905-alt.github.io/daejeon-apt-index/"
    page = (out / "apt" / "DEMO-0001.html").read_text(encoding="utf-8")
    assert f'<meta property="og:url" content="{base}apt/DEMO-0001.html">' in page
    assert f'<meta property="og:image" content="{base}static/og.png">' in page
    assert 'property="og:title" content="데모단지 01 · 지수' in page
    assert (out / "static" / "og.png").exists() and (out / "static" / "favicon.svg").exists()
    sitemap = (out / "sitemap.xml").read_text(encoding="utf-8")
    assert sitemap.count("<url>") == 63 + 6  # 단지 비교, 조건으로 찾기, 관심 단지, 역세권, 랭킹, 테마 and f"<loc>{base}apt/DEMO-0001.html</loc>" in sitemap
    assert f"Sitemap: {base}sitemap.xml" in (out / "robots.txt").read_text(encoding="utf-8")
    # 데모 사이트는 검색엔진에 올라가지 않게 합니다.
    assert '<meta name="robots" content="noindex">' in page


def test_complexes_json_and_small_rows(tmp_path):
    import json
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    pts = data["complexes"]
    index = (out / "index.html").read_text(encoding="utf-8")
    n_small = index.count('data-small="1"')
    assert n_small > 0 and len(pts) == 61 - n_small
    assert {"s", "n", "gu", "d", "i", "g", "p", "st", "f", "la", "ln", "dd", "py", "stn", "nw"} <= set(pts[0])
    assert any(c["stn"] and c["stn"].endswith("역") for c in pts)  # '정부청사역 대전1호선' → '정부청사역'
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert '<details class="panel station"' in stations and "역 " in stations
    finder = (out / "finder.html").read_text(encoding="utf-8")
    assert '"workplaces"' in finder and "정부세종청사" in finder
    assert [s["n"] for s in data["stats"]] == ["입지", "성장성", "상승세", "가성비", "거래량", "신축도"]
    assert all(len(c["st"]) == 6 and all(v is None or 0 <= v <= 100 for v in c["st"]) for c in pts)
    assert "dapi.kakao.com" not in index  # 키가 없으면 카카오 지도 스크립트를 넣지 않음
    assert not (out / "quiz.html").exists()
    for page in ("compare", "finder", "my"):
        html = (out / f"{page}.html").read_text(encoding="utf-8")
        assert f"static/{page}.js" in html and "static/app.js" in html


def test_card_save_only_for_ranked(tmp_path):
    import json
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    assert data["asof"] and data["region"] == "대전"
    ranked = {c["s"] for c in data["complexes"]}
    for page in (out / "apt").glob("*.html"):
        html = page.read_text(encoding="utf-8")
        has = 'data-act="save"' in html
        assert has == (page.stem in ranked), page.stem  # 소규모 단지는 카드 데이터가 없어 이미지 저장도 없음
        assert 'class="mc g-' in html and "data-share-sheet" in html  # 메인 카드와 공유 시트는 모든 단지에
        assert "static/cardgen.js" in html


def test_value_list_sorted_by_location(tmp_path):
    import re
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    html = (out / "index.html").read_text(encoding="utf-8")
    assert 'class="value-list"' in html and "value_scatter" not in html and 'aria-label="입지점수와 가격 산점도"' not in html
    section = html[html.index('id="value"'):html.index("</section>", html.index('id="value"'))]
    locs = [int(x) for x in re.findall(r'<span class="vl-label">입지</span>.*?<strong>(\d+)</strong>', section, re.S)]
    assert locs and locs == sorted(locs, reverse=True)


def test_sejong_config_extends_daejeon():
    from djdex import config

    sj = config.load(config.ROOT / "config.sejong.toml")
    dj = config.load()
    assert sj.region_name == "세종" and sj.geo_region == "세종특별자치시"
    assert sj.districts == {"36110": "세종"}  # 대전 구는 섞이지 않음
    assert sj.paths.data.name == "sejong" and dj.paths.data.name == "data"
    assert sj.hub["auto"] and sj.hub["hubs"] == [] and sj.hub["full_min"] == dj.hub["full_min"]  # 나머지는 물려받음
    assert sj.school["sido"] == "36" and sj.school["api_moves"] == dj.school["api_moves"]
    assert [f["key"] for f in sj.location_factors][0] == "subway" and sj.location_factors[0]["osm_route"] == "^B[0-9]+$"
    assert sj.metrics == dj.metrics


def test_sejong_demo_uses_dong_groups_and_brt(tmp_path):
    out = tmp_path / "sejong"
    cli.main(["--config", "config.sejong.toml", "--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert "세종에서" in index and "동별로 비교하기" in index and "구별" not in index
    assert 'data-gu="데모' in index  # 구 대신 동으로 거르기
    assert 'class="region-switch"' in index and 'aria-current="page">세종</a>' in index
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert "BRT 정류장마다" in stations and "지하철" not in stations
    robots = (out / "robots.txt").read_text(encoding="utf-8")
    assert "daejeon-apt-index/sitemap.xml" in robots and "sejong/sitemap.xml" in robots


def test_month_pages_built(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'class="ticker"' in index and 'id="heat-svg"' in index and 'id="leaders"' in index
    assert 'class="dm-hl"' in index and 'data-rank="1"' in index and "data-top=" in index  # 동네 카드 내용, 마우스 올림 표시
    rank = (out / "rank.html").read_text(encoding="utf-8")
    assert rank.count('class="rank-panel"') >= 3 and 'class="podium"' in rank
    themes = (out / "themes.html").read_text(encoding="utf-8")
    assert 'id="t-new"' in themes and "th-score" in themes
    apt = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert "매매" in apt


def test_pages_have_filters_and_index_next_to_name(tmp_path):
    import re
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    heads = re.findall(r"<th data-sort[^>]*>([^<]+)</th>", index[index.index('id="complex-table"'):])
    assert heads[:3] == ["순위", "단지", "지수"]  # 휴대폰에서도 지수가 이름 바로 옆에 보이게
    themes = (out / "themes.html").read_text(encoding="utf-8")
    assert "data-area-filter" in themes and "data-theme-list" in themes and "data-theme-more" in themes
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert 'data-st-sort="d"' in stations and "도보 약" in stations
    apt = next(p for p in (out / "apt").glob("*.html") if "data-trades" in p.read_text(encoding="utf-8"))
    html = apt.read_text(encoding="utf-8")
    assert "종합 지수에 들어가는 항목" in html and "참고 지표" in html
