"""배포된 사이트 점검 (수동 실행, GitHub 러너에서): 지역마다 첫 화면과 단지 페이지를 실제 주소로 열어
제목, 평가한 단지 수, 업데이트 날짜, 단지 페이지 수, 새 화면 요소가 들어갔는지를 로그에 한 줄씩 JSON 으로 남깁니다."""
from __future__ import annotations

import json
import re
import sys

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://spgummo0905-alt.github.io/daejeon-apt-index/"
REGIONS = {"대전": "", "세종": "sejong/", "서울": "seoul/"}
# 단지 페이지에 있어야 하는 화면 요소 (한눈에 보기 타일, 관련 점수 줄, 평형별 시세)
MARKS = {"한눈에 보기 타일": 'class="pt-grid"', "관련 점수 아래 줄": 'class="apt-more"', "평형별 시세": 'class="quotes"'}


def text(html: str, pat: str) -> str:
    m = re.search(pat, html, re.S)
    return re.sub(r"<[^>]+>|\s+", " ", m.group(1)).strip() if m else ""


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
            if apts:
                page = s.get(url + "apt/" + apts[0], timeout=30)
                out["단지 예시"] = {"주소": url + "apt/" + apts[0], "상태": page.status_code,
                                  **{k: v in page.text for k, v in MARKS.items()}}
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
