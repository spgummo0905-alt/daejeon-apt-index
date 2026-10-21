"""입지점수: 항목별로 대전 단지 중 백분위를 매기고 가중평균합니다 (0~100)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

# 대전 도시철도 1호선 역 순서 (판암 → 반석). 역 사이 이동 시간 계산에 씁니다.
LINE1 = ["판암", "신흥", "대동", "대전", "중앙로", "중구청", "서대전네거리", "오룡", "용문", "탄방", "시청",
         "정부청사", "갈마", "월평", "갑천", "유성온천", "구암", "현충원", "월드컵경기장", "노은", "지족", "반석"]


def _station_key(name) -> str | None:
    """'시청역 대전1호선' → '시청'. 1호선 역이 아니면 None."""
    if not isinstance(name, str) or not name.strip():
        return None
    head = name.split()[0]
    key = head[:-1] if head.endswith("역") else head
    return key if key in LINE1 else None


def _meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = math.radians((a[0] + b[0]) / 2)
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(lat)
    return math.hypot(dx, dy)


def detect_hubs(poi: pd.DataFrame, geo: dict, key: str = "academy", top: float = 0.10,
                merge_m: float = 2000, min_members: int = 3, max_hubs: int = 3,
                walk_m_per_min: float = 80, detour: float = 1.3, dongs: dict | None = None) -> list[dict]:
    """학원 밀집도로 주요 학원가를 자동으로 찾습니다 (다른 지역으로 넓힐 때 쓰는 방식).

    단지마다 이미 조사한 '반경 1km 학원 수'를 표본으로 써서 추가 API 호출이 없습니다.
    1) 학원 수 상위 top 비율 단지만 남기고
    2) 학원이 많은 단지부터 merge_m 안에 있으면 같은 학원가로 묶은 뒤
    3) 단지가 min_members 개 이상인 묶음을 학원 수 순으로 max_hubs 개 고릅니다.
    중심은 학원 수 가중 평균 좌표, 만점은 가장 큰 학원가 대비 규모(0.7~1.0)입니다.
    dongs(단지 → 동 이름)를 주면 가장 많이 묶인 동 이름을 학원가 이름으로 씁니다.
    """
    if key not in poi:
        return []
    cnt = pd.to_numeric(poi[key], errors="coerce")
    cnt = cnt[[c in geo and bool(geo[c]) for c in cnt.index]].dropna()
    if len(cnt) < min_members:
        return []
    hot = cnt[cnt >= cnt.quantile(1 - top)].sort_values(ascending=False)
    clusters: list[dict] = []
    for cid, n in hot.items():
        ll = tuple(geo[cid])
        home = next((c for c in clusters if _meters(c["seed"], ll) <= merge_m), None)
        if home is None:
            clusters.append({"seed": ll, "members": [(cid, ll, float(n))]})
        else:
            home["members"].append((cid, ll, float(n)))
    speed = walk_m_per_min / detour
    hubs = []
    for c in clusters:
        if len(c["members"]) < min_members:
            continue
        w = sum(n for _, _, n in c["members"])
        lat = sum(ll[0] * n for _, ll, n in c["members"]) / w
        lng = sum(ll[1] * n for _, ll, n in c["members"]) / w
        strength = float(np.mean(sorted((n for _, _, n in c["members"]), reverse=True)[:3]))
        stations: dict[str, int] = {}
        if "subway_name" in poi and "subway" in poi:
            near = [(_station_key(poi.at[cid, "subway_name"]), poi.at[cid, "subway"]) for cid, _, _ in c["members"]]
            near = [(k, d) for k, d in near if k and d is not None and not pd.isna(d) and d <= 800]
            for k in {k for k, _ in near}:
                stations[k] = int(round(np.median([d for kk, d in near if kk == k]) / speed))
        names = pd.Series([(dongs or {}).get(cid) for cid, _, _ in c["members"]]).dropna()
        hubs.append({"lat": round(lat, 5), "lng": round(lng, 5), "strength": strength,
                     "members": len(c["members"]), "stations": stations,
                     "name": f"{names.mode().iloc[0]} 학원가" if not names.empty else None})
    hubs.sort(key=lambda h: -h["strength"])
    hubs = hubs[:max_hubs]
    if hubs:
        top_s = hubs[0]["strength"]
        for i, h in enumerate(hubs, 1):
            h["weight"] = round(0.7 + 0.3 * h["strength"] / top_s, 2)
            h["name"] = h["name"] or f"학원가 {i}"
    return hubs


def hub_access(poi: pd.DataFrame, geo: dict, cfg: dict) -> pd.DataFrame:
    """주요 학원가까지 걸리는 시간(분)과 0~100 접근성 점수.

    시간은 걸어가는 경우와 1호선을 타는 경우 중 짧은 쪽입니다.
    - 도보: 직선거리 × 우회계수 ÷ 걷는 속도
    - 지하철: 가까운 역까지 도보 + 대기·승하차 + 역 수 × 역간 시간 + 내려서 학원가까지 도보
    학원가마다 점수 = 중요도 × (full_min 분 안이면 100, zero_min 분이면 0, 그 사이는 직선).
    여러 학원가 중 가장 높은 점수를 씁니다.
    """
    speed = cfg.get("walk_m_per_min", 80) / cfg.get("detour", 1.3)
    wait, per_stop = cfg.get("subway_wait_min", 5), cfg.get("min_per_stop", 2)
    full, zero = cfg.get("full_min", 10), cfg.get("zero_min", 40)
    rows = {}
    for cid in poi.index:
        ll = geo.get(cid)
        if not ll:
            continue
        st = _station_key(poi.at[cid, "subway_name"]) if "subway_name" in poi else None
        st_m = poi.at[cid, "subway"] if "subway" in poi else None
        best = (0.0, None, None)
        for h in cfg.get("hubs", []):
            t = _meters(tuple(ll), (h["lat"], h["lng"])) / speed
            if st and st_m is not None and not pd.isna(st_m):
                for hs, walk_min in (h.get("stations") or {}).items():
                    if hs in LINE1:
                        stops = abs(LINE1.index(st) - LINE1.index(hs))
                        t = min(t, st_m / speed + wait + per_stop * stops + walk_min)
            s = h.get("weight", 1.0) * float(np.clip((zero - t) / (zero - full), 0, 1)) * 100
            if best[1] is None or s > best[0] or (s == best[0] and t < best[2]):
                best = (s, h["name"], t)
        rows[cid] = {"hub": round(best[0], 1), "hub_name": best[1],
                     "hub_min": None if best[2] is None else round(best[2])}
    return pd.DataFrame.from_dict(rows, orient="index")


def percentile(s: pd.Series, higher_is_better: bool = True, ref: pd.Index | None = None) -> pd.Series:
    """0~100 백분위. ref 를 주면 그 단지들(보통 소규모 제외 단지)의 분포를 기준으로 매기고,
    ref 밖 단지도 그 분포 안 어디쯤인지로 점수를 받습니다. 기준 값이 하나뿐이면 50."""
    out = pd.Series(np.nan, index=s.index, dtype=float)
    valid = s.dropna()
    base = valid if ref is None else valid[valid.index.isin(ref)]
    if valid.empty or base.empty:
        return out
    if len(base) == 1:
        out[valid.index] = 50.0
        return out
    b = np.sort(base.to_numpy(dtype=float))
    v = valid.to_numpy(dtype=float)
    # 중간 순위: 같은 값이 여럿이면 가운데 순위. 기준 집합 안 값은 (순위-1)/(n-1) 과 같습니다.
    mid = (np.searchsorted(b, v, "left") + np.searchsorted(b, v, "right")) / 2
    pct = np.clip((mid - 0.5) / (len(b) - 1), 0, 1) * 100
    out[valid.index] = pct if higher_is_better else 100 - pct
    return out


def score(poi: pd.DataFrame, factors: list[dict], ref: pd.Index | None = None) -> pd.DataFrame:
    """poi: index=complex_id, 열=factor key. 반환: 항목별 백분위(<key>_pct)와 location_score.

    반경 안에 시설이 없는 'nearest' 항목(None)은 최하점(0)으로 봅니다.
    'score' 항목(학원가 접근성처럼 이미 0~100인 값)은 백분위로 바꾸지 않고 그대로 씁니다.
    'value' 항목(학군처럼 카카오 밖에서 구한 값)은 높을수록 좋은 백분위로 바꿉니다.
    score·value 항목에 값이 하나도 없으면 그 항목은 빼고 나머지 비중으로 계산합니다.
    """
    out = pd.DataFrame(index=poi.index)
    total_w = 0.0
    acc = pd.Series(0.0, index=poi.index)
    for f in factors:
        col = pd.to_numeric(poi.get(f["key"], pd.Series(index=poi.index, dtype=float)), errors="coerce")
        if f["kind"] in ("score", "value") and col.isna().all():
            continue  # 아직 모으지 못한 항목(예: 학교알리미 키가 없을 때)은 빼고 나머지로 가중평균
        total_w += f["weight"]
        if f["kind"] == "score":
            pct = col.clip(0, 100).fillna(0.0)
        elif f["kind"] == "value":
            pct = percentile(col, higher_is_better=True, ref=ref).fillna(50.0)
        elif f["kind"] == "nearest":
            pct = percentile(col, higher_is_better=False, ref=ref).fillna(0.0)
        else:
            pct = percentile(col.fillna(0), higher_is_better=True, ref=ref).fillna(0.0)
        out[f"{f['key']}_pct"] = pct
        acc += pct * f["weight"]
    out["location_score"] = acc / total_w if total_w else float("nan")
    return out
