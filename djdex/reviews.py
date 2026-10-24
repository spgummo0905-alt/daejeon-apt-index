"""바깥 후기 잇기: 카카오맵 장소(별점·후기 화면)와 네이버 블로그·카페 최근 글.

후기 사이트의 별점·글을 긁어 오는 것은 약관과 저작권 문제로 하지 않고, 공식 API로 허용된 만큼만 씁니다.
- 카카오 로컬(키워드 검색, KAKAO_REST_KEY): 단지 좌표 근처 '아파트' 분류 장소를 찾아 카카오맵 장소 주소로 바로 잇습니다.
  별점·후기는 카카오맵에서 봅니다.
- 네이버 검색 API(블로그, NAVER_CLIENT_ID/NAVER_CLIENT_SECRET): 단지 이름으로 찾은 글의 제목·요약·링크.
  '살아 본 이야기'만 남깁니다 (_story): 단지 이름이 나오고(이름이 짧거나 흔하면 동·구·지역 이름도 함께),
  사는 이야기 낱말(살아 보니·거주·입주·층간소음·주차·관리비·학군·임장 …)이 있어야 하고,
  매물·분양·광고, 시공·수리·청소 업체, 가게·상품 홍보 글과 다른 지역 이야기는 뺍니다.
  한 블로그에서는 한 글만. 키가 없으면 건너뜁니다.
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
NV_VERSION = 2            # 글 고르는 방법을 바꾸면 올려서 모든 단지를 다시 받음
PLACE_RETRY_DAYS = 60     # 카카오 장소를 못 찾은 단지는 두 달 뒤 다시
# 제목에 있으면 사는 이야기가 아닌 글: 매물·시세·분양·광고, 시공·수리·청소·이사 업체, 가게·상품 홍보
NOT_REVIEW = re.compile(r"급매|매물|매매가|전세가|월세|시세|호가|실거래|중개|공인|부동산|분양|모델하우스|청약|체험단|협찬|원고료|제공받|광고|"
                        r"경매|공매|시공|인테리어|리모델링|청소|이사업체|포장이사|용달|줄눈|탄성|도배|장판|필름|샷시|새시|중문|확장|견적|"
                        r"교체|설치|수리|철거|누수|방수|하자|타일|변기|세면대|싱크대|후드|보일러|방충망|블라인드|커튼|막힘|뚫음|"
                        r"업체|출장|상담|문의|예약|할인|이벤트|쿠폰|판매|파는|구매|구입|최저가|배달|"
                        r"약국|병원|의원|치과|한의원|학원|과외|미용실|헤어|네일|필라테스|헬스|맛집|카페|식당|분식|빵집|베이커리")
# 요약에만 있어도 홍보 글로 보는 낱말 (요약엔 '학원가 가까워요'처럼 사는 이야기에도 가게 이름이 나와서 더 좁게)
AD_BODY = re.compile(r"급매|매물|중개|공인중개|분양|체험단|협찬|원고료|제공받|견적|시공|업체|출장|상담|문의|예약|할인|판매|"
                     r"010[-\s]?\d{3,4}|카톡\s?상담")
# 사는 이야기 낱말: 하나는 있어야 남깁니다 (제목에 있으면 더 앞에)
LIVED = re.compile(r"살아\s?보|살아\s?본|살면서|살고\s?있|사는\s?중|살았|거주|입주(?!\s?청소)|이사\s?(?:왔|온|와서|오고|한\s?지)|"
                   r"\d+\s?년\s?(?:차|째)|장단점|단점|솔직|후기|리뷰|임장|단지\s?(?:분위기|구경|산책|둘러|내)|층간\s?소음|소음|주차|"
                   r"관리비|관리\s?사무소|커뮤니티|놀이터|학군|초품아|통학|등교|등원|동네|출퇴근|산책|조망|채광|일조|경사|언덕|오르막|"
                   r"아이\s?키우|육아|이웃")
# 다른 지역 이야기 (이 지역·동·구 이름 없이 이 이름만 나오면 뺌)
REGIONS = ("서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남",
           "경북", "경남", "제주", "수원", "성남", "분당", "용인", "고양", "일산", "청주", "천안", "전주", "창원", "김해", "포항")
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


def _stem(place: str) -> str:
    """'둔산1동' → '둔산', '유성구' → '유성' (글에는 '둔산 크로바'처럼 동·구를 빼고 쓰는 일이 많음)."""
    return re.sub(r"\d*(동|가|구|읍|면|리)$", "", place or "")


def _story(title: str, desc: str, region: str = "") -> int:
    """사는 이야기로 보이면 점수(1 이상), 아니면 0. 단지 이름은 따로 봅니다 (_names)."""
    if NOT_REVIEW.search(title) or AD_BODY.search(desc):
        return 0
    others = [r for r in REGIONS if r != region and r in title]
    if others and not (region and region in title + desc):
        return 0
    t, d = len(LIVED.findall(title)), len(LIVED.findall(desc))
    return 2 * t + d if t or d else 0


def _names(text: str, c: dict, region: str = "") -> int:
    """글에 이 단지 이름이 나오는 정도: 이름 그대로 2, 앞 네 글자 1, 안 나오면 0.
    이름이 세 글자 이하(누리·한빛·현대 …)거나 앞 네 글자만 맞으면 동·구·지역 이름도 함께 나와야 합니다."""
    base = _base_name(c["name"])
    if not base:
        return 0
    flat = _norm_name(text)
    local = any(x and len(x) >= 2 and x in flat for x in (_stem(c.get("dong", "")), _stem(c.get("gu", "")), region))
    if base in flat:
        return 2 if len(base) >= 4 or local else 0
    return 1 if len(base) >= 4 and base[:4] in flat and local else 0


def _posts(s: requests.Session, kind: str, query: str, c: dict, n: int = 3, region: str = "",
           seen: set | None = None) -> list[dict]:
    """검색 결과 100개 중 사는 이야기만, 점수 높은 순으로 n개 (한 블로그에 한 글)."""
    r = s.get(NAVER.format(kind), params={"query": query, "display": 100, "sort": "sim"}, timeout=15)
    r.raise_for_status()
    seen = set() if seen is None else seen
    picks = []
    for k, it in enumerate(r.json().get("items", [])):
        title, desc = _clean(it.get("title")), _clean(it.get("description"))
        story, name = _story(title, desc, region), _names(title + " " + desc, c, region)
        if not story or not name:
            continue
        who = _clean(it.get("bloggername") or it.get("cafename") or "")
        link = it.get("link", "")
        if link in seen or (who and who in seen):
            continue
        seen.update(x for x in (link, who) if x)
        title_name = 2 if _names(title, c, region) else 0
        picks.append((story + name + title_name, it.get("postdate", ""), -k,
                      {"t": title, "d": desc[:120], "u": link, "s": who, "at": it.get("postdate", "")}))
    picks.sort(key=lambda x: x[:3], reverse=True)
    return [p[3] for p in picks[:n]]


def naver_posts(complexes: list[dict], path: Path, client_id: str, secret: str, budget: int = 4000,
                log=print, region: str = "") -> None:
    """단지마다 사는 이야기 블로그 글 5개 (거래가 많은 단지부터, 일주일마다 새로). 로그인 없이 열리는 블로그 글만.
    '후기'로 찾아 모자라면 '살아보니'로 한 번 더 찾습니다 (단지마다 많아야 두 번)."""
    data = _load(path)
    s = requests.Session()
    s.headers.update({"X-Naver-Client-Id": client_id, "X-Naver-Client-Secret": secret})
    old = (date.today() - timedelta(days=REFRESH_DAYS)).isoformat()
    used = done = 0
    for c in complexes:
        cid = c["complex_id"]
        cur = data.get(cid, {})
        if cur.get("nv_at", "") >= old and cur.get("nv_v") == NV_VERSION:
            continue
        if used + 2 > budget:
            break
        q = " ".join(x for x in (c.get("dong"), c["name"]) if x)
        q = q if q.endswith("아파트") else q + " 아파트"
        seen: set = set()
        try:
            blog = _posts(s, "blog", q + " 후기", c, POSTS, region, seen)
            used += 1
            if len(blog) < POSTS:
                blog += _posts(s, "blog", q + " 살아보니", c, POSTS - len(blog), region, seen)
                used += 1
        except requests.RequestException as e:
            log(f"::warning::[네이버 글] 받기 실패, 여기까지: {e}")
            break
        data[cid] = {**cur, "nv_at": date.today().isoformat(), "nv_v": NV_VERSION, "posts": blog}
        done += 1
        time.sleep(0.05)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    have = sum(1 for v in data.values() if v.get("posts"))
    log(f"네이버 글: 이번에 {done:,}곳 받음 (호출 {used:,}번), 글이 있는 단지 {have:,}곳")


def load(path: Path, region: str = "") -> dict:
    """complex_id → {kp: [장소 id, 이름], posts: [{t, d, u, s, at}]} (로그인해야 열리는 카페 글은 뺌).
    예전 방법으로 받아 둔 글도 지금 기준(_story)으로 다시 걸러, 다시 받기 전에도 홍보 글은 안 보이게."""
    out = {}
    for k, v in _load(path).items():
        e = {}
        if v.get("kp"):
            e["kp"] = v["kp"]
        posts = [p for p in v.get("posts") or [] if "cafe.naver.com" not in p.get("u", "")
                 and _story(p.get("t", ""), p.get("d", ""), region)][:POSTS]
        if posts:
            e["posts"] = posts
        if e:
            out[k] = e
    return out
