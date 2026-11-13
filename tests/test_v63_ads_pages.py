"""광고(애드센스) 코드는 글을 읽는 화면에만. 찾기·비교·지도·MY·홈 같은 쓰는 화면과 데모 빌드에는 넣지 않는다."""
import pathlib, re
from jinja2 import Template
R = pathlib.Path(__file__).resolve().parent.parent
READING = ["apt", "rank", "themes", "stations", "methodology"]
TOOLS = ["index", "finder", "compare", "map", "my", "course", "cards", "card-gallery", "projects", "me", "share", "rooftop", "intro", "privacy", "terms", "preview", "admin"]

def _snippet():
    b = (R / "templates/base.html").read_text(encoding="utf8")
    i = b.index("{% set _ad_pages")
    j = b.index("{% endif %}", i) + len("{% endif %}")
    return b[i:j]

def _has_ad(page_path, demo=False, client="ca-pub-1"):
    out = Template(_snippet()).render(site={"adsense_client": client}, demo=demo, page_path=page_path)
    return "adsbygoogle" in out

def test_reading_pages_get_the_ad_code():
    for p in READING:
        assert _has_ad(p + ".html" if p != "apt" else "apt/30170-41.html"), p

def test_tool_pages_never_get_the_ad_code():
    for p in TOOLS:
        assert not _has_ad("" if p == "index" else p + ".html"), p

def test_no_ad_in_demo_or_without_client():
    assert not _has_ad("apt/x.html", demo=True)
    assert not _has_ad("apt/x.html", client="")

def test_ad_list_in_base_matches_this_test():
    m = re.search(r"_ad_pages = \[(.*?)\]", (R / "templates/base.html").read_text(encoding="utf8"))
    assert sorted(re.findall(r'"([a-z-]+)"', m.group(1))) == sorted(READING)

def test_privacy_notice_still_says_ads_exist():
    # 일부 화면에만 광고가 있어도 처리방침의 광고 안내(애드센스·광고 쿠키)는 그대로 둔다
    t = (R / "templates/privacy.html").read_text(encoding="utf8")
    assert "adsense_client" in t and "광고 쿠키" in t
