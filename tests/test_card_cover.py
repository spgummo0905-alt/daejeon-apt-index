"""UX v2 카드 표지 v2: 모든 단지에 똑같던 밤 건물 그림과 비어 보이던 동 이름 판 대신, 그 단지의 실제 항공 사진 한 장(가장 가까운 18단계).
사진을 못 받거나 서버 주소가 없으면 사진 칸 자체가 없고, 구·동 이름과 숫자 줄은 항상 남는다."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_collect_card_has_photo_slot_not_night_art_or_plate_in_server_and_phone_templates():
    t, j = _r("templates/_card.html"), _r("static/housecard.js")
    seg = t[t.index("macro collect"):]
    assert 'class="hc-photo"' in seg and "{% if satellite_url and c.lat and c.lng %}" in seg      # 주소와 좌표가 있을 때만
    assert "hc-plate" not in seg and "hc-dong" not in seg and "art(c.rank or k, true)" not in seg
    assert 'photo = el("span", "hc-photo")' in j and "window.DJ_SAT && c.la && c.ln" in j
    assert "hc-plate" not in j and "nightArt" not in j and "drawArt" not in j and "JIPGAM" not in seg + j


def test_dong_name_stays_on_card_top_line_so_text_survives_without_photo():
    t, j = _r("templates/_card.html"), _r("static/housecard.js")
    assert "{{ c.gu }} · {{ c.dong }}" in t and '(c.gu || "") + (c.d ? " · " + c.d : "")' in j


def test_cover_numbers_come_from_existing_values_only():
    t, j = _r("templates/_card.html"), _r("static/housecard.js")
    assert "c.build_year" in t and "c.hh" in t and "c.subway_raw" in t
    assert "c.y ?" in j and "c.hh ?" in j and "c.f.subway" in j and "c.i == null" in j


def test_cover_script_uses_closest_tile_hides_slot_on_failure_and_never_stores():
    js = _r("static/cover.js")
    assert "const Z = 18" in js and "box.hidden = true" in js and "i.onerror" in js            # 못 받으면 칸을 지움
    assert "dxs" in js and "dys" in js and "o.y < 0.2" in js                                  # 단지가 가장자리에 가까울 때만 옆 사진을 붙임
    assert "IntersectionObserver" in js and "rootMargin" in js                                # 화면에 가까워진 카드만
    assert "localStorage" not in js and "sessionStorage" not in js and "canvas" not in js     # 사진 저장 없음
    assert "브이월드(국토교통부)" in js and "촬영 시점이 달라" in js                           # 출처 문구
    assert "apiKey" not in js and "VWORLD" not in js                                          # 키는 화면 코드에 없음


def test_base_loads_cover_script_only_when_proxy_is_configured():
    b = _r("templates/base.html")
    assert "{% if satellite_url %}<script>window.DJ_SAT" in b and '{% if satellite_url %}<script src="{{ root }}static/cover.js' in b


def test_old_cover_css_removed_and_no_photo_card_keeps_text_sizes():
    css = _r("static/style.css")
    assert ".hc-art.hc-night" not in css and "--plate" not in css and ".hc-plate" not in css
    tail = css[css.index("UX v2 · 카드 표지 v2"):]
    assert ".hc-collect .hc-photo[hidden] { display: none; }" in tail
    sizes = [int(x) for x in re.findall(r"font-size: (\d+)px", tail)]
    assert sizes and min(sizes) >= 12                                                          # 카드 안 글자는 12px 아래로 내려가지 않음
