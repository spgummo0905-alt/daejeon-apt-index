"""정해 둔 몇 곳까지 거리 (예: 청주의 오송역·청주역). 지하철이 없는 지역의 교통 항목에 씁니다.

설정: factors 의 한 항목에 points = ["오송역", "청주역"] (이름) 또는 [{name, lat, lng}] (좌표).
이름만 적으면 카카오 키워드 검색으로 좌표를 찾아 data/<지역>/points.json 에 두고 다음부터는 그대로 씁니다.
거리는 osm.nearest 와 같은 모양(<key>, <key>_name)으로 단지마다 가장 가까운 곳까지 직선거리입니다.
"""
from __future__ import annotations

import json
from pathlib import Path


def resolve(names: list, path: Path, client=None, log=print) -> list[dict]:
    """설정의 points 를 [{name, lat, lng}] 로. 좌표를 못 찾은 곳은 빼고 알려 줌"""
    cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    out, changed = [], False
    for p in names:
        if isinstance(p, dict):
            out.append({"name": p["name"], "lat": float(p["lat"]), "lng": float(p["lng"])})
            continue
        hit = cache.get(p)
        if not hit and client is not None:
            hit = client.place(p, prefer="기차역")
            if hit:
                cache[p] = {"lat": hit[0], "lng": hit[1], "found": hit[2]}
                changed = True
                log(f"[교통] {p} 좌표: {hit[0]:.5f}, {hit[1]:.5f} ({hit[2]})")
        if hit:
            out.append({"name": p, "lat": hit["lat"] if isinstance(hit, dict) else hit[0],
                        "lng": hit["lng"] if isinstance(hit, dict) else hit[1]})
        else:
            log(f"::warning::[교통] {p} 좌표를 찾지 못해 빼고 계산합니다")
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    return out
