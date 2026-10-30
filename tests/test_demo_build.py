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
    small = json.loads((out / "small.json").read_text(encoding="utf-8"))["complexes"]
    n_small = len(small)
    assert n_small > 0 and len(pts) == 61 - n_small and all(c["sm"] == 1 and c["sr"] for c in small)
    assert {"s", "n", "gu", "d", "i", "g", "p", "st", "f", "la", "ln", "dd", "py", "stn", "nw"} <= set(pts[0])
    assert any(c["stn"] and c["stn"].endswith("역") for c in pts)  # '정부청사역 대전1호선' → '정부청사역'
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert '<details class="panel station"' in stations and "역 " in stations
    finder = (out / "finder.html").read_text(encoding="utf-8")
    assert '"workplaces"' in finder and "정부세종청사" in finder
    assert [s["n"] for s in data["stats"]] == ["입지", "장기 흐름", "5년 흐름", "입지 대비 가격", "거래량", "신축도"]
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
    assert ">세종<svg" in index and "동별 비교" in index and "구별" not in index
    assert 'data-gu="데모' in index  # 구 대신 동으로 거르기
    # 지역 고르기: 위쪽은 버튼 하나, 창 안에 권역별 지역 카드 (지금 지역 표시)
    assert 'class="rg-btn"' in index and '<span>아파트 지수</span>' in index
    assert '<p class="rg-grp" data-rg-grp>충청권</p>' in index and 'data-rg-name="세종" aria-current="page"' in index
    assert 'data-rg-name="대전"' in index
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert "BRT 정류장 주변" in stations and "지하철" not in stations
    robots = (out / "robots.txt").read_text(encoding="utf-8")
    assert "daejeon-apt-index/sitemap.xml" in robots and "sejong/sitemap.xml" in robots


def test_month_pages_built(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'class="ticker"' in index and 'id="heat-svg"' in index and 'data-gu-panel="top"' in index
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
    assert 'data-st-sort="d"' in stations and "직선 " in stations
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
    assert 'class="it-hot"' in intro and 'href="index.html">아파트 찾아보기' in intro
    # 요즘 뜨거운 동네: 지역 이름 없이, 온도 상위 동네를 넘겨 볼 자료와 대장 단지
    assert "최근 거래 흐름이 강한 동네" in intro and "지금 대전에서는" not in intro
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
    assert html.index('id="price"') < html.index('class="quotes"') < html.index("<h2>교통·학군·생활 입지</h2>")   # 평형별 시세는 시세 아래


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
    for sec in ('id="today"', 'id="badges"', 'id="album"', "오늘의 비교 후보", "임장 배지", "살펴본 아파트 카드", "static/cards.js"):
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
    assert "data-cliffs" in html and "static/cliffs.js" in html and "가까운 동네, 다른 아파트 가격" in html
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
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])   # 저장소 주소가 없음
    my = (out / "my.html").read_text(encoding="utf-8")
    assert "sync.js" not in my and 'id="account"' not in my and not (out / "privacy.html").exists()
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co/rest/v1/")   # Data API 화면 주소를 넣어도 주소만 씀
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {"owner": "", "email": ""}))
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
    assert 'id="account"' in my and "data-login" in my and 'href="me.html"' in my
    assert my.index('id="account"') < my.index('id="favs"')
    index = (out / "index.html").read_text(encoding="utf-8")
    assert "data-acct" in index and 'href="privacy.html"><b>개인정보처리방침</b>' in index
    assert "(skip|code|error|stay)" in index   # 카카오에서 돌아올 때 인트로로 보내지 않음
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


