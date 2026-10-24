"""네이버 글 고르기 점검 (수동 실행, review-check 의 probe): 사이트의 실제 단지를 네이버 블로그 검색 API로 찾아
지금 기준(djdex.reviews)으로 남는 글과, 예전 기준으론 남았는데 이제 빠지는 글의 제목을 로그로 남깁니다.
키는 출력하지 않습니다.
"""
from __future__ import annotations

import os
import re
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from djdex import reviews  # noqa: E402
from djdex.kapt import _base_name  # noqa: E402
from djdex.molit import _norm_name  # noqa: E402

BASE = "https://spgummo0905-alt.github.io/daejeon-apt-index/"
REGIONS = {"대전": ("", 30), "세종": ("sejong/", 10), "서울": ("seoul/", 10)}
OLD = re.compile(r"급매|매물|매매가|전세가|월세|중개|공인|부동산|분양|모델하우스|청약|체험단|협찬|원고료|제공받|광고|"
                 r"시공|인테리어|이사|입주청소|줄눈|탄성|도배|확장|견적|경매|공매")


def sample(rows: list[dict], n: int) -> list[dict]:
    """지수 높은 단지 절반, 이름이 짧은(흔한) 단지 절반."""
    rows = [c for c in rows if c.get("n")]
    top = sorted(rows, key=lambda c: -(c.get("i") or 0))[: n // 2]
    short = [c for c in rows if len(_base_name(c["n"])) <= 3 and c not in top][: n - len(top)]
    return top + short


def main() -> None:
    nid, nsec = os.environ.get("NAVER_CLIENT_ID", "").strip(), os.environ.get("NAVER_CLIENT_SECRET", "").strip()
    if not (nid and nsec):
        sys.exit("NAVER_CLIENT_ID/SECRET 이 없어요")
    s = requests.Session()
    s.headers.update({"X-Naver-Client-Id": nid, "X-Naver-Client-Secret": nsec})
    web = requests.Session()
    for region, (path, n) in REGIONS.items():
        rows = web.get(BASE + path + "complexes.json", timeout=30).json().get("complexes") or []
        have_old = have_new = 0
        for c in sample(rows, n):
            cx = {"name": c["n"], "dong": c.get("d", ""), "gu": c.get("gu", "")}
            q = " ".join(x for x in (cx["dong"], cx["name"]) if x)
            q = q if q.endswith("아파트") else q + " 아파트"
            items = s.get(reviews.NAVER.format("blog"), params={"query": q + " 후기", "display": 100, "sort": "sim"},
                          timeout=15).json().get("items", [])
            key = _base_name(cx["name"])
            old = []
            for it in items:
                t, d = reviews._clean(it.get("title")), reviews._clean(it.get("description"))
                if key and key[:4] in _norm_name(t + " " + d) and not OLD.search(t + " " + d):
                    old.append(t)
            old = old[:5]
            seen: set = set()
            new = reviews._posts(s, "blog", q + " 후기", cx, 5, region, seen)
            if len(new) < 5:
                new += reviews._posts(s, "blog", q + " 살아보니", cx, 5 - len(new), region, seen)
            have_old += bool(old)
            have_new += bool(new)
            newt = [p["t"] for p in new]
            print(f"\n[{region}] {cx['dong']} {cx['name']} · 검색 {len(items)}개 · 예전 {len(old)} → 지금 {len(new)}")
            for t in newt:
                print("   + " + t)
            for t in old:
                if t not in newt:
                    print("   - " + t)
        print(f"\n== [{region}] 글이 있는 단지: 예전 {have_old} → 지금 {have_new} (점검 {n}곳)\n")


if __name__ == "__main__":
    main()
