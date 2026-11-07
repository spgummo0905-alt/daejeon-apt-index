"""일조 미리보기용 단지별 건물 자료 만들기 (이 컴퓨터에서 한 번 돌려 data/preview/ 에 저장, 사이트 만들 때는 이 결과만 씀).

입력(수집 결과, 저장소 밖):
  layout/<지역>.json : 브이월드 건물 윤곽(단지 중심 약 440m) {단지: {la, ln, pnu, b:[{dn,f,h,u,us,in,p:[[경도,위도]..]}]}}
                       in=1 은 윤곽 중심이 단지 중심이 놓인 필지 안에 있다는 뜻
  hub.json           : 건축HUB 표제부 {PNU: [{bld,dong,f,h,use,apr,area,...}]}
출력: data/preview/<지역>/<단지>.json  (등급 A·B 단지만)

등급: 건축HUB 아파트 동 3개 이상 + 윤곽과 짝지은 비율 85% 이상 = A, 2개 이상 + 60% 이상 = B, 그 외 C, 건축HUB에 아파트 없음 D.
높이 우선순위: 건축HUB 높이 > 브이월드 높이 > 층수 x 층고(추정). 층고는 이 단지 실측 중간값.
"""
from __future__ import annotations

import json
import math
import re
import statistics
import sys
from pathlib import Path

NUM = lambda s: re.sub(r"\D", "", s or "")
NEAR_MIN_H = 9.0      # m, 3층 정도부터
NEAR_KEEP_M = 200.0   # 내 동에서 이 거리 안의 이웃 건물만


