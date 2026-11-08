import json
from pathlib import Path
from djdex import cli

ROOT_DIR = Path(__file__).resolve().parent.parent   # 스타일 원본 확인용: 배포본 style.css 는 공백을 줄여 놓아서 원본을 읽는다


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
    base = "https://www.jipgam.kr/daejeon/"
    page = (out / "apt" / "DEMO-0001.html").read_text(encoding="utf-8")
    assert f'<meta property="og:url" content="{base}apt/DEMO-0001">' in page
    assert f'<meta property="og:image" content="{base}static/og/daejeon.jpg">' in page
    assert 'property="og:title" content="데모단지 01 · 지수' in page
    assert (out / "static" / "og" / "daejeon.jpg").exists() and (out / "static" / "brand" / "favicon-48.png").exists()
    sitemap = (out / "sitemap.xml").read_text(encoding="utf-8")
    assert sitemap.count("<url>") == 63 + 9  # 단지 비교, 조건으로 찾기, 관심 단지, 카드첩, 집감 옥상, 역세권, 랭킹, 테마, 인트로 and f"<loc>{base}apt/DEMO-0001</loc>" in sitemap
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
    assert ">세종</button>" in index and "동별 비교" in index and "구별" not in index
    assert 'data-gu="데모' in index  # 구 대신 동으로 거르기
    # 지역 고르기: 위쪽은 버튼 하나, 창 안에 권역별 지역 카드 (지금 지역 표시)
    assert 'class="rg-btn"' in index and 'class="brand-word">집감<i class="brand-dot"' in index
    assert '<p class="rg-grp" data-rg-grp>충청권</p>' in index and 'data-rg-name="세종" aria-current="page"' in index
    assert 'data-rg-name="대전"' in index
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert "BRT 정류장 주변" in stations and "지하철" not in stations
    robots = (out / "robots.txt").read_text(encoding="utf-8")
    assert "jipgam.kr/daejeon/sitemap.xml" in robots and "sejong/sitemap.xml" in robots


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
    assert '<h1>좋은 집의 가치<br><em><span class="nb">더 쉽게 찾고,</span> <span class="nb">더 꼼꼼히 보다</span></em></h1>' in intro
    assert '마음에 드는 집을 찾고, 직접 둘러보세요.<br>실거래가·입지 비교부터 임장 코스와 현장 기록까지, 집감에서.' in intro
    # 실제 자료: 1위 카드, 등급 분포(S~D), 뜨거운 동네, 시작하기
    assert 'class="gcard it-card g-' in intro and "1위" in intro
    grades = intro.split('class="it-grades"')[1].split("</ul>")[0]
    assert grades.count('<span class="grade g-') == 5 and 'class="it-bar"' in intro
    assert 'class="it-hot"' in intro and 'href="index.html">궁금한 아파트 찾기' in intro
    assert "대전 아파트 검색하기" not in intro and "대전 아파트의" not in intro
    assert "같은 지역의 단지끼리 비교한 상대 점수" in intro
    assert 'data-search-go' in intro and 'href="index.html#list">아파트 검색하기' in intro
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
    assert my.index('id="favs"') < my.index('id="course"') < my.index('class="to-cards"')
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
    jump = page[page.index('<nav class="jump apt-jump"'):]
    assert jump.index("jump-field") < jump.index('href="#price"')   # 바로가기 줄 맨 앞 (5개 범주 진입 줄의 #price 와 구분)
    assert page.count('class="cat-row"') >= 3 and page.index('id="catalog"') < page.index('class="jump apt-jump"')   # 범주 진입 줄은 바로가기 위
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
    assert my.index('id="favs"') < my.index('id="account"') < my.index('id="course"')
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
    assert 'DJ.LOCAL_ONLY = ["kmap", "seed", "watchN"]' in app and 'DJ.records.setTimes(t)' in app
    sql = (config.ROOT / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    assert "enable row level security" in sql and "security definer" in sql and "where public.user_kv.t < excluded.t" in sql
    assert "revoke all on public.user_kv from anon, authenticated" in sql


def test_personal_records_available_to_guests(tmp_path, monkeypatch):
    # 계정을 켠 사이트도 기본 임장 기록은 비회원에게 열려 있고, 사진·공유·동기화는 로그인 안내.
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
    for page, inner in (("my.html", 'id="favs"'), ("cards.html", "data-album-cards")):
        html = (out / page).read_text(encoding="utf-8")
        assert "me-gate" not in html and inner in html
        assert html.index("static/records.js") < html.index("static/app.js")
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'class="nav-lock"' not in index
    assert "data-pop-why" in index and "후보 저장·코스·현장 메모는 로그인 없이도" in index
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.locked = () => !DJ.records.current()" in app
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
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
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
    assert 'id="prefs"' in my and "data-share-actions" not in my and "data-delete" not in my and 'href="me.html"' in my
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
    assert 'q.get("from") === "project"' in course and "프로젝트에서 고른 임장 코스" in course
    assert course.index('if (!DJ.save("course", next)) return;') < course.index('if (RECV) { location.href = base + "my.html#course"; return; }')
    assert "DJ.printSheet(sheet())" in course and "window.print" not in course
    assert "state.auto = true" in course   # 빈 코스가 저장돼 있어도 관심 단지를 따라감
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.printSheet = function" in app and "KAKAOTALK" in app and '"(pointer: coarse)"' in app
    prefs = (out / "static" / "prefs.js").read_text(encoding="utf-8")
    assert "DJ.printSheet(sheet)" in prefs and "window.print" not in prefs
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
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
    assert "data-my-seg" in my and 'data-mg-btn="visit"' in my and 'id="course"' in my and 'id="recent-sec"' in my   # 세 칸 탭(내 후보·임장·최근·설정)
    assert "fav-rail" in (out / "static" / "my.js").read_text(encoding="utf-8")
    assert "data-resume" in (out / "index.html").read_text(encoding="utf-8")


def test_compare_fill_finder_fav_and_card_flip_target(tmp_path):
    # 비교에 관심 단지 한 번에, 조건으로 찾기 결과 카드에서 바로 관심 단지 담기, 카드첩 뒤집기 단추는 누르는 자리를 넓게
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    assert "qa-fill" in (out / "static" / "compare.js").read_text(encoding="utf-8")
    assert "DJ.card(c, STATS, { fav: true })" in (out / "static" / "finder.js").read_text(encoding="utf-8")
    finder_html = (out / "finder.html").read_text(encoding="utf-8")
    assert finder_html.index("static/app.js") < finder_html.index("static/workplaces.js") < finder_html.index("static/finder.js")
    assert (out / "static" / "workplaces.js").exists()
    assert "if (opts.fav)" in (out / "static" / "app.js").read_text(encoding="utf-8")
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    assert ".mcard-turn::before" in css and ".gfav {" in css


def test_project_page_preserves_existing_records_and_is_not_indexed(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "projects.html").read_text(encoding="utf-8")
    assert 'name="robots" content="noindex"' in page and 'data-pj-create' in page
    assert page.index("static/records.js") < page.index("static/project-store.js") < page.index("static/projects.js")
    assert 'class="me-gate"' not in page
    assert "기존 내 코스를 덮어쓰지 않습니다" in page and "단지별 공통 기록" in page
    assert 'href="projects.html"' in (out / "my.html").read_text(encoding="utf-8")
    assert "projects" not in (out / "sitemap.xml").read_text(encoding="utf-8")
    sw = (out / "sw.js").read_text(encoding="utf-8")
    assert '"projects.html"' in sw and "static/project-store.js" in sw


def test_dated_visit_logs_available_on_field_project_and_my_pages(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    apt = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    projects = (out / "projects.html").read_text(encoding="utf-8")
    for page in (apt, projects):
        assert page.index("static/project-store.js") < page.index("static/visit-log.js") < page.index("static/visit-log-ui.js")
    assert 'data-pj-journal' in projects
    my = (out / "my.html").read_text(encoding="utf-8")
    assert 'data-visit-history' in my and my.index("static/visit-log.js") < my.index("static/my.js")
    sw = (out / "sw.js").read_text(encoding="utf-8")
    assert 'static/visit-log.js' in sw and 'static/visit-log-ui.js' in sw
    # 공유 RPC는 기존 단지 노트만 내보내고 새 날짜별 기록은 공개하지 않습니다.
    sql = (__import__('pathlib').Path(__file__).parents[1] / 'scripts' / 'supabase_setup.sql').read_text(encoding='utf-8')
    assert "k.k like 'visit:%'" in sql and "k.k like 'visitlog:%'" not in sql


def test_project_workspace_keeps_full_tools_inside_a_lazy_same_origin_panel(tmp_path):
    out = tmp_path / 'site'
    cli.main(['--data', str(tmp_path / 'data'), 'demo', '--out', str(out)])
    page = (out / 'projects.html').read_text(encoding='utf-8')
    assert '<dialog class="pw-dialog"' in page and 'data-pj-workspace' in page
    for kind in ('detail', 'field', 'compare', 'course', 'finder', 'history'):
        assert f'data-pw-tab="{kind}"' in page
    assert 'data-pj-budget' in page and 'data-pj-district' in page and 'data-pj-results' in page
    assert '<iframe' not in page  # 선택한 기능만 필요할 때 불러옵니다.
    for script in ('project-flow', 'project-workspace', 'workspace-embed'):
        assert f'static/{script}.js' in page
        assert f'static/{script}.js' in (out / 'sw.js').read_text(encoding='utf-8')
    assert page.index('static/project-flow.js') < page.index('static/project-workspace.js') < page.index('static/projects.js')
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    assert '.pw-dialog[open]' in css and '.pw-frame[hidden]' in css and '.pj-embed-field' in css
    assert 'body[data-page="projects"] .rcd { display: none; }' in css
    assert 'href="projects.html"' in (out / 'index.html').read_text(encoding='utf-8')
    assert '한 화면에서 집 찾기' in (out / 'intro.html').read_text(encoding='utf-8')


def test_my_settings_and_note_export(tmp_path):
    # 관심 화면 '내 설정'(처음 볼 지역·면적 단위·코스 이동·시세 알림 기준·내 체크 항목·내 기록 파일)과 임장 노트 내보내기
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    my = (out / "my.html").read_text(encoding="utf-8")
    for s in ('id="prefs"', 'data-pf="mode"', 'data-pf="dp"', "data-pf-checks", "data-pf-backup", "data-pf-restore",
              'data-area-unit="py"', "data-nt-csv", "data-nt-print", "static/prefs.js"):
        assert s in my, s
    assert my.index('id="favs"') < my.index('id="prefs"')
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.prefs = () =>" in app and "const dp = DJ.prefs().dp" in app and '"my:" + DJ.hash(t)' in app
    js = (out / "static" / "prefs.js").read_text(encoding="utf-8")
    assert '"\\uFEFF"' in js and "imjang-notes-" in js and 'dispatchEvent(new CustomEvent("dj:mode"' in js
    assert 'addEventListener("dj:mode"' in (out / "static" / "course.js").read_text(encoding="utf-8")
    index = (out / "index.html").read_text(encoding="utf-8")
    assert 'localStorage.getItem(prefsKey)' in index and '"djdex@"+auth.user.id+":prefs"' in index  # 현재 계정의 처음 볼 지역


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
    assert "/rest/v1/rpc/shared_view" in js and "DJ.photoUrl" not in js and "sh-photos" not in js   # 공유 화면은 사진을 그리지 않음
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
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
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
    assert man["display"] == "standalone" and man["start_url"] == "index.html?skip=1" and man["name"].startswith("집감") and man["short_name"] == "집감"
    for ic in man["icons"]:
        assert (out / ic["src"]).exists()
    sw = (out / "sw.js").read_text(encoding="utf-8")
    assert "__VERSION__" not in sw and 'const OTHER = [];' in sw and "precache" in sw and not (out / "static" / "sw.js").exists()
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
    # 입주 예정 물량 화면: 결론 한 줄, 연도 막대, 칸 색 단계, 작은 물량 제외, 먼 해·올해 꼬리표
    assert "mv-head" in index and "가장 많이 입주해요" in index and 'class="mv-bars"' in index and "mv-t" in index
    assert "공고된 것만" in index
    # 비율 → 색 단계 (0은 없음, 최댓값은 5)
    assert [movein._tier(x) for x in (0, 0.01, 0.2, 0.21, 0.5, 1.0)] == [0, 1, 1, 2, 3, 5]
    # 같은 달은 한 번만 쓰고, 30세대 미만은 목록에서 빼되 건수는 알려 줌
    rows2 = [{"ym": "202611", "addr": "대전 서구 a", "area": "서구", "hh": 2, "name": "잔여"},
             {"ym": "202611", "addr": "대전 서구 b", "area": "서구", "hh": 500, "name": "A"},
             {"ym": "202611", "addr": "대전 서구 c", "area": "서구", "hh": 300, "name": "B"},
             {"ym": "202703", "addr": "대전 유성구 d", "area": "유성구", "hh": 4000, "name": "C"}]
    v2 = movein.view(rows2, gus, today=date(2026, 11, 2))
    assert [r["name"] for r in v2["soon"]] == ["A", "B", "C"] and v2["soon_cut"] == 1
    assert [r["mlabel"] for r in v2["soon"]] == ["11월", "", "2027년 3월"]
    assert v2["bars"][0]["note"] == "남은 2달" and v2["bars"][-1]["note"] == "공고된 것만"
    assert v2["head"] == "2027년에 가장 많이 입주해요" and v2["bars"][1]["peak"] and not v2["bars"][0]["peak"]
    one = movein.view([rows2[3]], gus, today=date(2026, 11, 2))   # 한 해뿐이어도 깨지지 않음
    assert one["head"] == "2027년에 입주 예정이에요" and not any(b["peak"] for b in one["bars"])


def test_root_landing_picks_region_and_redirects_old_links(tmp_path):
    """맨 앞 주소는 지역 고르기 화면. 예전 대전 주소(/apt/○○.html 등)는 /daejeon/ 같은 화면으로 넘김"""
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--config", "config.sejong.toml", "--data", str(tmp_path / "data"), "demo", "--out", str(out / "sejong")])
    cli.main(["--data", str(tmp_path / "data"), "landing", "--out", str(out)])
    page = (out / "index.html").read_text(encoding="utf-8")
    # 디자인은 인트로 그대로, 지역부터 고르게 (위쪽 '지역 선택', 시작 버튼이 지역 고르기 창을 엶)
    assert '<base href="/daejeon/">' in page and 'class="it-hero"' in page and "<span>지역 선택</span>" in page
    assert '<h1>좋은 집의 가치<br><em><span class="nb">더 쉽게 찾고,</span> <span class="nb">더 꼼꼼히 보다</span></em></h1>' in page
    assert '마음에 드는 집을 찾고, 직접 둘러보세요.<br>실거래가·입지 비교부터 임장 코스와 현장 기록까지, 집감에서.' in page
    assert 'data-rg-open aria-haspopup="dialog" aria-controls="rg-pop">궁금한 동네 둘러보기' in page and 'aria-current="page"' not in page
    final = page.split('class="it-final"')[1].split('</section>')[0]
    assert 'data-rg-open' in final and "지역 고르고 아파트 찾기" in final
    assert 'data-search-go' not in final and 'href="index.html#list"' not in final
    assert "대전 아파트 검색하기" not in page and "대전 아파트의" not in page
    assert "분포 예시" in page and "지역마다 분포가 다릅니다" in page
    assert '<title>집감 | 아파트 실거래가 비교부터 임장 코스·기록까지</title>' in page
    assert 'property="og:title" content="집감 | 아파트 실거래가 비교부터 임장 코스·기록까지"' in page
    schema = json.loads(page.split('<script type="application/ld+json">')[1].split('</script>')[0])
    assert schema["@type"] == "WebSite" and schema["name"] == "집감"
    assert schema["url"] == "https://www.jipgam.kr/" and schema["@id"] == "https://www.jipgam.kr/#website"
    assert "potentialAction" not in schema  # 제공하지 않는 전국 통합 검색을 선언하지 않음
    assert 'href="https://www.jipgam.kr/sejong/"' in page and "window.DJ_LANDING=1" in page
    assert '<link rel="canonical" href="https://www.jipgam.kr/">' in page and 'content="https://www.jipgam.kr/static/og/jipgam.jpg"' in page
    assert 'name="naver-site-verification"' in page and not (out / "daejeon" / "landing.html").exists()
    assert (out / "static" / "og" / "jipgam.jpg").exists()
    assert "지역 선택" not in (out / "daejeon" / "intro.html").read_text(encoding="utf-8")   # 지역 인트로는 그대로
    stub = (out / "apt" / "DEMO-0001.html").read_text(encoding="utf-8")
    assert 'location.replace("/daejeon/apt/DEMO-0001.html"+location.search+location.hash)' in stub
    assert 'href="https://www.jipgam.kr/daejeon/apt/DEMO-0001"' in stub and 'content="noindex"' in stub
    assert (out / "rank.html").exists() and not (out / "sejong" / "rank.html").read_text(encoding="utf-8").startswith("<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>집감 대전")
    sw = (out / "sw.js").read_text(encoding="utf-8")
    assert "unregister" in sw and "fetch" not in sw
    smap = (out / "sitemap.xml").read_text(encoding="utf-8")
    assert "<sitemapindex" in smap and "daejeon/sitemap.xml" in smap and "sejong/sitemap.xml" in smap
    assert "Sitemap: https://www.jipgam.kr/sitemap.xml" in (out / "robots.txt").read_text(encoding="utf-8")
    # 지역 사이트는 각자 폴더 주소를 씀 (대전 → /daejeon/)
    dj = (out / "daejeon" / "index.html").read_text(encoding="utf-8")
    assert '<link rel="canonical" href="https://www.jipgam.kr/daejeon/">' in dj
    assert '<title>대전 아파트 실거래가·시세·입지 비교 | 집감</title>' in dj
    assert 'name="description" content="대전 아파트 ' in dj
    sj = (out / "sejong" / "index.html").read_text(encoding="utf-8")
    assert '<title>세종 아파트 실거래가·시세·입지 비교 | 집감</title>' in sj
    apt = (out / "daejeon" / "apt" / "DEMO-0001.html").read_text(encoding="utf-8")
    assert "실거래가·시세·입지 | 대전" in apt and "| 집감</title>" in apt


def test_apt_link_preview_card_only_for_s_and_a(tmp_path):
    # 링크 미리보기 카드: S·A 등급 단지만 따로 그리고, 나머지는 지역 대표 이미지
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    made = {p.stem for p in (out / "static" / "og" / "apt").glob("*.jpg")}
    assert made, "S·A 단지가 하나도 없으면 안 됨"
    for slug in made:
        html = (out / "apt" / f"{slug}.html").read_text(encoding="utf-8")
        assert f"static/og/apt/{slug}.jpg" in html.split('og:image"')[1].split(">")[0]
    other = next(p for p in (out / "apt").glob("*.html") if p.stem not in made)
    assert "static/og/apt/" not in other.read_text(encoding="utf-8").split('og:image"')[1].split(">")[0]
    from PIL import Image
    with Image.open(next((out / "static" / "og" / "apt").glob("*.jpg"))) as im:
        assert im.size == (1200, 630)


def test_og_card_display_name_shortening():
    from djdex.ogcard import display_parts
    assert display_parts("대치우성아파트1동,2동,3동,5동,6동,7동") == ("대치우성아파트", "")
    assert display_parts("반석마을3단지(호반베르디움)") == ("반석마을3단지", "호반베르디움")
    assert display_parts("현대1차(12,13,21,22,31,32,33동)") == ("현대1차", "")
    assert display_parts("공작한양") == ("공작한양", "")


def test_og_card_badges_use_real_values_only():
    from djdex.ogcard import badges
    # 값이 있고 눈에 띄는 것만, 숫자 그대로. 판단 말투(초품아 등)는 쓰지 않음
    b = badges(dict(sub=157, stn="탄방역", elem=253, hub=8, hn="둔산 학원가", hh=366, y=1994, nw=False, hosp=None, mart=None))
    assert b[0] == "탄방역 157m" and len(b) <= 3 and all("초품아" not in x for x in b)
    assert badges(dict(sub=None, elem=None, hub=None, hh=None, y=None, nw=False)) == []          # 값이 없으면 비움
    assert badges(dict(sub=2000, stn="먼역", elem=900, hub=60, hn="x", hh=100, y=1990)) == []     # 멀면 장점으로 적지 않음
    assert "2,010세대" in badges(dict(hh=2010))


def test_root_about_page_brand_explainer(tmp_path):
    """맨 앞 주소 /about: '집감이란?' 브랜드 설명. 지역 수·단지 수는 실제 값, 판단·예측 문구 없음, 사이트맵에 포함"""
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--config", "config.sejong.toml", "--data", str(tmp_path / "data"), "demo", "--out", str(out / "sejong")])
    cli.main(["--data", str(tmp_path / "data"), "landing", "--out", str(out)])
    page = (out / "about.html").read_text(encoding="utf-8")
    assert "<title>집감이란?" in page and '<link rel="canonical" href="https://www.jipgam.kr/about">' in page
    assert '"@type": "AboutPage"' in page and "전국 모든 지역을 제공한다는 뜻은 아니며" in page
    assert 'href="https://www.jipgam.kr/sejong/"' in page and 'name="naver-site-verification"' in page
    for bad in ("투자하세요", "오를", "수익 보장", "1위 서비스", "최고의"):
        assert bad not in page
    assert "about</loc>" in (out / "sitemap-root.xml").read_text(encoding="utf-8")
    assert 'href="/about">집감이란?</a>' in (out / "index.html").read_text(encoding="utf-8")
    assert "집감이란?" not in (out / "daejeon" / "index.html").read_text(encoding="utf-8")   # 지역 화면에는 두지 않음


def test_thin_trades_note_only_when_few_sale_trades():
    """가격 근거가 매매 3건 미만일 때만 안내. 충분하거나 분양권 기준이거나 건수를 모르면 안내하지 않음"""
    from djdex.site import _thin_trades

    base = {"price_ref": 80000.0}
    assert _thin_trades({**base, "price_basis": "최근 12개월 매매 2건"}) == 2
    assert _thin_trades({**base, "price_basis": "최근 12개월 매매 3건"}) is None
    assert _thin_trades({**base, "price_basis": "최근 24개월 분양권·입주권"}) is None
    assert _thin_trades({**base, "price_basis": None}) is None
    assert _thin_trades({"price_ref": float("nan"), "price_basis": "최근 12개월 매매 2건"}) is None


def test_landing_app_start_skips_only_with_saved_region():
    """앱 시작(?skip=1)은 지난 지역이 저장돼 있을 때만 바로 이동. 처음 켜면 지역 고르기를 보여 줌. 로그인 복귀(?code/error)는 항상 이동"""
    from djdex import landing

    src = (landing.ROOT / "templates" / "intro.html").read_text(encoding="utf-8")
    # code/error 는 항상, skip 은 지난 지역(L)이 있을 때만 이동
    assert "if(/[?&](code|error)=/.test(q)||(/[?&]skip=/.test(q)&&L))location.replace(" in src
    assert "(skip|code|error)" not in src


def test_root_privacy_and_terms_are_real_pages_not_redirect_stubs(tmp_path, monkeypatch):
    """구글 Play 등이 맨 앞 주소(/privacy.html, /terms.html)를 읽으므로 넘겨 주는 빈 페이지가 아니라 본문을 그대로 둔다"""
    from djdex import config
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co/rest/v1/")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(config.Config, "account", property(lambda self: {
        "owner": "운영자", "email": "help@example.com", "storage": "일본(도쿄)", "since": "2026-10-26",
        "provider": "custom:kakao"}))
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--config", "config.sejong.toml", "--data", str(tmp_path / "data"), "demo", "--out", str(out / "sejong")])
    cli.main(["--data", str(tmp_path / "data"), "landing", "--out", str(out)])
    for name, word in (("privacy.html", "개인정보"), ("terms.html", "이용약관")):
        page = (out / name).read_text(encoding="utf-8")
        assert "location.replace" not in page and 'http-equiv="refresh"' not in page   # 넘겨 주는 빈 페이지가 아님
        assert '<base href="/daejeon/">' in page and word in page and len(page) > 5000
    other = (out / "compare.html").read_text(encoding="utf-8")   # 나머지 옛 주소는 그대로 넘겨 줌
    assert "location.replace" in other


