"""배포본 HTML 의 내부 링크를 canonical 주소(.html 없는 주소)로 바꿉니다.

왜: 화면은 canonical 을 `/daejeon/rank` 처럼 .html 없이 선언하는데, 내부 링크는 `rank.html` 을
가리켜 구글이 같은 화면을 두 주소로 수천 개씩 크롤링했습니다 (서치콘솔 '리디렉션이 포함된 페이지',
'발견됨 - 현재 색인이 생성되지 않음' 급증 원인). 링크를 canonical 과 맞추면 크롤 예산이 실제 페이지로 갑니다.

바꾸는 곳:
- `href=`·`action=` (링크, 내부 이동)
- 예전 주소를 넘기는 안내 파일의 `content="0;url=…"`(meta refresh)
- 같은 안내 파일의 `location.replace("…")` (스크립트로 넘길 때)

바꾸지 않는 곳: 다른 도메인 링크, 그리고 스크립트가 만드는 주소(`fetch`·`DJ.href` 처럼 파일 이름이
필요한 곳). 그런 곳은 화면 코드에서 직접 .html 없이 적어야 합니다.

사용: python scripts/clean_links.py site
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# 내부 주소만. 외부 도메인은 건드리지 않습니다. `:` 가 들어간 주소(http://… 등)는 앞의 선택 부분이
# https://www.jipgam.kr 일 때만 맞으므로, 그 밖의 절대 주소는 그대로 둡니다.
_P = r'((?:https://www\.jipgam\.kr)?[^"\'\s:]*?)\.html'
_T = r'((?:[?#][^"\']*)?["\'])'
HREF = re.compile(r'((?:href|action)=["\'])' + _P + _T)
REFRESH = re.compile(r'(content=["\'][^"\']*?url=)' + _P + _T)
LOCATE = re.compile(r'(location\.replace\(["\'])' + _P + _T)
PATTERNS = (HREF, REFRESH, LOCATE)


def _drop(path: str) -> str:
    if path.endswith("index") and (path == "index" or path.endswith("/index")):
        return path[:-5] or "./"          # index.html → ./ , ../index.html → ../
    return path


def clean(html: str) -> str:
    out = html
    for rx in PATTERNS:
        def sub(m: re.Match, _rx=rx) -> str:
            pre, path, tail = m.groups()
            return pre + _drop(path) + tail
        out = rx.sub(sub, out)
    return out


def main(root: str) -> None:
    n_files = n_links = 0
    for p in Path(root).rglob("*.html"):
        src = p.read_text(encoding="utf-8")
        out = clean(src)
        if out != src:
            n_links += sum(len(rx.findall(src)) for rx in PATTERNS)
            p.write_text(out, encoding="utf-8")
            n_files += 1
    print(f"clean_links: {n_files} files, {n_links} links")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "site")
