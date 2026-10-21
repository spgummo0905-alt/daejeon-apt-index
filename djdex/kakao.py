"""카카오 로컬 API로 단지 좌표와 주변 시설 정보를 모읍니다.

필요한 키: 카카오 개발자 콘솔의 REST API 키 (환경변수 KAKAO_REST_KEY)
결과는 data/geo.json, data/poi.json 에 캐시되어 다음 실행 때 다시 부르지 않습니다.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

BASE = "https://dapi.kakao.com/v2/local/search"


class Kakao:
    def __init__(self, rest_key: str, pause: float = 0.05):
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"KakaoAK {rest_key}"
        self.pause = pause

    def _get(self, path: str, **params) -> dict:
        r = self.s.get(f"{BASE}/{path}.json", params=params, timeout=15)
        r.raise_for_status()
        time.sleep(self.pause)
        return r.json()

    def geocode(self, address: str, keyword: str | None = None) -> tuple[float, float] | None:
        """주소로 좌표(lat, lng)를 찾고, 실패하면 단지명 키워드 검색으로 한 번 더 찾습니다."""
        docs = self._get("address", query=address).get("documents", [])
        if not docs and keyword:
            docs = self._get("keyword", query=keyword).get("documents", [])
        if not docs:
            return None
        return float(docs[0]["y"]), float(docs[0]["x"])

    def nearest_place(self, lat: float, lng: float, category: str, radius: int,
                      name_contains: str | None = None) -> tuple[float, str] | None:
        """가장 가까운 시설의 (거리 m, 이름). 반경 안에 없으면 None."""
        for page in range(1, 4):  # 카카오는 최대 45건(15건 × 3페이지)까지 줍니다.
            data = self._get("category", category_group_code=category, x=lng, y=lat,
                             radius=radius, sort="distance", page=page, size=15)
            for d in data.get("documents", []):
                if name_contains and name_contains not in d.get("place_name", ""):
                    continue
                return float(d["distance"]), d.get("place_name", "")
            if data.get("meta", {}).get("is_end", True):
                return None
        return None

    def nearest(self, lat: float, lng: float, category: str, radius: int,
                name_contains: str | None = None) -> float | None:
        """가장 가까운 시설까지 거리(m). 반경 안에 없으면 None."""
        hit = self.nearest_place(lat, lng, category, radius, name_contains)
        return hit[0] if hit else None

    def count(self, lat: float, lng: float, category: str, radius: int, query: str | None = None) -> int:
        """반경 안 시설 수. query 를 주면 그 단어가 들어간 곳만 셉니다 (예: 학원 중 '수학')."""
        if query:
            data = self._get("keyword", query=query, category_group_code=category, x=lng, y=lat,
                             radius=radius, size=1)
        else:
            data = self._get("category", category_group_code=category, x=lng, y=lat,
                             radius=radius, size=1)
        return int(data.get("meta", {}).get("total_count", 0))


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")


def enrich(complexes: list[dict], factors: list[dict], region: str,
           geo_path: Path, poi_path: Path, client: Kakao, log=print) -> None:
    """complexes: complex_id, name, gu, dong, jibun 을 가진 dict 목록."""
    geo, poi = _load(geo_path), _load(poi_path)
    for i, c in enumerate(complexes, 1):
        cid = c["complex_id"]
        if cid not in geo:
            addr = f"{region} {c['gu']} {c['dong']} {c['jibun']}".strip()
            geo[cid] = client.geocode(addr, keyword=f"{region} {c['dong']} {c['name']}")
            if i % 50 == 0:
                _save(geo_path, geo)
        if not geo[cid]:
            continue
        lat, lng = geo[cid]
        entry = poi.setdefault(cid, {})
        for f in factors:
            if f["kind"] in ("score", "value"):  # 카카오 조회 없이 계산하는 항목 (학원가 접근성, 학군)
                continue
            want_name = f.get("keep_name") and hasattr(client, "nearest_place")
            if f["key"] in entry and (not want_name or f["key"] + "_name" in entry):
                continue
            if f["kind"] == "nearest" and want_name:
                # 역 이름까지 저장해 '역별 단지' 묶음에 씁니다.
                hit = client.nearest_place(lat, lng, f["category"], f["radius"], f.get("name_contains"))
                entry[f["key"]], entry[f["key"] + "_name"] = (hit if hit else (None, None))
            elif f["kind"] == "nearest":
                entry[f["key"]] = client.nearest(lat, lng, f["category"], f["radius"],
                                                 f.get("name_contains"))
            elif f.get("query"):
                entry[f["key"]] = client.count(lat, lng, f["category"], f["radius"], query=f["query"])
            else:
                entry[f["key"]] = client.count(lat, lng, f["category"], f["radius"])
        if i % 50 == 0:
            _save(poi_path, poi)
            log(f"입지 정보 {i}/{len(complexes)}")
    _save(geo_path, geo)
    _save(poi_path, poi)
