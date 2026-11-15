"""C3: 빈 카드첩·단지 목록 불러오기 실패에 직접 그린 장식 그림. 그림은 aria-hidden, 문장·버튼 그대로. 실패 안내가 닫힌 상자에 숨지 않게 연다."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
CARDS = (R / "templates/cards.html").read_text(encoding="utf8")
FIND = (R / "static/finder.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
def test_empty_album_has_decorative_art_and_same_copy():
    m = re.search(r'data-album-empty hidden>(.*?)</div>', CARDS, re.S)
    assert m and re.search(r'class="il-art( il-big)?" aria-hidden="true"', m.group(1))
    assert "아직 모은 단지가 없어요. 아파트를 열어 보면 카드가 한 장씩 모여요." in m.group(1) and 'href="finder.html">아파트 찾아보기' in m.group(1)
def test_finder_failure_art_is_decorative_and_box_is_opened():
    assert 'ic.setAttribute("aria-hidden", "true")' in FIND
    assert "advBox.open = true" in FIND
    assert FIND.index("advBox.open = true") < FIND.index("q.replaceChildren(ic,")
    assert "단지 목록을 불러오지 못했어요" in FIND and "인터넷 연결을 확인하고 다시 시도해 주세요. 골라 둔 조건은 그대로 남아 있어요." in FIND
def test_no_external_files_or_motion():
    start = CSS.index("/* C3 작은 그림")
    end = CSS.find("/* C3 저장 완료 체크", start)   # 뒤에 붙는 체크 표시 블록은 test_v64_c3b_pin_check 가 따로 검사
    block = CSS[start:end if end != -1 else len(CSS)]
    assert "url(" not in block and "animation" not in block and "@import" not in block
    assert "http" not in FIND[FIND.index("const ic = el"):FIND.index("const ic = el") + 900]
