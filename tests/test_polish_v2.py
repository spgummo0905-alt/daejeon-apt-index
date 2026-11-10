"""UX v2 다듬기: 겹침 제거(일조의 떠 있는 버튼), 하단 메뉴 불투명, 작은 글자·주요 버튼 키우기."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _tail():
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    return css[css.index("UX v2 · 다듬기"):]


def test_sun_screen_hides_floating_recent_button_on_phones_only():
    t = _tail()
    assert 'body[data-page="preview"] .rcd { display: none; }' in t
    assert t.index("@media (max-width: 720px)") < t.index('body[data-page="preview"] .rcd')   # 휴대폰 폭 안에서만


def test_tabbar_is_opaque_and_small_text_is_raised():
    t = _tail()
    assert ".tabbar { background: var(--surface); -webkit-backdrop-filter: none; backdrop-filter: none; }" in t
    for rule in (".tc-kind, .tc-hint, .badge-n { font-size: 14px; }", ".badge-name { font-size: 14px; }", ".gstat-val, .gstat-name { font-size: 14px; }"):
        assert rule in t, rule
    assert ".hm-toggle, .album-next .btn, #vs-share, .cmp-fit .btn { min-height: 56px; }" in t
