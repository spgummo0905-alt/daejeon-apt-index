"""학교알리미 공시정보 OpenAPI로 중학교 위치와 전·출입 학생 수를 모아 '학군' 지표를 만듭니다.

필요한 키: 학교알리미(schoolinfo.go.kr) OpenAPI 인증키 (환경변수 SCHOOLINFO_KEY)
결과는 data/school/<API종류>_<공시연도>.json 에 캐시되어 다음 실행 때 다시 부르지 않습니다.

학군 지표: 중학교 순전입률 = (전입 학생 수 - 전출 학생 수) ÷ 전체 학생 수, 최근 몇 년 평균.
학군을 보고 이사 오는 집이 많은 동네일수록 중학교 전입이 전출보다 많습니다.
(특목고·자사고 진학 인원이 실린 '졸업생의 진로 현황'은 OpenAPI로 제공되지 않습니다.)
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

import pandas as pd
import requests

URL = "https://www.schoolinfo.go.kr/openApi.do"
MIDDLE = "03"  # 학교급 코드: 02 초, 03 중, 04 고
_last_text = ""  # 결과가 비었을 때 로그로 남길 마지막 응답 앞부분


def _records(data) -> list[dict]:
    """응답 JSON에서 학교 목록을 꺼냅니다 (목록이 담긴 키 이름에 기대지 않음)."""
    if isinstance(data, list):
        return [d for d in data if isinstance(d, dict)]
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def fetch(key: str, api_type: str, sido: str, sgg: str | None = None, year: int | None = None,
          kind: str = MIDDLE, session=None, retries: int = 3) -> list[dict]:
    s = session or requests.Session()
    params = {"apiKey": key, "apiType": api_type, "sidoCode": sido, "schulKndCode": kind}
    if sgg:
        params["sggCode"] = sgg
    if year:
        params["pbanYr"] = str(year)
    for attempt in range(retries):
        try:
            r = s.get(URL, params=params, timeout=30)
            r.raise_for_status()
            global _last_text
            _last_text = getattr(r, "text", "")[:300]
            return _records(r.json())
        except (requests.RequestException, ValueError):
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return []


def _fetch_region(key, api_type, sido, sggs, year, log) -> list[dict]:
    """구별로 받고, 구 코드로 아무것도 안 나오면 시도 전체로 한 번 더 받습니다."""
    rows = []
    for sgg in sggs:
        rows += fetch(key, api_type, sido, sgg, year)
    if not rows:
        rows = fetch(key, api_type, sido, None, year)
        if rows:
            log(f"학교알리미 {api_type}: 구 코드로는 결과가 없어 시도 전체로 받았습니다.")
        else:
            log(f"학교알리미 {api_type} {year or ''}: 결과 없음. 응답 앞부분: {_last_text}")
    return rows


def collect(key: str, cfg: dict, sggs: list[str], out_dir: Path, this_year: int, log=print) -> None:
    """학교기본정보(위치)와 최근 n년 전·출입 학생 수를 받아 캐시합니다. 이미 받은 연도는 건너뜁니다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    sido = cfg.get("sido", "30")
    basic = out_dir / f"{cfg.get('api_basic', '0')}_now.json"
    if not basic.exists():
        rows = _fetch_region(key, cfg.get("api_basic", "0"), sido, sggs, None, log)
        if rows:
            basic.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        log(f"학교알리미 학교기본정보: 중학교 {len(rows)}곳"
            + (f" (항목: {', '.join(list(rows[0])[:12])} …)" if rows else " — 응답이 비어 있습니다"))
    got = 0
    for year in range(this_year, this_year - cfg.get("years", 3) - 2, -1):
        if got >= cfg.get("years", 3):
            break
        path = out_dir / f"{cfg.get('api_moves', '10')}_{year}.json"
        if path.exists():
            got += 1
            continue
        rows = _fetch_region(key, cfg.get("api_moves", "10"), sido, sggs, year, log)
        log(f"학교알리미 전·출입 {year}년: {len(rows)}곳")
        if rows:
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            got += 1