def test_personal_records_open_after_login(tmp_path, monkeypatch):
    # 로그인을 켠 사이트: 관심 단지·임장 코스·임장 노트·카드첩은 계정 기록이라 로그인해야 열림 (어느 기기에서든 같은 기록)
    from djdex import config
    out = tmp_path / "site"
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])   # 로그인을 안 켬: 예전처럼 이 기기에
    for page in ("my.html", "cards.html"):
        assert "me-gate" not in (out / page).read_text(encoding="utf-8")
    assert "nav-lock" not in (out / "index.html").read_text(encoding="utf-8")
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {"owner": "운영자", "email": "help@example.com"}))
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    for page, title, inner in (("my.html", "관심 단지는 로그인하면 열려요", 'id="favs"'), ("cards.html", "카드첩은 로그인하면 열려요", "data-album-cards")):
        html = (out / page).read_text(encoding="utf-8")
        gate = html.index('class="me-gate" data-when-out')
        assert title in html and "data-login" in html[gate:]
        assert gate < html.index("<div data-when-in hidden>") < html.index(inner)
    index = (out / "index.html").read_text(encoding="utf-8")
    assert index.count('class="nav-lock" data-when-out') == 3 and 'id="i-lock"' in index
    assert "data-pop-why" in index and "로그인하지 않아도 단지 정보·관심 단지" not in index
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.locked = () => !!(DJ.sync && !DJ.sync.user)" in app
    assert 'DJ.favs = () => DJ.locked() ? [] : load("favs", [])' in app
    assert 'if (DJ.askLogin("관심 단지")) return DJ.isFav(s);' in app and 'if (DJ.askLogin("임장 코스")) return;' in app
    assert 'DJ.askLogin("현장 모드")' in (out / "static" / "field.js").read_text(encoding="utf-8")
    assert 'DJ.askLogin("임장 코스")' in (out / "static" / "alts.js").read_text(encoding="utf-8")
    assert "DJ.loginPrompt = what =>" in (out / "static" / "sync.js").read_text(encoding="utf-8")


def test_account_menu_everywhere_and_intro_tools(tmp_path, monkeypatch):
    # 어느 화면에서든(인트로 포함) 위쪽 계정 버튼 → 작은 창에서 바로 카카오 로그인.
    # 인트로 '04 · 임장 도구': 가기 전 → 현장에서 → 다녀와서. 로그인이 필요한 도구는 로그인을 켰을 때만 소개
    from djdex import config
    out = tmp_path / "site"
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    intro = (out / "intro.html").read_text(encoding="utf-8")
    assert "04 · 임장 도구" in intro and "05 · 동네 온도" in intro and "#field" in intro and "my.html#course" in intro and "#alts" in intro
    assert "acct-pop" not in intro and "현장 사진" not in intro and "가족과 함께 보기" not in intro and "data-login" not in intro

    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26"}))
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    intro = (out / "intro.html").read_text(encoding="utf-8")
    for s in ('id="acct-pop"', 'aria-controls="acct-pop"', "현장 사진", "가족과 함께 보기", 'class="it-login"', "data-when-in", "data-user-name"):
        assert s in intro
    assert intro.count("data-login") == 2   # 위쪽 창과 인트로 로그인 줄
    apt = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert 'id="acct-pop"' in apt and 'href="../me.html#prefs"' in apt and 'href="../me.html"' in apt and 'href="../privacy.html"' in apt
    assert 'id="my-favs"' in (out / "my.html").read_text(encoding="utf-8")
    css = (out / "static" / "style.css").read_text(encoding="utf-8")
    assert 'body[data-page="intro"] .acct-btn { display: none; }' not in css
    js = (out / "static" / "sync.js").read_text(encoding="utf-8")
    assert "function menu()" in js and "[data-when-out]" in js


