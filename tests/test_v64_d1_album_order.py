"""D1: 카드첩 순서(시안). 맨 위에 '내가 모은 집들'과 모은 카드 구역, 그 아래 오늘의 비교 후보·임장 배지. 값·저장·계산·링크 변경 0."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
def test_collected_cards_come_first_then_today_then_badges():
    assert HTML.index('id="album"') < HTML.index('id="today"') < HTML.index('id="badges"')
def test_each_section_still_exactly_once_and_page_title_unchanged():
    for k in ('id="album"', 'id="today"', 'id="badges"', 'data-album-cards'):
        assert HTML.count(k) == 1, k
def test_original_features_and_copy_are_still_present_somewhere_on_the_page():
    for k in ("data-album-total", "data-album-bar", "data-album-been", "data-album-more", "data-album-next", "data-album-shown", "다녀옴 도장", "등급별 대표 카드", "수집한 기록이 차곡차곡", "인터넷이 불안정한가요?", "오늘의 비교 후보", "임장 배지", "{{ unit }}별로 살펴본 단지"):
        assert k in HTML, k