def _int(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return 0


def _flt(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def mdeg(lat):
    p = math.radians(lat)
    return 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p), 111132.954 - 559.822 * math.cos(2 * p) + 1.175 * math.cos(4 * p)


def ring_area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2


def rdp_closed(pts, eps=0.6):
    """닫힌 고리 단순화 (가장 먼 두 점으로 나눠 각각)."""
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    n = len(pts)
    if n < 5:
        return pts
    far = max(range(n), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)

    def line(path):
        if len(path) < 3:
            return path[:-1]
        a, b = path[0], path[-1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        best, bi = -1, 0
        for i in range(1, len(path) - 1):
            d = abs(dx * (a[1] - path[i][1]) - (a[0] - path[i][0]) * dy) / L if L > 1e-9 else math.hypot(path[i][0] - a[0], path[i][1] - a[1])
            if d > best:
                best, bi = d, i
        if best > eps:
            return line(path[:bi + 1]) + line(path[bi:])
        return [a]

    out = line(pts[:far + 1]) + line(pts[far:] + [pts[0]])
    return out if len(out) >= 3 else pts


def min_rect(pts):
    P = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    if len(P) < 3:
        return None
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0:
            up.pop()
        up.append(q)
    H = lo[:-1] + up[:-1]
    best = None
    for i in range(len(H)):
        a, b = H[i], H[(i + 1) % len(H)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6:
            continue
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        vx, vy = -uy, ux
        us = [q[0] * ux + q[1] * uy for q in H]
        vs = [q[0] * vx + q[1] * vy for q in H]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        area = (u1 - u0) * (v1 - v0)
        if best is None or area < best[0]:
            best = (area, ux, uy, vx, vy, u0, u1, v0, v1)
    if not best:
        return None
    _, ux, uy, vx, vy, u0, u1, v0, v1 = best
    return [[round(u * ux + v * vx, 1), round(u * uy + v * vy, 1)] for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]


def match(v, p, rows):
    """윤곽(브이월드)과 건축HUB 아파트 동을 짝짓기. 반환: apt 줄, 윤곽 목록, [(윤곽 번호, apt 번호)]"""
    apt = [r for r in rows if re.search(r"공동주택|아파트", r["use"]) and _int(r["f"]) >= 3 and r.get("gb", "") != "총괄표제부"]
    idx = [i for i in p.get("idx", []) if _int(v["b"][i]["f"]) >= 3]
    kx, ky = mdeg(v["la"])
    pairs = []
    for bi, i in enumerate(idx):
        b = v["b"][i]
        pm = [((x - v["ln"]) * kx, (y - v["la"]) * ky) for x, y in b["p"]]
        fp = ring_area(pm)
        for ri, r in enumerate(apt):
            sc = 0
            if NUM(b["dn"]) and NUM(b["dn"]) == NUM(r["dong"]):
                sc += 100
            elif NUM(b["dn"]) and NUM(r["dong"]):
                continue
            if _int(b["f"]) != _int(r["f"]):
                continue
            sc += 30
            if b["u"] and r["apr"] and b["u"] == r["apr"]:
                sc += 20
            elif b["u"] and r["apr"]:
                sc -= 10
            ar = _flt(r["area"]) / max(1, _int(r["f"]))
            if ar > 0 and fp > 0:
                e = abs(fp - ar) / max(fp, ar)
                sc += 25 if e < 0.12 else (10 if e < 0.3 else -15)
            pairs.append((sc, bi, ri))
    pairs.sort(reverse=True)
    ub, ur, got = set(), set(), []
    for sc, bi, ri in pairs:
        if bi in ub or ri in ur or sc < 45:
            continue
        ub.add(bi)
        ur.add(ri)
        got.append((idx[bi], ri))
    return apt, idx, got


def grade(n_apt, n_vw, matched):
    if n_apt == 0:
        return "D"
    cov = matched / n_apt
    if n_apt >= 3 and cov >= 0.85 and matched >= n_vw * 0.85:
        return "A"
    if n_apt >= 2 and cov >= 0.6:
        return "B"
    return "C"


def build_one(sid, v, p, rows, name_info):
    apt, idx, got = match(v, p, rows)
    g = grade(len(apt), len(idx), len(got))
    if g not in ("A", "B"):
        return g, None
    kx, ky = mdeg(v["la"])
    mget = {bi: ri for bi, ri in got}
    # 층고: 짝지은 동 중 실제 높이가 있는 5층 이상의 높이/층수 중앙값
    ratios = []
    for bi, ri in got:
        h, f = _flt(apt[ri]["h"]), _int(apt[ri]["f"])
        if h > 0 and f >= 5:
            ratios.append(h / f)
    fh = round(statistics.median(ratios), 2) if len(ratios) >= 3 else 2.92
    out = []
    for i, b in enumerate(v["b"]):
        pm = [((x - v["ln"]) * kx, (y - v["la"]) * ky) for x, y in b["p"]]
        f = _int(b["f"])
        r = apt[mget[i]] if i in mget else None
        if r:
            f = _int(r["f"])
            h, src = (_flt(r["h"]), "hub") if _flt(r["h"]) > 0 else ((_flt(b["h"]), "vworld") if _flt(b["h"]) > 0 else (round(f * fh, 2), "est"))
            k, dn = "own", r["dong"]
        else:
            if f < 2 and _flt(b["h"]) < 6:
                continue
            h, src = (_flt(b["h"]), "vworld") if _flt(b["h"]) > 0 else ((round(f * fh, 2), "est") if f >= 2 else (0, "none"))
            if src == "none" or h < 6:
                continue
            k, dn = "near", b["dn"]
        if k == "near" and h < NEAR_MIN_H:
            continue                      # 그림자가 멀리 가지 못하는 낮은 건물은 담지 않음
        simp = [[round(x, 1), round(y, 1)] for x, y in rdp_closed(pm, 0.8 if k == "near" else 0.5)]
        if len(simp) < 3:
            continue
        d = {"k": k, "dn": dn, "f": f, "h": round(h, 1), "s": src, "p": simp}
        if k == "own":
            d["r"] = min_rect(simp)       # 내 동의 남쪽 면 기준(직사각형)
        out.append(d)
    # 이웃 건물은 내 동들에서 NEAR_KEEP_M 안에 있는 것만
    owns = [b for b in out if b["k"] == "own"]
    cen = lambda b: (sum(x for x, _ in b["p"]) / len(b["p"]), sum(y for _, y in b["p"]) / len(b["p"]))
    oc = [cen(b) for b in owns]
    out = [b for b in out if b["k"] == "own" or any(math.hypot(cen(b)[0] - x, cen(b)[1] - y) <= NEAR_KEEP_M for x, y in oc)]
    own = [b for b in out if b["k"] == "own"]
    if len(own) < 2:
        return "C", None
    own.sort(key=lambda b: (int(NUM(b["dn"]) or 0), b["dn"]))
    near = [b for b in out if b["k"] != "own"]
    srcs = {s: sum(1 for b in out if b["s"] == s) for s in ("hub", "vworld", "est")}
    return g, {"m": {"id": sid, "lat": v["la"], "lon": v["ln"], "fh": fh, "g": g, "n_own": len(own), "n_apt": len(apt), "src": srcs,
                     "name": name_info.get("n", ""), "gu": name_info.get("gu", ""), "dong": name_info.get("d", "")},
               "b": own + near}


def main(src: Path, out: Path, comp_dir: Path | None = None):
    hub = json.loads((src / "hub.json").read_text(encoding="utf-8"))
    names = {}
    for rg in ("daejeon", "sejong", "cheongju"):
        f = (comp_dir or src) / f"{rg}_complexes.json"
        if f.exists():
            for c in json.loads(f.read_text(encoding="utf-8"))["complexes"]:
                names[c["s"]] = c
    stat = {"A": 0, "B": 0, "C": 0, "D": 0}
    total = 0
    for rg in ("daejeon", "sejong", "cheongju"):
        lay = json.loads((src / "layout" / f"{rg}.json").read_text(encoding="utf-8"))
        d = out / rg
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.json"):
            old.unlink()
        for sid, v in lay.items():
            if "b" not in v or not v.get("pnu"):
                continue
            rows = hub.get(v["pnu"], [])
            par = {"idx": [i for i, b in enumerate(v["b"]) if b.get("in")]}
            g, doc = build_one(sid, v, par, rows, names.get(sid, {}))
            stat[g] += 1
            if doc:
                p = d / f"{sid}.json"
                p.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                total += p.stat().st_size
    print(stat, "파일 합계 %.1f MB" % (total / 1e6))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]) if len(sys.argv) > 3 else None)