def test_my_info_page_only_for_logged_in(tmp_path, monkeypatch):
    # 내 정보(me.html): 로그인을 켰을 때만 만들고, 로그인한 사람에게만 내용을 보여 줌 (전엔 로그인 안내만).
    # 설정·가족과 함께 보기·계정 관리는 관심 화면에서 내 정보로 옮김. 로그인을 켜지 않은 사이트는 관심 화면에 설정 그대로
    from djdex import config
    out = tmp_path / "site"
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    assert not (out / "me.html").exists() and 'id="prefs"' in (out / "my.html").read_text(encoding="utf-8")

    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26"}))
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    me = (out / "me.html").read_text(encoding="utf-8")
    assert '<meta name="robots" content="noindex">' in me and "me.html" not in (out / "sitemap.xml").read_text(encoding="utf-8")
    assert me.index('class="me-gate" data-when-out') < me.index('class="me" data-when-in hidden')
    gated = me[me.index('class="me" data-when-in hidden'):]
    for s in ("data-me-prog", 'id="share"', "data-share-actions", 'id="prefs"', 'data-pf="dp"', "data-pf-checks", "data-pf-backup",
              "data-pf-restore", "data-sync-now", "data-logout-wipe", "data-delete", "help@example.com"):
        assert s in gated, s
    assert "static/prefs.js" in me and "static/me.js" in me
    my = (out / "my.html").read_text(encoding="utf-8")
    assert 'id="prefs"' not in my and "data-share" not in my and "data-delete" not in my and 'href="me.html"' in my
    assert "data-nt-csv" in my   # 임장 노트 내보내기는 관심 화면에
    js = (out / "static" / "me.js").read_text(encoding="utf-8")
    assert "아직 안 가 본 관심 단지" in js and 'DJ.save("course"' in js
    sync = (out / "static" / "sync.js").read_text(encoding="utf-8")
    assert '["my", "cards", "me"]' in sync and "[data-sync-now]" in sync
    assert "로그인하지 않아도 모든 기능" not in (out / "privacy.html").read_text(encoding="utf-8")


def test_course_share_link_and_print_sheet(tmp_path):
    # 임장 코스 공유: 단지 하나가 아니라 같은 코스를 여는 받은 코스 화면 링크(course.html?c=…&m=…)와 순서를 글로.
    # 인쇄·PDF: 화면 대신 들고 나갈 종이(요약·지도·체크리스트·메모 칸)만, 휴대폰은 인쇄 뒤에 치우지 않음, 앱 안 브라우저는 안내
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    course = (out / "static" / "course.js").read_text(encoding="utf-8")
    assert 'course.html?c=${stops.map(c => encodeURIComponent(c.s)).join(",")}&m=${cur().mode}' in course
    assert 'q.get("c") || q.get("course")' in course and "내 코스로 저장" in course and 'if (!got) DJ.save("course", state)' in course
    assert "DJ.printSheet(sheet())" in course and "window.print" not in course
    assert "state.auto = true" in course   # 빈 코스가 저장돼 있어도 관심 단지를 따라감
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.printSheet = function" in app and "KAKAOTALK" in app and '"(pointer: coarse)"' in app
    prefs = (out / "static" / "prefs.js").read_text(encoding="utf-8")
    assert "DJ.printSheet(sheet)" in prefs and "window.print" not in prefs
    css = (out / "static" / "style.css").read_text(encoding="utf-8")
    assert "body.printing > :not(.print-sheet)" in css and ".cs-p-checks" in css and "print-course" not in css


def test_share_sheet_art_and_recipient_landings(tmp_path, monkeypatch):
    # 공유 경험: 코스·비교·함께 보기는 받는 사람에게 보일 카톡 메시지(그림 카드·단추 두 개)를 미리 보여 주는 공유 시트로.
    # 받는 사람: 받은 코스 화면(course.html), 공유받은 단지 카드·비교엔 from=share 안내, 함께 보기 아래엔 시작하기.
    # 링크 미리보기 그림은 종류마다 (og/course·compare·family.jpg)
    from djdex import config
    monkeypatch.setenv("KAKAO_JS_KEY", "jskey")
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26"}))
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    kit = (out / "static" / "sharekit.js").read_text(encoding="utf-8")
    for s in ("DJ.shareSheet = function", "DJ.shareArt = { course: courseArt, compare: compareArt, family: familyArt }",
              "Kakao.Share.uploadImage", '{ title: "나도 써 보기", link: home }', "받는 사람에게는 이렇게 보여요"):
        assert s in kit, s
    for page, js in (("my.html", "static/sharekit.js"), ("compare.html", "static/sharekit.js"), ("me.html", "static/sharekit.js"),
                     ("course.html", "static/course.js")):
        assert js in (out / page).read_text(encoding="utf-8"), page
    assert 'data-kakao="jskey"' in (out / "compare.html").read_text(encoding="utf-8")
    assert "DJ.shareArt.course(" in (out / "static" / "course.js").read_text(encoding="utf-8")
    assert "DJ.shareArt.compare(" in (out / "static" / "compare.js").read_text(encoding="utf-8")
    assert "DJ.shareArt.family(" in (out / "static" / "prefs.js").read_text(encoding="utf-8")
    course = (out / "course.html").read_text(encoding="utf-8")
    assert '<meta name="robots" content="noindex">' in course and "data-rc-title" in course and 'id="course"' in course
    assert "static/og/course.jpg" in course and "임장 코스를 받았어요" in course
    assert "course.html" not in (out / "sitemap.xml").read_text(encoding="utf-8")
    assert "static/og/compare.jpg" in (out / "compare.html").read_text(encoding="utf-8")
    share = (out / "share.html").read_text(encoding="utf-8")
    assert "static/og/family.jpg" in share and "sh-about" in share
    for k in ("course", "compare", "family"):
        assert (out / "static" / "og" / f"{k}.jpg").stat().st_size > 20000
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert 'FROM !== "share"' in app and "공유받은 단지 카드예요" in app
    card = (out / "static" / "cardgen.js").read_text(encoding="utf-8")
    assert 'u.searchParams.set("from", "share")' in card and '{ title: "우리 단지 찾기", link: home }' in card


