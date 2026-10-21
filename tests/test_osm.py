import json

import requests

from djdex import osm

SAMPLE = {"elements": [
    {"type": "relation", "id": 1, "tags": {"ref": "B1"},
     "members": [{"type": "node", "ref": 10}, {"type": "way", "ref": 20}, {"type": "way", "ref": 99}]},
    {"type": "relation", "id": 2, "tags": {"ref": "B0"}, "members": [{"type": "node", "ref": 10}]},
    {"type": "node", "id": 10, "lat": 36.50, "lon": 127.26, "tags": {"name": "도담동"}},
    {"type": "way", "id": 20, "center": {"lat": 36.48, "lon": 127.29}, "tags": {"name": "정부세종청사북측"}},
    {"type": "node", "id": 11, "lat": 36.40, "lon": 127.20, "tags": {}},
]}


def test_parse_collects_stops_with_routes():
    refs, stops = osm.parse(SAMPLE)
    assert refs == ["B0", "B1"]
    assert stops == [{"name": "도담동", "lat": 36.50, "lng": 127.26, "routes": ["B0", "B1"]},
                     {"name": "정부세종청사북측", "lat": 36.48, "lng": 127.29, "routes": ["B1"]}]


def test_nearest_within_radius():
    _, stops = osm.parse(SAMPLE)
    geo = {"a": [36.501, 127.26], "b": [36.70, 127.10], "c": None}
    df = osm.nearest(geo, stops, "subway", 3000)
    assert df.loc["a", "subway_name"] == "도담동" and 100 < df.loc["a", "subway"] < 120
    assert df.loc["b"].isna().all() and "c" not in df.index
    assert list(osm.nearest(geo, [], "subway", 3000).columns) == ["subway", "subway_name"]


class FakeSession:
    def __init__(self, fail=False):
        self.fail, self.urls = fail, []

    def post(self, url, data=None, timeout=None):
        self.urls.append(url)
        if self.fail:
            raise requests.ConnectionError("down")

        class R:
            def raise_for_status(self):
                pass

            def json(self):
                return SAMPLE
        return R()


def test_collect_caches_and_falls_back(tmp_path):
    path = tmp_path / "osm_stops.json"
    geo = {"a": [36.5, 127.26]}
    stops = osm.collect("^B[0-9]+$", geo, path, log=lambda *_: None, session=FakeSession())
    assert len(stops) == 2 and json.loads(path.read_text())["routes"] == ["B0", "B1"]
    s = FakeSession(fail=True)
    assert osm.collect("^B[0-9]+$", geo, path, log=lambda *_: None, session=s) == stops
    assert len(s.urls) == len(osm.MIRRORS)
    assert osm.load(path) == stops
