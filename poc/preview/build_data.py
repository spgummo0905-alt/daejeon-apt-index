#!/usr/bin/env python3
"""집감 미리보기 시제품: 브이월드 건물 + 건축HUB 표제부 -> 단지별 분석용 JSON.

표준 라이브러리만 씁니다. 입력은 이미 받아 둔 파일이고, 이 스크립트는 외부에 접속하지 않습니다(키도 필요 없음).

사용:  python3 build_data.py [입력폴더] [출력폴더]
  입력폴더(기본 scratch/pv/samples): vworld_<단지>.json, hub_rows.txt, pnu_list.json, *_complexes.json
  출력폴더(기본 ./data): <단지코드>.json

연결 규칙(건물명/필지 근거만 사용, 동 번호를 임의로 붙이지 않음)
  1) 브이월드 건물의 (건물명 공백제거, 동 이름의 숫자) 가 건축HUB 표제부의 같은 쌍과 정확히 1:1 이면 '건축HUB와 일치'.
  2) 건물명과 동 이름이 있으나 건축HUB 쪽에 없으면 '브이월드만'.
  3) 동 이름만 있고 건물명이 없거나, 쌍이 둘 이상과 겹치면 '소속 불명' (계산에서 뺌).
  4) 이름도 동도 없는 일반 건물은 '브이월드만'(주변 건물).
높이 우선순위: 건축HUB heit > 브이월드 height > 층수 x 단지 안 실측 중간 층고.
"""
import json, math, os, re, statistics, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_IN = "/home/spgummo0905/.hermes/profiles/design-studio/cache/scratch/pv/samples"
RADIUS = 250.0   # 단지 중심에서 이 거리 안의 건물을 담는다 (단지 본 건물은 거리와 무관하게 담는다)

# 단지별 '이 단지 본 건물' 근거: 건축HUB 에서 이 단지 동들이 올라앉은 필지(PNU)와 건물명.
COMPLEXES = {
    "30200-631": {"pnu": "3020011500104640000", "nm": "도안신도시5블록트리풀시티아파트", "label": "트리풀시티 5단지"},
    "36110-203": {"pnu": "3611010600109710000", "nm": "첫마을아파트", "label": "첫마을 5단지"},
    "36110-421": {"pnu": "3611010700108530000", "nm": "나릿재마을2단지", "label": "나릿재마을 2단지"},
}

ASSUMPTIONS = [
    "높이는 건물 꼭대기 하나뿐입니다. 층별 높이, 필로티, 옥탑, 경사 지붕은 반영하지 않습니다.",
    "관측점은 '선택한 층의 한가운데' = (층 - 0.5) x 층고 이고, 창은 건물 남쪽을 보는 긴 면의 가운데에 있다고 가정합니다. 실제 창 방향은 자료에 없습니다.",
    "모든 건물이 같은 평지 위에 있다고 보고 계산합니다. 지형(고도 차이)은 반영하지 않았습니다(지형 미반영).",
    "나무, 담장, 가림막, 건물 날개(ㄱ자 등) 자체의 그림자는 반영하지 않습니다.",
    "해 위치는 날짜와 단지 중심 위도·경도로 계산한 천문 값(NOAA 간이식)이고, 구름·미세먼지는 반영하지 않습니다.",
    "15분 칸마다 칸 가운데 시각에서 해가 닿는지 판정하고, 닿는 칸 수 x 15분을 '직사광이 닿을 가능성이 있는 시간'으로 합니다.",
]
LIMITS = [
    "참고용 추정입니다. 실내 채광이나 법적 일조권(일조 보장) 판단 자료가 아닙니다.",
    "조망: 수면 자료가 부족해 아직 계산하지 않음.",
    "단지 중심에서 반경 약 250 m 밖의 건물은 담지 않아 먼 건물 그림자는 빠집니다.",
    "브이월드 이용 조건이 확정되지 않았습니다. 이 파일을 사이트에 올리거나 다시 나누어 주기 전에 확인이 필요합니다.",
]


def norm_name(s):
    return re.sub(r"\s+", "", s or "")


def dong_num(s):
    """'501동' '312동(상가)' '201' -> 숫자 문자열. 숫자 동이 아니면 None."""
    m = re.match(r"^\s*(\d{1,4})\s*동?\s*(\(.*\))?\s*$", s or "")
    return m.group(1) if m else None


def meters_per_deg(lat):
    p = math.radians(lat)
    mlat = 111132.954 - 559.822 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    mlon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)
    return mlon, mlat


