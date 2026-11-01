"""옥상 화면의 날씨: 기상청 초단기실황·초단기예보(공공데이터포털)를 시간마다 받아 weather.json 으로 만듭니다.
키는 브라우저에 둘 수 없어서 서버(GitHub Actions, .github/workflows/weather.yml)에서 받아 파일로 내려 주고,
사이트(static/rooftop.js)는 그 파일만 읽어요. 키는 로그에 찍지 않습니다.
- 동네(구)별 평균 좌표 → 기상청 격자(nx, ny) → 격자마다 한 번씩만 요청
- 결과: {"u": 갱신 시각, "g": {"nx_ny": {"t": 기온, "sky": 1맑음·3구름많음·4흐림, "pty": 강수형태, "rn1": 1시간 강수, "wsd": 바람, "reh": 습도}}}
"""
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/"
SITES = ["https://www.jipgam.kr/", "https://www.jipgam.kr/sejong/", "https://www.jipgam.kr/seoul/", "https://www.jipgam.kr/cheongju/"]
KST = timezone(timedelta(hours=9))


def grid(lat, lon):
    """위경도 → 기상청 격자 (공식 변환식, static/rooftop.js 의 kmaGrid 와 같은 식)"""
    RE, GRID, SLAT1, SLAT2, OLON, OLAT, XO, YO = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    d = math.pi / 180
    re = RE / GRID
    s1, s2, olon, olat = SLAT1 * d, SLAT2 * d, OLON * d, OLAT * d
    sn = math.log(math.cos(s1) / math.cos(s2)) / math.log(math.tan(math.pi * .25 + s2 * .5) / math.tan(math.pi * .25 + s1 * .5))
    sf = math.tan(math.pi * .25 + s1 * .5) ** sn * math.cos(s1) / sn
    ro = re * sf / math.tan(math.pi * .25 + olat * .5) ** sn
    ra = re * sf / math.tan(math.pi * .25 + lat * d * .5) ** sn
    th = lon * d - olon
    th = th - 2 * math.pi if th > math.pi else th + 2 * math.pi if th < -math.pi else th
    th *= sn
    return int(ra * math.sin(th) + XO + .5), int(ro - ra * math.cos(th) + YO + .5)


def get(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "jipgam-weather"}), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def call(op, key, base_date, base_time, nx, ny, rows):
    q = urllib.parse.urlencode({"pageNo": 1, "numOfRows": rows, "dataType": "JSON", "base_date": base_date, "base_time": base_time, "nx": nx, "ny": ny})
    url = f"{BASE}{op}?serviceKey={urllib.parse.quote(urllib.parse.unquote(key), safe='')}&{q}"
    try:
        body = get(url)["response"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{op} HTTP {e.code}") from None
    except Exception as e:   # 키가 섞인 주소가 로그에 남지 않게 종류만
        raise RuntimeError(f"{op} {type(e).__name__}") from None
    head = body.get("header", {})
    if head.get("resultCode") != "00":
        raise RuntimeError(f"{op} {head.get('resultCode')} {head.get('resultMsg')}")
    items = body.get("body", {}).get("items", {})
    return items.get("item", []) if isinstance(items, dict) else []


def towns():
    """사이트 단지 자료에서 구별 평균 좌표 → 격자 집합"""
    out = {}
    for site in SITES:
        try:
            cs = get(site + "complexes.json")["complexes"]
        except Exception as e:
            print(f"[날씨] {site} 자료를 못 읽음: {type(e).__name__}")
            continue
        by = {}
        for c in cs:
            if c.get("gu") and c.get("la") and c.get("ln"):
                by.setdefault(c["gu"], []).append((c["la"], c["ln"]))
        for gu, pts in by.items():
            la, ln = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            out[grid(la, ln)] = gu
    return out


def main():
    key = os.environ.get("DATA_GO_KR_KEY", "")
    if not key:
        print("[날씨] DATA_GO_KR_KEY 가 없어서 건너뜁니다.")
        return 0
    now = datetime.now(KST)
    t1 = now - timedelta(minutes=40)                       # 초단기실황: 매시 정각 자료, 40분 뒤부터 제공
    nb = (t1.strftime("%Y%m%d"), t1.strftime("%H00"))
    t2 = now - timedelta(minutes=45)                       # 초단기예보: 매시 30분 자료, 45분 뒤부터 제공
    if t2.minute < 30:
        t2 -= timedelta(hours=1)
    fb = (t2.strftime("%Y%m%d"), t2.strftime("%H30"))
    grids = towns()
    print(f"[날씨] 격자 {len(grids)}곳, 실황 {nb[0]} {nb[1]}, 예보 {fb[0]} {fb[1]}")
    res, fail = {}, 0
    for (nx, ny), gu in sorted(grids.items()):
        try:
            cur = {i["category"]: i["obsrValue"] for i in call("getUltraSrtNcst", key, nb[0], nb[1], nx, ny, 20)}
            sky = None
            for i in sorted(call("getUltraSrtFcst", key, fb[0], fb[1], nx, ny, 100), key=lambda i: (i["fcstDate"], i["fcstTime"])):
                if i["category"] == "SKY":
                    sky = int(i["fcstValue"])
                    break
            res[f"{nx}_{ny}"] = {"t": float(cur.get("T1H", 0)), "sky": sky or 1, "pty": int(float(cur.get("PTY", 0))), "rn1": float(cur.get("RN1", 0) or 0),
                                 "wsd": float(cur.get("WSD", 0)), "reh": float(cur.get("REH", 0))}
        except Exception as e:
            fail += 1
            print(f"[날씨] {gu}({nx},{ny}) 실패: {e}")
            if fail == 1 and not res:
                print("[날씨] 첫 요청부터 실패: 공공데이터포털에서 '기상청_단기예보 조회서비스' 활용 신청이 되어 있는지 확인해 주세요.")
    if not res:
        print("[날씨] 받은 자료가 없어요.")
        return 1
    with open(sys.argv[1] if len(sys.argv) > 1 else "weather.json", "w", encoding="utf-8") as f:
        json.dump({"u": now.isoformat(timespec="minutes"), "g": res}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[날씨] {len(res)}곳 저장, 실패 {fail}곳")
    return 0


if __name__ == "__main__":
    sys.exit(main())