def _num(x) -> float:
    try:
        return float(str(x).replace(",", "").strip())
    except (TypeError, ValueError):
        return float("nan")


def short_name(name: str, region: str = "대전") -> str:
    """'대전둔산중학교' → '둔산중'."""
    n = str(name or "").strip()
    if n.startswith(region) and len(n) > len(region) + 3:
        n = n[len(region):]
    return n.replace("중학교", "중")


def load(out_dir: Path, cfg: dict, region: str = "대전") -> pd.DataFrame:
    """캐시에서 중학교 표를 만듭니다. index=학교코드, 열: name, lat, lng, net_in(순전입률 %), years."""
    basic = out_dir / f"{cfg.get('api_basic', '0')}_now.json"
    if not basic.exists():
        return pd.DataFrame()
    sch = {}
    for r in json.loads(basic.read_text(encoding="utf-8")):
        code = r.get("SCHUL_CODE")
        kind = str(r.get("SCHUL_KND_SC_CODE", MIDDLE)).strip()
        if kind not in (MIDDLE, "3", "중", "중학교") and "중학교" not in str(r.get("SCHUL_NM", "")):
            continue
        lat, lng = _num(r.get("LTTUD")), _num(r.get("LGTUD"))
        if not code or math.isnan(lat) or math.isnan(lng) or str(r.get("ABSCH_YN", "N")).upper() == "Y":
            continue
        sch[code] = {"name": short_name(r.get("SCHUL_NM"), region), "lat": lat, "lng": lng}
    rates: dict[str, list[float]] = {}
    moves = sorted(p for p in out_dir.glob(f"{cfg.get('api_moves', '10')}_*.json") if p.stem.split("_")[-1].isdigit())
    for path in moves[-cfg.get("years", 3):]:  # 최근 n년만
        for r in json.loads(path.read_text(encoding="utf-8")):
            n = _num(r.get("STDNT_SUM"))
            if r.get("SCHUL_CODE") in sch and n and n > 0:
                rate = (_num(r.get("MVIN_SUM")) - _num(r.get("MVT_SUM"))) / n * 100
                if not math.isnan(rate):
                    rates.setdefault(r["SCHUL_CODE"], []).append(rate)
    df = pd.DataFrame.from_dict(sch, orient="index")
    df["net_in"] = pd.Series({c: sum(v) / len(v) for c, v in rates.items()})
    df["years"] = pd.Series({c: len(v) for c, v in rates.items()})
    return df.dropna(subset=["net_in"])


def _meters(a, b) -> float:
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * math.cos(lat))


def for_complexes(geo: dict, sch: pd.DataFrame, radius: float = 1500, k: int = 3) -> pd.DataFrame:
    """단지마다 반경 안 가까운 중학교 k곳의 순전입률을 거리로 가중평균합니다 (가까울수록 크게).
    반경 안에 없으면 가장 가까운 한 곳을 씁니다. 열: school_mid, school_mid_names."""
    if sch.empty:
        return pd.DataFrame()
    pts = list(zip(sch.index, sch["lat"], sch["lng"]))
    rows = {}
    for cid, ll in geo.items():
        if not ll:
            continue
        near = sorted((_meters(tuple(ll), (lat, lng)), code) for code, lat, lng in pts)
        pick = [p for p in near if p[0] <= radius][:k] or near[:1]
        w = [1 / (d + 300) for d, _ in pick]
        val = sum(wi * sch.at[c, "net_in"] for wi, (_, c) in zip(w, pick)) / sum(w)
        names = ", ".join(f"{sch.at[c, 'name']} {sch.at[c, 'net_in']:+.1f}%" for _, c in pick)
        rows[cid] = {"school_mid": round(val, 2), "school_mid_names": names}
    return pd.DataFrame.from_dict(rows, orient="index")
