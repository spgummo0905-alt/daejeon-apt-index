"""핵심 포인트(.pt-grid) 칸 안의 긴 글이 칸 밖으로 늘어나 320px 폰이 옆으로 밀리지 않게."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def test_points_text_wraps_anywhere():
    c = (R / "static/style.css").read_text(encoding="utf8")
    assert "/* D3 핵심 포인트 칸" in c and "\n.pt-k, .pt-s, .pt-v { overflow-wrap: anywhere; }\n" in c
def test_points_grid_still_two_equal_columns():
    c = (R / "static/style.css").read_text(encoding="utf8")
    assert ".pt-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));" in c
