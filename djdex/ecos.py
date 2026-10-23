"""한국은행 경제통계시스템(ECOS): 소비자물가지수와 금리. 단지 시세 차트의 실질 보기와 금리 표시에 씁니다.

환경변수 ECOS_KEY(https://ecos.bok.or.kr 에서 무료 발급)가 있을 때만 받습니다.
없거나 실패하면 차트에서 실질 보기·금리만 빠집니다.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import requests

URL = "https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/1000/{code}/M/{start}/{end}/{item}"
SERIES = {
    "cpi": ("901Y009", "0"),            # 소비자물가지수 총지수 (2020=100)
    "base": ("722Y001", "0101000"),     # 한국은행 기준금리
    "mort": ("121Y006", "BECBLA0302"),  # 예금은행 주택담보대출 금리 (신규취급액 기준)
}


def parse(payload: dict) -> dict[str, float]:
    rows = (payload.get("StatisticSearch") or {}).get("row") or []
    out = {}
    for r in rows:
        t, v = str(r.get("TIME", "")), r.get("DATA_VALUE")
        if len(t) == 6 and v not in (None, ""):
            out[f"{t[:4]}-{t[4:]}"] = float(v)
    return out


def fetch(key: str, start: str = "200601", end: str | None = None, session=None, log=print) -> dict:
    """{'cpi': {'2006-01': 76.8, ...}, 'base': {...}, 'mort': {...}} — 받은 것만."""
    s = session or requests.Session()
    end = end or date.today().strftime("%Y%m")
    out = {}
    for name, (code, item) in SERIES.items():
        try:
            r = s.get(URL.format(key=key, code=code, start=start, end=end, item=item), timeout=(10, 30))
            r.raise_for_status()
            vals = parse(r.json())
        except (requests.RequestException, ValueError) as e:
            # 주소에 키가 들어 있어 오류 문구 대신 종류만 남깁니다.
            log(f"::warning::ECOS {name} 받기 실패 ({type(e).__name__})")
            continue
        if vals:
            out[name] = vals
        else:
            log(f"::warning::ECOS {name}: 값이 없습니다 ({(r.json().get('RESULT') or {}).get('MESSAGE', '')})")
    return out


def save(path: Path, macro: dict) -> None:
    path.write_text(json.dumps(macro, ensure_ascii=False), encoding="utf-8")


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except ValueError:
        return {}
