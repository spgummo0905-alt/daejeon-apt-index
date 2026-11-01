"""언덕(고저차): 공개 지형 타일(AWS Terrain Tiles, Terrarium 형식)에서 단지와 가까운 역의 높이를 읽습니다.

지형 타일은 키가 필요 없습니다. 역 좌표는 카카오 로컬(지하철역)이나 OSM 정류장(세종 BRT)에서 찾습니다.
단지마다 한 번만 계산해 data/<지역>/elev.json 에 캐시합니다.
  e   단지 땅 높이(m, 해발)
  rf  주변 고저차: 단지에서 300m 안 땅이 가장 높은 곳과 낮은 곳의 차이 (언덕·비탈인지)
  st  가장 가까운 역보다 땅이 높은 정도 (+면 역에서 단지까지 오르막). 역 좌표를 모르면 없음
  pf  역 → 단지 직선 단면의 땅 높이 9점 (그래프용)

지형 타일(SRTM 30m 격자)은 건물 높이가 섞여 있어(특히 고층 단지), 한 점의 값 대신 둘레 60m 안에서 가장 낮은 값을
'땅 높이'로 씁니다. 그래도 평지 고층 단지에서 고저차가 20m 남짓 나올 수 있어 화면에는 구간(평지·비탈·언덕)과
'현장에서 꼭 걸어 보기'를 함께 보여줍니다.
"""
from __future__ import annotations

import io
import json
import math
from pathlib import Path

import requests

from .location import _meters

TILE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
Z = 13            # 위도 36도에서 한 칸 약 15m (지형 원자료가 30m 안팎이라 이 정도면 충분)
VERSION = 1       # 계산 방법을 바꾸면 올려서 다시 계산


