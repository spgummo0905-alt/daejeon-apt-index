"""바깥 후기 잇기: 카카오맵 장소(별점·후기 화면)와 네이버 블로그·카페 최근 글.

후기 사이트의 별점·글을 긁어 오는 것은 약관과 저작권 문제로 하지 않고, 공식 API로 허용된 만큼만 씁니다.
- 카카오 로컬(키워드 검색, KAKAO_REST_KEY): 단지 좌표 근처 '아파트' 분류 장소를 찾아 카카오맵 장소 주소로 바로 잇습니다.
  별점·후기는 카카오맵에서 봅니다.
- 네이버 검색 API(블로그, NAVER_CLIENT_ID/NAVER_CLIENT_SECRET): 단지 이름으로 찾은 글의 제목·요약·링크.
  이 단지에 살아 본(둘러본) 이야기만 남깁니다 (_keep):
  · 제목에 단지 이름이 있거나, 제목이 이 동네 임장·거주기('탄방동 임장')이고 요약에 단지 이름이 있어야 (_names:
    짧거나 흔한 이름은 동·구 이름도 함께, 다른 이름 속에 묻히면 안 되고, 단지 번호가 다르면 다른 단지)
  · 사는 이야기 낱말(살아 보니·거주·입주·층간소음·주차·관리비·학군·임장 …)이 있어야 (_story)
  · 매물·분양·광고·공고, 시공·수리·청소 업체, 가게·상품·수업 홍보, 다른 지역 이야기는 뺌
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
# 제목에 있으면 사는 이야기가 아닌 글: 매물·시세·분양·광고·공고, 시공·수리·청소·이사 업체, 가게·상품·수업 홍보,
# 단지 이름을 길 안내로만 쓴 글('OO아파트 맞은편 …')
NOT_REVIEW = re.compile(
    r"급매|매물|매매가|전세가|월세|시세|호가|실거래|중개|공인|부동산|분양|모델하우스|청약|체험단|협찬|원고료|제공받|광고|경매|공매|"
    r"모집|공고|설명회|공급|접수|당첨|무순위|줍줍|행위허가|"
    r"시공|인테리어|리모델링|청소|이사업체|포장이사|용달|사다리|크레인|줄눈|탄성|도배|장판|필름|샷시|새시|창호|중문|확장|견적|"
    r"교체|설치|수리|철거|누수|방수|하자|타일|변기|세면대|싱크|후드|보일러|에어컨|실외기|방충망|블라인드|커튼|도어락|열쇠|"
    r"비디오폰|인터폰|전등|LED|led|전기|세탁기|단말기|막힘|뚫음|리폼|\d+\s?(?:PY|py|P)\b|"
    r"업체|출장|상담|문의|예약|할인|이벤트|쿠폰|판매|파는|구매|구입|최저가|배달|배송|내돈내산|오픈|신상|메뉴|매장|가맹점|"
    r"맞은편|건너편|근처|"
    r"약국|병원|의원|치과|한의원|학원|과외|공부방|교습소|학습지|독서실|수업|레슨|씽크빅|피아노|바이올린|"
    r"미용실|헤어|네일|속눈썹|피어싱|피부|에스테틱|마사지|필라테스|요가|헬스|애견|펫|"
    r"맛집|카페|커피|라떼|식당|분식|김밥|떡볶이|칼국수|짬뽕|해장국|횟집|통닭|치킨|순대|돈까스|돈가츠|삼겹살|이자카야|"
    r"빵집|빵투어|빵지순례|베이커리|떡집|답례떡|꽃집|꽃다발|플라워|마트|슈퍼|상가|오피스텔|"
    r"주간보호|요양|복지센터|어린이집|유치원|축제|공연|연극|뮤지컬|영화관|CGV|휴대폰|성지|중고|명품|침대|소파|"
    r"짐보관|창고|스토리지|풀옵션|개소식|총회|케이크|복원|욕조|작업|공간|새롭게|변신|비포|애프터|홈스타일링|"
    r"\d{3}동\s?\d+평|방문\s?후기|방문기|(?<![장단관시강약이제통발초정거지요만총평\d])점(?=[)\]\s,.!|]|$)")
# 요약에만 있어도 홍보 글로 보는 낱말 (요약엔 '학원가 가까워요'처럼 사는 이야기에도 가게 이름이 나와서 더 좁게)
AD_BODY = re.compile(r"급매|공인중개|중개사|체험단|협찬|원고료|제공받|견적|시공|업체|출장|상담|문의|예약|할인|판매|"
                     r"(?:이번|오늘|작업|시공|공사)\s?현장|현장입니다|고객님|의뢰|재공급|입주자\s?모집|"
                     r"010[-\s]?[\d*]{3,4}|카톡\s?상담")
# 사는 이야기 낱말: 하나는 있어야 남깁니다 (제목에 있으면 더 앞에)
LIVED = re.compile(r"살아\s?보|살아\s?본|살면서|살고\s?있|사는\s?중|살았|살기|거주|입주(?!\s?청소)|이사\s?(?:왔|온|와서|오고|한\s?지)|"
                   r"장단점|단점|솔직|후기|리뷰|임장|발품|단지\s?(?:분위기|구경|산책|둘러|분석|내)|층간\s?소음|소음|주차|"
                   r"관리비|관리\s?사무소|커뮤니티|놀이터|학군|초품아|통학|등교|등원|동네|출퇴근|산책|조망|채광|일조|경사|언덕|오르막|"
                   r"아이\s?키우|육아|이웃")
# 제목에 단지 이름이 없을 때: 이 동네 이름과 함께 이런 낱말이 제목에 있어야 (동네 임장기·거주기)
TOPIC = re.compile(r"임장|발품|실거주|거주|살아\s?보|살아\s?본|살면서|살기|입주|이사\s?(?:왔|온|후기)|장단점|"
                   r"아파트\s?(?:분석|비교|후기|탐방|투어|단지)|단지\s?(?:분석|탐방|둘러)|동네\s?(?:분석|탐방)")
# 다른 지역 이야기 (이 지역 이름 없이 이 이름만 제목에 나오면 뺌)
REGIONS = ("서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남",
           "경북", "경남", "제주", "수원", "성남", "분당", "용인", "고양", "일산", "평촌", "안양", "청주", "천안", "전주", "익산",
           "창원", "김해", "포항")
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


def _stems(*places: str) -> list[str]:
    """'둔산1동' → '둔산', '유성구' → '유성', '조치원읍 교리' → '조치원'
    (글에는 '둔산 크로바'처럼 동·구를 빼고 쓰는 일이 많음). 한 글자('서구' → '서')는 흔해서 뺍니다."""
    out = []
    for place in places:
        for w in (place or "").split():
            w = re.sub(r"\d*(동|가|구|읍|면|리)$", "", w)
            if len(w) >= 2:
                out.append(w)
    return out


def _story(title: str, desc: str, region: str = "") -> int:
    """사는 이야기로 보이면 점수(1 이상), 아니면 0. 단지 이름은 따로 봅니다 (_names, _keep)."""
    if NOT_REVIEW.search(title) or AD_BODY.search(desc):
        return 0
    others = [r for r in REGIONS if r != region and r in title]
    if others and not (region and region in title + desc):
        return 0
    t, d = len(LIVED.findall(title)), len(LIVED.findall(desc))
    return 2 * t + d if t or d else 0


def _alone(text: str, base: str, stems: list[str]) -> bool:
    """짧은 이름이 다른 이름 속에 묻히지 않고 따로 나오는지: '송파 한양1차', '둔산크로바', '누리아파트', '크로바를' 은 되고
    '감일한양수자인', '방이한양3차', '은하수점' 은 안 됨 (앞은 띄어쓰기·기호나 이 동네 이름, 뒤는 기호·숫자·아파트·조사)."""
    t = re.sub(r"[()（）·.,\-\[\]|/]", " ", text)
    for m in re.finditer(re.escape(base), t):
        before, after = t[:m.start()].rstrip(), t[m.end():]
        left = m.start() == 0 or not re.match(r"[가-힣A-Za-z]", t[m.start() - 1]) or any(before.endswith(x) for x in stems)
        right = (not after or not re.match(r"[가-힣A-Za-z]", after[0])
                 or re.match(r"(?:아파트|APT|apt|A\b|마을|타운|단지|[은는이가을를의에와과도로랑])", after))
        if left and right:
            return True
    return False


def _names(text: str, c: dict, region: str = "", ctx: str = "") -> int:
    """text 에 이 단지 이름이 나오는 정도: 이름 그대로 2, 앞 네 글자 1, 안 나오면 0.
    - 이름이 다섯 글자 이하(누리·한빛·e편한세상 …)거나 앞 네 글자만 맞으면 흔한 이름이라 동·구 이름도 함께(text 나 ctx 에) 나와야 하고,
      다섯 글자 이하 이름은 다른 이름 속에 묻히지 않고 따로 나와야 (_alone)
    - 앞 네 글자만 맞을 때 이름에 단지·차 번호가 있으면 그 번호도 나와야 ('목동신시가지10' 에 '신시가지7단지' 글은 다른 단지)"""
    base = _base_name(c["name"])
    if not base:
        return 0
    flat = _norm_name(text)
    near = _norm_name(text + " " + ctx)
    stems = _stems(c.get("dong", ""), c.get("gu", ""))
    local = any(x in near for x in stems)
    if base in flat:
        if len(base) >= 6:
            return 2
        return 2 if local and _alone(text, base, stems) else 0
    if len(base) < 4 or base[:4] not in flat or not local:
        return 0
    nums = re.findall(r"\d+", base)
    return 1 if all(re.search(rf"(?<!\d){n}(?:단지|차|블럭|BL)", flat) for n in nums) else 0


def _keep(title: str, desc: str, c: dict, region: str = "") -> int:
    """이 단지에 살아 본(둘러본) 이야기면 점수, 아니면 0.
    제목에 단지 이름이 있거나, 제목이 이 동네 임장기·거주기('둔산동 임장', '탄방 실거주 …')이고 요약에 단지 이름이 있어야 합니다.
    단지 이름을 글 끝에 키워드로 붙인 가게·업체 글, 옆 동네 단지 글을 거르려고요."""
    story = _story(title, desc, region)
    if not story:
        return 0
    if _names(title, c, region, desc):
        return story + 4
    flat = _norm_name(title)
    if any(x in flat for x in _stems(c.get("dong", ""))) and TOPIC.search(title) and _names(title + " " + desc, c, region):
        return story + 1
    return 0


def _pick(items: list[dict], c: dict, n: int, region: str = "", seen: set | None = None) -> list[dict]:
    """검색 결과에서 이 단지 이야기만 점수 높은 순으로 n개 (한 블로그에 한 글)."""
    seen = set() if seen is None else seen
    picks = []
    for k, it in enumerate(items):
        title, desc = _clean(it.get("title")), _clean(it.get("description"))
        score = _keep(title, desc, c, region)
        if not score:
            continue
        who = _clean(it.get("bloggername") or it.get("cafename") or "")
        link = it.get("link", "")
        if link in seen or (who and who in seen):
            continue
        seen.update(x for x in (link, who) if x)
        picks.append((score, it.get("postdate", ""), -k,
                      {"t": title, "d": desc[:120], "u": link, "s": who, "at": it.get("postdate", "")}))
    picks.sort(key=lambda x: x[:3], reverse=True)
    return [p[3] for p in picks[:n]]


def _search(s: requests.Session, kind: str, query: str) -> list[dict]:
    r = s.get(NAVER.format(kind), params={"query": query, "display": 100, "sort": "sim"}, timeout=15)
    r.raise_for_status()
    return r.json().get("items", [])


def _posts(s: requests.Session, kind: str, query: str, c: dict, n: int = 3, region: str = "",
           seen: set | None = None) -> list[dict]:
    """검색 결과 100개 중 이 단지에 사는(둘러본) 이야기만 n개."""
    return _pick(_search(s, kind, query), c, n, region, seen)


def naver_posts(complexes: list[dict], path: Path, client_id: str, secret: str, budget: int = 4000,
                log=print, region: str = "", time_limit: float | None = None) -> None:
    """단지마다 사는 이야기 블로그 글 5개 (거래가 많은 단지부터, 일주일마다 새로). 로그인 없이 열리는 블로그 글만.
    '후기'로 찾아 모자라면 '살아보니'로 한 번 더 찾습니다 (단지마다 많아야 두 번).
    time_limit 초가 지나면 멈추고 나머지는 다음 실행 때 (단지가 많은 서울)."""
    data = _load(path)
    s = requests.Session()
    s.headers.update({"X-Naver-Client-Id": client_id, "X-Naver-Client-Secret": secret})
    old = (date.today() - timedelta(days=REFRESH_DAYS)).isoformat()
    used = done = 0
    t0 = time.monotonic()
    for c in complexes:
        cid = c["complex_id"]
        cur = data.get(cid, {})
        if cur.get("nv_at", "") >= old and cur.get("nv_v") == NV_VERSION:
            continue
        if used + 2 > budget:
            break
        if time_limit and time.monotonic() - t0 > time_limit:
            log("::notice::[네이버 글] 시간이 다 돼 나머지는 다음 실행 때 받습니다")
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


def load(path: Path, region: str = "", complexes: dict | None = None) -> dict:
    """complex_id → {kp: [장소 id, 이름], posts: [{t, d, u, s, at}]} (로그인해야 열리는 카페 글은 뺌).
    예전 방법으로 받아 둔 글도 지금 기준으로 다시 걸러, 다시 받기 전에도 홍보 글은 안 보이게
    (complexes 로 단지 이름·동을 주면 _keep, 없으면 글 내용만 _story)."""
    out = {}
    for k, v in _load(path).items():
        e = {}
        if v.get("kp"):
            e["kp"] = v["kp"]
        c = (complexes or {}).get(k)
        ok = (lambda t, d: _keep(t, d, c, region)) if c else (lambda t, d: _story(t, d, region))
        posts = [p for p in v.get("posts") or [] if "cafe.naver.com" not in p.get("u", "")
                 and ok(p.get("t", ""), p.get("d", ""))][:POSTS]
        if posts:
            e["posts"] = posts
        if e:
            out[k] = e
    return out
