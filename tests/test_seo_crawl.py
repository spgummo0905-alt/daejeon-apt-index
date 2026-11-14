"""SEO 개편(루트 집중·크롤 예산) 확인: 같은 화면이 두 주소로 크롤되지 않고, 루트가 브랜드·임장 대표 화면인지.

- 지역 인트로(/daejeon/intro 등)는 맨 앞 주소(/)와 같은 본문이라 noindex 이고 사이트맵에 없습니다.
- 도구·개인 화면(my·projects·compare·finder·cards)은 noindex 이고 사이트맵에 없습니다.
- 읽는 화면(index·rank·themes·methodology·rooftop·단지)은 noindex 가 없고 사이트맵에 있습니다.
- 루트(/)에는 브랜드·앱·자주 묻는 질문 구조화 정보가 있고, 화면에 보이는 질문·답과 글자까지 같습니다.
- 미리 받기(speculationrules)·예전 주소 안내 파일이 .html 주소를 만들지 않습니다.
"""
import html as H
import json
import re
import shutil
from pathlib import Path

import pytest

from djdex import cli

ROOT_DIR = Path(__file__).resolve().parent.parent
BASE = "https://www.jipgam.kr/daejeon/"


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    """지역(대전) + 맨 앞 주소를 한 번만 만듭니다."""
    tmp = tmp_path_factory.mktemp("seo")
    out = tmp / "site"
    cli.main(["--data", str(tmp / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--data", str(tmp / "data"), "landing", "--out", str(out)])
    return out


@pytest.fixture(scope="module")
def plain(tmp_path_factory):
    """데모가 아닌 실제 빌드(작은 가짜 표): 데모는 모든 화면에 noindex 를 넣어 구분이 안 되기 때문."""
    import pandas as pd
    from djdex import config, metrics, site

    rows = []
    for cid in ("A", "B"):
        for d in ("2026-03-01", "2026-04-01"):
            rows.append({"complex_id": cid, "name": cid, "gu": "서구", "dong": "둔산동", "jibun": "1",
                         "build_year": 2004, "area": 84.0, "price": 50000, "date": d,
                         "floor": 7, "cancelled": False, "direct": False})
    trades = pd.DataFrame(rows)
    cfg = config.load()
    table, hist, meta = metrics.compute(trades, cfg.metrics, cfg.filters)
    out = tmp_path_factory.mktemp("plain") / "s"
    site.build(table, hist, trades, meta, cfg, out)
    return out


def _robots(page: str) -> list[str]:
    return re.findall(r'<meta name="robots"[^>]*>', page)


def _ld(page: str) -> list[dict]:
    return [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)]


def test_private_and_tool_pages_are_noindex_and_out_of_sitemap(plain):
    sitemap = (plain / "sitemap.xml").read_text(encoding="utf-8")
    for name in ("my", "compare", "cards", "finder", "projects", "intro"):
        page = plain / f"{name}.html"
        if not page.exists():
            continue
        assert _robots(page.read_text(encoding="utf-8")) == ['<meta name="robots" content="noindex">'], name
        assert f"<loc>{BASE}{name}</loc>" not in sitemap, name
    # 사이트맵에 넣은 화면 중 noindex 인 것은 없어야 함 (색인됨-robots 차단 충돌 방지)
    for loc in re.findall(r"<loc>(.*?)</loc>", sitemap):
        assert loc.split("/")[-1] not in ("my", "compare", "cards", "finder", "projects", "intro"), loc


def test_pages_people_read_stay_indexable(plain):
    sitemap = (plain / "sitemap.xml").read_text(encoding="utf-8")
    for name in ("index", "rank", "themes", "methodology", "rooftop"):
        page = plain / f"{name}.html"
        if not page.exists():
            continue
        assert _robots(page.read_text(encoding="utf-8")) == [], name
    for need in ("", "methodology", "rank", "themes", "rooftop"):
        assert f"<loc>{BASE}{need}</loc>" in sitemap
    assert f"<loc>{BASE}apt/A</loc>" in sitemap


def test_regional_intro_is_not_the_root_page(demo):
    """지역 인트로는 맨 앞 주소와 같은 본문 → noindex, 사이트맵 제외. 맨 앞 주소(/)만 인트로를 씁니다."""
    intro = (demo / "daejeon" / "intro.html").read_text(encoding="utf-8")
    assert _robots(intro) == ['<meta name="robots" content="noindex">']
    assert 'id="faq"' not in intro            # 자주 묻는 질문은 맨 앞 주소에만
    assert "지역 선택" not in intro
    assert "intro</loc>" not in (demo / "daejeon" / "sitemap.xml").read_text(encoding="utf-8")
    root = (demo / "index.html").read_text(encoding="utf-8")
    assert '<link rel="canonical" href="https://www.jipgam.kr/">' in root
    assert 'id="faq"' in root


def test_root_declares_website_org_app_and_faq(demo):
    page = (demo / "index.html").read_text(encoding="utf-8")
    lds = {d["@type"]: d for d in _ld(page)}
    assert {"WebSite", "Organization", "SoftwareApplication", "FAQPage"} <= set(lds)
    assert lds["WebSite"]["@id"] == "https://www.jipgam.kr/#website" and lds["WebSite"]["url"] == "https://www.jipgam.kr/"
    assert "potentialAction" not in lds["WebSite"]      # 제공하지 않는 전국 검색을 선언하지 않음
    for kind in ("WebSite", "Organization"):
        assert {"Jipgam", "집감 임장", "집감 앱", "jipgam.kr"} <= set(lds[kind]["alternateName"])
    org = lds["Organization"]
    assert org["logo"]["url"].endswith("static/icons/icon-512.png") and org["sameAs"]
    app = lds["SoftwareApplication"]
    assert app["operatingSystem"] == "Android, Web" and app["offers"]["price"] == "0"
    assert app["publisher"] == {"@id": "https://www.jipgam.kr/#organization"}
    assert len(lds["FAQPage"]["mainEntity"]) >= 5


def test_visible_faq_matches_structured_data(demo):
    page = (demo / "index.html").read_text(encoding="utf-8")
    visible = re.findall(r'<details class="faq-it"><summary>(.*?)</summary><p>(.*?)</p></details>', page, re.S)
    assert len(visible) >= 5
    faq = next(d for d in _ld(page) if d["@type"] == "FAQPage")["mainEntity"]
    assert [(q["name"], q["acceptedAnswer"]["text"]) for q in faq] == \
        [(H.unescape(q), H.unescape(a)) for q, a in visible]
    assert all(q.endswith("?") for q, _a in visible)


def test_root_carries_brand_and_imjang_words(demo):
    page = (demo / "index.html").read_text(encoding="utf-8")
    head = page.split("</head>")[0]
    assert "집감" in head and "아파트 임장 앱" in head and "jipgam.kr" in head
    assert "임장 체크리스트" in head and "실거래가 비교" in head
    assert "집감은 아파트 임장 앱입니다" in page          # 첫 화면 글에도 브랜드·쓰임
    for bad in ("투자하세요", "수익 보장", "최고의", "1위 서비스"):    # 광고·판단 문구는 쓰지 않음
        assert bad not in page


def test_prefetch_and_old_link_stubs_do_not_make_html_addresses(demo):
    for rel in ("index.html", "daejeon/index.html", "daejeon/rank.html", "daejeon/apt/DEMO-0001.html"):
        page = (demo / rel).read_text(encoding="utf-8")
        rules = page.split('<script type="speculationrules">')[1].split("</script>")[0]
        assert ".html" not in rules, rel
        assert '"eagerness": "moderate"'.replace(" ", "") in rules.replace(" ", "")
    stub = (demo / "apt" / "DEMO-0001.html").read_text(encoding="utf-8")
    assert 'location.replace("/daejeon/apt/DEMO-0001"' in stub
    assert 'content="0;url=/daejeon/apt/DEMO-0001"' in stub
    assert ".html" not in stub
    intro_stub = (demo / "intro.html").read_text(encoding="utf-8")
    assert 'location.replace("/"' in intro_stub and 'canonical" href="https://www.jipgam.kr/"' in intro_stub


def test_clean_links_also_catches_redirect_and_form_targets():
    import sys
    sys.path.insert(0, str(ROOT_DIR / "scripts"))
    from clean_links import clean

    assert clean('<form action="finder.html"></form>') == '<form action="finder"></form>'
    assert clean('<meta http-equiv="refresh" content="0;url=/daejeon/rank.html">') == \
        '<meta http-equiv="refresh" content="0;url=/daejeon/rank">'
    assert clean('<script>location.replace("/daejeon/cards.html"+location.search)</script>') == \
        '<script>location.replace("/daejeon/cards"+location.search)</script>'
    assert clean('<a href="index.html">') == '<a href="./">'
    assert clean('<script>fetch("map-fallback.html")</script>') == '<script>fetch("map-fallback.html")</script>'


def test_deployed_html_has_no_html_links_after_clean(demo, tmp_path):
    import sys
    sys.path.insert(0, str(ROOT_DIR / "scripts"))
    from clean_links import clean

    out = tmp_path / "clean"
    shutil.copytree(demo, out)
    for p in out.rglob("*.html"):
        p.write_text(clean(p.read_text(encoding="utf-8")), encoding="utf-8")
    left = [str(p.relative_to(out)) for p in out.rglob("*.html")
            if re.search(r'(?:href|action)="[^"]*\.html', p.read_text(encoding="utf-8"))]
    assert left == []
    # 같은 화면이 .html 주소로도 열리지만, 내부 링크는 canonical 주소만 가리킴
    assert 'href="finder"' in (out / "daejeon" / "index.html").read_text(encoding="utf-8")


def test_noindex_list_matches_between_template_and_sitemap():
    """base.html(noindex 를 넣는 곳)과 site.write_sitemap(사이트맵에서 빼는 곳)의 목록이 같아야 합니다."""
    from djdex import site

    base = (ROOT_DIR / "templates" / "base.html").read_text(encoding="utf-8")
    line = next(l for l in base.splitlines() if "_noindex_pages = [" in l)
    names = set(re.findall(r'"([a-z-]+)"', line))
    assert names == set(site.NOINDEX_PAGES)
