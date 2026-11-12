"""UX v3.2 홈: 처음 온 사람도 글을 읽기 전에 시작할 수 있어야 한다.
- 지역 첫 화면의 주 버튼은 찾기로 직접 가고(같은 홈으로 되돌아가지 않음), 둘째 버튼은 이름과 같은 곳(지도)으로 간다.
- 큰 검색 칸은 기존 검색 창을 열고, 예산 칩은 찾기의 주소 조건(?budget=)을 그대로 쓴다.
- 처음 온 사람에게도 하단 메뉴가 보이고, '예시 지역' 같은 말이 지역 화면에 없다. 맨 앞 지역 고르기 화면은 그대로다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_region_intro_primary_buttons_go_where_their_names_say():
    h = _r("templates/intro.html")
    assert 'href="finder"' in h and "<b>조건으로 찾기</b>" in h and "else 'map' }}" in h and "지도로 보기" in h
    assert "궁금한 아파트 찾기" not in h and "한 화면에서 집 찾기" not in h
    assert 'class="it-hero{% if not landing %} it-start{% endif %}"' in h


def test_search_field_and_budget_chips_reuse_existing_search_and_finder_url():
    h, a = _r("templates/intro.html"), _r("static/app.js")
    assert "data-it-search" in h and 'finder?budget={{ b }}' in h and "(3, 5, 7, 10)" in h
    assert 'querySelectorAll("[data-it-search]")' in a and "btn.click()" in a        # 새 검색 기능 없이 기존 창을 연다
    f = _r("static/finder.js")
    assert 'qs.get("budget")' in f and '"budget", "py", "gu"' in f                      # 찾기는 이미 이 주소 조건을 읽는다


def test_region_intro_shows_tabbar_and_real_region_name_but_root_landing_keeps_old_behavior():
    c, h = _r("static/style.css"), _r("templates/intro.html")
    assert 'body[data-page="intro"]:not(:has(.it-start)) .tabbar { display: none; }' in c
    assert "{{ '예시 지역' if landing else region }}" in h
    seg = c[c.index("UX v3.2 · 지역 첫 화면"):]
    assert ".it-start .it-btn { height: 56px; font-size: 18px; }" in seg
    assert ".it-start-search {" in seg and ".it-search {" not in seg   # 아래쪽 기존 .it-search 와 겹치지 않음
    assert "min-height: 60px" in seg and "min-height: 48px" in seg
    assert "prefers-reduced-motion" in seg


def test_new_class_names_do_not_collide_with_existing_region_list_links():
    h, c = _r("templates/intro.html"), _r("static/style.css")
    assert 'class="it-region' in h                                   # 아래쪽 지역 목록 링크가 쓰는 기존 이름
    assert 'it-hero{% if not landing %} it-region' not in h           # 새 화면은 다른 이름(it-start)을 써서 그 스타일이 섞이지 않음
    assert ".it-start-search {" in c and ".it-search {" in c           # 새 검색 칸 이름과 아래쪽 기존 .it-search 도 분리
