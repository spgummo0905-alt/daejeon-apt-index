"""v6.1 입지 점수 줄: 400px 이하 폰에서 제목 칸이 줄어들어 가로 넘침이 없게. 점수·거리·순위 값은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def test_loc_list_row_can_shrink_on_narrow_phones():
    c = (R / "static/style.css").read_text(encoding="utf8"); seg = c[c.index("/* v6.1 좁은 폰"):]
    assert "max-width: 400px" in seg and "minmax(0, 1fr) auto auto" in seg and ".loc-label" in seg
    assert ".loc-grp" in seg   # 묶음 제목 줄은 건드리지 않음