def rdp(pts, eps):
    """Ramer-Douglas-Peucker (닫힌 고리의 마지막 점은 첫 점과 같다고 보고 먼저 뺀다)."""
    if len(pts) < 4:
        return pts

    def seg(a, b, lo, hi):
        if hi <= lo + 1:
            return [lo]
        ax, ay = a; bx, by = b
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1, lo
        for i in range(lo + 1, hi):
            px, py = pts[i]
            d = abs(dx * (ay - py) - (ax - px) * dy) / L if L > 1e-9 else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > eps:
            return seg(a, pts[bi], lo, bi) + seg(pts[bi], b, bi, hi)
        return [lo]

    # 고리를 두 조각으로 나누어(가장 먼 두 점) 각각 단순화
    n = len(pts)
    i0 = 0
    far = max(range(n), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    ring2 = pts[far:] + pts[:far + 1]
    a_idx = seg(pts[0], pts[far], 0, far) if far > 0 else [0]
    out = [pts[i] for i in a_idx]
    sub = pts[far:] + [pts[0]]
    b_idx = seg(sub[0], sub[-1], 0, len(sub) - 1)
    out += [sub[i] for i in b_idx]
    return out


def min_rect(pts):
    """건물에 딱 맞는 기울어진 최소 면적 직사각형(꼭짓점 4개). 볼록 껍질의 각 변 방향으로 돌려 가며 가장 작은 것을 고른다.
    계단식·ㄱ자처럼 꺾인 건물에서 '남쪽 긴 면'이 짧은 조각으로 잡히는 것을 막기 위한 관측 기준면이다."""
    P = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    if len(P) < 3:
        return None

    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    H = lo[:-1] + up[:-1]
    best = None
    for i in range(len(H)):
        a, b = H[i], H[(i + 1) % len(H)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6: continue
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        vx, vy = -uy, ux
        us = [q[0] * ux + q[1] * uy for q in H]; vs = [q[0] * vx + q[1] * vy for q in H]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        area = (u1 - u0) * (v1 - v0)
        if best is None or area < best[0]:
            best = (area, ux, uy, vx, vy, u0, u1, v0, v1)
    _, ux, uy, vx, vy, u0, u1, v0, v1 = best
    r = [(u * ux + v * vx, u * uy + v * vy) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    return [[round(x, 1), round(y, 1)] for x, y in r]


def resolve_height(hh, hv, f, floor_h):
    """높이 우선순위: 건축HUB(hub) > 브이월드(vworld) > 층수 x 층고(est). 하나도 못 정하면 (None, 'none')."""
    if hh and hh > 0:
        return hh, "hub"
    if hv and hv > 0:
        return hv, "vworld"
    if f and f >= 1:
        return round(f * floor_h, 2), "est"
    return None, "none"


def ring_area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def main(inp, outdir):
    os.makedirs(outdir, exist_ok=True)
    hub_by_pnu = collections.defaultdict(list)
    pnu = None
    for line in open(os.path.join(inp, "hub_rows.txt"), encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("PNU|"):
            pnu = line.split("|")[1]
        elif line.startswith("ROW|"):
            r = json.loads(line[4:]); r["pnu"] = pnu; hub_by_pnu[pnu].append(r)
    pnu_list = json.load(open(os.path.join(inp, "pnu_list.json"), encoding="utf-8"))
    cmeta = {}
    for f in ("daejeon", "sejong"):
        for c in json.load(open(os.path.join(inp, f + "_complexes.json"), encoding="utf-8"))["complexes"]:
            cmeta[c["s"]] = c

    report = {}
    for cid, cfg in COMPLEXES.items():
        vw = json.load(open(os.path.join(inp, "vworld_%s.json" % cid), encoding="utf-8"))
        cm = cmeta[cid]
        lat0, lon0 = cm["la"], cm["ln"]
        mlon, mlat = meters_per_deg(lat0)

        # 건축HUB 색인: (건물명, 동 숫자) -> 행들. 이 단지 조회에서 받은 모든 필지를 대상으로 한다.
        hub = collections.defaultdict(list)
        hub_rows_all = []
        for p in pnu_list[cid]["pnu"]:
            for r in hub_by_pnu.get(p, []):
                hub_rows_all.append(r)
                dn = dong_num(r["dongNm"])
                if dn:
                    hub[(norm_name(r["bldNm"]), dn)].append(r)

        # 브이월드 같은 (건물명,동 숫자) 쌍이 여러 도형인지
        vw_pairs = collections.Counter()
        for ft in vw["features"]:
            pr = ft["properties"]; dn = dong_num(pr["dong_nm"])
            if dn and pr["bld_nm"]:
                vw_pairs[(norm_name(pr["bld_nm"]), dn)] += 1

        blds = []
        stats = collections.Counter(); raw = collections.Counter(); raw_unmatched = []; hdiff = []
        for ft in vw["features"]:
            pr = ft["properties"]
            polys = ft["geometry"]["coordinates"]
            ring = max((pg[0] for pg in polys), key=lambda r: abs(ring_area([((x - lon0) * mlon, (y - lat0) * mlat) for x, y in r])))
            pts = [(round((x - lon0) * mlon, 3), round((y - lat0) * mlat, 3)) for x, y in ring]
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            if len(pts) < 3:
                continue
            simp = rdp(pts, 0.4)
            if len(simp) < 3:
                simp = pts
            if ring_area(simp) < 0:           # 반시계(+)로 통일
                simp = simp[::-1]
            dmin = min(math.hypot(x, y) for x, y in simp)
            nm, dn_raw = pr["bld_nm"], pr["dong_nm"]
            nn, dn = norm_name(nm), dong_num(dn_raw)
            own = (nn == norm_name(cfg["nm"]) and dn is not None and
                   any(dong_num(r["dongNm"]) == dn and r["pnu"] == cfg["pnu"] and norm_name(r["bldNm"]) == nn
                       for r in hub_by_pnu.get(cfg["pnu"], [])))
            f = int(float(pr["grnd_flr"] or 0))
            hv = float(pr["height"] or 0) or None
            hh, st, kind = None, None, "other"
            if dn and nn:
                rows = hub.get((nn, dn), [])
                if len(rows) == 1 and vw_pairs[(nn, dn)] == 1:
                    st = "hub"; hh = float(rows[0]["heit"]) or None
                    kind = "own" if own else "near"
                    if int(rows[0]["grndFlrCnt"]) != f:
                        stats["층수 불일치(원자료)"] += 1
                    if hh and hv:
                        hdiff.append(abs(hh - hv))
                elif len(rows) > 1 or vw_pairs[(nn, dn)] > 1:
                    st = "unknown"; kind = "near"
                else:
                    st = "vworld"; kind = "near"
            elif dn and not nn:
                st = "unknown"; kind = "near"          # 동 이름만 있고 건물명이 없다
            elif nn:
                st = "vworld"; kind = "annex"           # 상가동·경비실·학교 등
            else:
                st = "vworld"; kind = "other"           # 이름 없는 일반 건물
            if dn:                                      # 번호 동(원자료 반경 약 400 m 전체)
                raw["번호 동 전체"] += 1
                raw[{"hub": "건축HUB 일치", "vworld": "브이월드만", "unknown": "소속 불명"}[st]] += 1
                if st != "hub":
                    raw_unmatched.append((nm + " " + dn_raw).strip())
            if dmin > RADIUS and not own:
                continue
            blds.append({"k": kind, "nm": nm, "dn": dn_raw, "f": f, "hh": hh, "hv": hv, "st": st,
                         "u": pr["usability"] or "", "apr": pr["useapr_day"] or "", "d": round(dmin),
                         "p": [[round(x, 1), round(y, 1)] for x, y in simp], "r": min_rect(simp)})

        # 단지 안 실측 층고 중간값: 건축HUB 높이가 있는 5층 이상 '동' (이 단지·주변 아파트)
        ratios = [b["hh"] / b["f"] for b in blds if b["st"] == "hub" and b["hh"] and b["f"] >= 5]
        floor_h = round(statistics.median(ratios), 2)
        rmin, rmax = round(min(ratios), 2), round(max(ratios), 2)

        for b in blds:
            if b["st"] == "unknown":                    # 소속 불명은 높이를 정하지 않고 계산에서 뺀다
                b["h"], b["src"] = None, "none"
            else:
                b["h"], b["src"] = resolve_height(b["hh"], b["hv"], b["f"], floor_h)
        blds.sort(key=lambda b: ({"own": 0, "near": 1, "annex": 2, "other": 3}[b["k"]], b["dn"], b["d"]))
        for i, b in enumerate(blds):
            b["id"] = "b%d" % i

        own_b = [b for b in blds if b["k"] == "own"]
        hub_own_rows = [r for r in hub_by_pnu.get(cfg["pnu"], []) if dong_num(r["dongNm"]) and norm_name(r["bldNm"]) == norm_name(cfg["nm"])]
        hub_no_poly = [r["dongNm"] for r in hub_own_rows
                       if not any(b["k"] == "own" and dong_num(b["dn"]) == dong_num(r["dongNm"]) for b in blds)]
        by_st = collections.Counter(b["st"] for b in blds)
        by_src = collections.Counter(b["src"] for b in blds)
        by_kind = collections.Counter(b["k"] for b in blds)
        apt = [b for b in blds if dong_num(b["dn"]) and b["nm"]]
        summary = {
            "도형 건물 수": len(blds), "종류별": dict(by_kind), "매칭 상태별": dict(by_st), "높이 출처별": dict(by_src),
            "이 단지 동(도형 있음)": len(own_b), "이 단지 동 중 건축HUB 일치": sum(1 for b in own_b if b["st"] == "hub"),
            "건축HUB 이 단지 동 수(숫자 동)": len(hub_own_rows), "건축HUB 에는 있으나 도형 없음": hub_no_poly,
            "이름 있는 동(아파트 등) 수": len(apt), "그 중 건축HUB 일치": sum(1 for b in apt if b["st"] == "hub"),
            "그 중 브이월드만": sum(1 for b in apt if b["st"] == "vworld"), "그 중 소속 불명": sum(1 for b in apt if b["st"] == "unknown"),
            "동 이름만 있고 건물명 없음(소속 불명)": sum(1 for b in blds if b["st"] == "unknown" and not b["nm"]),
            "원자료(반경 약 400 m) 번호 동 기준": dict(raw), "원자료에서 건축HUB와 못 이은 번호 동": sorted(set(raw_unmatched)),
            "원자료 층수 불일치(건축HUB 일치 동)": stats["층수 불일치(원자료)"],
            "브이월드·건축HUB 높이 둘 다 있는 동": {"개수": len(hdiff), "차이 중간값 m": round(statistics.median(hdiff), 2) if hdiff else None,
                                          "차이 최대 m": round(max(hdiff), 2) if hdiff else None},
            "분석 자료 없음(높이·층수 모두 없음)": sum(1 for b in blds if b["src"] == "none"),
        }
        doc = {
            "meta": {
                "title": "집감 미리보기 시제품 분석용 자료",
                "complex": {"id": cid, "name": cm["n"], "label": cfg["label"], "gu": cm.get("gu"), "dong": cm.get("d"),
                            "lat": lat0, "lon": lon0, "year": cm.get("y"), "households": cm.get("hh")},
                "sources": [
                    {"name": "브이월드 건물 데이터(GIS건물통합정보)", "used": "건물 도형, 동 이름, 층수, 높이(있을 때)", "date": vw.get("받은시각", "")},
                    {"name": "건축HUB 건축물대장 표제부", "used": "동 이름, 층수, 높이(heit), 사용승인일", "date": "2026-11-07 받은 파일 기준"},
                    {"name": "집감 단지 목록", "used": "단지 중심 좌표, 이름", "date": "2026-11-06 갱신본"},
                ],
                "radius_m": RADIUS,
                "coord": "x=단지 중심에서 동쪽 m, y=북쪽 m",
                "floor_h": {"value": floor_h, "n": len(ratios), "min": rmin, "max": rmax,
                            "method": "건축HUB 높이 / 지상층수의 중간값(5층 이상 아파트 동, 이 파일 안)"},
                "height_priority": ["건축물대장 높이(hub)", "브이월드 높이(vworld)", "층수로 추정(est) = 층수 x floor_h"],
                "status_labels": {"hub": "건축HUB와 일치", "vworld": "브이월드만", "unknown": "소속 불명"},
                "assumptions": ASSUMPTIONS, "limits": LIMITS,
                "match_summary": summary,
            },
            "own": {"bld_nm": cfg["nm"], "pnu": cfg["pnu"]},
            "buildings": blds,
        }
        path = os.path.join(outdir, cid + ".json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(outdir, cid + ".js"), "w", encoding="utf-8") as fh2:   # 더블클릭(file://) 열기용 같은 내용
            fh2.write("window.PV_DATA=window.PV_DATA||{};window.PV_DATA[%s]=" % json.dumps(cid))
            json.dump(doc, fh2, ensure_ascii=False, separators=(",", ":")); fh2.write(";\n")
        report[cid] = (os.path.getsize(path), summary, floor_h)
    for cid, (sz, s, fh) in report.items():
        print(cid, "%.1fKB" % (sz / 1024), "floor_h", fh)
        print(json.dumps(s, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0] if a else DEFAULT_IN, a[1] if len(a) > 1 else os.path.join(HERE, "data"))
