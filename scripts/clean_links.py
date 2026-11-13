"""배포본 HTML 의 내부 링크를 canonical 주소(.html 없는 주소)로 바꿉니다.

왜: 화면은 canonical 을 `/daejeon/rank` 처럼 .html 없이 선언하는데, 내부 링크는 `rank.html` 을
가리켜 구글이 같은 화면을 두 주소로 수천 개씩 크롤링했습니다 (서치콘솔 '리디렉션이 포함된 페이지',
'발견됨 - 현재 색인이 생성되지 않음' 급증 원인). 링크를 canonical 과 맞추면 크롤 예산이 실제 페이지로 갑니다.

사용: python scripts/clean_links.py site
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# href="x.html", href="../x.html?a=1#k", href="https://www.jipgam.kr/x.html" 만. 외부 도메인은 건드리지 않습니다.
HREF = re.compile(r'(href=["\'])((?:https://www\.jipgam\.kr)?[^"\'\s:]*?)\.html((?:[?#][^"\']*)?["\'])')


def clean(html: str) -> str:
    def sub(m: re.Match) -> str:
        pre, path, tail = m.groups()
        if path.endswith("index") and (path == "index" or path.endswith("/index")):
            path = path[:-5] or "./"          # index.html → ./ , ../index.html → ../
        return pre + path + tail
    return HREF.sub(sub, html)


def main(root: str) -> None:
    n_files = n_links = 0
    for p in Path(root).rglob("*.html"):
        src = p.read_text(encoding="utf-8")
        out = clean(src)
        if out != src:
            n_links += len(HREF.findall(src))
            p.write_text(out, encoding="utf-8")
            n_files += 1
    print(f"clean_links: {n_files} files, {n_links} links")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "site")
