import json
from djdex import cli


def test_demo_builds_site(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert "데모 화면" in index and "데모단지" in index
    pages = list((out / "apt").glob("*.html"))
    assert len(pages) == 61
    assert (out / "methodology.html").exists() and (out / "static" / "style.css").exists()
    # 단지 페이지: 평형별 매매·전세·월세와 거래 표의 전세·월세 탭
    apts = [q.read_text(encoding="utf-8") for q in pages]
    full = [a for a in apts if 'class="quotes"' in a and "전세가율" in a and 'data-trade-kind="w"' in a]
    assert len(full) > len(pages) // 2
    assert 'data-trade-kind="j"' in full[0] and '<tbody data-k="w" hidden>' in full[0]
    # 한눈에 보기: 문장 대신 숫자 타일 (입지·학군 막대, 구 중간 가격 대비 기준선)
    pts = [a for a in apts if 'class="pt-grid"' in a]
    assert len(pts) > len(pages) // 2
    assert sum('<span class="pt-k">입지</span>' in a for a in pts) > len(pts) // 2 and any("<em style=" in a for a in pts)


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
    assert f'<meta property="og:image" content="{base}static/og/daejeon.jpg">' in page
    assert 'property="og:title" content="데모단지 01 · 지수' in page
    assert (out / "static" / "og" / "daejeon.jpg").exists() and (out / "static" / "favicon.svg").exists()
    sitemap = (out / "sitemap.xml").read_text(encoding="utf-8")
    assert sitemap.count("<url>") == 63 + 7  # 단지 비교, 조건으로 찾기, 관심 단지, 역세권, 랭킹, 테마, 인트로 and f"<loc>{base}apt/DEMO-0001.html</loc>" in sitemap
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
    assert ">세종<svg" in index and "동별로 비교하기" in index and "구별" not in index
    assert 'data-gu="데모' in index  # 구 대신 동으로 거르기
    # 지역 고르기: 위쪽은 버튼 하나, 창 안에 권역별 지역 카드 (지금 지역 표시)
    assert 'class="rg-btn"' in index and '<span>아파트 지수</span>' in index
    assert '<p class="rg-grp" data-rg-grp>충청권</p>' in index and 'data-rg-name="세종" aria-current="page"' in index
    assert 'data-rg-name="대전"' in index
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


def test_intro_page_and_first_visit(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    intro = (out / "intro.html").read_text(encoding="utf-8")
    # 실제 자료: 1위 카드, 등급 분포(S~D), 뜨거운 동네, 시작하기
    assert 'class="gcard it-card g-' in intro and "1위" in intro
    grades = intro.split('class="it-grades"')[1].split("</ul>")[0]
    assert grades.count('<span class="grade g-') == 5 and 'class="it-bar"' in intro
    assert 'class="it-hot"' in intro and 'href="index.html">시작하기' in intro
    # 요즘 뜨거운 동네: 지역 이름 없이, 온도 상위 동네를 넘겨 볼 자료와 대장 단지
    assert "요즘 뜨거운 동네는" in intro and "지금 대전에서는" not in intro
    hot = json.loads(intro.split("data-hot-json>")[1].split("</script>")[0])
    assert 1 <= len(hot) <= 5 and all({"d", "j", "t", "h", "n3"} <= set(h) for h in hot)
    assert [h["t"] for h in hot] == sorted((h["t"] for h in hot), reverse=True)
    assert 'localStorage.setItem("dj-intro","1")' in intro and 'class="it-skip"' in intro
    # 첫 화면: 처음 온 사람만 인트로로 (로봇·사이트 안 이동 제외), 모든 화면 아래에 '서비스 소개'
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'location.replace("intro.html")' in index and "yeti" in index
    assert '<a href="intro.html">서비스 소개</a>' in index
    assert 'location.replace' not in (out / "rank.html").read_text(encoding="utf-8")


def test_ieyo_follows_final_consonant():
    from djdex.site import _ieyo
    assert [_ieyo(w) for w in ["가정동", "종로1가", "조치원읍", "을지로2가", "연서면"]] == ["이에요", "예요", "이에요", "예요", "이에요"]


def test_fee_shown_per_m2_and_quotes_below_price(tmp_path):
    from djdex.site import fee_word, man
    assert [fee_word(t) for t in (10, 50, 85)] == ["비싼 편 (상위 10%)", "중간쯤", "저렴한 편 (하위 15%)"]
    assert man(113400) == "11.3만 원" and man(100000) == "10만 원"
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    pages = [p.read_text(encoding="utf-8") for p in (out / "apt").glob("*.html")]
    fee = [h for h in pages if "<dt>관리비</dt>" in h]
    assert fee and all("㎡당" in h and "공용관리비" in h for h in fee)
    html = next(h for h in pages if 'class="quotes"' in h)
    assert html.index('id="price"') < html.index('class="quotes"') < html.index("<h2>입지는 어떤가</h2>")   # 평형별 시세는 시세 아래


def test_fee_rank_needs_enough_complexes_and_range():
    from djdex import site
    assert site.FEE_RANGE[1] <= 4000 and site.RANK_MIN >= 10


def test_today_cards_and_album(tmp_path):
    # 수집 요소: 메인의 '오늘의 카드' 세 장(연 카드는 카드첩으로), 관심 단지 화면의 '내 카드첩'
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'id="today"' in index and "data-today-row" in index and "data-album-count" in index
    assert index.index('id="today"') < index.index('id="my-strip"')   # 이번 달 숫자 바로 아래
    my = (out / "my.html").read_text(encoding="utf-8")
    assert 'id="album"' in my and "내 카드첩" in my and "data-album-areas" in my and "구별로 모은 카드" in my
    assert my.index('id="album"') < my.index('id="favs"')
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.collect = function" in app and "DJ.miniCard = function" in app
    assert app.index("DJ.collect(c.s)") < app.index("DJ.addRecent(c)")   # 처음 쓰는 기기에서 '첫 카드'로 세어지게
    home = (out / "static" / "home.js").read_text(encoding="utf-8")
    assert "todayCards" in home and '"today-" + DJ.sido' in home   # 지역마다 따로 정함
    # 단지 자료(complexes.json)의 단지 코드 앞 두 자리로 지역을 나눔 (대전 30)
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    assert all(len(c["s"]) > 2 for c in data["complexes"])
