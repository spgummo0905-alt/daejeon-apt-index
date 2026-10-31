"""집감 옥상: 쉬어가는 1인용 화면 (rooftop.html + rooftop.js)"""
import subprocess
from pathlib import Path

from djdex import cli

ROOT = Path(__file__).resolve().parents[1]


def test_rooftop_page_and_entrances(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "rooftop.html").read_text(encoding="utf-8")
    assert 'id="roof"' in page and 'data-roof-sound' in page and "소리 꺼짐" in page      # 소리는 기본 꺼짐
    assert 'data-roof-food="pork"' in page and "data-roof-fire" in page and "data-roof-photo" in page
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
