"""맨 앞 주소(www.jipgam.kr/)의 첫 화면: 인트로(디자인 그대로)에서 지역부터 고르기.

지역 사이트는 모두 폴더 하나씩 (/daejeon/, /seoul/, /sejong/, /cheongju/ …) 이고, 맨 앞에는 지역을 고르는 화면만 둡니다.
지역이 늘면 config.toml 의 regions 에 한 줄만 더하면 이 화면에도 카드가 생겨요.

예전에 대전이 맨 앞 주소에 있던 시절의 링크(www.jipgam.kr/apt/○○.html, /rank.html …)는
같은 이름의 작은 안내 파일이 /daejeon/ 의 같은 화면으로 넘겨 줍니다 (주소 뒤 ?·# 도 그대로).
지역 사이트를 모두 만든 뒤 맨 마지막에 실행합니다: python -m djdex landing --out site
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from .config import ROOT

LEGACY = "daejeon"   # 예전에 맨 앞 주소에 있던 지역 폴더


def _folder(url: str, base: str) -> str:
    """지역 주소 → 이 사이트 안의 폴더 이름 ('https://www.jipgam.kr/seoul/' → 'seoul')"""
    if base and url.startswith(base):
        return url[len(base):].strip("/")
    return urlsplit(url).path.strip("/")


def regions(cfg, out_dir: Path) -> list[dict]:
    """고를 수 있는 지역: config.toml 의 regions 중 사이트가 실제로 만들어진 곳만 (폴더에 index.html 이 있는 곳)"""
    base = _root_url(cfg)
    rows = []
    for g in cfg.site.get("regions", []):
        if g.get("ready") and not (ROOT / g["ready"]).exists():
            continue
        folder = _folder(g.get("url", ""), base)
        if not folder or not (out_dir / folder / "index.html").exists():
            continue
        n = 0
        try:
            n = len(json.loads((out_dir / folder / "complexes.json").read_text(encoding="utf-8")).get("complexes", []))
        except (OSError, ValueError, AttributeError):
            pass
        rows.append(dict(g, folder=folder, path=f"{folder}/", n=n))
    return rows


def _root_url(cfg) -> str:
    """사이트 맨 앞 주소 (대전 base_url 'https://www.jipgam.kr/daejeon/' → 'https://www.jipgam.kr/')"""
    u = urlsplit(cfg.site.get("base_url", ""))
    return f"{u.scheme}://{u.netloc}/" if u.netloc else ""


STUB = ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>집감 {name}</title>'
        '<meta name="robots" content="noindex"><link rel="canonical" href="{canon}">'
        '<script>location.replace("{to}"+location.search+location.hash)</script>'
        '<meta http-equiv="refresh" content="0;url={to}"></head>'
        '<body><a href="{to}">집감 {name} 화면으로 이동</a></body></html>')


def write_redirects(out_dir: Path, folder: str, name: str, base: str, skip: set[str] = frozenset()) -> int:
    """예전 맨 앞 주소의 화면들 → /{folder}/ 같은 화면. 다른 지역 폴더나 맨 앞 파일과 겹치면 건너뜁니다."""
    src = out_dir / folder
    n = 0
    for f in sorted(src.rglob("*.html")):
        rel = f.relative_to(src).as_posix()
        if rel == "index.html" or rel.startswith("static/"):
            continue
        dst = out_dir / rel
        if dst.exists() or rel.split("/")[0] in skip:   # 다른 지역 폴더와 겹치는 이름은 건드리지 않음
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        to = f"/{folder}/{rel}"
        canon = f"{base}{folder}/{rel[:-5]}" if base else to
        dst.write_text(STUB.format(name=escape(name), to=escape(to), canon=escape(canon)), encoding="utf-8")
        n += 1
    return n


# 예전 맨 앞 서비스 워커를 정리하는 워커: 저장해 둔 화면을 지우고 스스로 물러납니다.
# (예전 워커가 맨 앞 주소 전체를 맡고 있어서, 지역 폴더의 새 워커와 겹치지 않게)
SW = """// 맨 앞 주소(지역 고르기)는 서비스 워커가 필요 없어요. 예전 대전 워커가 남아 있으면 저장분을 지우고 물러납니다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("djdex-")).map(k => caches.delete(k))))
    .catch(() => {}).then(() => self.registration.unregister()));
});
"""


def _write_about(cfg, out_dir: Path, base: str, rows: list[dict]) -> None:
    """'집감이란?' 브랜드 설명 페이지 (맨 앞 주소/about). 지역·단지 수는 이번 빌드의 실제 값."""
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    total = sum(r["n"] for r in rows)
    about = {"@context": "https://schema.org", "@type": "AboutPage", "@id": base + "about#page", "url": base + "about",
             "name": "집감이란?", "inLanguage": "ko-KR", "isPartOf": {"@id": base + "#website"},
             "about": {"@id": base + "#organization"}}
    schema = json.dumps(about, ensure_ascii=False).replace("<", "\\u003c")
    html = env.get_template("about.html").render(
        base=base, regions=rows, total=f"{total:,}", schema=schema,
        today=datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y.%m.%d"),
        naver=cfg.site.get("naver_site_verification", ""), google=cfg.site.get("google_site_verification", ""))
    (out_dir / "about.html").write_text(html, encoding="utf-8")


def build(cfg, out_dir: Path) -> int:
    """맨 앞 주소 = 지역 사이트의 인트로 화면(디자인 그대로)을 지역부터 고르게 만든 것 (site.py 가 만든 landing.html).
    화면 안의 그림·링크는 그 지역 폴더 기준으로 열리게 <base> 를 붙여 맨 앞에 둡니다."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = _root_url(cfg)
    rows = regions(cfg, out_dir)
    legacy = next((r for r in rows if r["folder"] == LEGACY), rows[0] if rows else None)
    if not legacy or not (out_dir / legacy["folder"] / "landing.html").exists():
        return 0
    src = out_dir / legacy["folder"] / "landing.html"
    html = src.read_text(encoding="utf-8")
    src.unlink()   # 지역 폴더 안에는 두지 않음 (맨 앞에만)
    folder = legacy["folder"]
    html = html.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<base href="/{folder}/">', 1)
    if base:
        html = html.replace(f'href="{base}{folder}/landing"', f'href="{base}"').replace(
            f'content="{base}{folder}/landing"', f'content="{base}"')
        html = re.sub(r'(<meta property="og:image" content=")[^"]*(")', rf'\g<1>{base}static/og/jipgam.jpg\g<2>', html)
        # 사이트 이름은 도메인 첫 화면에서 선언합니다. 지역 자료를 전국 합계나 전국 순위로 표현하지 않습니다.
        website = {"@context": "https://schema.org", "@type": "WebSite", "@id": base + "#website",
                   "name": "집감", "alternateName": ["Jipgam", "집감 임장"], "url": base, "inLanguage": "ko-KR",
                   "description": "아파트 실거래가·입지 비교, 임장 코스와 현장 기록을 한곳에서 준비하는 플랫폼"}
        # JSON 문자열 안의 HTML 종료 태그가 script 요소를 닫지 못하게 이스케이프합니다.
        schema = json.dumps(website, ensure_ascii=False).replace("<", "\\u003c")
        # 브랜드 검색(집감)에서 사이트와 로고를 알아보게: 조직 정보와 로고 (96px 아이콘이 아닌 512px)
        org = {"@context": "https://schema.org", "@type": "Organization", "@id": base + "#organization",
               "name": "집감", "alternateName": "Jipgam", "url": base, "logo": base + "static/icons/icon-512.png"}
        org_s = json.dumps(org, ensure_ascii=False).replace("<", "\\u003c")
        html = html.replace("</head>", f'<script type="application/ld+json">{schema}</script>\n'
                                       f'<script type="application/ld+json">{org_s}</script>\n</head>', 1)
    (out_dir / "index.html").write_text(html, encoding="utf-8")

    if base:
        _write_about(cfg, out_dir, base, rows)

    # 링크 미리보기 이미지 (맨 앞 주소용 '전국')
    (out_dir / "static" / "og").mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "static" / "og" / "jipgam.jpg", out_dir / "static" / "og" / "jipgam.jpg")

    (out_dir / "sw.js").write_text(SW, encoding="utf-8")
    n_stub = write_redirects(out_dir, legacy["folder"], legacy["name"], base, {r["folder"] for r in rows}) if legacy else 0

    # 검색엔진: 맨 앞 주소 + 지역마다의 사이트맵
    if base:
        from xml.sax.saxutils import escape as xe
        today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
        (out_dir / "sitemap-root.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"<url><loc>{xe(base)}</loc><lastmod>{today}</lastmod><priority>1.0</priority></url>\n"
            f"<url><loc>{xe(base)}about</loc><lastmod>{today}</lastmod><priority>0.8</priority></url>\n</urlset>\n", encoding="utf-8")
        maps = [f"{base}sitemap-root.xml"] + [f"{base}{r['path']}sitemap.xml" for r in rows
                                              if (out_dir / r["folder"] / "sitemap.xml").exists()]
        (out_dir / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join(f"<sitemap><loc>{xe(m)}</loc><lastmod>{today}</lastmod></sitemap>\n" for m in maps)
            + "</sitemapindex>\n", encoding="utf-8")
        (out_dir / "robots.txt").write_text("User-agent: *\nAllow: /\n" + "".join(f"Sitemap: {m}\n" for m in maps[1:])
                                            + f"Sitemap: {base}sitemap.xml\n", encoding="utf-8")

    # 안드로이드 앱 소유 확인 파일은 맨 앞 주소에만 둘 수 있어요
    from .site import write_assetlinks
    write_assetlinks(out_dir, cfg, root=True)
    return n_stub