class DEM:
    """타일을 받아 두고 위경도의 높이를 이웃 네 칸 사이로 고르게(쌍선형) 읽습니다."""

    def __init__(self, session: requests.Session | None = None, log=print):
        self.s = session or requests.Session()
        self.tiles: dict[tuple[int, int], object] = {}
        self.log = log
        self.fetched = 0

    def _tile(self, x: int, y: int):
        if (x, y) not in self.tiles:
            from PIL import Image
            r = self.s.get(TILE.format(z=Z, x=x, y=y), timeout=30)
            r.raise_for_status()
            self.tiles[(x, y)] = Image.open(io.BytesIO(r.content)).convert("RGB").load()
            self.fetched += 1
        return self.tiles[(x, y)]

    def _px(self, gx: int, gy: int) -> float:
        px = self._tile(gx // 256, gy // 256)[gx % 256, gy % 256]
        return px[0] * 256 + px[1] + px[2] / 256 - 32768

    def at(self, lat: float, lng: float) -> float:
        n = 256 * 2 ** Z
        fx = (lng + 180) / 360 * n - 0.5
        s = math.sin(math.radians(lat))
        fy = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n - 0.5
        x0, y0 = math.floor(fx), math.floor(fy)
        tx, ty = fx - x0, fy - y0
        a, b = self._px(x0, y0), self._px(x0 + 1, y0)
        c, d = self._px(x0, y0 + 1), self._px(x0 + 1, y0 + 1)
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def _offset(lat: float, lng: float, dist: float, bearing: float) -> tuple[float, float]:
    dy = dist * math.cos(bearing) / 111_320
    dx = dist * math.sin(bearing) / (111_320 * math.cos(math.radians(lat)))
    return lat + dy, lng + dx


def ground(dem: DEM, lat: float, lng: float) -> float:
    """땅 높이 어림: 둘레 30·60m 열여섯 점과 가운데 중 가장 낮은 값 (건물·나무 높이를 덜어 냄)."""
    pts = [(lat, lng)] + [_offset(lat, lng, r, 2 * math.pi * k / 8) for r in (30, 60) for k in range(8)]
    return min(dem.at(*p) for p in pts)


def measure(dem: DEM, ll: tuple[float, float], station: tuple[float, float] | None) -> dict:
    lat, lng = ll
    e = ground(dem, lat, lng)
    around = [e] + [ground(dem, *_offset(lat, lng, r, 2 * math.pi * k / 8)) for r in (150, 300) for k in range(8)]
    out = {"e": round(e, 1), "rf": round(max(around) - min(around), 1)}
    if station:
        pf = [ground(dem, station[0] + (lat - station[0]) * k / 8, station[1] + (lng - station[1]) * k / 8)
              for k in range(8)] + [e]
        out["st"] = round(e - pf[0], 1)
        out["pf"] = [round(v, 1) for v in pf]
    return out


def station_coords(cid_name: dict[str, str], geo: dict, dist: dict[str, float], client, known: dict,
                   stops: list[dict] | None = None) -> dict[str, list[float] | None]:
    """역 이름 → [lat, lng]. OSM 정류장 목록이 있으면 거기서, 아니면 카카오 지하철역(SW8)에서 찾습니다.
    한 이름은 한 번만 찾습니다 (못 찾은 이름도 None 으로 기억)."""
    by_stop = {}
    for st in stops or []:
        by_stop.setdefault(st["name"], []).append((st["lat"], st["lng"]))
    for cid, name in cid_name.items():
        if not name or name in known or not geo.get(cid):
            continue
        lat, lng = geo[cid]
        if by_stop.get(name):
            known[name] = list(min(by_stop[name], key=lambda p: _meters((lat, lng), p)))
            continue
        if client is None:
            continue
        r = int((dist.get(cid) or 1000) + 100)
        hit = None
        for page in (1, 2):
            data = client._get("category", category_group_code="SW8", x=lng, y=lat, radius=min(r, 20000),
                               sort="distance", page=page, size=15)
            hit = next((d for d in data.get("documents", []) if d.get("place_name") == name), None)
            if hit or data.get("meta", {}).get("is_end", True):
                break
        known[name] = [float(hit["y"]), float(hit["x"])] if hit else None
    return known


def collect(geo: dict, poi: dict, path: Path, client=None, stops: list[dict] | None = None,
            key: str = "subway", log=print, session=None, limit: int | None = None) -> dict:
    """새 단지만 계산해 path 에 저장하고 전체를 돌려줍니다. 지형 타일을 못 받으면 받은 데까지 저장합니다."""
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if data.get("_v") != VERSION:
        data = {"_v": VERSION, "_stations": data.get("_stations", {})}
    known = data["_stations"]
    if stops:   # 세종 BRT: 정류장은 매번 OSM 목록에서 가장 가까운 곳 (이름만으로는 겹침)
        names = {}
        for cid, ll in geo.items():
            if ll:
                st = min(stops, key=lambda s: _meters(tuple(ll), (s["lat"], s["lng"])))
                names[cid] = st["name"]
                known.setdefault(st["name"], [st["lat"], st["lng"]])
    else:
        names = {cid: (p or {}).get(key + "_name") for cid, p in poi.items()}
    todo = [cid for cid, ll in geo.items() if ll and cid not in data]
    if limit:
        todo = todo[:limit]
    if not todo:
        return data
    try:
        station_coords({c: names.get(c) for c in todo}, geo, {c: (poi.get(c) or {}).get(key) for c in todo},
                       client, known, stops)
    except requests.RequestException as e:   # 역 좌표를 못 찾아도 주변 고저차는 계산
        log(f"::warning::역 좌표 찾기 실패, 주변 고저차만 계산합니다: {e}")
    dem = DEM(session, log)
    done = 0
    try:
        for cid in todo:
            st = known.get(names.get(cid) or "")
            data[cid] = measure(dem, tuple(geo[cid]), tuple(st) if st else None)
            done += 1
    except (requests.RequestException, OSError, ValueError) as e:
        log(f"::warning::지형 타일 받기 실패, {done}곳까지 저장합니다: {e}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    vals = sorted(v["rf"] for k, v in data.items() if not k.startswith("_"))
    sts = sorted(v["st"] for k, v in data.items() if not k.startswith("_") and v.get("st") is not None)
    log(f"[언덕] 새로 {done}곳 (지형 타일 {dem.fetched}장), 모두 {len(vals)}곳"
        + (f", 주변 고저차 중간 {vals[len(vals) // 2]:.0f}m · 위 10% {vals[len(vals) * 9 // 10]:.0f}m" if vals else "")
        + (f", 역보다 높은 단지 중간 {sts[len(sts) // 2]:+.0f}m · 위 10% {sts[len(sts) * 9 // 10]:+.0f}m ({len(sts)}곳)" if sts else ""))
    return data


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}
