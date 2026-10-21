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
    assert sitemap.count("<url>") == 63 + 4  # 단지 비교, 조건으로 찾기, 관심 단지, 역세권 and f"<loc>{base}apt/DEMO-0001.html</loc>" in sitemap
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
    assert [s["n"] for s in data["stats"]] == ["입지", "성장성", "상승세", "가성비", "거래량"]
    assert all(len(c["st"]) == 5 and all(v is None or 0 <= v <= 100 for v in c["st"]) for c in pts)
    assert "dapi.kakao.com" not in index  # 키가 없으면 카카오 지도 스크립트를 넣지 않음
    assert not (out / "quiz.html").exists()
    for page in ("compare", "finder", "my"):
        html = (out / f"{page}.html").read_text(encoding="utf-8")
        assert f"static/{page}.js" in html and "static/app.js" in html


def test_card_download_button_only_for_ranked(tmp_path):
    import json
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    data = json.loads((out / "complexes.json").read_text(encoding="utf-8"))
    assert data["asof"] and data["region"] == "대전"
    ranked = {c["s"] for c in data["complexes"]}
    for page in (out / "apt").glob("*.html"):
        html = page.read_text(encoding="utf-8")
        has = "data-card-download" in html
        assert has == (page.stem in ranked), page.stem  # 소규모 단지는 카드 데이터가 없어 버튼도 없음
        assert "static/cardgen.js" in html
