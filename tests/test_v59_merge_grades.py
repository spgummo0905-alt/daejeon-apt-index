"""v5.9 홈: 등급 분포를 '카드 읽는 법' 구간 안으로 합침. 막대·등급 5칸·안내 문구는 그대로."""
import pathlib
H = (pathlib.Path(__file__).resolve().parent.parent / "templates/intro.html").read_text(encoding="utf8")

def test_ladder_section_merged_into_card_section():
    assert "it-ladder" not in H and 'class="it-kicker" data-reveal>등급<' not in H
    card = H[H.index('id="it-card"'):]
    card = card[:card.index("</section>")]
    assert 'class="it-dist"' in card and 'class="it-bar"' in card and 'class="it-grades"' in card
    assert "분포 예시" in card and "지역마다 분포가 다릅니다" in card

def test_card_section_still_before_uses_and_rest_untouched():
    assert H.index('id="it-card"') < H.index("it-uses") < H.index('id="it-tools"')
