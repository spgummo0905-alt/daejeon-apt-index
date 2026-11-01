"""청주: 지하철 대신 오송역·청주역까지 거리, 역세권 화면 없이"""
import json

from djdex import cli, config, osm, points


def test_cheongju_config():
    cj = config.load(config.ROOT / "config.cheongju.toml")
    assert cj.region_name == "청주" and set(cj.districts) == {"43111", "43112", "43113", "43114"}
    keys = [f["key"] for f in cj.location_factors]
    assert "subway" not in keys and keys[0] == "rail"
    rail = cj.location_factors[0]
    assert [p["name"] for p in rail["points"]] == ["오송역", "청주역"]
    assert abs(sum(f["weight"] for f in cj.location_factors) - 1) < 1e-9
    assert cj.raw["region"]["movein_area"] == "충북" and cj.raw["region"]["movein_addr"] == "청주"


def test_points_resolve_and_distance(tmp_path):
    class K:
        calls = 0
        def place(self, name, prefer=""):
            K.calls += 1
            return (36.6456, 127.3917, "청주역 · 기차역")
    path = tmp_path / "points.json"
    pts = points.resolve(["청주역", {"name": "오송역", "lat": 36.6203, "lng": 127.3270}], path, K())
    assert [p["name"] for p in pts] == ["청주역", "오송역"] and K.calls == 1
    assert points.resolve(["청주역"], path, K())[0]["lat"] == 36.6456 and K.calls == 1   # 두 번째는 저장해 둔 좌표
    assert points.resolve(["없는역"], tmp_path / "x.json") == []                            # 키 없으면 빼고 진행
    near = osm.nearest({"a": [36.6420, 127.4000], "b": [36.6210, 127.3300]}, pts, "rail", 40000)
    assert near.at["a", "rail_name"] == "청주역" and near.at["b", "rail_name"] == "오송역"
    assert 500 < near.at["a", "rail"] < 1500


def test_cheongju_demo_has_no_station_pages(tmp_path):
    out = tmp_path / "site"
    cli.main(["--config", "config.cheongju.toml", "--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    index = (out / "index.html").read_text(encoding="utf-8")
    assert not (out / "stations.html").exists()
    assert 'href="stations.html"' not in index and 'data-km-flag="stn"' not in index
    assert "data-no-stop" in (out / "finder.html").read_text(encoding="utf-8")
    assert "<h2>기차역</h2>" not in (out / "themes.html").read_text(encoding="utf-8")
    cx = json.loads((out / "complexes.json").read_text(encoding="utf-8"))["complexes"]
    assert all("rail" in c["f"] and "subway" not in c["f"] for c in cx)
    apt = next((out / "apt").glob("*.html")).read_text(encoding="utf-8")
    assert "오송역·청주역까지 거리" in apt


def test_assetlinks_only_at_root_with_fingerprints(tmp_path):
    from djdex import config, site
    cfg = config.load(config.ROOT / "config.toml")
    site.write_assetlinks(tmp_path, cfg)
    assert not (tmp_path / ".well-known").exists()            # 지문이 없으면 만들지 않음
    cfg.raw.setdefault("app", {})["android_sha256"] = ["aa:bb:cc"]
    site.write_assetlinks(tmp_path, cfg)
    j = json.loads((tmp_path / ".well-known" / "assetlinks.json").read_text(encoding="utf-8"))
    assert j[0]["target"]["package_name"] == "kr.jipgam.app" and j[0]["target"]["sha256_cert_fingerprints"] == ["AA:BB:CC"]
    sub = config.load(config.ROOT / "config.sejong.toml")     # 지역 폴더(/sejong/)에는 두지 않음
    sub.raw.setdefault("app", {})["android_sha256"] = ["AA"]
    other = tmp_path / "sub"
    site.write_assetlinks(other, sub)
    assert not other.exists()
