"""G3: 글자 선택 색과 입력 막대 색을 브랜드 초록으로. 글자색은 바꾸지 않음(대비 유지)."""
import pathlib
CSS = (pathlib.Path(__file__).resolve().parent.parent / "static/style.css").read_text(encoding="utf8")
B = CSS[CSS.index("/* G3 브라우저"):]

def test_selection_uses_brand_accent_and_keeps_text_color():
    assert "::selection { background: color-mix(in srgb, var(--accent) 28%, var(--surface)); color: var(--text); }" in B
    assert "input, textarea { caret-color: var(--accent); }" in B

def test_block_is_small_and_has_no_text_sizes_or_motion():
    assert "font-size" not in B and "transition" not in B and "animation" not in B
