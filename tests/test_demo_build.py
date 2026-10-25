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
    assert sitemap.count("<url>") == 63 + 8  # 단지 비교, 조건으로 찾기, 관심 단지, 카드첩, 역세권, 랭킹, 테마, 인트로 and f"<loc>{base}apt/DEMO-0001.html</loc>" in sitemap
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
    assert 'sessionStorage.setItem("dj-intro","1")' in intro and 'it-skip' not in intro and '건너뛰기' not in intro
    # 첫 화면: 들어올 때마다 인트로로 (같은 창에서 이미 봤거나 로봇·사이트 안 이동 제외), 모든 화면 아래에 '서비스 소개'
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'location.replace("intro.html")' in index and "yeti" in index and 'sessionStorage.getItem("dj-intro")' in index
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


def test_cards_page_today_badges_album(tmp_path):
    # 수집 요소는 메인이 아니라 따로 '카드첩' 화면에: 오늘의 임장 후보 세 장, 임장 배지, 내 카드첩
    import re
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'id="today"' not in index and "cards.html" in index   # 메인엔 없고 메뉴에만
    cards = (out / "cards.html").read_text(encoding="utf-8")
    for sec in ('id="today"', 'id="badges"', 'id="album"', "오늘의 임장 후보", "임장 배지", "내 카드첩", "static/cards.js"):
        assert sec in cards, sec
    assert cards.index('id="today"') < cards.index('id="badges"') < cards.index('id="album"')
    my = (out / "my.html").read_text(encoding="utf-8")
    assert 'id="album"' not in my and 'class="to-cards" href="cards.html"' in my   # 관심 단지 화면은 카드첩으로 가는 카드만
    assert my.index('class="to-cards"') < my.index('id="favs"')
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.collect = function" in app and "DJ.miniCard = function" in app and "DJ.memo = function" in app
    assert app.index("DJ.collect(c.s)") < app.index("DJ.addRecent(c)")   # 처음 쓰는 기기에서 '첫 카드'로 세어지게
    # 배지마다 '어떻게 받나요'와 '임장에 왜 필요할까요'가 있어야 함 (재미만 있는 배지는 두지 않음)
    block = app[app.index("DJ.BADGES = ["):app.index("DJ.badgeState")]
    ids = re.findall(r'\{ id: "(\w+)"', block)
    assert len(ids) == len(set(ids)) == 14
    assert block.count("how: ") == block.count("why: ") == block.count("tip: ") == 14
    cjs = (out / "static" / "cards.js").read_text(encoding="utf-8")
    assert "pickToday" in cjs and '"picks-" + DJ.sido' in cjs   # 지역마다 따로 정함
    for k in ("비교 후보", "흐름 확인", "가성비 후보"):
        assert k in cjs
    # 실거래·전세·입지 지도·비교·조건 찾기에서 한 일을 배지로 셈
    assert 'DJ.act("trade")' in app and 'DJ.act("jeonse")' in app
    assert 'DJ.act("loc")' in (out / "static" / "aptmap.js").read_text(encoding="utf-8")
    assert 'DJ.act("cmp")' in (out / "static" / "compare.js").read_text(encoding="utf-8")
    assert 'DJ.act("find")' in (out / "static" / "finder.js").read_text(encoding="utf-8")
    assert 'data-high="' in (next((out / "apt").glob("*.html"))).read_text(encoding="utf-8")


def test_apt_jump_tabs_and_floor_section(tmp_path):
    # 단지 페이지: 바로가기 탭(스크롤 따라 붙음)과 층별 시세(입체 건물, floors.js)
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = next(p for p in (out / "apt").glob("*.html") if 'data-floors' in p.read_text(encoding="utf-8")).read_text(encoding="utf-8")
    nav = page[page.index('<nav class="jump apt-jump"'):page.index("</nav>", page.index('<nav class="jump apt-jump"'))]
    for href in ("#price", "#floors", "#loc", "#reviews", "#trades"):
        assert f'href="{href}"' in nav, href
    for sec in ('id="price"', 'id="floors"', 'id="loc"', 'id="reviews"', 'id="trades"'):
        assert sec in page, sec
    # 순서: 시세 → 평형별 → 층별 → 입지
    assert page.index('id="price"') < page.index('id="floors"') < page.index('id="loc"')
    assert "static/floors.js" in page and 'data-src="d/' in page
    js = (out / "static" / "floors.js").read_text(encoding="utf-8")
    assert "임장 팁" in js and "YEARS = 5" in js


