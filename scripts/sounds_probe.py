"""옥상 자연 소리용 실제 녹음 찾기: 위키미디어 커먼즈에서 자유 이용 녹음 후보를 검색해 라이선스·길이와 함께 보여 줍니다."""
import json
import sys
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
QUERIES = {
    "fire": ["fireplace crackling", "bonfire crackling", "burning wood fire", "campfire"],
    "city": ["urban ambience night", "street ambience", "traffic ambience", "city soundscape", "Seoul street sounds"],
    "bug": ["summer night insects", "frogs night chorus", "cicada", "katydid", "night soundscape forest"],
    "wind": ["wind in trees", "wind through leaves"],
    "river": ["stream water flowing", "river water sound"],
}


def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    req = urllib.request.Request(url, headers={"User-Agent": "jipgam-sounds-probe/1.0 (https://www.jipgam.kr)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    for cat, qs in QUERIES.items():
        print(f"\n=== {cat} ===")
        seen = set()
        for q in qs:
            try:
                d = get({"action": "query", "generator": "search", "gsrsearch": q + " filetype:audio", "gsrnamespace": 6, "gsrlimit": 12,
                         "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata|mediatype"})
            except Exception as e:
                print(f"  ({q}) 실패: {type(e).__name__}")
                continue
            for p in (d.get("query", {}).get("pages") or []):
                ii = (p.get("imageinfo") or [{}])[0]
                if p["title"] in seen or not ii:
                    continue
                seen.add(p["title"])
                md = ii.get("extmetadata", {})
                lic = (md.get("LicenseShortName") or {}).get("value", "?")
                dur = ii.get("duration") or (md.get("Duration") or {}).get("value") or "?"
                print(f"  {p['title']} | {lic} | {dur}s | {round(ii.get('size', 0) / 1024)}KB | {ii.get('url')}")


if __name__ == "__main__":
    sys.exit(main())
