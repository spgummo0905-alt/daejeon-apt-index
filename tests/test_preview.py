"""일조 미리보기(정식) 시험: 자료 만들기 등급과 사이트 연결."""
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def _build_mod():
    spec = importlib.util.spec_from_file_location("preview_build", ROOT_DIR / "scripts" / "preview_build.py")
    m = importlib.util.module_from_spec(spec)
    sys.modules["preview_build"] = m
    spec.loader.exec_module(m)
    return m


def test_grade_thresholds():
    g = _build_mod().grade
    assert g(0, 5, 0) == "D"                    # 건축HUB에 아파트 없음
    assert g(10, 10, 9) == "A"                  # 동 3개 이상 + 85% 이상
    assert g(10, 10, 6) == "B"                  # 60% 이상
    assert g(10, 10, 3) == "C"                  # 부족하면 열지 않음
    assert g(2, 2, 2) == "B"                    # 동 2개뿐이면 A 가 될 수 없음


def test_saved_preview_data_only_has_grade_a_or_b_and_matches_listing():
    root = ROOT_DIR / "data" / "preview"
    files = list(root.glob("*/*.json"))
    assert len(files) > 500
    for f in files[::25]:
        d = json.loads(f.read_text(encoding="utf-8"))
        assert d["m"]["g"] in ("A", "B") and d["m"]["id"] == f.stem
        assert sum(1 for b in d["b"] if b["k"] == "own") == d["m"]["n_own"]


def test_demo_site_has_no_preview_unless_switched_on(tmp_path):
    from djdex import cli
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    assert not (out / "preview.html").exists() and not (out / "preview").exists()   # 가짜 단지엔 만들지 않음
    assert not any("pv-link" in p.read_text(encoding="utf-8") for p in (out / "apt").glob("*.html"))


def test_preview_page_template_keeps_disclaimer_noindex_and_credits():
    t = (ROOT_DIR / "templates" / "preview.html").read_text(encoding="utf-8")
    assert "추정한 참고용" in t and "법적 일조권" in t and 'content="noindex"' in t
    js = (ROOT_DIR / "static" / "preview.js").read_text(encoding="utf-8")
    assert "브이월드" in js and "건축HUB" in js and "추정한 참고용" in js          # 출처 표기와 한계 문구
    assert re.search(r"font-size:\s*18px", (ROOT_DIR / "static" / "preview.css").read_text(encoding="utf-8"))
