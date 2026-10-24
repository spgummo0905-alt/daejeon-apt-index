import io
import json

from PIL import Image

from djdex import elev


class FakeResp:
    def __init__(self, content):
        self.content = content

    def raise_for_status(self):
        pass


class Tiles:
    """동쪽으로 갈수록 높아지는 가짜 지형 (픽셀 하나에 0.5m)."""

    def __init__(self):
        self.calls = 0

    def get(self, url, timeout=None):
        self.calls += 1
        z, x, y = (int(v) for v in url.rsplit(".", 1)[0].split("/")[-3:])
        img = Image.new("RGB", (256, 256))
        px = img.load()
        for i in range(256):
            v = 50 + (x * 256 + i - 7_000_000 // 4) * 0.5 % 400 + 32768
            r, g = int(v) // 256, int(v) % 256
            b = int((v - int(v)) * 256)
            for j in range(256):
                px[i, j] = (r, g, b)
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return FakeResp(buf.getvalue())


def test_dem_reads_terrarium_and_measures_climb():
    dem = elev.DEM(Tiles())
    a, b = dem.at(36.35, 127.38), dem.at(36.35, 127.39)
    assert b > a   # 동쪽이 더 높음
    m = elev.measure(dem, (36.35, 127.39), (36.35, 127.38))
    assert m["st"] > 0 and len(m["pf"]) == 9 and m["pf"][-1] == m["e"] and m["rf"] > 0


def test_collect_is_incremental_and_uses_osm_stops(tmp_path):
    geo = {"A": [36.35, 127.39], "B": [36.351, 127.385], "C": None}
    stops = [{"name": "정류장1", "lat": 36.35, "lng": 127.38}]
    path = tmp_path / "elev.json"
    s = Tiles()
    data = elev.collect(geo, {}, path, stops=stops, session=s, log=lambda *_: None)
    assert set(k for k in data if not k.startswith("_")) == {"A", "B"}
    assert data["A"]["st"] > 0 and data["_stations"]["정류장1"] == [36.35, 127.38]
    calls = s.calls
    geo["D"] = [36.352, 127.386]
    elev.collect(geo, {}, path, stops=stops, session=s, log=lambda *_: None)
    loaded = elev.load(path)
    assert set(loaded) == {"A", "B", "D"} and s.calls - calls <= 4   # 새 단지 하나만 (타일은 거의 다시 받지 않음)
    assert json.loads(path.read_text(encoding="utf-8"))["_v"] == elev.VERSION


def test_collect_without_station_keeps_relief_only(tmp_path):
    data = elev.collect({"A": [36.35, 127.39]}, {"A": {"subway": 500, "subway_name": "어느역 1호선"}},
                        tmp_path / "e.json", session=Tiles(), log=lambda *_: None)
    assert "rf" in data["A"] and "st" not in data["A"]
