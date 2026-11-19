"""K1(1단계): 84㎡ 환산가(대표 추정가)와 평형 선택 시세는 모든 화면에서 소수 1자리(3.8억). 실제 거래금액과 내가 입력한 호가·대출액은 그대로(2자리). 상세 안의 평형별 시세·예상 거래 범위·고점은 아직 2자리(다음 단계)."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
def r(p): return (R / p).read_text(encoding="utf8")

def test_estimate_prices_use_the_one_decimal_filter_everywhere_in_templates():
    for f in ("templates/apt.html", "templates/index.html", "templates/intro.html"):
        assert "price_ref | price" not in r(f), f
    assert r("templates/apt.html").count("price_ref | eok") >= 6 and r("templates/index.html").count("price_ref | eok") == 2 and r("templates/intro.html").count("price_ref | eok") == 2

def test_real_trade_amounts_keep_two_decimals():
    a = r("templates/apt.html")
    assert "lead.price | price" in a and "t.price | price" in a
    assert 'return eok(manwon, 2)' in r("djdex/site.py")

def test_js_estimates_one_decimal_but_quotes_stay_as_typed():
    for f, tag in (("static/field.js", "`${p}평 · 시세 ${eokRef(price)}`"), ("static/share.js", "` · 84㎡ ${eokRef(c.p)}`")):
        s = r(f); assert tag in s and "toFixed(1)) + \"억\"" in s and "toFixed(2)) + \"억\"" in s, f
    assert "eok(won)" in r("static/field.js") and "eok(won)" in r("static/share.js")      # 호가는 2자리 그대로
    for f in ("static/pay.js", "static/course.js", "static/my.js", "static/prefs.js"): assert 'toFixed(2)) + "억"' in r(f), f
