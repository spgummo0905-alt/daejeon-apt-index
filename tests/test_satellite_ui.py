"""위성 사진 칸: 키는 화면 코드에 없고, 대리 서버 주소가 설정돼 있을 때만 생기며, 출처 표기가 있다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _r(p):
    return (ROOT / p).read_text(encoding="utf-8")


def test_no_vworld_key_in_any_site_file_and_worker_has_no_literal_key():
    for f in ("static/satellite.js", "templates/apt.html", "workers/satellite/index.js", "workers/satellite/wrangler.toml", "config.toml"):
        t = _r(f)
        assert "apiKey" not in t and "api.vworld.kr/req/wmts/1.0.0/\"" not in t, f
    assert "env.VWORLD_KEY" in _r("workers/satellite/index.js")              # 키는 서버 시크릿에서만


def test_satellite_box_only_when_proxy_url_is_configured_and_has_source_note():
    t = _r("templates/apt.html")
    assert "{% if latlng and satellite_url %}" in t and "data-api=\"{{ satellite_url }}\"" in t
    assert "항공 사진 출처: 브이월드(국토교통부)" in t and "촬영 시점이 달라" in t
    assert '{% if satellite_url %}<script src="{{ root }}static/satellite.js' in t
    import re
    m = re.search(r'^satellite_url = "([^"]*)"', _r("config.toml"), re.M)
    assert m and (m.group(1) == "" or m.group(1).startswith("https://") and "/functions/v1/satellite" in m.group(1))   # 꺼짐이거나 우리 함수 주소


def test_satellite_script_hides_everything_when_tiles_fail_and_never_stores():
    js = _r("static/satellite.js")
    assert "if (loaded >= 5) box.hidden = false; else box.remove();" in js
    assert "requestIdleCallback" in js and "localStorage" not in js and "sessionStorage" not in js and "canvas" not in js
