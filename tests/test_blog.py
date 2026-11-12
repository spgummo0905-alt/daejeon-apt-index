"""임장 가이드 블로그(/blog/): 크롤러가 자바스크립트 없이 받은 HTML에 직답·본문·구조화 데이터가 다 있는지,
화면 FAQ 와 FAQPage 데이터가 글자까지 같은지, 사이트맵·llms.txt·RSS 에 글이 들어가는지."""
import html as H
import json
import re

import pytest

from djdex import blog, cli


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("blog")
    out = tmp / "site"
    cli.main(["--data", str(tmp / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--data", str(tmp / "data"), "landing", "--out", str(out)])
    return out


def _ld(page: str) -> list[dict]:
    return [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)]


def test_every_post_has_answer_first_and_valid_meta(site):
    posts = blog.load_posts()
    assert len(posts) >= 6 and [p["order"] for p in posts] == sorted(p["order"] for p in posts)
    for p in posts:
        page = (site / "blog" / f"{p['slug']}.html").read_text(encoding="utf-8")
        assert page.count("<h1>") == 1 and f"<h1>{H.escape(p['title'])}</h1>" in page
        # 직답이 h1 바로 아래 첫 문단 (서론 없이)
        after_h1 = page.split("</h1>", 1)[1]
        first_p = re.search(r'<p class="answer">(.*?)</p>', after_h1, re.S)
        assert first_p and H.unescape(first_p.group(1)) == p["answer"]
        assert after_h1.index('class="answer"') < after_h1.index("<h2>")
        assert f'<link rel="canonical" href="https://www.jipgam.kr/blog/{p["slug"]}">' in page
        assert 'name="robots"' not in page                                   # noindex 사고 없음
        assert 60 <= len(p["description"]) <= 160
        assert "투자 권유나 가격 예측이 아닙니다" in page


def test_jsonld_matches_visible_text(site):
    for p in blog.load_posts():
        page = (site / "blog" / f"{p['slug']}.html").read_text(encoding="utf-8")
        lds = {d["@type"]: d for d in _ld(page)}
        art = lds["BlogPosting"]
        assert art["headline"] == p["title"] and art["publisher"] == {"@id": "https://www.jipgam.kr/#organization"}
        assert art["dateModified"] == str(p["date_modified"])
        assert lds["BreadcrumbList"]["itemListElement"][1]["item"] == "https://www.jipgam.kr/blog/"
        faq = lds["FAQPage"]["mainEntity"]
        visible = re.findall(r"<dt>(.*?)</dt><dd>(.*?)</dd>", page)
        assert [(q["name"], q["acceptedAnswer"]["text"]) for q in faq] == [(H.unescape(a), H.unescape(b)) for a, b in visible]


def test_images_sized_alt_and_copied(site):
    for p in blog.load_posts():
        page = (site / "blog" / f"{p['slug']}.html").read_text(encoding="utf-8")
        for tag in re.findall(r"<img [^>]*static/blog/[^>]*>", page):
            assert re.search(r'alt="[^"]{6,}"', tag) and "width=" in tag and "height=" in tag
            name = re.search(r"static/blog/([a-z0-9-]+\.webp)", tag).group(1)
            assert (site / "static" / "blog" / name).exists()


def test_internal_links_point_to_existing_posts(site):
    slugs = {p["slug"] for p in blog.load_posts()}
    for p in blog.load_posts():
        page = (site / "blog" / f"{p['slug']}.html").read_text(encoding="utf-8")
        for s in re.findall(r'href="https://www\.jipgam\.kr/blog/([a-z0-9-]+)"', page):
            assert s in slugs, f"{p['slug']} → 없는 글 {s}"


def test_sitemap_llms_feed_and_index(site):
    smap = (site / "sitemap-root.xml").read_text(encoding="utf-8")
    llms = (site / "llms.txt").read_text(encoding="utf-8")
    feed = (site / "blog" / "feed.xml").read_text(encoding="utf-8")
    index = (site / "blog" / "index.html").read_text(encoding="utf-8")
    for p in blog.load_posts():
        url = f"https://www.jipgam.kr/blog/{p['slug']}"
        assert f"<loc>{url}</loc><lastmod>{p['date_modified']}</lastmod>" in smap
        assert url in llms and f"<link>{url}</link>" in feed and f'href="{url}"' in index
    assert "https://www.jipgam.kr/blog/</loc>" in smap
    assert 'href="https://www.jipgam.kr/blog/"' in (site / "about.html").read_text(encoding="utf-8")


def test_missing_required_field_stops_build(tmp_path):
    (tmp_path / "x.md").write_text('+++\norder = 1\nslug = "x"\ntitle = "t"\n+++\n본문', encoding="utf-8")
    with pytest.raises(ValueError, match="question"):
        blog.load_posts(tmp_path)


def test_markdown_escapes_html_and_resolves_root_links():
    out, _ = blog.render_body("<script>x</script> [홈](/about) **굵게**", "https://www.jipgam.kr/")
    assert "<script>" not in out and 'href="https://www.jipgam.kr/about"' in out and "<strong>굵게</strong>" in out
