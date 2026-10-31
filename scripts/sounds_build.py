"""옥상 자연 소리: 위키미디어 커먼즈의 자유 이용 실제 녹음을 받아 짧은 mp3 로 만듭니다 (static/sounds/).
- 반복 소리는 끝과 처음을 겹쳐서 이음새 없이, 불꽃은 큰 소리가 터지는 자리를 찾아 한 발씩 잘라요
- 저작자·라이선스는 위키미디어에서 받아 credits.json 에 남기고, 설정 창 '정보'에 보여 줘요
필요: ffmpeg, numpy"""
import json
import math
import os
import subprocess
import sys
import urllib.parse
import urllib.request

import numpy as np

SR = 32000
OUT = sys.argv[1] if len(sys.argv) > 1 else "static/sounds"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "jipgam-sounds-build/1.0 (https://www.jipgam.kr)"}

# (이름, 파일 제목, 시작 초, 길이 초, 겹치는 초, 목표 소리 크기)
LOOPS = [
    ("cricket", "Field cricket Gryllus pennsylvanicus.ogg", 0, 10.4, 1.2, .085),
    ("katydid", "Northern Bush Katydid (Scudderia septentrionalis) chirping.webm", 0, 11.1, 1.2, .08),
    ("frog", "Night Chorus of Frogs and Toads in Niger Delta.ogg", 1, 24, 2, .09),
    ("cicada", "Cicada 20200619.wav", 2, 40, 3, .08),
    ("wind", "Windy breath.ogg", 0, 20, 3, .08),
    ("rain", "Rain against the window.ogg", 8, 50, 4, .08),
    ("chime", "Windchime.ogg", 3, 56, 4, .06),
    ("fire", "Campfire sound ambience.ogg", 2, 54, 4, .07),
    ("city", "Cebu City at night.ogg", 20, 70, 5, .07),
    ("water", "433589 jackthemurray stream-river-water-up-close.wav", 3, 50, 4, .07),
    ("purr", "Purring cat bertie.ogg", 0, 8.6, .8, .08),
]
ONESHOTS = [("meow1", "Maullido de gata hembra joven.ogg", .6), ("meow2", "Meow of a Siamese cat - freemaster2.wav", .6)]
# 불꽃: (이름, 파일 제목, 가져올 발수, 가까운 소리인가)
FIREWORKS = [
    ("silv2", "Silvester fireworks from the street 02 cool stuff.ogg", 5, True),
    ("silv3", "Silvester fireworks from the street 03 end.ogg", 4, True),
    ("piece", "Fireworks piece.ogg", 4, True),
    ("nijm", "Fireworks nijmegen 2009.ogg", 5, True),
    ("far1", "Fireworks in distance 1.ogg", 3, False),
    ("far2", "Fireworks in distance 2.ogg", 3, False),
    ("far4", "Fireworks in distance 4.ogg", 3, False),
]


def get(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        d = r.read()
    return d if binary else json.loads(d.decode("utf-8"))


def info(title):
    d = get(API + "?" + urllib.parse.urlencode({"action": "query", "titles": "File:" + title, "prop": "imageinfo", "iiprop": "url|extmetadata", "format": "json", "formatversion": 2}))
    ii = d["query"]["pages"][0]["imageinfo"][0]
    md = ii.get("extmetadata", {})
    strip = lambda k: __import__("re").sub(r"<[^>]+>", "", (md.get(k) or {}).get("value", "")).strip()
    return ii["url"], {"title": title, "license": strip("LicenseShortName"), "author": strip("Artist")[:120], "page": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(title.replace(" ", "_"))}


def decode(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def encode(x, path, br="56k"):
    x = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", br, path], input=x.tobytes(), check=True)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-9)


def fetch(title, cache={}):
    if title in cache:
        return cache[title]
    url, meta = info(title)
    path = "/tmp/src_" + str(abs(hash(title))) + os.path.splitext(url.split("?")[0])[1]
    open(path, "wb").write(get(url, True))
    cache[title] = (path, meta)
    return cache[title]


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest, credits = {"loops": {}, "oneshots": {}, "near": [], "far": []}, {}
    for name, title, start, dur, xf, target in LOOPS:
        try:
            path, meta = fetch(title)
            x = decode(path)
            a = int(start * SR)
            seg = x[a:a + int(dur * SR)]
            n = int(xf * SR)
            if len(seg) < n * 3:
                n = len(seg) // 4
            t = np.linspace(0, math.pi / 2, n)
            out = seg[:-n].copy()
            out[:n] = out[:n] * np.sin(t) + seg[-n:] * np.cos(t)
            out = out - np.mean(out)
            out *= target / rms(out)
            encode(out, f"{OUT}/{name}.mp3")
            manifest["loops"][name] = f"{name}.mp3"
            credits[name] = meta
            print(f"[소리] {name}: {len(out) / SR:.1f}s {meta['license']}")
        except Exception as e:
            print(f"[소리] {name} 실패: {type(e).__name__}: {str(e)[:120]}")
    for name, title, target in ONESHOTS:
        try:
            path, meta = fetch(title)
            x = decode(path)
            nz = np.where(np.abs(x) > .02 * np.max(np.abs(x)))[0]
            x = x[max(0, nz[0] - 200):nz[-1] + 400]
            f = int(.05 * SR)
            x[-f:] *= np.linspace(1, 0, f)
            x *= .5 / (np.max(np.abs(x)) + 1e-9)
            encode(x, f"{OUT}/{name}.mp3")
            manifest["oneshots"][name] = f"{name}.mp3"
            credits[name] = meta
            print(f"[소리] {name}: {len(x) / SR:.2f}s {meta['license']}")
        except Exception as e:
            print(f"[소리] {name} 실패: {type(e).__name__}: {str(e)[:120]}")
    for name, title, k, near in FIREWORKS:
        try:
            path, meta = fetch(title)
            x = decode(path)
            w = SR // 100
            env = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode="same"))
            env = env[::w // 2]
            hop = w // 2
            got, e2 = [], env.copy()
            for _ in range(k * 4):
                i = int(np.argmax(e2))
                if e2[i] < .18 * env.max() or len(got) >= k:
                    break
                got.append(i)
                e2[max(0, i - int(4.5 * SR / hop)):i + int(4.5 * SR / hop)] = 0
            for j, i in enumerate(sorted(got)):
                t0 = max(0, i * hop - int(.06 * SR))
                clip = x[t0:t0 + int(3.4 * SR)].copy()
                if len(clip) < SR:
                    continue
                f = int(1.2 * SR)
                clip[-f:] *= np.linspace(1, 0, f) ** 1.5
                clip *= .8 / (np.max(np.abs(clip)) + 1e-9)
                fn = f"fw_{name}_{j}.mp3"
                encode(clip, f"{OUT}/{fn}", "64k")
                manifest["near" if near else "far"].append(fn)
            credits[name] = meta
            print(f"[소리] {name}: {len(got)}발 {meta['license']}")
        except Exception as e:
            print(f"[소리] {name} 실패: {type(e).__name__}: {str(e)[:120]}")
    json.dump(manifest, open(f"{OUT}/manifest.json", "w"), ensure_ascii=False, indent=1)
    json.dump(credits, open(f"{OUT}/credits.json", "w"), ensure_ascii=False, indent=1)
    tot = sum(os.path.getsize(f"{OUT}/{f}") for f in os.listdir(OUT))
    print(f"[소리] 파일 {len(os.listdir(OUT))}개, 합계 {tot // 1024}KB")
    return 0 if manifest["loops"] else 1


if __name__ == "__main__":
    sys.exit(main())