def test_convenience_course_everywhere_and_shortcuts(tmp_path):
    # 편의: 현장 모드에서 코스 이전·다음 단지로 바로(같은 순서 DJ.courseOrder), 단지 페이지 '임장 코스에 넣기',
    # 관심 화면 바로가기·휴대폰에선 관심 단지 옆으로 넘기기, 첫 화면 '이어서'
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    for s in ("DJ.courseOrder = function", "DJ.courseStops = function", "DJ.removeFromCourse = function", "function courseButton()", "function resume()"):
        assert s in app, s
    course = (out / "static" / "course.js").read_text(encoding="utf-8")
    assert "DJ.courseOrder(cur().list.map(s => D.bySlug[s]))" in course
    field = (out / "static" / "field.js").read_text(encoding="utf-8")
    assert "function course(c, d)" in field and "임장 코스 ${k + 1}/${stops.length}" in field and '"다음 단지 →"' in field
    apt = next(p for p in (out / "apt").glob("*.html") if "data-course-add" in p.read_text(encoding="utf-8")).read_text(encoding="utf-8")
    assert 'aria-label="임장 코스에 넣기"' in apt
    my = (out / "my.html").read_text(encoding="utf-8")
    assert "data-my-jump" in my and 'href="#course"' in my and 'id="recent-sec"' in my
    assert "fav-rail" in (out / "static" / "my.js").read_text(encoding="utf-8")
    assert "data-resume" in (out / "index.html").read_text(encoding="utf-8")


def test_compare_fill_finder_fav_and_card_flip_target(tmp_path):
    # 비교에 관심 단지 한 번에, 조건으로 찾기 결과 카드에서 바로 관심 단지 담기, 카드첩 뒤집기 단추는 누르는 자리를 넓게
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    assert "qa-fill" in (out / "static" / "compare.js").read_text(encoding="utf-8")
    assert "DJ.card(c, STATS, { fav: true })" in (out / "static" / "finder.js").read_text(encoding="utf-8")
    assert "if (opts.fav)" in (out / "static" / "app.js").read_text(encoding="utf-8")
    css = (out / "static" / "style.css").read_text(encoding="utf-8")
    assert ".mcard-turn::before" in css and ".gfav {" in css


def test_my_settings_and_note_export(tmp_path):
    # 관심 화면 '내 설정'(처음 볼 지역·면적 단위·코스 이동·시세 알림 기준·내 체크 항목·내 기록 파일)과 임장 노트 내보내기
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    my = (out / "my.html").read_text(encoding="utf-8")
    for s in ('id="prefs"', 'data-pf="mode"', 'data-pf="dp"', "data-pf-checks", "data-pf-backup", "data-pf-restore",
              'data-area-unit="py"', "data-nt-csv", "data-nt-print", "static/prefs.js"):
        assert s in my, s
    assert my.index('id="prefs"') < my.index('id="favs"')
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.prefs = () =>" in app and "const dp = DJ.prefs().dp" in app and '"my:" + DJ.hash(t)' in app
    js = (out / "static" / "prefs.js").read_text(encoding="utf-8")
    assert '"\\uFEFF"' in js and "imjang-notes-" in js and 'dispatchEvent(new CustomEvent("dj:mode"' in js
    assert 'addEventListener("dj:mode"' in (out / "static" / "course.js").read_text(encoding="utf-8")
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'localStorage.getItem("djdex:prefs")' in index   # 처음 볼 지역


