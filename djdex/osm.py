"""OpenStreetMap(Overpass API)에서 버스 노선의 정류장 위치를 모읍니다. 키가 필요 없습니다.

세종 BRT 정류장은 카카오 로컬에 '정류장' 분류가 없어, 키워드 'BRT'로 찾으면 이름에 BRT가 들어간
카페·중개사무소가 잡힙니다. 그래서 OSM에 그려진 BRT 노선(번호가 B0, B1 … 인 노선)의 정류장을 씁니다.
결과는 data/<지역>/osm_stops.json 에 캐시되고, 새로 받지 못하면 캐시를 그대로 씁니다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd
import requests

from .location import _meters

MIRRORS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter",
           "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]


def query(route_ref: str, bbox: tuple[float, float, float, float]) -> str:
    """bbox: (남, 서, 북, 동). 노선 번호가 route_ref(정규식)에 맞는 버스 노선과 그 정류장."""
    s, w, n, e = bbox
    return (f'[out:json][timeout:120];'
            f'rel["type"="route"]["route"="bus"]["ref"~"{route_ref}"]({s},{w},{n},{e})->.r;'
            f'.r out body;'
            f'(node(r.r)["name"];way(r.r)["name"]["public_transport"="platform"];'
            f'way(r.r)["name"]["highway"="platform"];)->.p;'
            f'.p out center tags;')


def parse(data: dict) -> tuple[list[str], list[dict]]:
    """Overpass 응답 → (노선 번호 목록, 정류장 [{name, lat, lng, routes}])."""
    els = data.get("elements", [])
    routes: dict[tuple[str, int], set[str]] = {}
    refs = set()
    for e in els:
        if e.get("type") != "relation":
            continue
        ref = e.get("tags", {}).get("ref", "")
        refs.add(ref)
        for m in e.get("members", []):
            routes.setdefault((m.get("type"), m.get("ref")), set()).add(ref)
    stops = []
    for e in els:
        if e.get("type") not in ("node", "way"):
            continue
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lng = e.get("lon", e.get("center", {}).get("lon"))
        name = e.get("tags", {}).get("name")
        if lat is None or lng is None or not name:
            continue
        stops.append({"name": name, "lat": float(lat), "lng": float(lng),
                      "routes": sorted(routes.get((e["type"], e["id"]), []))})
    return sorted(refs, key=_ref_order), stops


def _ref_order(ref: str):
    m = re.search(r"\d+", ref)
    return (int(m.group()) if m else 0, ref)


def bbox_of(geo: dict, margin: float = 0.03) -> tuple[float, float, float, float] | None:
    pts = [ll for ll in geo.values() if ll]
    if not pts:
        return None
    lats, lngs = [p[0] for p in pts], [p[1] for p in pts]
    return (round(min(lats) - margin, 4), round(min(lngs) - margin, 4),
            round(max(lats) + margin, 4), round(max(lngs) + margin, 4))


def collect(route_ref: str, geo: dict, path: Path, log=print, session=None) -> list[dict]:
    """정류장을 새로 받아 캐시에 저장합니다. 실패하면 예전 캐시를 씁니다."""
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    bbox = bbox_of(geo)
    if bbox is None:
        return old.get("stops", [])
    s = session or requests.Session()
    q = query(route_ref, bbox)
    for url in MIRRORS:
        try:
            r = s.post(url, data={"data": q}, timeout=(10, 180))
            r.raise_for_status()
            refs, stops = parse(r.json())
        except (requests.RequestException, ValueError) as e:
            log(f"[정류장] {url} 실패: {e}")
            continue
        if not stops:
            log(f"[정류장] {url}: 노선 {route_ref} 정류장을 찾지 못했습니다 (노선 {len(refs)}개)")
            continue
        names = {st["name"] for st in stops}
        log(f"[정류장] OSM 노선 {len(refs)}개 ({', '.join(refs)}), 정류장 {len(stops)}곳 (이름 {len(names)}개)")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"route_ref": route_ref, "routes": refs, "stops": stops},
                                   ensure_ascii=False, indent=0), encoding="utf-8")
        return stops
    if old.get("stops"):
        log(f"[정류장] 새로 받지 못해 지난번 정류장 {len(old['stops'])}곳을 씁니다")
    return old.get("stops", [])


def load(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")).get("stops", []) if path.exists() else []


def nearest(geo: dict, stops: list[dict], key: str, radius: float) -> pd.DataFrame:
    """단지마다 가장 가까운 정류장까지 직선거리(m)와 이름. 반경 밖이면 비웁니다.
    열: <key>, <key>_name (카카오 'nearest' 항목과 같은 모양)."""
    rows = {}
    pts = [((st["lat"], st["lng"]), st["name"]) for st in stops]
    for cid, ll in geo.items():
        if not ll or not pts:
            continue
        d, name = min((_meters(tuple(ll), p), nm) for p, nm in pts)
        rows[cid] = {key: round(d, 1), key + "_name": name} if d <= radius else {key: None, key + "_name": None}
    return pd.DataFrame.from_dict(rows, orient="index", columns=[key, key + "_name"])
