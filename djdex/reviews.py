"""바깥 후기 잇기: 카카오맵 장소(별점·후기 화면)와 네이버 블로그·카페 최근 글.

후기 사이트의 별점·글을 긁어 오는 것은 약관과 저작권 문제로 하지 않고, 공식 API로 허용된 만큼만 씁니다.
- 카카오 로컬(키워드 검색, KAKAO_REST_KEY): 단지 좌표 근처 '아파트' 분류 장소를 찾아 카카오맵 장소 주소로 바로 잇습니다.
  별점·후기는 카카오맵에서 봅니다.
- 네이버 검색 API(블로그, NAVER_CLIENT_ID/NAVER_CLIENT_SECRET): 단지 이름으로 찾은 최근 글의 제목·요약·링크.
  중개사무소 매물 글, 분양·체험단 광고 글은 제목·요약 낱말로 뺍니다. 키가 없으면 건너뜁니다.
  카페 글은 대부분 로그인·카페 가입을 해야 열려서 받지 않습니다 (예전에 받아 둔 카페 글도 화면에 쓰지 않음).

결과는 data/kapt/reviews.json 에 단지(complex_id)별로 둡니다 (단지 정보 캐시에 같이 들어감).
"""
from __future__ import annotations

import html
import json
import re
import time
from datetime import date, timedelta
from pathlib import Path

import requests

from .kapt import _base_name, _score
from .molit import _norm_name

NAVER = "https://openapi.naver.com/v1/search/{}.json"
REFRESH_DAYS = 7          # 네이버 글은 일주일마다 새로
POSTS = 5                 # 단지 페이지에 보여 주는 블로그 글 수
PLACE_RETRY_DAYS = 60     # 카카오 장소를 못 찾은 단지는 두 달 뒤 다시
# 거주 후기가 아닌 글 (매물·분양·광고·인테리어 시공 홍보)
NOT_REVIEW = re.compile(r"급매|매물|매매가|전세가|월세|중개|공인|부동산|분양|모델하우스|청약|체험단|협찬|원고료|제공받|광고|"
                        r"시공|인테리어|이사|입주청소|줄눈|탄성|도배|확장|견적|경매|공매")
TAG = re.compile(r"<[^>]+>")


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _clean(s: str) -> str:
    return html.unescape(TAG.sub("", s or "")).strip()


def kakao_places(complexes: list[dict], geo: dict, path: Path, client, log=print, time_limit: float | None = None) -> None:
    """단지 좌표 400m 안 '아파트' 분류 장소 중 이름이 닮은 가장 가까운 곳 (없으면 150m 안 가장 가까운 아파트).
    time_limit 초가 지나면 멈추고 나머지는 다음 실행 때 (단지가 많은 서울)."""
    data = _load(path)
    old = (date.today() - timedelta(days=PLACE_RETRY_DAYS)).isoformat()
    found = tried = 0
    t0 = time.monotonic()
    for c in complexes:
        cid, ll = c["complex_id"], geo.get(c["complex_id"])
        cur = data.get(cid, {})
        if not ll or cur.get("kp") or cur.get("kp_at", "") >= old:
            continue
        if time_limit and time.monotonic() - t0 > time_limit:
            log("::notice::[카카오 장소] 시간이 다 돼 나머지는 다음 실행 때 찾습니다")
            break
        tried += 1
        try:
            docs = client._get("keyword", query=_base_name(c["name"]) or c["name"], x=ll[1], y=ll[0],
                               radius=400, sort="distance").get("documents", [])
        except requests.RequestException as e:
            log(f"::warning::[카카오 장소] 찾기 실패, 여기까지: {e}")
            break
        apts = [d for d in docs if "아파트" in d.get("category_name", "")]
        near = [d for d in apts if _score(d.get("place_name", ""), c["name"]) >= 1]
        pick = near[0] if near else next((d for d in apts if float(d.get("distance") or 9e9) <= 150), None)
        cur = {**cur, "kp_at": date.today().isoformat()}
        if pick:
            cur["kp"] = [pick["id"], pick.get("place_name", "")]
            found += 1
        data[cid] = cur
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    have = sum(1 for v in data.values() if v.get("kp"))
    log(f"카카오맵 장소: 이번에 {tried:,}곳 찾아 {found:,}곳 이음, 이어 둔 단지 {have:,}곳")


def _posts(s: requests.Session, kind: str, query: str, name: str, n: int = 3) -> list[dict]:
    r = s.get(NAVER.format(kind), params={"query": query, "display": 20, "sort": "sim"}, timeout=15)
    r.raise_for_status()
    key = _base_name(name)
    out = []
    for it in r.json().get("items", []):
        title, desc = _clean(it.get("title")), _clean(it.get("description"))
        text = title + " " + desc
        if not key or key[:4] not in _norm_name(text) or NOT_REVIEW.search(text):
            continue
        out.append({"t": title, "d": desc[:120], "u": it.get("link", ""),
                    "s": _clean(it.get("bloggername") or it.get("cafename") or ""),
                    "at": it.get("postdate", "")})
        if len(out) >= n:
            break
    return out


def naver_posts(complexes: list[dict], path: Path, client_id: str, secret: str, budget: int = 4000,
                log=print) -> None:
    """단지마다 블로그 후기 5개 (거래가 많은 단지부터, 일주일마다 새로). 로그인 없이 열리는 블로그 글만."""
    data = _load(path)
    s = requests.Session()
    s.headers.update({"X-Naver-Client-Id": client_id, "X-Naver-Client-Secret": secret})
    old = (date.today() - timedelta(days=REFRESH_DAYS)).isoformat()
    used = done = 0
    for c in complexes:
        cid = c["complex_id"]
        cur = data.get(cid, {})
        if cur.get("nv_at", "") >= old:
            continue
        if used + 1 > budget:
            break
        q = " ".join(x for x in (c.get("dong"), c["name"]) if x)
        q = q if q.endswith("아파트") else q + " 아파트"
        try:
            blog = _posts(s, "blog", q + " 후기", c["name"], POSTS)
        except requests.RequestException as e:
            log(f"::warning::[네이버 글] 받기 실패, 여기까지: {e}")
            break
        used += 1
        data[cid] = {**cur, "nv_at": date.today().isoformat(), "posts": blog}
        done += 1
        time.sleep(0.05)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    have = sum(1 for v in data.values() if v.get("posts"))
    log(f"네이버 글: 이번에 {done:,}곳 받음 (호출 {used:,}번), 글이 있는 단지 {have:,}곳")


def load(path: Path) -> dict:
    """complex_id → {kp: [장소 id, 이름], posts: [{t, d, u, s, at}]} (로그인해야 열리는 카페 글은 뺌)"""
    out = {}
    for k, v in _load(path).items():
        e = {}
        if v.get("kp"):
            e["kp"] = v["kp"]
        posts = [p for p in v.get("posts") or [] if "cafe.naver.com" not in p.get("u", "")][:POSTS]
        if posts:
            e["posts"] = posts
        if e:
            out[k] = e
    return out
