"""집감 블로그(www.jipgam.kr/blog/): 임장 가이드 글을 정적 HTML로 만듭니다.

글은 content/blog/*.md 하나에 한 편입니다. 맨 위 +++ 사이는 TOML 머리말(제목·질문·직답·FAQ·날짜),
그 아래는 본문(간단한 마크다운)입니다. 화면과 검색용 구조화 데이터(JSON-LD)를 같은 머리말에서 만들기 때문에
화면 글자와 구조화 데이터가 어긋나지 않습니다.

- 첫 문단은 머리말의 answer(질문에 대한 직답)를 그대로 씁니다.
- FAQ는 머리말의 faq 한 곳에서 화면 섹션과 FAQPage 데이터를 함께 만듭니다.
- 이미지는 static/blog/<이름>.webp 이고 본문에서 ![설명](img:<이름>) 으로 씁니다. 바로 뒤의 '▲' 줄은 사진 설명이 됩니다.
- draft = true 인 글은 만들지 않습니다.

landing.build() 가 맨 앞 주소를 만든 뒤 부릅니다. 사이트맵·llms.txt 에 넣을 글 목록을 돌려줍니다.
"""
from __future__ import annotations

import json
import re
import shutil
import tomllib
from html import escape
from pathlib import Path
from xml.sax.saxutils import escape as xe

from PIL import Image

from .config import ROOT

CONTENT = ROOT / "content" / "blog"
IMAGES = ROOT / "static" / "blog"
FOLDER = "blog"
REQUIRED = ("title", "slug", "question", "answer", "description", "order", "date_published", "date_modified", "data_asof")


# ---------- 글 읽기 ----------

def load_posts(src: Path = CONTENT) -> list[dict]:
    """머리말 + 본문을 읽어 order 순으로. 필수 항목이 빠지면 조용히 넘기지 않고 멈춥니다(빠진 글이 배포되지 않게)."""
    posts = []
    for f in sorted(Path(src).glob("*.md")):
        text = f.read_text(encoding="utf-8")
        m = re.match(r"\+\+\+\n(.*?)\n\+\+\+\n(.*)", text, re.S)
        if not m:
            raise ValueError(f"{f.name}: 맨 위 +++ 머리말이 없어요")
        meta = tomllib.loads(m.group(1))
        missing = [k for k in REQUIRED if not meta.get(k) and meta.get(k) != 0]
        if missing:
            raise ValueError(f"{f.name}: 머리말에 {', '.join(missing)} 이(가) 없어요")
        if meta.get("draft"):
            continue
        if not re.fullmatch(r"[a-z0-9-]+", meta["slug"]):
            raise ValueError(f"{f.name}: slug 는 영문 소문자·숫자·- 만 써요")
        meta["body"] = m.group(2)
        posts.append(meta)
    posts.sort(key=lambda p: p["order"])
    slugs = [p["slug"] for p in posts]
    if len(set(slugs)) != len(slugs):
        raise ValueError("같은 slug 를 쓰는 글이 있어요")
    return posts


# ---------- 간단한 마크다운 ----------

def _inline(s: str, base: str) -> str:
    """굵게(**), 링크([글](주소)). 주소가 /로 시작하면 사이트 주소를 붙입니다."""
    out, pos = [], 0
    for m in re.finditer(r"\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)", s):
        out.append(escape(s[pos:m.start()]))
        if m.group(1) is not None:
            out.append(f"<strong>{_inline(m.group(1), base)}</strong>")
        else:
            href = m.group(3)
            if href.startswith("/"):
                href = base.rstrip("/") + href
            out.append(f'<a href="{escape(href)}">{escape(m.group(2))}</a>')
        pos = m.end()
    out.append(escape(s[pos:]))
    return "".join(out)


def _image(name: str, alt: str, base: str, eager: bool) -> str:
    f = IMAGES / f"{name}.webp"
    if not f.exists():
        raise ValueError(f"이미지가 없어요: static/blog/{name}.webp")
    w, h = Image.open(f).size
    w, h = w // 2, h // 2   # 휴대폰 화면 2배 캡처 → 화면에 보이는 크기
    load = 'fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    return (f'<img src="{base}static/blog/{name}.webp" alt="{escape(alt)}" width="{w}" height="{h}" {load}>')


def render_body(md: str, base: str) -> tuple[str, list[str]]:
    """본문 마크다운 → HTML, 쓰인 이미지 이름들."""
    blocks = [b.strip("\n") for b in re.split(r"\n\s*\n", md.strip()) if b.strip()]
    html, images = [], []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        lines = b.split("\n")
        if b.startswith("## "):
            html.append(f"<h2>{_inline(b[3:].strip(), base)}</h2>")
        elif b.startswith("### "):
            html.append(f"<h3>{_inline(b[4:].strip(), base)}</h3>")
        elif m := re.fullmatch(r"!\[([^\]]*)\]\(img:([a-z0-9-]+)\)", b.strip()):
            cap = ""
            if i + 1 < len(blocks) and blocks[i + 1].startswith("▲"):
                cap = f"<figcaption>{_inline(blocks[i + 1][1:].strip(), base)}</figcaption>"
                i += 1
            html.append(f"<figure>{_image(m.group(2), m.group(1), base, eager=not images)}{cap}</figure>")
            images.append(m.group(2))
        elif all(re.match(r"\d+\. ", ln) for ln in lines):
            html.append("<ol>" + "".join(f"<li>{_inline(re.sub(r'^\d+\. ', '', ln), base)}</li>" for ln in lines) + "</ol>")
        elif all(ln.startswith("- ") for ln in lines):
            html.append("<ul>" + "".join(f"<li>{_inline(ln[2:], base)}</li>" for ln in lines) + "</ul>")
        elif lines[0].startswith("|") and len(lines) >= 2 and re.fullmatch(r"[|\s:-]+", lines[1]):
            def cells(ln):
                return [c.strip() for c in ln.strip().strip("|").split("|")]
            head = "".join(f"<th scope=\"col\">{_inline(c, base)}</th>" for c in cells(lines[0]))
            rows = "".join("<tr>" + "".join(f"<td>{_inline(c, base)}</td>" for c in cells(ln)) + "</tr>" for ln in lines[2:])
            html.append(f'<div class="tbl"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>')
        else:
            html.append("<p>" + "<br>".join(_inline(ln, base) for ln in lines) + "</p>")
        i += 1
    return "\n".join(html), images


