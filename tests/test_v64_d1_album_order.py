"""D1: 카드첩 순서(시안). 맨 위에 '내가 모은 집들'과 모은 카드 구역, 그 아래 오늘의 비교 후보·임장 배지. 값·저장·계산·링크 변경 0."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
def test_title_and_lead_follow_the_mockup():
    assert "<h1>내가 모은 집들</h1>" in HTML and "직접 살펴본 단지가 기록으로 남습니다." in HTML
    assert "살펴본 아파트와 임장 기록" not in HTML
def test_collected_cards_come_first_then_today_then_badges():
    assert HTML.index('id="album"') < HTML.index('id="today"') < HTML.index('id="badges"')
def test_inside_album_order_filter_cards_then_best_then_progress_then_legend_then_grades_then_areas():
    o = [HTML.index(k) for k in ("data-album-empty ", "data-album-filter", "data-album-cards", "data-album-best ", "album-prog", "album-legend", "data-album-grades", "data-album-areas")]
    assert o == sorted(o)
    assert HTML.index("data-album-note") < HTML.index('id="album"')          # 안내 띠는 구역 위(시안)
def test_all_original_hooks_and_copy_are_still_present():
    for k in ("data-album-total", "data-album-bar", "data-album-been", "data-album-more", "data-album-next", "data-album-shown", "album-legend", "다녀옴 도장", "등급별 대표 카드", "수집한 기록이 차곡차곡", "인터넷이 불안정한가요?", "오늘의 비교 후보", "임장 배지", "{{ unit }}별로 살펴본 단지", "내 카드 모아보기"):
        assert k in HTML, k
def test_each_section_still_exactly_once_and_page_title_unchanged():
    for k in ('id="album"', 'id="today"', 'id="badges"', 'data-album-cards'):
        assert HTML.count(k) == 1, k
    assert "카드첩 · 임장 기록 · 집감" in HTML      # 검색에 보이는 제목은 그대로
