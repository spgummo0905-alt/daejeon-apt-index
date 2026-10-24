"""배포된 사이트 점검 (수동 실행, GitHub 러너에서): 지역마다 첫 화면과 단지 페이지를 실제 주소로 열어
제목, 평가한 단지 수, 업데이트 날짜, 단지 페이지 수, 새 화면 요소가 들어갔는지를 로그에 한 줄씩 JSON 으로 남깁니다."""
from __future__ import annotations

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://spgummo0905-alt.github.io/daejeon-apt-index/"
REGIONS = {"대전": "", "세종": "sejong/", "서울": "seoul/"}
# 단지 페이지에 있어야 하는 화면 요소 (한눈에 보기 타일, 관련 점수 줄, 평형별 시세)
MARKS = {"한눈에 보기 타일": 'class="pt-grid"', "관련 점수 아래 줄": 'class="apt-more"', "평형별 시세": 'class="quotes"',
         "바로가기 탭": 'apt-jump', "층별 시세": "data-floors"}
# 모든 화면에 있어야 하는 요소 (지역 고르기 버튼, 최근 본 단지 버튼)
COMMON = {"지역 고르기": 'class="rg"', "최근 본 버튼": "data-rcd", "메뉴에 카드첩": 'href="cards.html"', "위쪽 검색 버튼": "data-hs-open",
          "지도 가격 거르기": 'id="kmap-ctl"'}
# 수집 자료가 단지 페이지에 반영된 수 (전체 단지 페이지를 열어 셉니다)
FILLED = {"단지 정보(세대수·주차)": lambda h: 'id="info"' in h,
          "공급면적": lambda h: "공급면적 정보가 없어" not in h,
          "카카오맵 장소": lambda h: "place.map.kakao.com/" in h,
          "네이버 글": lambda h: 'class="rv-posts"' in h,
          "관리비": lambda h: "<dt>관리비</dt>" in h,
          "후기가 입지 아래": lambda h: 0 < h.find("입지는 어떤가") < h.find('id="reviews"'),
          "언덕 체크": lambda h: 'id="hill"' in h,
          "언덕 역 단면": lambda h: 'class="hl-svg"' in h}


def text(html: str, pat: str) -> str:
    m = re.search(pat, html, re.S)
    return re.sub(r"<[^>]+>|\s+", " ", m.group(1)).strip() if m else ""


def _get(s: requests.Session, url: str) -> str:
    # GitHub Pages 가 한꺼번에 많이 열면 잠깐 막을 때가 있어(429 등) 조금 쉬었다 두 번 더 열어 봅니다
    for wait in (0, 2, 6):
        time.sleep(wait)
        try:
            r = s.get(url, timeout=30)
        except requests.RequestException:
            continue
        if r.ok:
            return r.text
        if r.status_code == 404:
            return ""
    return ""


def main() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (site-check)"
    s.hooks["response"].append(lambda r, *a, **k: setattr(r, "encoding", "utf-8"))  # 한글이 깨지지 않게
    for region, path in REGIONS.items():
        url = BASE + path
        r = s.get(url, timeout=30)
        out = {"지역": region, "주소": url, "상태": r.status_code}
        if r.ok:
            html = r.text
            out |= {"제목": text(html, r"<title>(.*?)</title>"), "소개": text(html, r'<p class="lead">(.*?)</p>'),
                    "업데이트": text(html, r'class="eyebrow[^"]*">(.*?)<'),
                    "지역 메뉴에 서울": "seoul/" in html}
            cx = s.get(url + "complexes.json", timeout=30)
            if cx.ok:
                data = cx.json()
                rows = data.get("complexes") or []
                out["단지 자료"] = len(rows)
                top = sorted((c for c in rows if c.get("i") is not None), key=lambda c: -c["i"])[:3]
                out["지수 TOP 3"] = [f"{c.get('n')} {c.get('i')}점 {c.get('pt') or ''}".strip() for c in top]
                out["전세 시세 있는 단지"] = sum(1 for c in rows if c.get("j"))
            sm = s.get(url + "sitemap.xml", timeout=30)
            apts = re.findall(r"<loc>[^<]*/apt/([^<]*)</loc>", sm.text) if sm.ok else []
            out["단지 페이지"] = len(apts)
            out |= {k: v in html for k, v in COMMON.items()}
            cards = s.get(url + "cards.html", timeout=30)
            out["카드첩 화면"] = cards.ok and all(k in cards.text for k in ('id="today"', 'id="badges"', 'id="album"'))
            out["메인에 오늘의 카드 없음"] = 'id="today"' not in html
            out["메인 3D 시세"] = "data-m3d-seg" in html
            js = s.get(url + "static/cards.js", timeout=30)
            out["임장 후보 코드"] = js.ok and "pickToday" in js.text
            app = s.get(url + "static/app.js", timeout=30)
            out["동·역·조건 검색 코드"] = app.ok and "DJ.parseCond" in app.text
            st = s.get(url + "stations.html", timeout=30)
            out["역 검색 연결"] = st.ok and "data-st-name=" in st.text
            my = s.get(url + "my.html", timeout=30)
            out["임장 코스"] = my.ok and 'id="course"' in my.text
            intro = s.get(url + "intro.html", timeout=30)
            out["인트로"] = {"상태": intro.status_code, "제목": text(intro.text, r"<title>(.*?)</title>") if intro.ok else "",
                           "뜨거운 동네 넘기기": "data-hot-json" in intro.text}
            if apts:
                page = s.get(url + "apt/" + apts[0], timeout=30)
                out["단지 예시"] = {"주소": url + "apt/" + apts[0], "상태": page.status_code,
                                  **{k: v in page.text for k, v in MARKS.items()}}
                with ThreadPoolExecutor(8) as ex:
                    pages = [p for p in ex.map(lambda a: _get(s, url + "apt/" + a), apts) if p]
                out["반영"] = {"열린 단지 페이지": f"{len(pages)} / {len(apts)}", **{k: sum(map(f, pages)) for k, f in FILLED.items()}}
                # 관리비가 그럴듯한지: ㎡당 금액 분포와 예시 세 곳 (화면 문구 그대로)
                fees = sorted(int(m.group(1).replace(",", "")) for h in pages
                              for m in [re.search(r"<dt>관리비</dt><dd><small>㎡당</small> ([\d,]+)", h)] if m)
                if fees:
                    out["관리비 ㎡당"] = {"가장 낮음": fees[0], "중간": fees[len(fees) // 2], "가장 높음": fees[-1]}
                    out["관리비 예시"] = [text(h, r"<h1[^>]*>(.*?)</h1>") + " · " + text(h, r"<dt>관리비</dt>(.*?)</div>")
                                      for h in pages if "<dt>관리비</dt>" in h][:3]
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