def test_family_share_and_field_photos(tmp_path, monkeypatch):
    # 가족과 함께 보기(공유 링크, share.html)와 현장 사진: 로그인을 켰을 때만, 처리방침에도
    from djdex import config
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26", "provider": "custom:kakao"}))
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    share = (out / "share.html").read_text(encoding="utf-8")
    assert '<meta name="robots" content="noindex">' in share and "static/share.js" in share and "data-sh-body" in share
    assert "share.html" not in (out / "sitemap.xml").read_text(encoding="utf-8")
    me = (out / "me.html").read_text(encoding="utf-8")
    assert "data-share hidden" in me and "data-share-actions" in me
    js = (out / "static" / "share.js").read_text(encoding="utf-8")
    assert "/rest/v1/rpc/shared_view" in js and "DJ.photoUrl" in js
    sync = (out / "static" / "sync.js").read_text(encoding="utf-8")
    assert "DJ.photoPut = async function" in sync and "/storage/v1/object/photos/" in sync and "allPhotos()" in sync
    field = (out / "static" / "field.js").read_text(encoding="utf-8")
    assert "function photos()" in field and "1280 / Math.max" in field and 'toBlob(ok, "image/jpeg", 0.8)' in field
    privacy = (out / "privacy.html").read_text(encoding="utf-8")
    assert "현장 사진" in privacy and "함께 보기" in privacy and "위치 정보" in privacy
    sql = (config.ROOT / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    for s in ("create table if not exists public.shares", "function public.shared_view(t text)", "'photos', 'photos', true, 1048576",
              "photos insert own", "public.photo_quota_ok()", "grant execute on function public.shared_view(text) to anon"):
        assert s in sql, s


def test_admin_page_roles_settings_and_membership_groundwork(tmp_path, monkeypatch):
    # 관리자 화면(admin.html): 로그인을 켰을 때만 만들고 검색에서 뺌. 권한 확인은 서버 함수가 하고(역할: 운영자 > 관리자 > 스태프),
    # 사이트 설정(공지 띠·기능 켜고 끄기)은 누구나 읽는 공개 설정으로 모든 화면에 반영. 멤버십은 등급표·구독 표 자리만 (결제는 나중)
    import re
    from djdex import config
    out = tmp_path / "site"
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    assert not (out / "admin.html").exists()

    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26"}))
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    ad = (out / "admin.html").read_text(encoding="utf-8")
    assert '<meta name="robots" content="noindex">' in ad and "admin.html" not in (out / "sitemap.xml").read_text(encoding="utf-8")
    assert ad.index('class="me-gate" data-when-out') < ad.index("data-ad-deny") < ad.index('class="ad" data-ad hidden')
    for tab in ("overview", "members", "settings", "plans", "logs"):
        assert f'data-ad-go="{tab}"' in ad and f'data-ad-pane="{tab}"' in ad
    assert 'data-ad-go="logs" aria-selected="false" data-ad-min="admin"' in ad and "static/admin.js" in ad
    assert '<symbol id="i-shield"' in ad and 'href="admin.html" data-admin-link hidden' in (out / "my.html").read_text(encoding="utf-8")
    # 내 정보: 회원 번호(권한을 받을 때), 멤버십 줄(켰을 때만), 꺼질 수 있는 기능 표시
    me = (out / "me.html").read_text(encoding="utf-8")
    assert "data-member-id" in me and "data-member-copy" in me and '<li data-feature="membership">' in me
    assert 'id="share" aria-labelledby="share-title" data-feature="share"' in me
    css = (out / "static" / "style.css").read_text(encoding="utf-8")
    assert '.off-photos [data-feature="photos"], .off-share [data-feature="share"] { display: none !important; }' in css
    assert 'html:not(.on-membership) [data-feature="membership"]' in css
    assert 's.dataset.feature = "photos"' in (out / "static" / "field.js").read_text(encoding="utf-8")
    sync = (out / "static" / "sync.js").read_text(encoding="utf-8")
    assert "/rest/v1/rpc/my_member" in sync and "/rest/v1/app_settings?select=key,value" in sync and '"notice-bar"' in sync
    assert "[data-admin-link]" in sync and "ls.get(NOTE_X" in sync

    # 화면이 부르는 함수와 넘기는 이름이 SQL 함수와 같은지 (다르면 PostgREST 가 404)
    sql = (config.ROOT / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    js = (out / "static" / "admin.js").read_text(encoding="utf-8")
    sig = {m[0]: [a.split()[0] for a in m[1].split(",") if a.strip()]
           for m in re.findall(r"create or replace function public\.(\w+)\(([^)]*)\)", sql)}
    calls = re.findall(r'rpc\("(\w+)"(?:, \{([^}]*)\})?', js)
    assert {c[0] for c in calls} == {"my_member", "admin_overview", "admin_members", "admin_set_member", "admin_set_setting",
                                     "admin_plans", "admin_set_plan", "admin_logs"}
    for fn, body in calls:
        assert fn in sig, fn
        keys = re.findall(r"(\w+):", re.sub(r"\([^()]*\)", "", body)) if body else []
        assert set(keys) <= set(sig[fn]), (fn, keys, sig[fn])
    # 표마다 행 보안을 켜고, 바꾸기는 함수로만 (security definer + 빈 search_path), 관리 기록은 정책 없이 함수로만
    for t in ("members", "plans", "subscriptions", "app_settings", "admin_log"):
        assert f"alter table public.{t} enable row level security;" in sql, t
    assert "on public.admin_log for" not in sql
    for fn in ("my_member", "admin_overview", "admin_members", "admin_set_member", "admin_set_setting", "admin_set_plan", "admin_plans", "admin_logs"):
        body = sql[sql.index(f"function public.{fn}("):]
        assert "security definer set search_path = ''" in body[:400], fn
        assert f"revoke all on function public.{fn}(" in sql and f"grant execute on function public.{fn}(" in sql
    assert "raise exception 'owner only'" in sql and "raise exception 'last owner'" in sql
    assert "using (public)" in sql and "using (active)" in sql
    # 첫 운영자는 db-setup 실행 때 회원 번호로 (모양 확인, psql 변수로 넘김)
    wf = (config.ROOT / ".github" / "workflows" / "db-setup.yml").read_text(encoding="utf-8")
    assert "owner_uid:" in wf and "grep -Eq '^[0-9a-f]{8}-" in wf and "-v uid=\"$OWNER_UID\"" in wf and ":'uid'::uuid" in wf


def test_rights_notice_terms_and_minified_deploy(tmp_path):
    # 권리 표시: 모든 화면 아래쪽에 저작권·무단 복제 금지와 이용약관. 약관은 사이트가 권하는 쓰임(카드·링크 나누기)은 허용하고
    # 자동 수집·복제·리버스 엔지니어링은 금지. 배포본은 화면 코드를 압축하고 맨 위에 권리 표시 (저장소 원본은 그대로)
    from djdex import config
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    terms = (out / "terms.html").read_text(encoding="utf-8")
    for s in ("자동 수집", "리버스 엔지니어링", "단지 카드 이미지·링크·임장 코스를 가족이나 지인과 나누기", "데이터베이스제작자"):
        assert s in terms, s
    for page in ("index.html", "rank.html", "methodology.html"):
        html = (out / page).read_text(encoding="utf-8")
        assert 'href="terms.html">이용약관</a>' in html and "무단 복제와 자동 수집을 금지합니다" in html, page
    lic = (config.ROOT / "LICENSE").read_text(encoding="utf-8")
    assert "All rights reserved" in lic and "리버스 엔지니어링" in lic
    sh = (config.ROOT / "scripts" / "minify_site.sh").read_text(encoding="utf-8")
    assert "esbuild@0.24.2" in sh and "--charset=utf8" in sh and "--allow-overwrite" in sh and "All rights reserved" in sh
    wf = (config.ROOT / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")
    assert wf.index("bash scripts/minify_site.sh site") < wf.index("actions/upload-pages-artifact")


def test_walk_minutes_use_one_rule_everywhere():
    # 걷는 시간: 직선거리 × 1.3 ÷ 분당 75m 하나로 (역세권·단지 배지·입지 지도·현장 모드·주변 단지가 같은 값)
    from djdex import site
    assert site.walk_min(256) == 4 and site.walk_min(700) == 12 and site.walk_min(10) == 1
    js = (config_root := site.ROOT / "static")
    app = (js / "app.js").read_text(encoding="utf-8")
    assert 'walk: { kmh: 4.5, detour: 1.3' in app and 'DJ.walkMin = m => DJ.moveMin(m / 1000, "walk")' in app
    for f in ("aptmap.js", "field.js", "alts.js"):
        t = (js / f).read_text(encoding="utf-8")
        assert "DJ.walkMin(" in t and "/ 67" not in t and "/ 80" not in t, f
    assert "walk_min" in (site.ROOT / "templates" / "stations.html").read_text(encoding="utf-8")


def test_home_is_lighter_and_tops_live_on_rank(tmp_path):
    # 첫 화면: 구별 세 칸을 한 칸(요약·순위·최고가)으로, 주목할 단지는 랭킹으로, 등급 분포는 빼고,
    # 전체 목록은 상위 30곳만 HTML에 두고 나머지는 단지 자료로 그림 (단지가 많은 서울도 가볍게)
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'data-gu-view="sum"' in index and 'data-gu-panel="rank"' in index
    assert 'id="top"' not in index and "<h2>등급과 분포</h2>" not in index
    assert 'id="complex-table" data-lazy' in index
    tbl = index[index.index('id="complex-table"'):]
    body = tbl[tbl.index("<tbody>"):tbl.index("</tbody>")]
    assert body.count("<tr") - body.count('data-small="1"') == 30
    rank = (out / "rank.html").read_text(encoding="utf-8")
    assert 'id="top"' in rank and "지수·수익률 순위" in rank and 'role="tab"' in rank
    assert 'class="ki-more"' in "".join(p.read_text(encoding="utf-8") for p in list((out / "apt").glob("*.html"))[:20])


def test_visit_compare_and_monthly_payment(tmp_path):
    # 다녀온 단지 나란히 비교(관심 화면)와 단지 화면 '한 달에 얼마?' (설정 [finder] 의 LTV·DSR·금리를 그대로)
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    my = (out / "my.html").read_text(encoding="utf-8")
    assert "data-visit-cmp" in my and "data-vc-table" in my and "다녀온 단지 나란히 비교" in my
    assert "function visitCompare(notes, eok)" in (out / "static" / "my.js").read_text(encoding="utf-8")
    apts = [p.read_text(encoding="utf-8") for p in list((out / "apt").glob("*.html"))[:30]]
    pay = next(h for h in apts if "data-pay " in h)
    assert "이 단지 사려면 한 달에 얼마?" in pay and "static/pay.js" in pay and "&#34;dsr&#34;: 0.4" in pay
    js = (out / "static" / "pay.js").read_text(encoding="utf-8")
    assert "loan * r / (1 - Math.pow(1 + r, -n))" in js and "pay * 12 / DSR" in js


def test_pwa_manifest_icons_and_service_worker(tmp_path):
    # 앱처럼 쓰기: 지역마다 manifest·sw.js 를 사이트 맨 위에, 같은 주소 아래 다른 지역 폴더는 그 지역 워커가 맡게
    from djdex import site
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    man = json.loads((out / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert man["display"] == "standalone" and man["start_url"] == "index.html?skip=1" and "아파트 지수" in man["name"]
    for ic in man["icons"]:
        assert (out / ic["src"]).exists()
    sw = (out / "sw.js").read_text(encoding="utf-8")
    assert "__VERSION__" not in sw and '"sejong"' in sw and "precache" in sw and not (out / "static" / "sw.js").exists()
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'rel="manifest" href="manifest.webmanifest"' in index and "apple-touch-icon" in index
    assert "data-install" in (out / "my.html").read_text(encoding="utf-8")
    assert 'navigator.serviceWorker.register(ROOT + "sw.js")' in (out / "static" / "app.js").read_text(encoding="utf-8")


def test_noise_check_and_reconstruction_age(tmp_path):
    # 소음 체크(OSM 큰길·철도까지 직선거리)와 재건축 연한(30년) 표시. 거리 계산은 선분까지 최단거리
    from djdex import noise
    lines = [{"kind": "trunk", "name": "한밭대로", "pts": [[36.35, 127.38], [36.36, 127.38]]},
             {"kind": "rail", "name": "경부선", "pts": [[36.30, 127.40], [36.40, 127.40]]}]
    m = noise.measure({"A": [36.355, 127.381], "B": [36.355, 127.399], "C": [36.6, 127.6]}, lines)
    assert m["A"]["road"] == 90 and m["A"]["road_kind"] == "간선도로" and m["B"]["rail"] == 90 and m["C"] == {}
    assert noise.level(m["A"])[0] == "near" and noise.level({"road": 300, "road_kind": "대로"})[0] == "far"
    data = noise.parse({"elements": [{"type": "way", "tags": {"highway": "primary", "name": "계룡로"},
                                      "geometry": [{"lat": 36.1, "lon": 127.1}, {"lat": 36.2, "lon": 127.2}]},
                                     {"type": "way", "tags": {"highway": "primary", "tunnel": "yes"},
                                      "geometry": [{"lat": 36.1, "lon": 127.1}, {"lat": 36.2, "lon": 127.2}]}]})
    assert len(data) == 1 and data[0]["kind"] == "primary"
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    apts = [p.read_text(encoding="utf-8") for p in (out / "apt").glob("*.html")]
    assert any('id="noise"' in h and "소음 체크" in h for h in apts)
    assert any("재건축 연한" in h for h in apts)
    pts = json.loads((out / "complexes.json").read_text(encoding="utf-8"))["complexes"]
    assert any("nz" in c for c in pts)
    assert '"noise", "큰길 쪽 동에서 소음 들어 보기' in (out / "static" / "app.js").read_text(encoding="utf-8")


def test_movein_supply_by_area(tmp_path):
    # 입주 예정 물량: 청약홈 분양 공고 → 지역·구 거르기, 같은 단지 정정 공고는 하나로, 앞으로 3년 구별 합계
    from datetime import date
    from djdex import movein
    rows = [
        {"HOUSE_MANAGE_NO": "1", "HOUSE_NM": "유성 A", "HSSPLY_ADRES": "대전광역시 유성구 학하동 1", "TOT_SUPLY_HSHLDCO": "800",
         "MVN_PREARNGE_YM": "202712", "SUBSCRPT_AREA_CODE_NM": "대전"},
        {"HOUSE_MANAGE_NO": "1", "HOUSE_NM": "유성 A", "HSSPLY_ADRES": "대전광역시 유성구 학하동 1", "TOT_SUPLY_HSHLDCO": "820",
         "MVN_PREARNGE_YM": "202712", "SUBSCRPT_AREA_CODE_NM": "대전"},
        {"HOUSE_MANAGE_NO": "2", "HOUSE_NM": "서구 B", "HSSPLY_ADRES": "대전광역시 서구 도마동 2", "TOT_SUPLY_HSHLDCO": "1200",
         "MVN_PREARNGE_YM": "202605", "SUBSCRPT_AREA_CODE_NM": "대전"},
        {"HOUSE_MANAGE_NO": "3", "HOUSE_NM": "세종 C", "HSSPLY_ADRES": "세종특별자치시 어진동", "TOT_SUPLY_HSHLDCO": "500",
         "MVN_PREARNGE_YM": "202712", "SUBSCRPT_AREA_CODE_NM": "세종"},
    ]
    gus = ["동구", "중구", "서구", "유성구", "대덕구"]
    p = movein.parse(rows, "대전", gus)
    assert [r["name"] for r in p] == ["서구 B", "유성 A"] and p[1]["hh"] == 820 and p[1]["area"] == "유성구"
    v = movein.view(p, gus, today=date(2026, 10, 30))
    assert v["years"] == [2026, 2027, 2028] and v["total"] == [0, 820, 0] and v["table"][0]["area"] == "유성구"
    assert movein.view(p, gus, today=date(2029, 1, 1)) is None
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'id="movein"' in index and "입주 예정 물량" in index and 'href="#movein"' in index and "조합원 몫" in index
