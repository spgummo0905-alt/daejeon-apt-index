"""UX v5.2: 위치 지도 새 안(이름표 약도 + 생활 시설 거리), 배지 알림 대신 MY 점."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_map_draws_only_named_marks_and_one_solid_circle():
    j = R("static/locmap.js")
    assert "stroke-dasharray" not in j and "pts.forEach" not in j and "Math.random" not in j
    assert "반경 1km" in j and "maxMarks" in j and "ARROW" in j   # 화면 밖 중심지는 화살표+이름
    assert "자리가 없으면 이름표는 그리지 않음" in j and "hidden" in j   # 못 그린 것은 지도 아래 글줄로


def test_detail_card_moves_price_rank_badges_out_of_the_map():
    h = R("templates/apt.html")
    art = h[h.index('class="mc-art"'):h.index('class="mc-under"')]
    assert "mc-price" not in art and "mc-rank" not in art and "mc-medal" not in art and "mc-badges" not in art
    assert "mc-lochead" in h and "map.html?s=" in h and "위치 · 직선거리" in h
    assert 'class="mc-fac"' in h and "초등학교" in h and "대형마트" in h and "병원 1km 안" in h
    assert "단지 중심에서 잰 직선거리" in h
    assert "84㎡로 맞추면" in h and "거래한 면적과 추정 면적이 달라 바로 견줄 수 없어요" in h
    assert "지수 산정 {{ n_total }}곳 중" in h


def test_facility_values_are_only_shown_when_present_and_not_walk_times():
    h = R("templates/apt.html")
    seg = h[h.index('class="mc-fac"') - 300:h.index("mc-fnote")]
    for k in ("subway_raw", "elementary_raw", "mart_raw", "hospital_raw"):
        assert k in h
    assert "걸어서" not in seg and "분" not in seg.replace("분포", "")


def test_badge_toast_replaced_by_my_dot_without_touching_records():
    a = R("static/app.js")
    seg = a[a.index("DJ.checkBadges = function"):a.index("// 카드첩 알림은 이만큼")]
    assert "DJ.toast" not in seg and "paintDot" in seg
    assert 'save("dj-badge-dot"' not in a and "sessionStorage" in a   # 기록 저장소(키·형식)는 건드리지 않음
    assert "has-dot" in a and 'DJ.LOCAL_ONLY = ["kmap", "seed", "watchN"]' in a
    c = R("static/style.css")
    assert "has-dot::after" in c[c.index("UX v5.2"):]


def test_v52_block_is_last_and_text_never_below_12px():
    c = R("static/style.css")
    assert c.count("UX v5.2 · 위치 지도 새 안") == 1
    tail = c[c.index("UX v5.2 · 위치 지도 새 안"):]
    import re
    sizes = [int(x) for x in re.findall(r"font-size: (\d+)px", tail)]
    assert sizes and min(sizes) >= 14
