"""UX v3.2: 없는 주소(404)에서 영어 기본 화면 대신 집감 안내 화면을 보여 준다.
어느 주소에서 열려도 깨지지 않게 링크는 절대 주소, 스타일은 파일 안, 눌림 칸 56px 이상."""
import re

from djdex import landing


def _page():
    return landing.NOT_FOUND.format(folder="daejeon")


def test_not_found_page_has_brand_message_and_two_absolute_buttons():
    h = _page()
    assert "찾으시는 페이지가 없어요" in h and "집감" in h and 'lang="ko"' in h
    hrefs = re.findall(r'href="([^"]+)"', h)
    assert hrefs == ["/", "/", "/daejeon/finder.html"]          # 로고, 홈으로, 찾기: 모두 절대 주소
    assert not re.search(r'(src|href)="(?!/|#)', h)               # 상대 경로·외부 파일 없음
    assert "<link" not in h and "<script" not in h


def test_not_found_page_is_noindex_large_and_has_no_horizontal_overflow_rules():
    h = _page()
    assert 'name="robots" content="noindex"' in h and 'name="viewport"' in h
    assert "min-height:56px" in h and "font-size:18px" in h        # 큰 버튼, 본문 18px 이상
    assert "box-sizing:border-box" in h and "max-width:520px" in h
    assert "prefers-reduced-motion" not in h and "animation" not in h   # 움직임 없음


def test_root_landing_build_writes_404_html_at_site_root(tmp_path):
    from djdex import cli

    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out / "daejeon")])
    cli.main(["--data", str(tmp_path / "data"), "landing", "--out", str(out)])
    page = (out / "404.html").read_text(encoding="utf-8")
    assert "찾으시는 페이지가 없어요" in page and 'href="/daejeon/finder.html"' in page
    assert "word-break:keep-all" in page
