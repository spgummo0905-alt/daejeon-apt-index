"""v5.5 편의 단추: 자기자본 빠른 입력·한글 금액 읽기, 길찾기 링크, 담을 때 짧은 진동."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent


def _t(p):
    return (R / p).read_text(encoding="utf8")


def test_pay_quick_buttons_and_korean_amount():
    h, j = _t("templates/apt.html"), _t("static/pay.js")
    for n in ("1000", "5000", "10000", "0"):
        assert f'data-pay-add="{n}"' in h
    assert "data-pay-read" in h and 'aria-live="polite"' in h
    assert "천만" in j and 'eq.dispatchEvent(new Event("input"' in j   # 계산·저장은 기존 입력 이벤트 그대로
    assert 'DJ.save("pay"' in j                                          # 저장 방식 그대로


def test_pay_chip_touch_size_and_calm():
    c = _t("static/style.css")
    seg = c[c.index("/* v5.5 편의 단추"):]
    assert "min-height: 44px" in seg and "prefers-reduced-motion" in seg


def test_navigate_link_uses_kakao_and_keeps_map_link():
    h = _t("templates/apt.html")
    assert "map.kakao.com/link/to/" in h and 'rel="noopener"' in h
    assert "map?s=" in h and "실제 지도 ›" in h


def test_tap_vibration_respects_reduced_motion_and_support():
    a = _t("static/app.js")
    i = a.index("DJ.tap = function")
    seg = a[i:i + 200]
    assert "!DJ.calm" in seg and "navigator.vibrate" in seg and "try" in seg
    assert "DJ.paintFavCount();\n    DJ.tap();" in a
