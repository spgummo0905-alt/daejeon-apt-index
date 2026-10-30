"""소음 체크: 단지에서 큰길(고속·간선도로, 대로)과 철도까지 직선거리를 OpenStreetMap(Overpass API)으로 잽니다.
키가 필요 없습니다. 소음은 임장 단골 확인 거리인데 숫자 자료가 없어, '현장에서 낮·밤 소음을 확인할 단지'를 짚는 데 씁니다.

데시벨을 재는 것이 아니라 거리만 봅니다 (방음벽·동 배치·층에 따라 실제 소음은 크게 다름).
결과는 data/<지역>/noise.json 에 캐시합니다. {단지: {road, road_kind, road_name, rail, rail_name}} (거리는 m, 1km 밖은 비움)
도로·철도 선은 data/<지역>/noise_lines.json 에 두고, 새로 받지 못하면 지난번 것을 씁니다.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import requests

from .osm import HEADERS, MIRRORS, bbox_of

VERSION = 1
FAR = 1000   # 이보다 멀면 거리를 적지 않음
# OSM 도로 등급 → 화면 이름. motorway·trunk 는 자동차 전용·간선, primary 는 시내 대로(보통 4~8차로)
KINDS = {"motorway": "고속도로", "trunk": "간선도로", "primary": "대로"}


def query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    return (f'[out:json][timeout:180];('
            f'way["highway"~"^(motorway|trunk|primary)$"]({s},{w},{n},{e});'
            f'way["railway"="rail"]["service"!~"."]["tunnel"!="yes"]({s},{w},{n},{e});'
            f');out geom tags;')


def parse(data: dict) -> list[dict]:
    """Overpass 응답 → 선 목록 [{kind, name, pts: [[lat, lng], ...]}]. 지하(터널) 도로는 뺍니다."""
    out = []
    for e in data.get("elements", []):
        tags, geom = e.get("tags", {}), e.get("geometry") or []
        if len(geom) < 2 or tags.get("tunnel") == "yes":
            continue
        kind = "rail" if tags.get("railway") == "rail" else tags.get("highway")
        if kind not in KINDS and kind != "rail":
            continue
        out.append({"kind": kind, "name": tags.get("name") or tags.get("ref") or "",
                    "pts": [[round(g["lat"], 6), round(g["lon"], 6)] for g in geom]})
    return out


def _seg_dist(p, a, b) -> float:
    """점 p 에서 선분 ab 까지 거리(m). 짧은 거리라 위도 기준 평면으로 근사."""
    k = math.cos(math.radians(p[0]))
    ax, ay = (a[1] - p[1]) * 111320 * k, (a[0] - p[0]) * 110540
    bx, by = (b[1] - p[1]) * 111320 * k, (b[0] - p[0]) * 110540
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    return math.hypot(ax + t * dx, ay + t * dy)


def measure(geo: dict, lines: list[dict]) -> dict:
    """단지마다 가장 가까운 큰길·철도까지 거리."""
    # 선분을 0.01도(약 1km) 칸에 나눠 담아 단지 둘레 칸만 봅니다
    grid: dict[tuple[int, int], list] = {}
    for ln in lines:
        pts = ln["pts"]
        for a, b in zip(pts, pts[1:]):   # 선분이 지나는 칸(양 끝을 감싸는 칸 모두)에 담음: 긴 직선 구간도 놓치지 않게
            for y in range(int(min(a[0], b[0]) * 100), int(max(a[0], b[0]) * 100) + 1):
                for x in range(int(min(a[1], b[1]) * 100), int(max(a[1], b[1]) * 100) + 1):
                    grid.setdefault((y, x), []).append((a, b, ln))
    out = {}
    for cid, ll in geo.items():
        if not ll:
            continue
        cy, cx = int(ll[0] * 100), int(ll[1] * 100)
        best = {"road": (FAR + 1, None), "rail": (FAR + 1, None)}
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for a, b, ln in grid.get((cy + dy, cx + dx), []):
                    key = "rail" if ln["kind"] == "rail" else "road"
                    d = _seg_dist(ll, a, b)
                    if d < best[key][0]:
                        best[key] = (d, ln)
        row = {}
        d, ln = best["road"]
        if ln and d <= FAR:
            row.update(road=round(d), road_kind=KINDS[ln["kind"]], road_name=ln["name"])
        d, ln = best["rail"]
        if ln and d <= FAR:
            row.update(rail=round(d), rail_name=ln["name"])
        out[cid] = row
    return out


def collect(geo: dict, path: Path, lines_path: Path, log=print, session=None) -> dict:
    """도로·철도 선을 받아(실패하면 지난번 선) 모든 단지 거리를 다시 잽니다. 계산은 몇 초면 끝나 늘 새로 합니다."""
    import time
    lines = None
    bbox = bbox_of(geo)
    fresh = lines_path.exists() and time.time() - lines_path.stat().st_mtime < 7 * 86400
    if fresh:   # 도로·철도는 자주 바뀌지 않아 일주일에 한 번만 새로 받음 (단지 거리는 매번 다시 잼)
        lines = json.loads(lines_path.read_text(encoding="utf-8")).get("lines", []) or None
    if bbox and not lines:
        s = session or requests.Session()
        s.headers.update(HEADERS)
        for url in MIRRORS:
            try:
                r = s.post(url, data={"data": query(bbox)}, timeout=(10, 240))
                r.raise_for_status()
                lines = parse(r.json())
            except (requests.RequestException, ValueError) as e:
                log(f"[소음] {url} 실패: {e}")
                continue
            if lines:
                break
    if lines and not fresh:
        lines_path.parent.mkdir(parents=True, exist_ok=True)
        lines_path.write_text(json.dumps({"v": VERSION, "lines": lines}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    elif lines_path.exists():
        lines = json.loads(lines_path.read_text(encoding="utf-8")).get("lines", [])
        log(f"[소음] 새로 받지 못해 지난번 도로·철도 선 {len(lines):,}개를 씁니다")
    if not lines:
        return load(path)
    res = measure(geo, lines)
    path.write_text(json.dumps({"v": VERSION, "data": res}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    near = sum(1 for v in res.values() if v.get("road", FAR) <= 100 or v.get("rail", FAR) <= 200)
    log(f"[소음] 도로·철도 선 {len(lines):,}개, 단지 {len(res):,}곳 중 큰길 100m·철도 200m 안 {near:,}곳")
    return res


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    d = json.loads(path.read_text(encoding="utf-8"))
    return d.get("data", {}) if d.get("v") == VERSION else {}


# 화면 구간: 큰길·철도가 가까운 정도. 숫자는 거리 기준일 뿐 실제 소음은 현장에서 확인
def level(n: dict | None) -> tuple[str, str] | None:
    if not n or ("road" not in n and "rail" not in n):
        return None
    road, rail = n.get("road", FAR + 1), n.get("rail", FAR + 1)
    big = n.get("road_kind") in ("고속도로", "간선도로")
    if (big and road <= 150) or road <= 60 or rail <= 150:
        return "near", "큰길·철도가 가까워요"
    if (big and road <= 400) or road <= 150 or rail <= 400:
        return "mid", "큰길·철도가 조금 떨어져 있어요"
    return "far", "큰길·철도에서 떨어져 있어요"