def test_structured_data_on_region_home_and_apartment_pages(tmp_path):
    """검색·AI 요약이 읽는 구조화 정보: 지역 홈은 목록 설명, 단지 상세는 단지 정보(있는 값만). JSON 이 깨지지 않아야 함"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    def blocks(name):
        html = (out / name).read_text(encoding="utf-8")
        return [json.loads(b.split("</script>")[0]) for b in html.split('<script type="application/ld+json">')[1:]]
    home = blocks("index.html")
    assert len(home) == 1 and [g["@type"] for g in home[0]["@graph"]] == ["BreadcrumbList", "CollectionPage"]
    apt = next((out / "apt").glob("*.html"))
    one = blocks("apt/" + apt.name)
    kinds = [g["@type"] for g in one[0]["@graph"]]
    assert kinds[:2] == ["BreadcrumbList", "ApartmentComplex"] and set(kinds[2:]) <= {"FAQPage"}   # 질문 블록은 값이 있을 때만
    cx = one[0]["@graph"][1]
    assert cx["name"] and cx["address"]["addressCountry"] == "KR" and cx["description"]
    assert "geo" not in cx or {"latitude", "longitude"} <= set(cx["geo"])   # 좌표는 있을 때만
    assert "aggregateRating" not in cx and "offers" not in cx               # 지어낸 평점·가격 정보 금지


def test_card_traits_types_stamps_numbers_are_data_based_and_stable():
    """카드 개성: 타입·도장은 있는 값으로만, 번호는 구별 묶음이고 한 번 붙으면 바뀌지 않는다"""
    from djdex import cardtraits as ct
    base = dict(subway_raw=None, rail_raw=None, elementary_raw=None, hub_raw=None, mart_raw=None, hospital_raw=None, build_year=None, hh=None, is_new=False)
    rows = [dict(base, slug=f"s{i}", gu="가구" if i % 2 else "나구", elementary_raw=100 + i * 30, mart_raw=900 - i * 20,
                 subway_raw=(300 + i * 40 if i % 3 == 0 else None), hh=500 + i * 60, build_year=1985 + i) for i in range(30)]
    out = ct.compute(rows, "nowhere")
    assert all(v["t"] for v in out.values())
    first = out["s0"]
    assert "sub" in first["m"] and "sch" in first["m"]            # 지하철 300m, 초등학교 100m
    assert "sub" not in out["s1"]["m"]                            # 지하철 값이 없으면 도장이 없다(지어내지 않음)
    assert sum(1 for v in out.values() if v["n"] == out["s0"]["n"] and v["m"] == first["m"]) == first["n"]   # 같은 조합 수는 실제로 센 값
    nums = {(v["g"], v["no"]) for v in out.values()}
    assert len(nums) == 30                                         # 번호 중복 없음
    # 등록된 번호는 유지되고, 새 단지는 그 구의 마지막 번호 다음
    reg = {s: [v["g"], v["no"]] for s, v in out.items()}
    rows.append(dict(base, slug="aaa-new", gu="가구"))
    again = ct.assign_numbers(rows, reg)
    assert all(again[s] == (reg[s][0], reg[s][1]) for s in reg) and again["aaa-new"] == ("가구", max(n for g, n in reg.values() if g == "가구") + 1)
    assert ct.pack(first)[0] == first["t"] and isinstance(ct.pack(first)[2], int)


def test_card_traits_registry_files_cover_each_region_without_duplicates():
    import json
    from pathlib import Path
    d = Path(__file__).resolve().parent.parent / "djdex" / "card_numbers"
    for city in ("daejeon", "sejong", "cheongju", "seoul"):
        reg = json.loads((d / f"{city}.json").read_text(encoding="utf-8"))
        assert len(reg) > 100
        pairs = [tuple(v) for v in reg.values()]
        assert len(pairs) == len(set(pairs))


def test_llms_txt_robots_allow_ai_bots_and_apartment_faq(tmp_path, monkeypatch):
    """AI 검색용 안내 파일과 수집기 허용, 단지 상세의 자주 묻는 질문(있는 값으로만)과 FAQPage 구조화 정보"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--config", "config.sejong.toml", "--data", str(tmp_path / "data"), "demo", "--out", str(out / "sejong")])
    cli.main(["--data", str(tmp_path / "data"), "landing", "--out", str(out)])
    robots = (out / "robots.txt").read_text(encoding="utf-8")
    for bot in ("GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"):
        assert f"User-agent: {bot}\nAllow: /" in robots
    assert "Disallow" not in robots
    llms = (out / "llms.txt").read_text(encoding="utf-8")
    assert llms.startswith("# 집감") and "갱신일:" in llms and "https://www.jipgam.kr/about" in llms and "투자 권유가 아닙니다" in llms
    apt = next((out / "daejeon" / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert 'id="faq"' in apt and apt.count('class="faq-it"') >= 3
    ld = [json.loads(b.split("</script>")[0]) for b in apt.split('<script type="application/ld+json">')[1:]]
    faq = [g for g in ld[0]["@graph"] if g["@type"] == "FAQPage"][0]["mainEntity"]
    assert len(faq) == apt.count('class="faq-it"') and all(q["acceptedAnswer"]["text"] for q in faq)


def test_rank_tab_is_named_browse(tmp_path):
    """아래 탭·위 메뉴의 '랭킹'은 '둘러보기'로 부르고, 주소(rank.html)는 그대로 둔다(검색·북마크 보존)"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "index.html").read_text(encoding="utf-8")
    assert 'data-tab="rank"' not in page and 'href="rank.html"><svg class="ic" aria-hidden="true"><use href="#i-rank"/></svg>순위</a>' in page   # 탭에서는 빠지고 홈 둘러보기 입구로
    assert 'data-nav="rank">둘러보기</a>' in page and 'data-nav="rank">랭킹</a>' not in page
    assert (out / "rank.html").exists()


def test_visited_card_stamp_wiring(tmp_path):
    """다녀온 카드: 현장 기록이 있으면 카드에 도장(DJ.been), 카드첩에 다녀온 수. 기록은 이 기기 안에서만 읽는다(서버 전송 없음)"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    cards = (out / "cards.html").read_text(encoding="utf-8")
    assert "DJ.been = function" in app and 'el("span", "mcard-been"' in app
    assert "data-album-been" in cards and "DJ.been(c)" in (out / "static" / "cards.js").read_text(encoding="utf-8")
    been = app[app.index("DJ.been = function"):app.index("DJ.been = function") + 500]
    assert "fetch(" not in been and "XMLHttpRequest" not in been and "sendBeacon" not in been
    assert ".mcard-been" in (out / "static" / "style.css").read_text(encoding="utf-8")


def test_project_report_and_resume_wiring(tmp_path):
    """한 장 보고서(프로젝트 화면)와 첫 화면 '이어서'의 진행 중 프로젝트: 기존 요약·인쇄를 재사용하고, 서버로 보내는 코드가 없다"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "projects.html").read_text(encoding="utf-8")
    assert "data-pj-report" in page and "static/project-report.js" in page
    assert page.index("visit-summary.js") < page.index("project-report.js") < page.index("static/projects.js")
    pj = (out / "static" / "projects.js").read_text(encoding="utf-8")
    assert "summaryRows()" in pj and pj.count("DJVisitSummary.build(") == 1     # 다녀온 뒤 정리와 같은 자료를 한 곳에서
    assert "DJ.printSheet(sheet)" in pj and "DJProjectReport.build(" in pj
    rep = (out / "static" / "project-report.js").read_text(encoding="utf-8")
    for bad in ("fetch(", "XMLHttpRequest", "sendBeacon", "localStorage"):
        assert bad not in rep, bad
    assert '"static/project-report.js?v=" + VERSION' in (out / "sw.js").read_text(encoding="utf-8")
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "DJ.activeProject = function" in app and "pj.slugs.length" in app and "!p.archived && p.slugs.length" in app
    assert "data-resume" in (out / "index.html").read_text(encoding="utf-8")


def test_ux_home_gates_and_next_actions_wiring(tmp_path):
    """UX 1차: 홈 입구 3개(찾기·비교·임장), 알림 속 다음 행동, 비교·현장 기록·정리 뒤 다음 행동. 새 저장 구조 없이 기존 기능을 잇고, 자동 이동이 없다"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    home = (out / "index.html").read_text(encoding="utf-8")
    gates = home[home.index("data-gates"):home.index('class="roof-strip"')]          # 위쪽 메뉴의 같은 링크와 섞이지 않게 입구 영역만
    for key in ("data-gate-compare", "data-gate-visit", 'href="finder.html"', 'href="compare.html"', 'href="projects.html"'):
        assert key in gates, key
    assert gates.index('href="finder.html"') < gates.index('href="compare.html"') < gates.index('href="projects.html"')   # 찾기 → 비교 → 임장 순서
    assert gates.count('class="gate-btn"') == 3 and home.count("data-gates") == 1
    assert "rooftop.html" in home and "roof-strip" in home       # 옥상은 그대로 있음
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "function gates()" in app and "const entries = () => {" in app and "gates(); resume(); };" in app
    assert "DJ.activeProject()" in app[app.index("function gates()"):app.index("function gates()") + 900]
    assert "action.href" in app and "toast-act" in app                                # 알림 속 다음 행동 링크
    toast = app[app.index("DJ.toast = function"):app.index("DJ.unlock = function")]
    assert "location" not in toast and "assign(" not in toast and "replace(" not in toast  # 알림은 스스로 이동시키지 않음
    cmp_js = (out / "static" / "compare.js").read_text(encoding="utf-8")
    assert 'id="vs-next"' in (out / "compare.html").read_text(encoding="utf-8")
    assert "function nextStep(" in cmp_js and "DJ.addToCourse(" in cmp_js and "projects.html" in cmp_js
    field = (out / "static" / "field.js").read_text(encoding="utf-8")
    assert "function nextAfterVisit()" in field and "if (!was) nextAfterVisit()" in field   # 켤 때만
    proj = (out / "static" / "projects.js").read_text(encoding="utf-8")
    assert "다시 비교하기" in proj and "compare.html?s=" in proj
    css = (out / "static" / "style.css").read_text(encoding="utf-8")
    assert ".toast-act" in css and "min-height: 44px" in css[css.index(".toast-act"):css.index(".toast-act") + 200]
    # 새 저장 구조 없음: 이번 변경이 만든 코드가 새 키를 쓰지 않는다
    for code in (app[app.index("function gates()"):app.index("function gates()") + 1500], cmp_js[cmp_js.index("function nextStep("):cmp_js.index("function nextStep(") + 1800]):
        assert 'save("' not in code and "localStorage" not in code


def test_lean_page_headers_keep_one_note_box(tmp_path):
    """네 화면(찾기·비교·카드첩·프로젝트)의 머리말: 제목 아래 설명은 접이식 상자 하나에 모으고, 같은 안내를 되풀이하지 않는다. 문구는 지우지 않고 상자 안으로 옮긴다"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    pages = {n: (out / f"{n}.html").read_text(encoding="utf-8") for n in ("finder", "compare", "cards", "projects")}
    for n, h in pages.items():
        hero = h[h.index('class="page-hero'):h.index("</section>", h.index('class="page-hero'))]
        assert "page-hero" in hero and "lean" in hero.split(">")[0], n
        assert hero.count('<details class="hero-note">') == 1 and 'class="lead"' not in hero, n    # 설명 상자 하나, 따로 떠 있는 긴 설명 없음
        assert len(hero.split("</summary>")[0].split("<summary>")[1]) < 400, n
    f_hero = pages["finder"][pages["finder"].index('class="page-hero'):pages["finder"].index("</section>")]
    assert "실거래까지 반영" in f_hero and f_hero.index("<details") < f_hero.index("실거래까지 반영")   # 기준일 안내는 지워지지 않고 상자 안에 있음
    assert "백업하세요" in pages["cards"] and "백업하세요" in pages["projects"]                      # 저장 안내도 지워지지 않음(상자 안)
    assert 'data-storage-summary' in pages["cards"] and 'data-storage-summary' in pages["projects"]  # 로그인 시 바뀌는 칸을 계속 이어받음
    assert pages["projects"].count("어떤 집을 찾고 있나요") == 1 and "새 프로젝트 만들기" not in pages["projects"]   # 같은 뜻의 소제목 두 개를 하나로
    assert 'data-pj-create' in pages["projects"] and 'name="name"' in pages["projects"]
    js = (out / "static" / "cards.js").read_text(encoding="utf-8")
    assert "카드를 뒤집으면 선정 이유가 표시됩니다" not in js and pages["cards"].count("카드를 뒤집으면") == 0   # 같은 안내가 네 번 나오던 것을 없앰


def test_field_mode_confirms_only_after_real_save(tmp_path):
    """UX 2차 A·B: 현장 모드는 저장이 실제로 된 뒤에만 '다녀왔어요'·체크를 확정하고, 사진은 서버 삭제가 실패하면 되돌린다.
    (실제 동작은 브라우저에서 저장소가 가득 찬 경우와 서버가 삭제를 거절한 경우로 확인함. 여기서는 그 연결이 사라지지 않도록 고정한다)"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    js = (out / "static" / "field.js").read_text(encoding="utf-8")
    assert "function persist()" in js and "const ok = keep();" in js
    been = js[js.index('been.addEventListener("click"'):js.index("nextAfterVisit();", js.index('been.addEventListener("click"'))]
    assert "if (!persist())" in been and been.index("if (!persist())") < been.index("paint();")      # 저장 성공을 본 뒤에야 켜진 표시
    chk = js[js.index('cb.addEventListener("change"'):js.index("const t = el(", js.index('cb.addEventListener("change"'))]
    assert "if (!persist())" in chk and "cb.checked = was" in chk                                       # 체크리스트도 같게
    assert ".catch(() => {})" not in js[js.index('el("button", "fm-ph-del"'):js.index("if ((v.p || []).length < MAXP)")]   # 사진 삭제 오류를 삼키지 않음
    assert "await DJ.photoDel([path])" in js and "사진을 지우지 못했어요" in js and "photoWhy(e)" in js
    assert js.index("if (!persist()) { v.p.splice(at, 0, gone)") < js.index("await DJ.photoDel([path])")  # 기록을 못 바꾸면 파일도 지우지 않음
    assert "DJ.photoDel([path]).catch(() => {}); }" in js                                              # 올린 뒤 기록에 못 남긴 파일만 조용히 치움
    course = (out / "static" / "course.js").read_text(encoding="utf-8")
    assert "if (!DJ.saveVisit(c.s, v)) { set(was); cb.checked = was; }" in course
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert ".toast:not(.out) > strong" in app                                                           # 같은 알림이 겹겹이 쌓이지 않음


def test_project_report_print_keeps_blocks_whole(tmp_path):
    """한 장 보고서 인쇄: 긴 메모는 토막마다 이름표가 붙고(쪽이 넘어가도 어느 단지인지 보임), 제목이 쪽 끝에 혼자 남거나 긴 주소가 오른쪽에서 잘리지 않는다"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    js = (out / "static" / "projects.js").read_text(encoding="utf-8")
    assert "DJProjectReport.chunks(m.text)" in js and "이어서" in js and "pj-r-mb" in js
    from pathlib import Path
    css = (Path(__file__).resolve().parent.parent / "static" / "style.css").read_text(encoding="utf-8")   # 배포본은 공백이 압축돼 원본으로 확인
    assert ".pj-report h3, .pj-report h4 { break-after: avoid; }" in css
    assert ".pj-r-mb { break-inside: avoid; }" in css and "overflow-wrap: anywhere" in css
    assert ".pj-r-mb{break-inside:avoid" in (out / "static" / "style.css").read_text(encoding="utf-8").replace(" ", "") or ".pj-r-mb" in (out / "static" / "style.css").read_text(encoding="utf-8")


def test_apt_detail_has_compare_in_the_action_row(tmp_path):
    """UX 2차: 단지 상세 위쪽 행동 줄에 '비교'. 관심 단지가 있으면 이 단지와 함께, 없으면 이 단지 하나로 비교를 연다. 새 저장 구조 없음"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "apt" / "DEMO-0001.html").read_text(encoding="utf-8")
    row = page[page.index('class="icon-actions apt-actions"'):page.index("</div>", page.index('class="icon-actions apt-actions"'))]
    assert "data-compare-here" in row and 'compare.html?a=DEMO-0001' in row
    assert row.index("data-course-add") < row.index("data-compare-here") < row.index("data-field")      # 관심 · 코스 · 비교 · 현장 체크 · 공유 순서
    assert 'aria-label="다른 단지와 비교하기"' in row and "<span>비교</span>" in row
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "[data-compare-here]" in app and "DJ.favs().filter(s => s !== c.s" in app and ".slice(0, 3)" in app    # 관심 단지 최대 3곳 + 이 단지 = 최대 4곳
    assert "compare.html?a=" in page[page.index("주요 지표 비교"):page.index("주요 지표 비교") + 400]          # 아래쪽 기존 '다른 단지와 비교' 링크는 그대로


def test_visit_prep_name_is_the_same_everywhere(tmp_path):
    """UX 2차: 하단 탭·위 메뉴·전체 메뉴·홈 입구가 같은 이름('임장 준비')을 쓰고, 목적지는 그대로(프로젝트). '임장 코스'는 코스 화면 이름으로만 남는다"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    home = (out / "index.html").read_text(encoding="utf-8")
    tab = home[home.index('class="tabbar"'):home.index("</nav>", home.index('class="tabbar"'))]
    assert 'data-tab="projects"' in tab and "임장</a>" in tab
    assert [tab.index(h) for h in ('index.html', 'finder.html', 'compare.html', 'projects.html', 'my.html')] == sorted(tab.index(h) for h in ('index.html', 'finder.html', 'compare.html', 'projects.html', 'my.html'))   # 탭 순서: 홈·찾기·비교·임장·MY
    assert ">임장 준비<svg" in home and ">임장</button>" not in home                                       # 위 메뉴
    gates = home[home.index("data-gates"):home.index('class="roof-strip"')]
    assert "data-gv-k>임장 준비<" in gates and "임장 준비 열기" in gates and 'href="projects.html" data-gv-btn' in gates
    from pathlib import Path
    allmenu = (Path(__file__).resolve().parent.parent / "templates" / "_allmenu.html").read_text(encoding="utf-8")   # 전체 메뉴는 부분 화면이라 원본에서 확인
    assert "<h3>임장 준비</h3>" in allmenu and 'aria-label="임장 준비 메뉴"' in allmenu and "<h3>임장</h3>" not in allmenu
    assert "<li><a href=\"my.html#course\">임장 코스</a></li>" in allmenu                                    # 코스 화면 이름은 그대로
    assert "임장 코스" in home                                                                            # 코스 화면 이름은 그대로 남아 있음
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert '"이어하기"' in app and '"이어서 하기"' in app                                                   # 진행 중일 때의 이름은 그대로


def test_mobile_text_wrap_rules_stay(tmp_path):
    """UX 2차: 모바일 글자 밀림 정리. 개수 칸의 '대전 전체'는 좁은 화면에서 '전체'만, 안내문은 한 줄, 문단·제목 끝에 한두 단어만 남지 않도록 text-wrap 규칙을 유지한다"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    finder = (out / "finder.html").read_text(encoding="utf-8")
    assert '<span class="sv-rg">' in finder and "전체</small>" in finder and "data-sv-all" in finder       # 지역 이름만 접을 수 있게 감쌈, 문구는 그대로
    css = (root / "static" / "style.css").read_text(encoding="utf-8")
    tail = css[css.index("모바일 글자 밀림 정리"):]
    assert "p, li, dd, summary, figcaption { text-wrap: pretty; }" in tail
    assert "text-wrap: balance" in tail and ".sv-delta" in tail and ".sv-count .sv-rg { display: none; }" in tail
    assert ".sv-delta { grid-column: 1 / -1; grid-row: 2;" in tail and ".sv-count-box { display: contents; }" in tail   # 안내문은 제목 아래 한 줄
    assert ".ls em, .pt-v, .loc-pct { white-space: nowrap; }" in tail
    # .ki-note(단지 정보 칸의 긴 안내)는 줄바꿈을 허용: nowrap 이면 휴대폰에서 칸 밖으로 밀려 화면 전체가 옆으로 움직였다(Android 앱 UX)
    assert ".ki-note { white-space: normal; overflow-wrap: anywhere; }" in tail
    js = (root / "static" / "finder.js").read_text(encoding="utf-8")
    assert "조건을 고를수록 좁혀집니다" in js and "data-sv-delta" in js                                      # 문구와 연결은 그대로


def test_mobile_visual_first_and_station_filter_box(tmp_path):
    """모바일: 조건으로 찾기는 그림이 질문 위에 먼저(낮게 잘라 질문 제목과 한 화면에), 역 화면은 정렬+역 고르기를 한 상자에 담고 휴대폰에서는 가로로 밀어 찾는 칩 줄 대신 선택 상자를 쓴다"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    css = (root / "static" / "style.css").read_text(encoding="utf-8")
    assert ".sv-art { order: 2; }" not in css                                                                  # 그림을 질문 아래로 보내던 규칙이 없다
    assert ".sv-art .sv-svg { height: 150px; max-height: 150px; object-fit: cover;" in css
    finder = (out / "finder.html").read_text(encoding="utf-8")
    assert finder.index("data-sv-art") < finder.index("data-sv-q")                                             # 마크업 순서도 그림 → 질문
    stations = (out / "stations.html").read_text(encoding="utf-8")
    assert 'class="st-filter"' in stations and "data-st-jump" in stations and 'class="page-hero lean"' in stations
    box = stations[stations.index('class="st-filter"'):stations.index("</section>", stations.index('class="st-filter"'))]
    assert "data-st-sort" in box and "data-st-jump" in box                                                     # 정렬과 역 고르기가 한 상자 안
    assert 'class="jump station-jump"' in stations                                                             # 넓은 화면용 바로가기 줄은 그대로
    assert "@media (max-width: 899px) { .station-jump { display: none; } }" in css
    js = (out / "static" / "app.js").read_text(encoding="utf-8")
    assert "function stationJump()" in js and "stationJump();" in js and "stationFocus();" in js                # 검색에서 들어오는 ?st= 도 그대로


def test_toast_stays_above_bottom_sheets(tmp_path):
    """UX 2차: 현장 시트가 열린 채 뜨는 알림('다음 단지 현장 모드 →')이 어두운 뒷판(90)·시트(91) 뒤에 깔려 눌리지 않던 문제. 알림은 시트 위(100), 사진 보기·복사창(110~121) 아래"""
    from pathlib import Path
    import re
    css = (Path(__file__).resolve().parent.parent / "static" / "style.css").read_text(encoding="utf-8")
    z = lambda sel: int(re.findall(re.escape(sel) + r"[^}]*?z-index:\s*(\d+)", css)[-1])
    assert z(".toast-zone") > z(".sheet") > z(".sheet-back")
    assert z(".toast-zone") < z(".viewer-back") and z(".toast-zone") < z(".copybox-back")


def test_detail_card_budget_line_is_wired_and_hidden_by_default():
    """UX 2차: 상세 카드의 '추정 시세 / 내 예산' 한 줄. 기본은 숨김(예산을 정하지 않은 사람에게는 자리도 없음), fit.js 로 계산, 판단어 없음"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    apt = (root / "templates" / "apt.html").read_text(encoding="utf-8")
    assert 'data-mc-fit hidden' in apt and 'static/fit.js' in apt
    assert apt.index('static/fit.js') < apt.index('static/field.js')
    app = (root / "static" / "app.js").read_text(encoding="utf-8")
    assert 'DJFit.budgetGap' in app and 'DJFit.budgetText' in app


def test_share_view_leaves_photos_out_on_server_and_screen():
    """P0 개인정보: 사진 저장소를 비공개로 닫아도 shared_view 가 방문 기록을 통째로 돌려주면 사진 경로(회원 id 포함)가 로그인 없는 사람에게 나감.
    서버(SQL)는 방문 기록에서 체크 c·x, 메모 m, 호가 q, 다녀온 날 d 만 돌려주고(허용 목록), 화면(share.js)은 사진을 그리지도 요청하지도 않음"""
    import re
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    for name in ("scripts/supabase_setup.sql", "scripts/migrations/shared_view_no_photos_apply.sql"):
        sql = (root / name).read_text(encoding="utf-8")
        fn = sql[sql.index("function public.shared_view(t text)"):]
        fn = fn[:fn.index("$$;", fn.index("$$;") + 3) + 3] if fn.count("$$;") > 1 else fn
        assert "e.key in ('c', 'x', 'm', 'q', 'd')" in fn, name                 # 허용 목록 방식
        assert "jsonb_each(k.v)" in fn and "else k.v end" in fn, name
        assert "'p'" not in fn.replace("'p'", "", 0) or "key in ('c', 'x', 'm', 'q', 'd')" in fn, name
        assert re.search(r"\bin \([^)]*'p'", fn) is None, name                  # 허용 목록에 사진(p)이 들어 있으면 안 됨
    rb = (root / "scripts/migrations/shared_view_no_photos_rollback.sql").read_text(encoding="utf-8")
    assert "jsonb_object_agg(k.k, k.v)" in rb                                    # 되돌리기는 옛 동작
    js = (root / "static" / "share.js").read_text(encoding="utf-8")
    for bad in ("photoUrl", "sh-photos", "sh-photo-off", "v.p", "<img", 'el("img")'):
        assert bad not in js, bad
    assert "사진은 제외" in js
    css = (root / "static" / "style.css").read_text(encoding="utf-8")
    assert ".sh-photos" not in css and ".sh-photo-off" not in css                # 죽은 스타일도 없음


def test_finder_reserves_space_for_late_drawn_art_and_question():
    """UX 2차: 조건으로 찾기는 그림·질문을 스크립트가 나중에 채워 아래 내용이 밀렸음(레이아웃 흔들림 0.3~0.4). 빈 칸일 때도 같은 크기의 자리를 미리 잡는다"""
    from pathlib import Path
    css = (Path(__file__).resolve().parent.parent / "static" / "style.css").read_text(encoding="utf-8")
    assert ".sv-art:empty { aspect-ratio: 520 / 330;" in css
    assert ".sv-art:empty { min-height: 152px; }" in css and ".sv-q:empty { min-height: 276px; }" in css
def test_tap_targets_stay_at_least_44px_for_common_controls():
    """UX 2차: 768폭에서 40px 이던 상단 메뉴·기록 버튼·시세띠·화살표, 30px 이던 카드 뒤집기의 누르는 칸을 44px 이상으로"""
    from pathlib import Path
    css = (Path(__file__).resolve().parent.parent / "static" / "style.css").read_text(encoding="utf-8")
    tail = css[css.index("/* 터치 영역: 자주 누르는 것은 44px 이상으로"):]
    for rule in (".top-nav > a, .tn-btn { min-height: 44px; }", ".rcd-fab { min-height: 44px; }", ".rail-btn { width: 44px; height: 44px; }",
                 ".tk { min-height: 44px;", ".mcard-turn::after { content: \"\"; position: absolute; inset: -7px;"):
        assert rule in tail, rule
def test_mobile_chip_rows_are_tidy_grids():
    """UX 2차: 휴대폰에서 구·면적 칩이 줄마다 폭이 들쭉날쭉하고 한 칩이 혼자 떨어졌음. 폭이 같은 격자로, 숨는 항목 없이"""
    from pathlib import Path
    css = (Path(__file__).resolve().parent.parent / "static" / "style.css").read_text(encoding="utf-8")
    tail = css[css.index("/* 휴대폰: 구·면적 칩을 폭이 같은 격자로"):]
    assert ".controls > #gu-filter { flex: 1 1 100%; }" in tail      # 가로 배치 칸 안에서 폭 전체를 써야 격자가 줄어들지 않음
    assert "#gu-filter, [data-area-filter] { display: grid;" in tail
    assert ".chips.trade-area { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }" in tail
    assert "min-height: 44px" in tail and "overflow-x" not in tail     # 가로로 숨기지 않음


def test_photo_wording_matches_private_storage():
    """사진 저장소를 비공개로 닫으면 '함께 보기'에는 사진이 안 보임. 처리방침·내 정보·공유 화면 설명이 사실과 같아야 함(옛 '주소를 아는 사람만 볼 수 있어요'·'사진 포함' 문구 금지)"""
    from pathlib import Path
    t = Path(__file__).resolve().parent.parent / "templates"
    privacy = (t / "privacy.html").read_text(encoding="utf-8")
    assert "로그인한 본인만 볼 수 있고" in privacy and "임장 노트(사진은 제외)" in privacy
    assert "그 주소를 아는 사람만" not in privacy and "임장 노트(사진 포함)" not in privacy
    assert "사진 포함" not in (t / "me.html").read_text(encoding="utf-8")
    assert "메모·사진)예요" not in (t / "share.html").read_text(encoding="utf-8")


def test_field_photo_note_matches_private_storage():
    """사진 저장소가 비공개가 되어 공유 링크로는 사진이 안 보임. 현장 모드의 사진 안내가 '가족도 볼 수 있어요'라고 하면 안 됨"""
    from pathlib import Path
    js = (Path(__file__).resolve().parent.parent / "static" / "field.js").read_text(encoding="utf-8")
    assert "로그인한 나만 볼 수 있어요. 공유 링크로는 보이지 않아요." in js
    assert "공유 링크를 받은 가족도 볼 수 있어요" not in js


def test_choice_chips_report_their_selected_state_to_assistive_tech():
    """UI 감사: 한 번에 하나만 고르는 칩·세그먼트는 클릭 처리 코드가 'active' 클래스만 바꿔서 화면 읽기 도구에는 선택 상태가 안 알려졌음(홈 구 칩 16개·테마 칩·가격 기간 버튼 등).
    클래스 변화를 한 곳에서 aria-pressed 로 맞춘다. 'active' 가 있는 묶음만 대상이라 '단지 추가' 같은 행동 칩과 role=tab(aria-selected 사용)은 건드리지 않음"""
    from pathlib import Path
    js = (Path(__file__).resolve().parent.parent / "static" / "app.js").read_text(encoding="utf-8")
    assert 'const BTN = "button.chip, button.seg-btn";' in js
    assert 'b.getAttribute("role") !== "tab"' in js and 'btns.some(b => b.classList.contains("active"))' in js
    assert 'attributeFilter: ["class"]' in js and 'setAttribute("aria-pressed", b.classList.contains("active")' in js


def test_detail_to_check_box_uses_only_real_values_and_touch_sizes():
    """UX 2차: 상세 '임장 때 직접 확인할 것'은 거래 건수 부족·언덕·소음·소규모 단지 값에서만 만들고 해당 없으면 통째로 안 보임. 가격 입력칸·지역 이름 버튼 누르는 칸 44px"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    apt = (root / "templates" / "apt.html").read_text(encoding="utf-8")
    assert "{% if todo %}" in apt and 'id="to-check-t"' in apt and 'id="points"' in apt
    for cond in ("thin_n is not none", 'hill.cls in ("slope", "hill")', 'noise.cls in ("near", "mid")', "c.small"):
        assert cond in apt, cond
    css = (root / "static" / "style.css").read_text(encoding="utf-8")
    assert ".pay-form select, .pay-form input, .sv-calc .field input, .sv-calc .field select { min-height: 44px; }" in css
    assert ".rg-word { padding-block: 5px; margin-block: -5px; }" in css


def test_home_list_filters_come_back_after_browser_back():
    """상세를 보고 뒤로 가면 홈 표의 구·검색어·종류 선택이 풀려 있던 문제. 뒤로·앞으로 이동일 때만 탭 기억(sessionStorage)에서 되살린다.
    새로 열기·새로고침·'?area=' 로 들어온 경우는 기존 동작 그대로여야 하므로 조건을 함께 지킨다"""
    from pathlib import Path
    js = (Path(__file__).resolve().parent.parent / "static" / "table.js").read_text(encoding="utf-8")
    assert 'nav.type === "back_forward"' in js
    assert '!(qs.get("area") || qs.get("dong"))' in js and 'location.hash !== "#list"' in js
    assert "sessionStorage.setItem(KEEP" in js and "function reset() { limit = PAGE; apply(); save(); }" in js


def test_compare_next_step_sits_above_the_result_table():
    """명령서 3-F: 비교 후 임장으로 이어지는 기능은 유지하되 표(3,700px) 맨 아래에 있어 멀었음. 결과 표 위로 올려
    단지를 2곳 이상 고르면 바로 임장 코스·프로젝트로 갈 수 있게 한다(상자는 2곳 미만이면 hidden 그대로)"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    t = (root / "templates" / "compare.html").read_text(encoding="utf-8")
    assert t.index('id="vs-next"') < t.index('id="vs-result"')
    assert 'id="vs-next" aria-label="비교 다음 단계" hidden' in t
    js = (root / "static" / "compare.js").read_text(encoding="utf-8")
    assert "고른 단지로 이어가기" in js and "box.hidden = cs.length < 2;" in js


def test_detail_check_box_leads_to_field_mode_button():
    """명령서 3-C: '추가로 확인할 것' → 현장 기록 경로. 확인할 것 상자 안에 현장 모드를 여는 큰 버튼(data-field, 기존 현장 모드 시트 재사용).
    상자는 값이 있을 때만 나오므로 버튼도 그 안에만 있어야 한다(해당 없는 단지에 혼자 뜨지 않음)"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    apt = (root / "templates" / "apt.html").read_text(encoding="utf-8")
    box = apt[apt.index('<section class="to-check"'):apt.index("</section>", apt.index('<section class="to-check"'))]
    assert 'class="btn to-check-go" data-field' in box and 'aria-controls="field-sheet"' in box
    assert apt.count("to-check-go") == 1
    css = (root / "static" / "style.css").read_text(encoding="utf-8")
    assert ".to-check .to-check-go { width: 100%; justify-content: center; min-height: 48px;" in css


def test_detail_price_board_separates_real_and_estimated_and_shows_thin_notice():
    """4-A 상세: 가격판(.pb)에 실거래와 비교용 추정을 서로 다른 모양으로 나란히, 기준일·가격 근거 건수(3건 미만일 때만)·내 예산 차이(data-mc-fit)를 그 바로 아래에.
    h1 은 문서 맨 앞(가격판)에 하나뿐이고, 5개 범주 줄(#catalog)은 금박 카드보다 앞에 있다. 금박 카드 안의 중복 가격 칸은 없다"""
    from pathlib import Path
    apt = (Path(__file__).resolve().parent.parent / "templates" / "apt.html").read_text(encoding="utf-8")
    board = apt[apt.index('<section class="pb"'):apt.index("</section>", apt.index('<section class="pb"'))]
    assert 'class="pb-p pb-real"' in board and 'class="pb-p pb-est"' in board and board.index("pb-real") < board.index("pb-est")
    assert "추정 · 비교용" in board and "실거래" in board and "{{ lead.price | price }}" in board and "{{ c.price_ref | price }}" in board
    assert '<p class="pb-fit" data-mc-fit hidden></p>' in board
    assert "{% if thin_n is not none %}" in board and "가격 근거 {{ thin_n }}건" in board
    assert apt.count("<h1") == 1 and apt.index("<h1") < apt.index('class="mc g-')
    assert apt.index('id="catalog"') < apt.index('class="apt-hero"') < apt.index('class="jump apt-jump"')
    assert 'class="mc-cells"' not in apt and "thin-chip" not in apt and 'class="mc-fit"' not in apt


def test_finder_question_header_says_single_or_multiple_choice():
    """명령서 3-B: 조건 찾기에서 단일 선택과 복수 선택을 화면에서 구분. 질문 번호 줄에 '하나만 고르세요 / 여러 개 고를 수 있어요'를 붙인다
    (지역·평형·필수 조건은 복수, 상황·직장·예산·연식은 단일, 역·학교는 각각 하나)"""
    from pathlib import Path
    js = (Path(__file__).resolve().parent.parent / "static" / "finder.js").read_text(encoding="utf-8")
    for step_id, kind in (("status", "one"), ("gu", "many"), ("work", "one"), ("budget", "one"), ("py", "many"), ("age", "one"), ("near", "one"), ("must", "many")):
        assert f'{{ id: "{step_id}", pick: "{kind}"' in js, step_id
    assert '여러 개 고를 수 있어요' in js and '하나만 고르세요' in js and '각각 하나만 고르세요' in js


def test_home_entries_sit_under_search_with_one_main_action():
    """4-A 홈: 찾기·비교·임장 입구는 검색창 바로 아래(hero-copy 안)이고 카드덱보다 앞. 으뜸 행동(.gate-main)은 기본 '찾기' 하나,
    진행 중인 프로젝트가 있으면 app.js 가 그 자리를 '이어서 하기'로 옮김. 으뜸 카드는 CSS order 로 항상 맨 위"""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    home = (root / "templates" / "index.html").read_text(encoding="utf-8")
    app = (root / "static" / "app.js").read_text(encoding="utf-8")
    css = (root / "static" / "style.css").read_text(encoding="utf-8")
    assert home.index("data-search-go") < home.index('data-resume') < home.index("data-gates") < home.index('class="hero-deck"') < home.index('class="roof-strip"')
    assert home.count("gate-main") == 1 and home.index("gate-main") < home.index("data-gate-compare") < home.index("data-gate-visit")
    g = app[app.index("function gates()"):app.index("function gates()") + 1400]
    assert 'classList.remove("gate-main")' in g and 'v.classList.add("gate-main")' in g
    assert ".gate-main { order: -1;" in css and css.count(".gates { display: grid;") == 1


def test_lead_trade_never_shows_cancelled_deal_as_recent_price():
    """검수 P0: 해제(취소) 거래만 있는 단지에서 취소 거래를 '최근 실거래'로 내세우지 않는다. 데이터는 고치지 않고 목록에는 그대로 둔다"""
    import datetime as dt
    from djdex.site import _lead_trade
    d = lambda m: dt.datetime(2026, m, 1)
    mk = lambda m, price, **kw: {"price": price, "date": d(m), "area": 84.9, "cancelled": False, "direct": False, "kind": "매매", **kw}
    # 거래 없음
    assert _lead_trade([], False) == (None, "거래 내역 없음")
    # 취소 거래만
    only_cancel = [mk(6, 90000, cancelled=True), mk(5, 88000, cancelled=True)]
    lead, why = _lead_trade(only_cancel, False)
    assert lead is None and "해제" in why and len(only_cancel) == 2 and only_cancel[0]["price"] == 90000
    # 최신이 취소면 그 다음 유효 거래
    lead, why = _lead_trade([mk(6, 90000, cancelled=True), mk(5, 80000), mk(4, 79000)], False)
    assert lead["price"] == 80000 and why is None
    # 직거래 제외 설정
    assert _lead_trade([mk(6, 70000, direct=True)], True)[0] is None
    assert _lead_trade([mk(6, 70000, direct=True)], False)[0]["price"] == 70000
    # 매매가 있으면 더 최신인 분양권보다 매매를 먼저, 분양권뿐이면 그것(종류는 화면에서 표시)
    assert _lead_trade([mk(6, 95000, kind="분양권"), mk(3, 80000)], False)[0]["price"] == 80000
    assert _lead_trade([mk(6, 95000, kind="분양권")], False)[0]["kind"] == "분양권"


def _build_detail_pages(tmp_path, rows, **cfg_over):
    import pandas as pd
    from djdex import config, metrics, site
    base = {"gu": "서구", "dong": "둔산동", "jibun": "1", "build_year": 2004, "floor": 7, "direct": False, "cancelled": False}
    out = []
    for cid, items in rows.items():
        for d, area, price, extra in items:
            out.append({**base, "complex_id": cid, "name": cid, "date": d, "area": area, "price": price, **extra})
    trades = pd.DataFrame(out)
    cfg = config.load()
    table, hist, meta = metrics.compute(trades, cfg.metrics, cfg.filters)
    site.build(table, hist, trades, meta, cfg, tmp_path / "s")
    return {p.stem: p.read_text(encoding="utf-8") for p in (tmp_path / "s" / "apt").glob("*.html")}


def test_detail_price_board_states_for_cancelled_only_mixed_area_and_no_estimate(tmp_path):
    """검수 6: 취소 거래만 / 서로 다른 면적 / 추정 가격 없음 단지의 가격판 표시를 실제 빌드로 확인"""
    good = [("2026-0%d-01" % m, 84.0, 50000 + m * 100, {}) for m in range(1, 6)]
    rows = {
        "OKA": good,
        "CNL": good + [("2026-06-15", 84.0, 99000, {"cancelled": True}), ("2026-06-20", 84.0, 98000, {"cancelled": True})],
        "MIX": [("2026-0%d-01" % m, 59.0, 40000 + m * 100, {}) for m in range(1, 6)] + [("2026-06-01", 84.0, 52000, {})] + good,
        "THN": [("2026-05-01", 84.0, 50000, {}), ("2026-06-01", 84.0, 51000, {})],
    }
    pages = _build_detail_pages(tmp_path, rows)
    assert pages, "상세 페이지가 만들어져야 함"
    def board(h):
        a = h.index('<section class="pb"'); return h[a:h.index("</section>", a)]
    for html in pages.values():
        b = board(html)
        assert "최근 실거래" in b and "추정 · 비교용" in b and html.count("<h1") == 1
        assert ("실제 거래 면적" in b) or ("pb-none" in b)          # 실거래 칸은 면적을 적거나, 없으면 이유를 적는다
    # 취소 거래 가격(9.9억·9.8억)은 취소 거래가 섞인 단지(CNL)의 가격판에도 대표 가격으로 나오지 않고, 유효 거래 가격이 나온다
    assert "9.9억" not in board(pages["CNL"]) and "9.8억" not in board(pages["CNL"]) and "5.0" in board(pages["CNL"])
    # 실거래 면적과 추정 면적이 다르면(MIX 59㎡ 위주 + 84㎡ 한 건) 안내 문구, 같으면 '모두 ... 기준' 문구
    assert ("면적 기준이 달라요" in board(pages["MIX"])) or ("두 가격 모두 전용" in board(pages["MIX"]))
    assert all(("면적 기준이 달라요" in board(h)) or ("두 가격 모두 전용" in board(h)) or ("실제 가격이 아니에요" in board(h)) or ("pb-none" in board(h)) for h in pages.values())


def test_home_resume_card_shows_only_recorded_state_and_next_action():
    """4-B2: 홈 '이어하기' 카드는 실제 기록(후보 수, 이 프로젝트 후보 중 방문 기록이 있는 단지 수)에서만 상태를 만들고,
    다음 행동도 그 숫자로만 정한다. 비교했는지는 기록이 없어 말하지 않는다. 방문 기록 모듈(visit-log.js)을 홈에서도 불러온다"""
    home = (ROOT_DIR / "templates" / "index.html").read_text(encoding="utf-8")
    app = (ROOT_DIR / "static" / "app.js").read_text(encoding="utf-8")
    g = app[app.index("function gates()"):app.index("function gates()") + 2600]
    assert "DJVisitLog.list({ region, projectId: pj.id })" in g and "pj.slugs.includes(x)" in g
    assert "다녀온 ${went}곳" in g and "다음: 후보 더 담기" in g and "안 가 본 후보 ${n - went}곳" in g and "다음: 기록을 보며 다시 비교" in g
    assert "비교했" not in g and "비교 완료" not in g
    assert '<script src="static/visit-log.js?v={{ v }}"></script>' in home
    assert home.index('<script src="static/visit-log.js') < home.index('<script src="static/table.js')


def test_project_steps_do_not_force_order_or_claim_unrecorded_compare():
    """4-B2: 프로젝트 단계 표시는 기록이 남은 것만 완료(✓). 비교·코스는 했다는 기록이 없으니 완료로 세지 않고 '원할 때'(free)로 두며,
    방문을 먼저 해도 3번째 단계가 바로 진행 중이 된다. 순서가 상관없다는 안내 문구가 있다"""
    js = (ROOT_DIR / "static" / "projects.js").read_text(encoding="utf-8")
    html = (ROOT_DIR / "templates" / "projects.html").read_text(encoding="utf-8")
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    s = js[js.index("const steps = ["):js.index("find(\"[data-pj-steps]\").replaceChildren")]
    assert 's: n < 2 ? "todo" : "free"' in s and "logs.length ? \"done\"" not in s.split("비교하고")[1].split("다녀와서")[0]
    assert 's: !logs.length ? "todo" : went >= 2 ? "done" : "now"' in s       # 방문 기록만으로 3번째 단계가 정해짐(후보 수와 무관한 순서 강제 없음)
    assert "순서는 상관없어요" in html and "pj-steps-note" in html and ".pj-step.free { border-style: dashed; }" in css


def test_home_list_follows_map_and_intro_skips_for_people_with_own_records():
    """4-B2: 검색·정렬이 되는 '전체 단지' 구역은 지도 바로 뒤, 동네 온도 이하는 그 뒤(바로가기 줄도 같은 순서). 인트로는 처음 온 사람만 거치고,
    이 기기에 관심 단지·프로젝트·방문 기록이 있는 사람은 건너뛴다(빈 관심 목록은 기록으로 세지 않음). 첫 방문 인트로·지역 이동 규칙은 그대로"""
    home = (ROOT_DIR / "templates" / "index.html").read_text(encoding="utf-8")
    assert home.index('id="map"') < home.index('<section id="list"') < home.index('id="heat"') < home.index('id="movein"') < home.index('id="world"')
    j = home[home.index('<nav class="jump"'):home.index("</nav>", home.index('<nav class="jump"'))]
    assert j.index('href="#list"') < j.index('href="#heat"') < j.index('href="#world"')
    assert home.count('<section id="list"') == 1 and "contain-intrinsic-size: auto 2400px" in (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    h = home[home.index("function own()"):home.index("function own()") + 520]
    assert '"project:"' in h and '"visitlog:"' in h and '"favs"' in h and '"[]"' in h
    assert "&&!own()&&" in home and 'location.replace("intro.html")' in home and 'sessionStorage.getItem("dj-intro")' in home


def test_detail_fit_summary_reuses_djfit_and_index_calc_is_an_accordion():
    """4-B1: 상세의 '내 조건과 견줘 보기'는 가격판 바로 뒤에 숨은 채로 있다가, 저장된 조건이 있을 때만 app.js 가 DJFit.evaluate 결과로 채워 보인다
    (새 판정 로직 없음, 자료 없음은 따로, 평가·추천 문구 없음). 지수 계산 구역은 접는 상자 안에 있고 해시로 들어오면 펼쳐진다"""
    from pathlib import Path
    apt = (ROOT_DIR / "templates" / "apt.html").read_text(encoding="utf-8")
    app = (ROOT_DIR / "static" / "app.js").read_text(encoding="utf-8")
    assert apt.index('class="pb"') < apt.index("data-fit-sum") < apt.index('id="catalog"') and apt.count('<details class="pf" data-fit-sum') == 1
    assert '<details class="pf" data-fit-sum hidden>' in apt
    g = app[app.index('const fitSum = document.querySelector("[data-fit-sum]")'):]
    g = g[:g.index("상세 위쪽 '비교'")]
    assert "DJFit.hasConditions(s)" in g and "DJFit.evaluate(s, full," in g and "자료 없음 (맞다고 세지 않아요)" in g
    assert "추천" not in g and "합격" not in g and "불합격" not in g
    calc = apt[apt.index('id="index-calc"'):]
    calc = calc[:calc.index("</section>")]
    assert '<details class="acc" data-acc>' in calc and "charts.hist" in calc and "charts.components" in calc
    assert 'details[data-acc]' in app and 'hashchange' in app
    assert ".pf[hidden] { display: none; }" in (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")


def test_detail_fit_slots_are_reserved_before_data_arrives():
    """4-B1: 저장된 조건·예산이 있으면 요약 줄과 예산 줄 자리를 그리는 즉시 잡아 둬, 데이터가 늦게 와도 아래 내용이 밀리지 않는다(화면 흔들림 방지).
    채우기·다시 숨기기는 app.js 에서 한다(결과가 없으면 hold 를 풀고 숨김)"""
    apt = (ROOT_DIR / "templates" / "apt.html").read_text(encoding="utf-8")
    app = (ROOT_DIR / "static" / "app.js").read_text(encoding="utf-8")
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    i = apt.index("data-fit-sum"); s = apt[i:i + 1500]
    assert 'classList.add("hold")' in s and "djdex@" in s and "survey" in s
    assert "c.small" in s and "c.price_ref is not nan" in s       # 소규모·추정 없는 단지는 자리를 잡지 않음(잡았다 비우면 오히려 흔들림)
    assert 'fitSum.classList.remove("hold")' in app and 'fitLine.classList.remove("hold")' in app
    assert ".pb-fit.hold { min-height: 66px; }" in css and ".pf.hold { min-height: 62px; }" in css


def test_projects_page_has_planned_date_box_with_native_date_input_and_keeps_visits_separate():
    """4-B3: 프로젝트 화면의 방문 예정일 상자는 기본 날짜 입력(무거운 달력 라이브러리 없음)을 쓰고, 오늘 이후만 고르게 하며,
    저장·변경·취소가 모두 기존 프로젝트 저장(P.update)을 거친다. 예정일(계획)과 방문 기록(실제)은 날짜로만 견주고 서로 바꾸지 않는다"""
    html = (ROOT_DIR / "templates" / "projects.html").read_text(encoding="utf-8")
    js = (ROOT_DIR / "static" / "projects.js").read_text(encoding="utf-8")
    store = (ROOT_DIR / "static" / "project-store.js").read_text(encoding="utf-8")
    assert 'data-pj-plan-form' in html and 'name="planned" type="date" required' in html and 'data-pj-plan-clear' in html and "계획일 뿐이에요" in html
    assert html.index("data-pj-stats") < html.index("data-pj-plan") < html.index("data-pj-steps")
    assert "date.min = today" in js and 'mutate({ planned: e.target.elements.planned.value })' in js and 'mutate({ planned: "" })' in js
    assert "DJVisitLog.list({ region: REGION, projectId: current.id })" in js and "visitlog" not in js[js.index("function plan()"):js.index("function dash()")].replace("DJVisitLog", "")
    assert "version: 1" in store and "version: 2" not in store and "planned: plannedOf(value.planned)" in store
    assert "<script src" not in html or "flatpickr" not in html and "datepicker" not in html.lower()


def test_late_layout_shifts_are_removed_by_deciding_from_saved_records_before_first_paint():
    """4-C1: 홈(1280 재방문 0.075)과 프로젝트 화면(다크 0.036)의 화면 흔들림 원인은 '저장된 기록만 있으면 정해지는 것'을 단지 자료·문서 로딩이 끝난 뒤에야 바꾸던 것.
    입구 카드·이어서 줄은 문서에 자리가 있으면 바로 맞추고, 프로젝트 화면은 목록과 새 프로젝트 상자를 자료보다 먼저 맞춘다. 높이를 크게 잡아 두는 방식이 아님"""
    app = (ROOT_DIR / "static" / "app.js").read_text(encoding="utf-8")
    pj = (ROOT_DIR / "static" / "projects.js").read_text(encoding="utf-8")
    html = (ROOT_DIR / "templates" / "projects.html").read_text(encoding="utf-8")
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    assert 'if (document.querySelector("[data-gates]") && document.querySelector("[data-resume]")) entries();' in app
    assert app.count("entries();") >= 2 and "gates();\n    resume();\n    regionPicker" not in app          # DOMContentLoaded 안에서만 부르지 않음
    r = app[app.index("function resume()"):app.index("// ---------- 앱처럼 쓰기")]
    assert r.index("box.hidden = false;") < r.index("DJ.data().then")                                     # 줄은 자료보다 먼저 보임
    assert "min-height: 36px" in css[css.index(".resume {"):css.index(".resume {") + 200]
    assert pj.index('find("[data-pj-new]").open = !P.list(REGION).length;') < pj.index("DJ.data().then(d => {\n    D = d;")
    assert "editor.hidden = !current || !D;" in pj
    assert 'removeAttribute("open")' in html and html.index("data-pj-new") < html.index('removeAttribute("open")')   # 스크립트가 늦게 와도 첫 화면부터 접힘


def test_project_store_keeps_unknown_fields_but_never_lets_them_override_known_ones():
    """4-C1: 옛 코드를 가진 탭이 새 칸(planned)을 지우는 문제의 재발 방지. 앞으로 더해질 칸은 읽고 다시 저장할 때 그대로 이어 주되 알려진 칸을 덮지 못한다"""
    store = (ROOT_DIR / "static" / "project-store.js").read_text(encoding="utf-8")
    assert "const KNOWN = new Set(" in store and "...extra, version: 1" in store            # 모르는 칸을 먼저 펼치고 알려진 칸이 뒤에서 덮음
    assert "version: 2" not in store and "slice(0, 20)" in store and "String(v).length <= 400" in store


def test_late_script_and_data_arrival_no_longer_moves_the_page_on_production_like_networks():
    """4-C1b: 운영에서 재 보니 #279 후에도 홈 1280(0.079)과 프로젝트(0.045)가 흔들렸다. 데모는 스크립트·단지 자료가 빨리 와서 0이었던 것.
    원인: app.js 와 complexes.json 이 첫 그림 뒤에 도착하면 (홈) 입구 카드가 '이어서 하기'로 바뀌며 높이가 줄고, (프로젝트) 편집 영역이 나타나며 바닥글이 밀려남.
    고침: 저장된 기록만으로 정해지는 입구 카드 상태를 문서에서 바로 맞추고, 프로젝트는 자료 대기 동안 자리를 미리 잡는다. 지연을 건 시험(900ms)에서 홈·프로젝트 모두 0.001 이하"""
    home = (ROOT_DIR / "templates" / "index.html").read_text(encoding="utf-8")
    proj = (ROOT_DIR / "templates" / "projects.html").read_text(encoding="utf-8")
    pj = (ROOT_DIR / "static" / "projects.js").read_text(encoding="utf-8")
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    i = home.index("data-gv-btn"); s = home[i:i + 2600]
    assert "<script>try{var a=JSON.parse" in s and 'classList.add("gate-live")' in s and '"gate"+"-main"' in s      # 문서 안에서 바로 맞춤
    assert "p.version===1" in s and "!p.archived" in s and "p.slugs.length" in s                       # app.js 의 activeProject 와 같은 기준
    assert 'classList.add("pj-wait")' in proj and "pj-wait" in pj and ".pj-wait .pj-layout { min-height: 720px; }" in css
    assert "@media (min-width: 901px) { .pj-wait .pj-layout" in css


def test_course_and_crumb_tap_targets_reach_44px_without_changing_text_size():
    """4-C2: 임장 코스의 코스에서 빼기(×) 30→44px, 확인 목록 한 줄 44px, 첫 단지 길찾기 44px, 단지 목록 위치 링크의 누르는 범위 44px.
    글자 크기는 그대로(누르는 범위만 넓힘). 모바일 390px 실측에서 작은 대상 수가 줄었음을 확인한 변경"""
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    assert ".cs-del { width: 44px; height: 44px;" in css
    assert ".cs-check label { display: flex; gap: 8px; align-items: flex-start; min-height: 44px;" in css
    assert ".cs-leg, .cs-first { display: flex; align-items: center; min-height: 44px;" in css
    assert ".crumb a { display: inline-block; padding: 14px 0; margin: -14px 0; }" in css
    assert ".cs-t a { font-weight: 800;" in css and "padding: 8px 0; margin: -8px 0; }" in css


def test_my_screen_folds_intro_and_storage_note_but_keeps_the_login_aware_note_hook():
    """4-C2: 관심 화면 윗부분의 설명 2줄과 저장 안내를 한 줄로 접어 핵심인 '관심 단지'가 첫 화면에서 더 위에 보이게 함(390px에서 y646→553).
    저장 안내 칸(data-storage-summary)은 접힌 안에 그대로 두어 로그인 상태에 따라 sync.js 가 문구를 바꾸는 기능을 유지"""
    my = (ROOT_DIR / "templates" / "my.html").read_text(encoding="utf-8")
    i = my.index('<details class="hero-note">'); box = my[i:my.index("</details>", i)]
    assert "data-storage-summary" in box and "후보를 모아 비교하고" in box          # 안내는 지우지 않고 접어 둠
    assert my.count("data-storage-summary") == 1 and my.index("hero-note") < my.index("data-my-seg")


def test_finder_count_hint_line_reserves_its_text_height_so_results_do_not_shift():
    """4-C3: 찾기 화면 결과 개수 상자 아래 안내 줄(.sv-delta)이 비어 있다가 글자가 들어오며 6px 커져 1280px에서 화면이 흔들렸음(운영 0.024, 기준 0.02).
    글자 한 줄 높이(13px × 1.8 = 23.4px)에 맞춰 미리 24px 확보"""
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    line = next(l for l in css.splitlines() if l.startswith(".sv-delta {"))
    assert "min-height: 24px" in line and "min-height: 18px" not in line


def test_my_screen_reserves_favorites_row_height_from_saved_favs_before_data_arrives():
    """4-C4: 관심 화면에서 카드가 자료 로딩 뒤에 92→300px대로 커지며 아래 계정·임장 코스 칸이 밀렸음(운영 1280px 0.03~0.065, 기준 0.02).
    문서 안 작은 스크립트가 저장된 관심 단지 수를 읽어 #favs 에 fav-wait(카드 줄) / fav-wait0(빈 안내) 를 먼저 붙여 높이를 미리 잡음"""
    my = (ROOT_DIR / "templates" / "my.html").read_text(encoding="utf-8")
    css = (ROOT_DIR / "static" / "style.css").read_text(encoding="utf-8")
    assert my.index('id="favs"') < my.index("fav-wait0") and "fav-wait" in my and "djdex-auth" in my
    assert "#favs.fav-wait { min-height: 305px; }" in css and "#favs.fav-wait0 { min-height: 158px; }" in css



def test_map_screen_is_wired(tmp_path):
    """새 지도 화면(map.html): 핀→요약 시트, 지도/목록 전환, 찾기·홈에서 들어가는 길. 기존 index.html#map 구역은 그대로"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "map.html").read_text(encoding="utf-8")
    for key in ('data-mp-svg', 'data-mp-sheet', 'data-mp-view="map"', 'data-mp-view="list"', 'data-sh-detail', 'data-sh-sun', 'data-sh-fav', 'data-mp-q'):
        assert key in page, key
    assert "추정 시세예요" in page and "static/map.js" in page and 'class="hd-title"' in page      # 추정 표시·머리 제목
    js = (out / "static" / "map.js").read_text(encoding="utf-8")
    assert "DJ.toggleFav" in js and "preview.html#c=" in js and "preview/list.json" in js         # 기존 저장·일조 연결 재사용
    assert "window.kakao" in js and "kakao.maps.load" in js and "mp-note" in js                  # 카카오 지도는 있을 때만, 없으면 점 지도가 대체
    assert "dapi.kakao.com" not in page                                                         # 데모(키 없음)는 외부 SDK를 부르지 않음
    home = (out / "index.html").read_text(encoding="utf-8"); finder = (out / "finder.html").read_text(encoding="utf-8")
    assert 'href="map.html"' in home and 'href="map.html"' in finder and 'id="map"' in home      # 입구 연결, 옛 지도 구역 보존
    assert 'data-tab="map"' not in page and 'data-tab="finder"' in page

def test_apt_fixed_cta_reuses_existing_course_button(tmp_path):
    """단지 상세 아래 고정 버튼: 새 저장 없이 기존 '임장 코스에 넣기'(없으면 관심) 버튼을 대신 누른다"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert 'data-apt-cta hidden' in page and 'data-apt-cta-btn' in page and "임장 코스에 넣기" in page
    app = (out / "static" / "app.js").read_text(encoding="utf-8")
    body = app[app.index("function aptCta()"):app.index("function aptCta()") + 1300]
    assert "base.click()" in body and "localStorage" not in body and "DJ.addToCourse" not in body      # 저장은 원래 버튼이 함
    assert app.index("courseButton();\n    aptCta();") > 0


def test_preview_buildings_are_touch_and_keyboard_selectable(tmp_path):
    """일조 입체 그림: 건물 터치·키보드가 같은 선택 함수를 쓰고, 고를 수 없는 건물은 이유를 안내한다. 계산 코드는 그대로"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    js = (out / "static" / "preview.js").read_text(encoding="utf-8")
    assert "function wireBuildings" in js and "function whyNot" in js and "tabindex" in js
    assert "requestAnimationFrame(() => { tickRaf = 0" in js
    calc = (out / "static" / "preview-calc.js").read_text(encoding="utf-8")
    assert "wireBuildings" not in calc            # 계산 엔진은 건드리지 않음

def test_map_list_marks_complexes_without_coordinates(tmp_path):
    """좌표가 없는 단지는 지도에 점을 만들지 않고, 목록 끝에 '위치 미확인'으로만 알린다(임의 위치 금지)"""
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    js = (out / "static" / "map.js").read_text(encoding="utf-8")
    assert "NOXY" in js and "위치 미확인" in js
    assert "ALL = d.complexes.filter(c => c.la != null && c.ln != null)" in js      # 지도 점은 좌표 있는 단지만


def test_preview_stage_first_layout_has_dong_sheet():
    """일조 화면 재배치: 장면 위·결과 카드·동 버튼+날짜·시간 순서, 동 목록은 시트로. 계산 파일은 그대로"""
    root = Path(__file__).resolve().parent.parent
    html = (root / "templates" / "preview.html").read_text(encoding="utf-8")
    # 동·날짜·층 조작은 장면 위에 겹쳐 있고(st-main 안), 그 아래에 결과 카드와 시간 바가 온다
    assert html.index('class="st-main"') < html.index('id="dongBtn"') < html.index('id="floor"') < html.index('id="result-card"') < html.index('id="vtime"')
    assert 'id="glbox"' in html and 'id="engBtn"' in html
    assert 'id="dongSheet"' in html and 'id="dong"' in html
    js = (root / "static" / "preview.js").read_text(encoding="utf-8")
    assert "function openDongSheet" in js and "앞 동에 가려져요" in js