# ---------- 구조화 데이터 ----------

def _ld(obj: dict) -> str:
    # JSON 문자열 안의 </script> 가 script 요소를 닫지 못하게
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


def _schemas(p: dict, base: str, url: str, image: str | None) -> list[str]:
    org = {"@id": base + "#organization"}
    post = {"@context": "https://schema.org", "@type": "BlogPosting", "@id": url + "#article",
            "mainEntityOfPage": url, "url": url, "headline": p["title"], "description": p["description"],
            "inLanguage": "ko-KR", "datePublished": str(p["date_published"]), "dateModified": str(p["date_modified"]),
            "author": org, "publisher": org, "isPartOf": {"@id": base + "blog/#blog"},
            "about": p["question"]}
    if image:
        post["image"] = image
    if p.get("tags"):
        post["keywords"] = ", ".join(p["tags"])
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "집감", "item": base},
        {"@type": "ListItem", "position": 2, "name": "임장 가이드", "item": base + "blog/"},
        {"@type": "ListItem", "position": 3, "name": p["title"], "item": url}]}
    out = [_ld(post), _ld(crumbs)]
    if p.get("faq"):
        out.append(_ld({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": q["a"]}} for q in p["faq"]]}))
    return out


# ---------- 만들기 ----------

def build(cfg, out_dir: Path, base: str, src: Path = CONTENT) -> list[dict]:
    """out_dir/blog/ 아래에 목록·글·RSS 를 만들고, 사이트맵·llms.txt 용 목록을 돌려줍니다."""
    posts = load_posts(src)
    if not posts or not base:
        return []
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    dst = Path(out_dir) / FOLDER
    dst.mkdir(parents=True, exist_ok=True)
    img_dst = Path(out_dir) / "static" / "blog"
    img_dst.mkdir(parents=True, exist_ok=True)
    common = dict(base=base, naver=cfg.site.get("naver_site_verification", ""),
                  google=cfg.site.get("google_site_verification", ""))

    for p in posts:
        p["url"] = f"{base}{FOLDER}/{p['slug']}"
        p["body_html"], p["images"] = render_body(p["body"], base)
        for name in p["images"]:
            shutil.copy2(IMAGES / f"{name}.webp", img_dst / f"{name}.webp")
    for k, p in enumerate(posts):
        p["prev"] = posts[k - 1] if k > 0 else None
        p["next"] = posts[k + 1] if k + 1 < len(posts) else None
        image = f"{base}static/blog/{p['images'][0]}.webp" if p["images"] else None
        html = env.get_template("blog_post.html").render(
            p=p, posts=posts, schemas=_schemas(p, base, p["url"], image),
            og_image=image or f"{base}static/og/jipgam.jpg", **common)
        (dst / f"{p['slug']}.html").write_text(html, encoding="utf-8")

    blog = {"@context": "https://schema.org", "@type": "Blog", "@id": base + "blog/#blog", "url": base + "blog/",
            "name": "집감 임장 가이드", "inLanguage": "ko-KR", "publisher": {"@id": base + "#organization"},
            "blogPost": [{"@type": "BlogPosting", "headline": p["title"], "url": p["url"],
                          "datePublished": str(p["date_published"])} for p in posts]}
    html = env.get_template("blog_index.html").render(posts=posts, schemas=[_ld(blog)], **common)
    (dst / "index.html").write_text(html, encoding="utf-8")
    _write_feed(dst / "feed.xml", base, posts)
    return [{"url": p["url"], "title": p["title"], "question": p["question"],
             "lastmod": str(p["date_modified"])} for p in posts]


def _rfc822(d) -> str:
    from datetime import datetime, time
    from email.utils import format_datetime
    from zoneinfo import ZoneInfo
    return format_datetime(datetime.combine(d, time(9, 0), ZoneInfo("Asia/Seoul")))


def _write_feed(path: Path, base: str, posts: list[dict]) -> None:
    """RSS 2.0: 새 글을 수집기·리더가 알아채게. 최신 글이 위."""
    items = "".join(
        f"<item><title>{xe(p['title'])}</title><link>{xe(p['url'])}</link><guid isPermaLink=\"true\">{xe(p['url'])}</guid>"
        f"<pubDate>{_rfc822(p['date_published'])}</pubDate><description>{xe(p['description'])}</description></item>\n"
        for p in sorted(posts, key=lambda p: (p["date_published"], p["order"]), reverse=True))
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n'
        f"<title>집감 임장 가이드</title><link>{xe(base)}blog/</link>"
        "<description>아파트 찾기부터 비교, 임장 코스, 현장 기록까지 집감 화면으로 따라가는 임장 가이드</description>"
        f"<language>ko</language>\n{items}</channel></rss>\n", encoding="utf-8")