def test_home_map_price_filters(tmp_path, monkeypatch):
    # 메인 지도: 핀 값(84㎡ 가격·지수·전세가율)과 가격대·조건 거르기 (카카오맵이 뜰 때만 보임)
    monkeypatch.setenv("KAKAO_JS_KEY", "test-key")
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'id="kmap-ctl" hidden' in index and 'data-km-show="p"' in index and "data-km-price" in index
    for f in ("new", "big", "stn", "hi"):
        assert f'data-km-flag="{f}"' in index
    js = (out / "static" / "kmap.js").read_text(encoding="utf-8")
    assert "function filters(items, clusterer)" in js and 'DJ.load("kmap"' in js


def test_imjang_course_on_my_page(tmp_path):
    # 관심 단지 화면의 임장 코스: 가장 짧은 방문 순서, 구간 거리·시간과 카카오맵 길찾기, 현장 체크리스트·메모
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    my = (out / "my.html").read_text(encoding="utf-8")
    assert 'id="course"' in my and "data-cs-add" in my and 'data-cs-mode="walk"' in my and "static/course.js" in my
    assert my.index('id="favs"') < my.index('id="course"') < my.index('id="recent"')
    js = (out / "static" / "course.js").read_text(encoding="utf-8")
    assert "map.kakao.com/link/from/" in js and "map.kakao.com/link/to/" in js
    assert "function order()" in js and "MAX = 8" in js and "DJ.visit(c.s)" in js
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.CHECK = [" in app and app.count('",\n') >= 8 and "DJ.visitItems(c" in js   # 현장 체크리스트 (현장 모드와 같이 씀)


def test_search_by_dong_station_and_condition(tmp_path):
    # 한 칸 검색: 단지·동·역 이름과 '7억 이하 30평대' 같은 조건. 위쪽 검색 버튼은 모든 화면에
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    for page in ("index.html", "rank.html", "my.html", "stations.html"):
        html = (out / page).read_text(encoding="utf-8")
        assert 'data-hs-open' in html and 'id="hs-pop"' in html, page
    js = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.parseCond" in js and "DJ.condHref" in js and '"stations.html?st="' in js and '"index.html?area="' in js
    assert "{ grouped: true }" in js   # 단지 페이지로 가는 검색창만 묶음 결과 (비교·임장 코스는 단지만)
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert "data-st-name=" in stations
    table = (out / "static" / "table.js").read_text(encoding="utf-8")
    assert 'qs.get("area")' in table and 'qs.get("dong")' in table
    finder = (out / "static" / "finder.js").read_text(encoding="utf-8")
    assert "function fromUrl()" in finder and '"budget", "py", "gu"' in finder
    # 아무 조건도 안 고른 처음에는 '결과'가 아니라 전체 단지 수와 안내만
    assert "const narrowed = ()" in finder and "data-sv-wait" in (out / "finder.html").read_text(encoding="utf-8")
    import json
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    assert all(c.get("sm", 1) == 1 for c in data["complexes"])


def test_home_price_gap_pairs(tmp_path):
    # 메인 지도 아래 '가까운데 값이 크게 다른 곳' (3D 시세는 뺐음): 600m 안 1.4배 넘는 두 단지, 차이 단서, 지도에서 잇기
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    html = (out / "index.html").read_text(encoding="utf-8")
    assert "data-cliffs" in html and "static/cliffs.js" in html and "가까운데 값이 크게 다른 곳" in html
    assert html.index('id="kmap"') < html.index("data-cliffs")
    assert "m3d" not in html and "deck.gl" not in html and not (out / "static" / "m3d.js").exists()
    js = (out / "static" / "cliffs.js").read_text(encoding="utf-8")
    assert "function cliffs(" in js and "function clues(" in js and "DJ.kmap.focusPair" in js
    assert "focusPair" in (out / "static" / "kmap.js").read_text(encoding="utf-8")

def test_hill_check_on_apt_page_and_data(tmp_path):
    # 언덕 체크: 주변 고저차 구간, 역과 높이 비교, 역 → 단지 단면. 카드 메모·조건으로 찾기에도
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    pages = [p.read_text(encoding="utf-8") for p in (out / "apt").glob("*.html")]
    with_hill = [h for h in pages if 'id="hill"' in h]
    assert with_hill and len(with_hill) < len(pages)   # 자료가 없는 단지는 칸을 그리지 않음
    assert any('class="hl-svg"' in h for h in with_hill) and any("hl-svg" not in h for h in with_hill)
    assert all("위성 지형 자료" in h for h in with_hill)
    assert {c for h in with_hill for c in ("평지에 가까워요", "완만한 비탈이 있어요", "언덕 지형이에요") if c in h} >= {"평지에 가까워요", "언덕 지형이에요"}
    h = with_hill[0]
    assert h.index('id="loc"') < h.index('id="hill"') < h.index('id="reviews"')
    import json
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    assert any("hl" in c for c in data["complexes"]) and any("hl" not in c for c in data["complexes"])
    assert '{ id: "flat"' in (out / "static" / "finder.js").read_text(encoding="utf-8")
    assert '["언덕"' in (out / "static" / "app.js").read_text(encoding="utf-8")


def test_watchlist_news(tmp_path):
    """관심 단지 새 소식: 단지마다 거래 수·최근 거래 면적을 싣고, 단지·관심·메인 화면이 지난번 확인한 때와 견줌."""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    traded = [c for c in data["complexes"] if c.get("ld")]
    assert traded and all(isinstance(c["tc"], int) and c["tc"] > 0 and c["lr"] for c in traded)
    page = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert 'data-tc="' in page and "data-watch-news" in page
    assert "data-news-list" in (out / "my.html").read_text(encoding="utf-8")
    assert "data-strip-news" in (out / "index.html").read_text(encoding="utf-8")
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.watchSync = function" in app and "DJ.news = function" in app


def test_field_mode_and_notes(tmp_path):
    """현장 모드: 단지 페이지 바로가기 줄의 버튼과 시트, 이 단지 자료로 짚는 체크리스트·호가·메모, 관심 화면의 임장 노트."""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert 'class="jump-field" data-field' in page and 'id="field-sheet"' in page and "static/field.js" in page
    assert page.index("jump-field") < page.index('href="#price"')   # 바로가기 줄 맨 앞
    js = (out / "static" / "field.js").read_text(encoding="utf-8")
    assert "getCurrentPosition" in js and "map.kakao.com/link/to/" in js and "시세보다" in js and "DJ.visitItems(c" in js
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert all(k in app for k in ('"hill-st"', '"park"', '"fee"', '"old"', '"high"'))
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    assert any("pq" in c for c in data["complexes"])
    my = (out / "my.html").read_text(encoding="utf-8")
    assert "data-notes-list" in my and my.index('id="course"') < my.index('id="notes"') < my.index('id="recent"')


def test_same_budget_alternatives(tmp_path):
    """같은 값으로 가까이에 있는 단지: 84㎡ ±10%·3km(모자라면 5km) 안 세 곳, 다른 점, 임장 코스에 더하기·나란히 비교."""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert "data-alts=" in page and "static/alts.js" in page
    assert page.index('id="loc"') < page.index('id="alts"') < page.index('id="reviews"')
    js = (out / "static" / "alts.js").read_text(encoding="utf-8")
    assert "<= 0.1" in js and "x.k <= 3" in js and "x.k <= 5" in js and "DJ.addToCourse([slug, c.s])" in js and "compare.html?s=" in js
    assert "DJ.addToCourse = function" in (out / "static" / "app.js").read_text(encoding="utf-8")


def test_kakao_login_only_with_keys_and_privacy_contact(tmp_path, monkeypatch):
    # 카카오 로그인(기록 이어 보기): 저장소 주소·공개 키와 처리방침 책임자·연락처가 모두 있을 때만 넣음
    from djdex import config
    out = tmp_path / "site"
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co/rest/v1/")   # Data API 화면 주소를 넣어도 주소만 씀
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])   # 책임자·연락처가 비어 있음
    my = (out / "my.html").read_text(encoding="utf-8")
    assert "sync.js" not in my and 'id="account"' not in my and not (out / "privacy.html").exists()

    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26",
        "provider": "custom:kakao"}))
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    my = (out / "my.html").read_text(encoding="utf-8")
    assert 'window.DJ_SB = {"key": "sb_publishable_test", "provider": "custom:kakao", "url": "https://demo.supabase.co"}' in my
    assert my.index("static/app.js") < my.index("static/sync.js") < my.index("static/my.js")
    assert 'id="account"' in my and "data-login" in my and "data-delete" in my and "data-logout-wipe" in my
    assert my.index('id="account"') < my.index('id="favs"')
    index = (out / "index.html").read_text(encoding="utf-8")
    assert "data-acct" in index and 'href="privacy.html"><b>개인정보처리방침</b>' in index
    assert "(skip|code|error)" in index   # 카카오에서 돌아올 때 인트로로 보내지 않음
    privacy = (out / "privacy.html").read_text(encoding="utf-8")
    for s in ("Supabase, Inc.", "일본(도쿄)", "help@example.com", "운영자", "2026-10-26", "만 14세 미만", "118"):
        assert s in privacy
    js = (out / "static" / "sync.js").read_text(encoding="utf-8")
    assert "grant_type=pkce" in js and "code_challenge_method=s256" in js and "/rest/v1/rpc/sync_put" in js
    assert 'provider=${encodeURIComponent(C.provider || "kakao")}' in js
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert 'DJ.LOCAL_ONLY = ["kmap", "seed", "watchN"]' in app and 'localStorage.setItem("djdex-t"' in app
    sql = (config.ROOT / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    assert "enable row level security" in sql and "security definer" in sql and "where public.user_kv.t < excluded.t" in sql
    assert "revoke all on public.user_kv from anon, authenticated" in sql
