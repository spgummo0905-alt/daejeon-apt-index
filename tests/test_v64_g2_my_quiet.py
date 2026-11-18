"""G2: MY 숫자 세 칸은 기록이 하나도 없으면 접고(지우지 않음), MY 폰 화면에서는 '최근 본' 동그라미가 같은 내용을 되풀이하지 않는다."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
MYJS = (R / "static/my.js").read_text(encoding="utf8")
HTML = (R / "templates/my.html").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* G2 MY"):]

def test_stats_fold_only_when_all_three_counts_are_zero_and_markup_stays():
    assert 'stBox.classList.toggle("none", !favs.length && !courseN && !beenN)' in MYJS
    assert HTML.count("data-ms=") == 3 and 'data-my-stats' in HTML          # 칸은 지우지 않음
    assert ".my-stats.none { display: none; }" in B

def test_recent_circle_hidden_on_my_phone_only_and_tab_still_shows_recent():
    assert '@media (max-width: 720px) { body[data-page="my"] .rcd { display: none; } }' in B
    assert 'data-mg-btn="more"' in HTML and "최근·설정" in HTML and 'id="recent"' in HTML   # 같은 내용은 MY '최근·설정' 칸에 그대로 있음
    assert "[data-rcd]" in (R / "static/app.js").read_text(encoding="utf8")   # 다른 화면의 최근 본 기능은 그대로
