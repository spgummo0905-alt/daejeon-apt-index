"""UX v4.1: 일조 시트 닫기 버튼 터치 칸 44px 이상."""
from pathlib import Path

CSS = (Path(__file__).resolve().parent.parent / "static/style.css").read_text(encoding="utf-8")


def test_pick_close_button_is_44px_touch_target():
    assert ".pick-x { min-height: 44px; min-width: 44px;" in CSS


def test_close_handler_and_markup_untouched():
    root = Path(__file__).resolve().parent.parent
    assert "data-pick-x" in (root / "templates/preview.html").read_text(encoding="utf-8")
    assert "bt.hasAttribute('data-pick-x')" in (root / "static/preview.js").read_text(encoding="utf-8")
