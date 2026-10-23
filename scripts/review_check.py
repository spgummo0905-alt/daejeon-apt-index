"""후기 링크 점검: 휴대폰 브라우저처럼 열어 앱 설치·로그인을 요구하는지, 후기가 바로 보이는지 (수동 실행, GitHub 러너에서).

결과는 로그에 한 줄씩 JSON 으로 남깁니다: 최종 주소, 제목, '로그인'·'앱' 낱말 수, 화면을 덮는 창, 첫 화면 글 앞부분.
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse as up

import requests
from playwright.sync_api import sync_playwright

NAMES = ["둔산동 크로바아파트", "도안동 트리풀시티 9단지", "전민동 엑스포아파트"]
WORDS = {
    "login": ["로그인", "회원가입", "카페 가입", "가입하기", "회원만", "멤버만"],
    "app": ["앱 설치", "앱에서 보기", "앱으로 보기", "앱 열기", "앱에서 열기", "앱 다운", "설치하기", "App Store", "Google Play"],
    "review": ["후기", "리뷰", "별점", "평점"],
}
# 화면의 40% 넘게 덮는 고정 창(앱 설치·로그인 팝업)이 있는지
OVERLAY_JS = """() => {
  const vw = innerWidth, vh = innerHeight, out = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if ((s.position !== 'fixed' && s.position !== 'sticky') || s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (area > vw * vh * 0.4) out.push((el.innerText || '').replace(/\\s+/g, ' ').slice(0, 120));
  }
  return out.slice(0, 3);
}"""


def kakao_place(q: str) -> str | None:
    r = requests.get("https://dapi.kakao.com/v2/local/search/keyword.json", params={"query": q},
                     headers={"Authorization": f"KakaoAK {os.environ['KAKAO_REST_KEY']}"}, timeout=15)
    docs = r.json().get("documents", [])
    apt = [d for d in docs if "아파트" in d.get("category_name", "")]
    return (apt or docs or [{}])[0].get("id")


def naver_links(q: str, kind: str, n: int = 2) -> list[str]:
    cid, sec = os.environ.get("NAVER_CLIENT_ID"), os.environ.get("NAVER_CLIENT_SECRET")
    if not (cid and sec):
        return []
    r = requests.get(f"https://openapi.naver.com/v1/search/{kind}.json", params={"query": q, "display": n, "sort": "sim"},
                     headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": sec}, timeout=15)
    return [it["link"] for it in r.json().get("items", [])]


def targets(q: str) -> list[tuple[str, str]]:
    e = up.quote(q)
    out = []
    kid = kakao_place(q)
    if kid:
        out += [("카카오 장소", f"https://place.map.kakao.com/{kid}"),
                ("카카오 장소 #review", f"https://place.map.kakao.com/{kid}#review"),
                ("카카오 장소 #comment", f"https://place.map.kakao.com/{kid}#comment"),
                ("카카오 모바일 장소", f"https://m.map.kakao.com/actions/detailMapView?id={kid}")]
    out += [("카카오맵 검색", f"https://m.map.kakao.com/actions/searchView?q={e}"),
            ("네이버 블로그 검색(모바일)", f"https://m.search.naver.com/search.naver?where=m_blog&query={up.quote(q + ' 후기')}"),
            ("네이버 블로그 검색(PC 주소)", f"https://search.naver.com/search.naver?ssc=tab.blog.all&query={up.quote(q + ' 후기')}"),
            ("네이버 카페 검색(모바일)", f"https://m.search.naver.com/search.naver?where=m_cafe&query={e}"),
            ("네이버 지도 검색", f"https://m.map.naver.com/search2/search.naver?query={e}"),
            ("네이버 플레이스 검색", f"https://m.place.naver.com/place/list?query={e}"),
            ("네이버 부동산 검색", f"https://m.land.naver.com/search/result/{e}"),
            ("호갱노노 검색", f"https://hogangnono.com/search?q={e}"),
            ("유튜브 검색", f"https://m.youtube.com/results?search_query={up.quote(q + ' 임장')}")]
    out += [("네이버 블로그 글", u) for u in naver_links(q + " 후기", "blog")]
    out += [("네이버 카페 글", u) for u in naver_links(q, "cafearticle")]
    return out


def probe(page, label: str, url: str) -> dict:
    res = {"what": label, "url": url}
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3500)
        text = re.sub(r"\s+", " ", page.inner_text("body"))
        res.update(final=page.url, title=page.title()[:80],
                   words={k: sum(text.count(w) for w in ws) for k, ws in WORDS.items()},
                   overlay=page.evaluate(OVERLAY_JS), text=text[:300])
        # 네이버 지도·플레이스 검색 결과에서 장소 번호 찾기 (후기 화면 주소를 시험하려고)
        ids = re.findall(r"/place/(\d{6,})", page.content())
        if ids:
            res["place_ids"] = list(dict.fromkeys(ids))[:3]
    except Exception as e:   # 시간 초과·앱 주소(intent://)로 넘김 등
        res["error"] = f"{type(e).__name__}: {str(e)[:160]}"
        res["final"] = page.url
    return res


def main() -> None:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for dev in ("Galaxy S9+", "iPhone 13"):
            ctx = b.new_context(**p.devices[dev], locale="ko-KR")
            page = ctx.new_page()
            for q in NAMES[: 3 if dev == "Galaxy S9+" else 1]:
                print(f"\n===== {dev} · {q}")
                naver_place = None
                for label, url in targets(q):
                    r = probe(page, label, url)
                    naver_place = naver_place or (r.get("place_ids") or [None])[0]
                    print(json.dumps(r, ensure_ascii=False))
                if naver_place:   # 네이버 플레이스 방문자·블로그 후기 화면
                    for label, url in (("네이버 플레이스 방문자 리뷰", f"https://m.place.naver.com/place/{naver_place}/review/visitor"),
                                       ("네이버 플레이스 블로그 리뷰", f"https://m.place.naver.com/place/{naver_place}/review/ugc"),
                                       ("네이버 플레이스 홈", f"https://m.place.naver.com/place/{naver_place}/home")):
                        print(json.dumps(probe(page, label, url), ensure_ascii=False))
            ctx.close()
        b.close()


if __name__ == "__main__":
    main()
