"""시황 지도: 단지 위치로 동 영역을 그려 SVG 경로로 만듭니다.

법정동 경계 파일 없이, 단지마다 가장 가까운 땅(보로노이 칸)을 단지 둘레 몇백 m 안에서만 떼어
같은 동끼리 합칩니다. 사람이 사는 곳만 칠해져 산·강은 비고, 동 사이 경계는 실제와 비슷하게 나옵니다.
구 경계는 assets/boundary.json (통계청 2013 시군구 경계)을 씁니다.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import shapely
from shapely.geometry import MultiPoint, Point, shape
from shapely.ops import polylabel, unary_union

BOUNDARY = Path(__file__).resolve().parent.parent / "assets" / "boundary.json"


def load_districts(codes: dict) -> dict:
    """{구 이름: [[lng, lat], ...] 도형(GeoJSON dict)}, 설정의 법정동 시군구 코드로 찾습니다."""
    if not BOUNDARY.exists():
        return {}
    data = json.loads(BOUNDARY.read_text(encoding="utf-8"))["districts"]
    return {name: data[code] for code, name in codes.items() if code in data}


class _Proj:
    """위경도 → 평면 m (작은 지역이라 등장방형 근사로 충분)."""

    def __init__(self, lat0: float, lng0: float):
        self.lat0, self.lng0 = lat0, lng0
        self.kx = 111_320 * math.cos(math.radians(lat0))
        self.ky = 110_540

    def xy(self, lat: float, lng: float) -> tuple[float, float]:
        return (lng - self.lng0) * self.kx, -(lat - self.lat0) * self.ky

    def geom(self, gj: dict):
        return shapely.transform(shape(gj), lambda a: [[(x - self.lng0) * self.kx, -(y - self.lat0) * self.ky]
                                                       for x, y in a])


def _path(geom, f) -> str:
    """도형 → SVG path d (f: 평면 m → 화면 px)."""
    out = []
    polys = getattr(geom, "geoms", [geom])
    for p in polys:
        if p.is_empty or p.geom_type != "Polygon":
            continue
        for ring in [p.exterior, *p.interiors]:
            pts = [f(x, y) for x, y in ring.coords[:-1]]
            if len(pts) >= 3:
                out.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
    return "".join(out)


def _label_at(geom):
    """가장 큰 조각 안쪽 깊숙한 점 (이름표 자리)."""
    parts = list(getattr(geom, "geoms", [geom]))
    big = max((p for p in parts if p.geom_type == "Polygon"), key=lambda p: p.area)
    return polylabel(big, tolerance=10)


def build(points: dict, districts: dict | None = None, radius: float = 650, width: int = 640,
          margin: float = 1500) -> dict | None:
    """points: {(구, 동): [(lat, lng), ...]}, districts: {구 이름: GeoJSON 도형}.

    반환: w, h, regions {(구, 동): {d, x, y}}, districts [{name, d, x, y}].
    화면은 칠한 동들을 둘러싼 범위(+margin m)만 보여주고, 구 경계는 그 범위에 맞춰 자릅니다.
    """
    pts = [(k, lat, lng) for k, ll in points.items() for lat, lng in ll if lat and lng]
    if len(points) < 3 or len(pts) < 3:
        return None
    lat0 = sum(p[1] for p in pts) / len(pts)
    lng0 = sum(p[2] for p in pts) / len(pts)
    pr = _Proj(lat0, lng0)
    seen, xy, keys = set(), [], []
    for k, lat, lng in pts:
        p = pr.xy(lat, lng)
        r = (round(p[0]), round(p[1]))
        if r in seen:  # 같은 자리 두 단지 (보로노이 칸이 하나뿐)
            continue
        seen.add(r)
        xy.append(p)
        keys.append(k)
    gus = {name: pr.geom(gj).buffer(0) for name, gj in (districts or {}).items()}
    land = unary_union(list(gus.values())) if gus else None
    mp = MultiPoint(xy)
    cells = shapely.voronoi_polygons(mp, extend_to=mp.envelope.buffer(radius * 4), ordered=True)
    pieces: dict = {}
    for (x, y), k, cell in zip(xy, keys, cells.geoms):
        piece = cell.intersection(Point(x, y).buffer(radius, quad_segs=12))
        own = gus.get(k[0])
        if own is not None:  # 구 경계를 넘지 않게
            piece = piece.intersection(own)
        elif land is not None:
            piece = piece.intersection(land)
        if not piece.is_empty:
            pieces.setdefault(k, []).append(piece)
    regions = {}
    for k, ps in pieces.items():
        g = unary_union(ps)
        # 단지 사이 좁은 틈은 메우고 모서리는 둥글게, 점은 줄여 파일을 가볍게
        g = g.buffer(120, quad_segs=6).buffer(-120, quad_segs=6).simplify(12)
        own = gus.get(k[0])
        if own is not None:
            g = g.intersection(own)
        if not g.is_empty and g.area > 0:
            regions[k] = g
    if len(regions) < 3:
        return None
    allg = unary_union(list(regions.values()))
    x0, y0, x1, y1 = allg.bounds
    x0, y0, x1, y1 = x0 - margin, y0 - margin, x1 + margin, y1 + margin
    s = width / (x1 - x0)
    h = round((y1 - y0) * s)

    def f(x, y):
        return (x - x0) * s, (y - y0) * s

    view = shapely.box(x0, y0, x1, y1)
    out = {"w": width, "h": h, "scale_m": round(1 / s, 2), "regions": {}, "districts": []}
    for k, g in regions.items():
        lp = _label_at(g)
        lx, ly = f(lp.x, lp.y)
        out["regions"][k] = {"d": _path(g, f), "x": round(lx, 1), "y": round(ly, 1),
                             "area": round(g.area / 1e6, 3)}
    filled = allg.buffer(250)
    for name, g in gus.items():
        cut = g.intersection(view)
        if cut.is_empty:
            continue
        # 구 이름은 칠한 동을 피해 빈 땅에 (빈 땅이 너무 좁으면 구 한가운데)
        empty = cut.difference(filled)
        lp = _label_at(empty if not empty.is_empty and empty.area > cut.area * 0.08 else cut)
        lx, ly = f(lp.x, lp.y)
        out["districts"].append({"name": name, "d": _path(cut, f), "x": round(lx, 1), "y": round(ly, 1)})
    return out
