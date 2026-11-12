"""UX v3.9: Fable 완성도 심사 반영 — 선택 색은 브랜드 초록, 금색은 등급·점수에만, 어두운 첫 화면 크림 띠 없음."""
from pathlib import Path

CSS = (Path(__file__).resolve().parent.parent / "static/style.css").read_text(encoding="utf-8")
SEG = CSS[CSS.index("UX v3.9 · Fable 완성도 심사 반영"):]


def test_selection_color_token_is_brand_green_and_charts_keep_old_navy():
    assert ":root { --navy: #0f3d33; --on-navy: #ffffff; --navy-chart: #13294b;" in SEG
    assert "--navy: #6fd1ae; --on-navy: #0b1f1a; --navy-chart: #9ec5f4;" in SEG
    for t in (".pc-rbase { stroke: var(--navy-chart);", ".k-line.navy { background: var(--navy-chart); }", ".art-b.main { fill: var(--navy-chart);"):
        assert t in CSS


def test_gold_not_used_for_intro_labels_or_detail_chip():
    assert ".it-kicker, .it-step-n { color: var(--accent); }" in SEG
    # v5.1(Fable 평가)에서 제목의 색 번짐은 일부러 걷어냈다. 칩 색은 그대로 지키고, 번짐 제거는 v5.1 시험이 고정한다.
    assert "rgba(111, 209, 174, .14)" in SEG
    assert "--g-S: #b8912f" in CSS          # 등급 금색은 그대로


def test_dark_intro_has_no_cream_band():
    assert "(prefers-color-scheme: dark) {\n  .it-start .it-fan::before { background: #0b1f1a; }" in SEG
