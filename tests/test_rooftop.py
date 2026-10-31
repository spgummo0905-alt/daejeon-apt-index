"""집감 옥상: 쉬어가는 1인용 화면 (rooftop.html + rooftop.js)"""
import subprocess
from pathlib import Path

from djdex import cli

ROOT = Path(__file__).resolve().parents[1]


def test_rooftop_page_and_entrances(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "rooftop.html").read_text(encoding="utf-8")
    assert 'id="roof"' in page and 'data-roof-sound' in page and 'aria-checked="false"' in page      # 소리는 기본 꺼짐
    assert 'data-roof-food="pork"' in page and "data-roof-fire" in page and "data-roof-photo" in page
    assert "data-roof-stars" in page and "data-roof-wishgo" in page and 'data-roof-amb="cricket"' in page   # 별 세기, 소원, 환경음 고르기
    assert 'data-page="rooftop"' in page and "static/rooftop.js" in page
    assert 'href="rooftop.html"' in (out / "index.html").read_text(encoding="utf-8")      # 첫 화면 아래 줄
    assert 'href="rooftop.html"' in (out / "compare.html").read_text(encoding="utf-8")    # 바닥글 (메뉴에는 없음)
    assert 'top-nav' in page and '<a href="rooftop.html">' not in page.split('<nav class="top-nav">')[1].split("</nav>")[0]
    assert "<loc>https://www.jipgam.kr/rooftop</loc>" in (out / "sitemap.xml").read_text(encoding="utf-8")


def test_rooftop_script_is_valid_and_gentle():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    subprocess.run(["node", "--check", str(ROOT / "static" / "rooftop.js")], check=True)
    assert "prefers-reduced-motion" in js and "visibilitychange" in js        # 움직임 줄이기, 숨겨진 탭 멈춤
    assert "sound: false" in js and "setTargetAtTime" in js                  # 소리 기본 꺼짐, 부드러운 켜짐
    assert "weather-data/weather.json" in js and "rooftop3d.js" in js         # 날씨는 기상청 자료 파일에서, 실패해도 그냥 열림
    assert "open-meteo" not in js.lower()


def test_rooftop_3d_scene_and_vendor():
    subprocess.run(["node", "--check", str(ROOT / "static" / "rooftop3d.js")], check=True)
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert 'from "./vendor/three.module.min.js"' in js3 and "countStar" in js3 and "sendLantern" in js3   # 별 세기, 소원 풍등
    for kind in ("peony", "chrys", "willow", "ring", "heart", "palm", "crossette", "crackle", "double", "saturn"):
        assert f'"{kind}"' in js3                                                                         # 불꽃 종류
    assert "addItem" in js3 and "aerial" in js3 and "lieDown" in js3                                       # 꾸미기, 야경 보기, 누워서 보기
    assert (ROOT / "static" / "vendor" / "three.module.min.js").stat().st_size > 400_000
    assert (ROOT / "static" / "vendor" / "three.LICENSE").exists()


def test_weather_grid_matches_kma_examples():
    import importlib.util
    spec = importlib.util.spec_from_file_location("weather_fetch", ROOT / "scripts" / "weather_fetch.py")
    w = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(w)
    assert w.grid(37.5665, 126.9780) == (60, 127)     # 서울 시청 (기상청 격자 공식 예시)
    assert w.grid(36.3504, 127.3845) == (67, 100)     # 대전
    assert w.grid(35.1796, 129.0756) == (98, 76)      # 부산
