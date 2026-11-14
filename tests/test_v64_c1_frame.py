"""C1: 수집 카드(.hc-collect) 틀 두께를 4px 로 맞춘다(갤러리 S 만 3px 이던 것). 등급 색 의미·반짝임·이름 크기는 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
CSS = (R / "static/style.css").read_text(encoding="utf8")
def test_s_frame_is_4px_at_end():
    assert "/* C1 수집 카드 틀" in CSS and "\n.hc-collect.g-S { padding: 4px; }\n" in CSS
def test_grade_colours_untouched():
    assert ".hc-collect.g-S { background: #c9a24a; padding: 3px;" in CSS                  # 금색 틀 규칙 원문 그대로(뒤 규칙이 두께만 덮음)
    assert ".hc-collect.g-A { background: linear-gradient(135deg, #ffffff, #c9d0db 30%" in CSS
    assert ".hc-collect.g-B { background: linear-gradient(135deg, #c8e0ff" in CSS
def test_name_size_rules_untouched():
    assert ".hc-collect .hc-cname { font-size: 22px;" in CSS and "@media (max-width: 480px) { .album-cards .mcw-hc .hc-cname { font-size: 17px; }" in CSS
