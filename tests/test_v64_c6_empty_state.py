"""C6: 빈 카드첩을 시안 모양으로(큰 그림·제목·버튼·연결 안내 띠). 문장·링크는 그대로, 카드가 모이면 둘 다 사라짐."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
HTML = (R / "templates/cards.html").read_text(encoding="utf8")
JS = (R / "static/cards.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
def test_empty_state_has_title_original_copy_and_single_cta():
    m = re.search(r'data-album-empty hidden>(.*?)</div>', HTML, re.S).group(1)
    assert "첫 카드를 기다리고 있어요" in m
    assert "아직 모은 단지가 없어요. 아파트를 열어 보면 카드가 한 장씩 모여요." in m
    assert m.count('class="btn primary"') == 1 and 'href="finder.html">아파트 찾아보기' in m
    assert '<span class="il-art il-big" aria-hidden="true">' in m           # 그림을 감싼 칸 자체가 장식(안쪽 svg 의 aria-hidden 과 별개)
def test_net_notice_is_text_only_and_never_claims_success():
    m = re.search(r'<p class="empty-net" data-album-empty-net hidden>(.*?)</p>', HTML, re.S).group(1)
    assert "인터넷이 불안정한가요?" in m and "기록이 저장되지 않았다면 성공 도장을 숨겨요." in m
    assert "저장됐" not in m and "성공했" not in m
def test_both_hide_together_when_cards_exist():
    assert 'const net = sec.querySelector("[data-album-empty-net]"); if (net) net.hidden = got.length > 0;' in JS
    assert 'sec.querySelector("[data-album-empty]").hidden = got.length > 0;' in JS
def test_css_no_external_files_no_motion_and_button_56():
    b = CSS[CSS.index("/* C6 빈 카드첩"):]
    _n3 = b.find("\n/* E3 지역 소개", 5)
    if _n3 > 0:
        b = b[:_n3]   # 자기 블록만
    assert "url(" not in b and "animation" not in b and "@import" not in b
    assert "min-height: 56px" in b and ".empty-net[hidden] { display: none; }" in b
