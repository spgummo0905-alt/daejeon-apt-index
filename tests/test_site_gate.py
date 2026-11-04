"""배포 관문(scripts/site_gate.py): 필수 자료가 빠지면 실패, 선택 지역이 없으면 경고만"""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

from djdex import cli

SPEC = importlib.util.spec_from_file_location("site_gate", Path(__file__).resolve().parent.parent / "scripts" / "site_gate.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    root = tmp_path_factory.mktemp("gate") / "site"
    cli.main(["--data", str(root.parent / "data"), "demo", "--out", str(root / "daejeon")])
    cli.main(["--data", str(root.parent / "data"), "landing", "--out", str(root)])
    return root


@pytest.fixture
def site(built, tmp_path, monkeypatch):
    dst = tmp_path / "site"
    shutil.copytree(built, dst)
    monkeypatch.setenv("SITE_GATE_MIN_DAEJEON", "10")   # 데모는 단지가 적다
    return dst


def errors(root):
    return [m for lv, m in gate.run(root)[0] if lv == "error"]


def test_complete_site_passes_and_missing_optional_regions_only_warn(site):
    results, done = gate.run(site)
    assert [m for lv, m in results if lv == "error"] == []
    assert done == ["daejeon"]
    assert {m.split(":")[0] for lv, m in results if lv == "warn"} >= {"sejong", "cheongju", "seoul"}
    assert gate.main(["x", str(site)]) == 0


def test_missing_required_region_fails(site):
    shutil.rmtree(site / "daejeon")
    assert any("daejeon: 폴더가 없습니다" in m for m in errors(site))
    assert gate.main(["x", str(site)]) == 1


def test_truncated_collection_fails(site, monkeypatch):
    n = len(json.loads((site / "daejeon" / "complexes.json").read_text(encoding="utf-8"))["complexes"])
    monkeypatch.setenv("SITE_GATE_MIN_DAEJEON", str(n + 1))   # 실제 개수보다 하나 더 요구하면 '모자람'
    assert any(f"단지 자료 {n}곳 (최소 {n + 1}곳" in m for m in errors(site))
    monkeypatch.setenv("SITE_GATE_MIN_DAEJEON", str(n))       # 경계: 딱 맞으면 통과
    assert not any("단지 자료" in m for m in errors(site))


def test_broken_or_missing_complexes_json_fails(site):
    cj = site / "daejeon" / "complexes.json"
    cj.write_text("{ 깨진 json", encoding="utf-8")
    assert any("읽을 수 없습니다" in m for m in errors(site))
    cj.unlink()
    assert any("complexes.json 이 없습니다" in m for m in errors(site))


def test_rows_missing_required_fields_fail(site):
    cj = site / "daejeon" / "complexes.json"
    data = json.loads(cj.read_text(encoding="utf-8"))
    for c in data["complexes"][:10]:
        c.pop("g")
    cj.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    assert any("필수 칸" in m for m in errors(site))


def test_missing_apartment_pages_and_sitemap_fail(site):
    for p in list((site / "daejeon" / "apt").glob("*.html"))[:20]:
        p.unlink()
    assert any("단지 페이지" in m for m in errors(site))
    (site / "daejeon" / "sitemap.xml").unlink()
    assert any("sitemap.xml 이 없습니다" in m for m in errors(site))


def test_broken_optional_region_fails_but_absent_one_does_not(site, built):
    shutil.copytree(built / "daejeon", site / "sejong")
    (site / "sejong" / "complexes.json").unlink()
    assert any(m.startswith("sejong:") for m in errors(site))   # 있는데 깨졌으면 올리지 않는다


def test_unfilled_service_worker_version_fails(site):
    sw = site / "daejeon" / "sw.js"
    sw.write_text('const VERSION = "__VERSION__";', encoding="utf-8")
    assert any("__VERSION__" in m for m in errors(site))


def test_missing_root_files_fail(site):
    (site / "robots.txt").unlink()
    assert any("robots.txt" in m for m in errors(site))


def test_workflow_runs_the_gate_before_upload():
    wf = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")
    assert "python scripts/site_gate.py site" in wf
    assert wf.index("python scripts/site_gate.py site") < wf.index("actions/upload-pages-artifact")
    # 관문 단계는 실패를 삼키면 안 된다
    gate_step = wf[wf.index("배포 관문"):wf.index("actions/upload-pages-artifact")]
    assert "continue-on-error" not in gate_step and "|| true" not in gate_step
