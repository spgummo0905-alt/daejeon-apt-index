"""옥상 배경 사진 후보: 위키미디어 커먼즈에서 자유 이용(공개 도메인·CC0·CC BY) 야경·노을 사진을 찾아 크기·라이선스와 함께 보여 줍니다."""
import json
import re
import time
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "jipgam-images-probe/1.0 (https://www.jipgam.kr; t0mango@gmail.com) python-urllib"}
QUERIES = ["Gwangandaegyo night", "Busan night skyline fireworks", "Seoul night skyline Han River", "city skyline twilight bay bridge", "night cityscape panorama bridge lights",
           "Hong Kong Victoria Harbour night panorama", "Sydney harbour twilight", "dusk sky clouds afterglow", "sunset sky pink clouds", "twilight sky panorama"]
OK = re.compile(r"public domain|cc0|cc by 2|cc by 3|cc by 4|cc-by|pd", re.I)


def get(params):
    time.sleep(1.5)
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    for q in QUERIES:
        print(f"\n=== {q} ===")
        try:
            d = get({"action": "query", "generator": "search", "gsrsearch": q + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 14, "prop": "imageinfo", "iiprop": "url|size|extmetadata"})
        except Exception as e:
            print("  실패", type(e).__name__)
            continue
        for p in d.get("query", {}).get("pages") or []:
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})
            lic = (md.get("LicenseShortName") or {}).get("value", "?")
            if not ii or ii.get("width", 0) < 2400 or "SA" in lic.upper() or not OK.search(lic):
                continue
            print(f"  {p['title']} | {lic} | {ii['width']}x{ii['height']} | {ii.get('url')}")


if __name__ == "__main__":
    main()
