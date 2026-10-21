"""지표표를 정적 HTML 사이트로 내보냅니다 (메인, 단지별 페이지, 산출 방법)."""
from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import charts
from .charts import eok, grade, nan as _nan
from .config import ROOT


def slug(complex_id: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]+", complex_id):
        return complex_id
    return hashlib.sha1(complex_id.encode("utf-8")).hexdigest()[:12]


def fmt_price(manwon) -> str:
    """만원 단위 가격을 '3.42억' / '8,500만' 으로."""
    return eok(manwon, 2)


def fmt_pct(x, signed: bool = True) -> str:
    if _nan(x):
        return "-"
    return f"{x * 100:+.1f}%" if signed else f"{x * 100:.1f}%"


def fmt_score(x) -> str:
    return "-" if _nan(x) else f"{x:.0f}"


def fmt_raw(v, factor: dict) -> str:
    """입지 원래 값: 거리는 m/km, 개수는 '곳'."""
    if factor["kind"] == "nearest":
        if _nan(v):
            return f"반경 {factor['radius'] / 1000:g}km 안에 없음"
        return f"{v:.0f}m" if v < 1000 else f"{v / 1000:.1f}km"
    return "-" if _nan(v) else f"{int(v)}곳"


def svg_chart(points, width: int = 640, height: int = 220) -> str:
    """예전 단순 그래프 호환용: 비교선 없는 연도별 가격."""
    return charts.line_compare(points, [], "이 단지", "", width, height)


def _top_share(series: pd.Series) -> pd.Series:
    """값이 클수록 상위. 반환: '상위 x%' 의 x (1~100)."""
    valid = series.dropna()
    rank = valid.rank(ascending=False, method="min")
    out = pd.Series(index=series.index, dtype=float)
    out[valid.index] = (rank / len(valid) * 100).clip(lower=1)
    return out


def _env() -> Environment:
    env = Environment(loader=FileSystemLoader(ROOT / "templates"),
                      autoescape=select_autoescape(["html"]))
    env.filters.update(price=fmt_price, pct=fmt_pct, score=fmt_score, eok=eok)
    env.tests["nan"] = _nan
    return env


def _summary(c: dict, n: int, gu_med: dict, factors: list[dict], years: list[int],
             real: bool, region: str) -> list[str]:
    """단지 페이지 맨 위 '한눈에 보기' 문장들."""
    out = []
    if not _nan(c["index"]):
        g, gname = grade(c["index"])
        if c.get("rank"):
            out.append(f"종합 지수 {c['index']:.0f}점, {region} {n}개 단지 중 {c['rank']}위로 상위 {c['index_top']:.0f}%입니다 ({g}등급 {gname}).")
        else:
            out.append(f"종합 지수 {c['index']:.0f}점입니다. 거래가 적은 소규모 단지라 순위와 TOP 목록에서는 뺐습니다.")
    if not _nan(c.get("last_price")):
        kind = "" if c.get("last_kind") == "매매" else f" {c['last_kind']}"
        high = " 같은 면적 기준 신고가입니다." if c.get("new_high") else ""
        out.append(f"가장 최근 거래는 {c['last_date']:%Y.%m.%d} 전용 {c['last_area']:.0f}㎡{kind} {eok(c['last_price'], 2)}입니다.{high}")
    if not _nan(c.get("location_top")):
        best = max(factors, key=lambda f: -1 if _nan(c.get(f["key"] + "_pct")) else c[f["key"] + "_pct"])
        out.append(f"입지점수는 {region} 상위 {c['location_top']:.0f}%이고, 가장 강한 항목은 {best['label']}입니다.")
    for n_y in years:
        v = c.get(f"cagr_{n_y}y")
        if not _nan(v):
            kind = "실질" if real else "명목"
            word = "올랐습니다" if v > 0 else "내렸습니다"
            out.append(f"최근 {n_y}년 동안 {kind} 기준 연평균 {abs(v) * 100:.1f}%씩 {word}.")
            break
    med = gu_med.get(c["gu"])
    if not _nan(c.get("price_ref")) and med:
        diff = c["price_ref"] / med - 1
        if abs(diff) < 0.03:
            out.append(f"84㎡ 환산가는 {c['gu']} 중위가와 거의 같습니다.")
        else:
            out.append(f"84㎡ 환산가는 {c['gu']} 중위가보다 {abs(diff) * 100:.0f}% {'비쌉' if diff > 0 else '저렴합'}니다."
                       )
    return out


def build(table: pd.DataFrame, hist: pd.DataFrame, trades: pd.DataFrame, meta: dict,
          cfg, out_dir: Path, demo: bool = False, kakao_js_key: str | None = None,
          geo: dict | None = None) -> int:
    env = _env()
    out_dir = Path(out_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    (out_dir / "apt").mkdir(parents=True)
    shutil.copytree(ROOT / "static", out_dir / "static")

    ref = cfg.metrics["reference_area"]
    years = cfg.metrics["cagr_years"]
    factors = cfg.location_factors
    geo = geo or {}
    table = table.copy()
    if "small" not in table:
        table["small"] = False
    main_t = table[~table["small"].astype(bool)]
    table["index_top"] = _top_share(main_t["index"]).reindex(table.index)
    table["location_top"] = _top_share(main_t["location_score"]).reindex(table.index)
    n_total = len(main_t)
    table = add_game_stats(table, trades, meta)
    main_t = table[~table["small"].astype(bool)]

    rows = []
    for cid, r in table.iterrows():
        d = r.to_dict()
        d["complex_id"], d["slug"] = cid, slug(cid)
        # 결측이 섞이면 pandas가 정수 열을 float로 바꾸므로 표시용으로 되돌립니다.
        d["build_year"] = None if _nan(d.get("build_year")) else int(d["build_year"])
        d["grade"], d["grade_name"] = grade(d.get("index"))
        d["rank"] = None if _nan(d.get("rank")) else int(d["rank"])
        asof_year = int(meta["asof"][:4])
        d["is_new"] = bool((not _nan(d.get("build_year")) and d.get("build_year") and d["build_year"] >= asof_year - 5)
                           or "분양권" in str(d.get("price_basis") or ""))
        d["small"] = bool(d.get("small"))
        d["new_high"] = bool(d.get("new_high")) if not _nan(d.get("new_high")) else False
        d["new_high_recent"] = bool(d.get("new_high_recent")) if not _nan(d.get("new_high_recent")) else False
        ll = geo.get(cid)
        d["lat"], d["lng"] = (ll[0], ll[1]) if ll else (None, None)
        rows.append(d)

    # 구별 통계
    gus = list(cfg.districts.values())
    gu_stats = []
    for gu in gus:
        sub = main_t[main_t["gu"] == gu]
        if sub.empty:
            continue
        best = sub["index"].idxmax() if sub["index"].notna().any() else None
        gu_stats.append({"gu": gu, "n": len(sub), "price": sub["price_ref"].median(),
                         "index": sub["index"].median(),
                         "location": sub["location_score"].median(),
                         "growth": sub["stat_growth"].median() if "stat_growth" in sub else float("nan"),
                         "highs": int(sub.get("new_high_recent", pd.Series(dtype=bool)).fillna(False).astype(bool).sum()),
                         "best_name": sub.loc[best, "name"] if best is not None else None,
                         "best_slug": slug(best) if best is not None else None})
    gu_med = {g["gu"]: g["price"] for g in gu_stats if not _nan(g["price"])}

    # TOP 목록
    by_id = {r["complex_id"]: r for r in rows}

    def top(df, col, k=5):
        return [by_id[cid] for cid in df.nlargest(k, col).index]

    has_loc = main_t["location_score"].notna().any()
    priced = main_t.dropna(subset=["price_ref"])
    value_picks = []
    if has_loc and not priced.empty:
        cand = priced[(priced["location_score"] > priced["location_score"].median())
                      & (priced["price_ref"] < priced["price_ref"].median())]
        value_picks = top(cand.assign(v=cand["location_score"] - cand["price_ref"].rank(pct=True) * 100), "v")
    highs = []
    if "new_high_recent" in main_t:
        hr = main_t[main_t["new_high_recent"].fillna(False).astype(bool)].sort_values("last_date", ascending=False)
        highs = [by_id[cid] for cid in hr.index[:5]]
    tops = [
        {"title": "종합 지수 상위 5곳", "items": top(main_t.dropna(subset=["index"]), "index"),
         "value": lambda r: f"{r['index']:.0f}점"},
        {"title": f"{years[0]}년 수익률 상위 5곳", "items": top(main_t.dropna(subset=[f"cagr_{years[0]}y"]), f"cagr_{years[0]}y"),
         "value": lambda r, k=f"cagr_{years[0]}y": fmt_pct(r[k])},
    ]
    dips = [by_id[cid] for cid in main_t[main_t.get("from_peak", pd.Series(dtype=float)) <= -0.10]
            .sort_values("from_peak").index[:5]] if "from_peak" in main_t else []
    if dips:
        tops.append({"title": "전고점 대비 많이 내린 단지", "items": dips,
                     "value": lambda r: f"{r['from_peak'] * 100:.0f}% · {int(r['peak_year'])}년 고점"})
    news = sorted([r for r in rows if not r["small"] and r["is_new"] and not _nan(r.get("location_score"))],
                  key=lambda r: -r["location_score"])[:5]
    if news:
        tops.append({"title": "신축·분양권 단지 입지 순위", "items": news,
                     "value": lambda r: f"입지 {r['location_score']:.0f}" + (f" · {r['build_year']}년" if r.get("build_year") else "")})
    if highs:
        tops.insert(0, {"title": "최근 신고가", "items": highs,
                        "value": lambda r: f"{eok(r['last_price'])} · {r['last_area']:.0f}㎡ · {r['last_date']:%m.%d}"})
    if value_picks:
        tops.append({"title": "입지 대비 저렴한 5곳", "items": value_picks,
                     "value": lambda r: f"입지 {r['location_score']:.0f} · {eok(r['price_ref'])}"})

    link = "apt/{}.html"
    index_charts = {
        "map": charts.responsive(charts.dot_map, [dict(r, href=link.format(r["slug"])) for r in rows if not r["small"]],
                                mob={"width": 360, "max_height": 440}) if geo else "",
        "gu_price": charts.hbar([(g["gu"], g["price"], eok(g["price"])) for g in gu_stats],
                                unit_tip=" (84㎡ 환산 중위)"),
        "gu_index": charts.hbar([(g["gu"], g["index"], f"{g['index']:.0f}점") for g in gu_stats
                                 if not _nan(g["index"])], vmax=100, unit_tip=" (지수 중위)"),
        "scatter": charts.responsive(charts.value_scatter, [dict(r, x=r["location_score"], y=r["price_ref"],
                                    href=link.format(r["slug"])) for r in rows if not r["small"]],
                                    mob={"width": 360, "height": 320}) if has_loc else "",
        "hist": charts.responsive(charts.histogram, list(main_t["index"]), mob={"width": 360}),
    }
    # 지도, 검색, 대결, 게임, 맞춤 찾기가 함께 쓰는 단지 데이터 (소규모 제외).
    # 페이지에 넣지 않고 따로 받아 첫 화면을 가볍게 합니다.
    write_complexes(out_dir, [r for r in rows if not r["small"]], factors)
    common = dict(meta=meta, region=cfg.region_name, demo=demo, ref_area=int(ref),
                  window=cfg.metrics["window_months"], years=years, factors=factors, gus=gus,
                  grades=charts.GRADES, grade_legend=charts.grade_legend(), site=cfg.site, stats=STATS)

    (out_dir / "index.html").write_text(env.get_template("index.html").render(
        rows=rows, root="", page_path="", charts=index_charts, tops=tops, gu_stats=gu_stats,
        kakao_js_key=kakao_js_key, **common), encoding="utf-8")
    (out_dir / "methodology.html").write_text(
        env.get_template("methodology.html").render(root="", page_path="methodology.html", cfg=cfg, **common), encoding="utf-8")
    import json as _json
    finder_cfg = _json.dumps(cfg.raw.get("finder", {}), ensure_ascii=False)
    for name in APP_PAGES:
        (out_dir / f"{name}.html").write_text(
            env.get_template(f"{name}.html").render(root="", page_path=f"{name}.html", finder_cfg=finder_cfg,
                                                       finder=cfg.raw.get("finder", {}), **common),
            encoding="utf-8")
    (out_dir / "stations.html").write_text(env.get_template("stations.html").render(
        root="", page_path="stations.html", stations=station_groups(rows), radius=STATION_RADIUS, **common), encoding="utf-8")

    # 단지 페이지
    trades = trades.copy()
    trades["date"] = pd.to_datetime(trades["date"])
    by_cid = dict(tuple(trades.sort_values("date", ascending=False).groupby("complex_id")))
    hist_by = dict(tuple(hist.groupby("complex_id")))
    region_line = [(y, v * ref) for y, v in meta.get("region_history", [])]
    factor_med = {f["key"]: table[f["key"] + "_pct"].median() if f["key"] + "_pct" in table else float("nan")
                  for f in factors}
    index_values = list(main_t["index"])
    by_dong: dict[tuple, list] = {}
    for r in rows:
        by_dong.setdefault((r["gu"], r["dong"]), []).append(r)
    tpl = env.get_template("apt.html")
    for c in rows:
        cid = c["complex_id"]
        h = hist_by.get(cid)
        main = [] if h is None else [(int(y), float(p) * ref) for y, p in zip(h["year"], h["ppm2"])]
        tr = by_cid.get(cid)
        tr_list = [] if tr is None else tr.to_dict("records")
        cutoff = pd.Timestamp(meta["asof"].replace(".", "-") + "-01") - pd.DateOffset(years=10)
        has_loc_c = not _nan(c.get("location_score"))
        comps = [("입지점수", c.get("location_score"), f"{fmt_score(c.get('location_score'))}점")]
        comps += [(f"{n}년 수익률 백분위", c.get(f"cagr_{n}y_pct"), fmt_score(c.get(f"cagr_{n}y_pct"))) for n in years]
        c_charts = {
            "gauge": charts.gauge(c.get("index")),
            "components": charts.responsive(charts.hbar, [(k, v, s) for k, v, s in comps], vmax=100,
                                            marker=50, marker_label="대전 중간(50)",
                                            desk={"width": 520}, mob={"width": 340}),
            "price": charts.responsive(charts.line_compare, main, region_line, "이 단지", f"{cfg.region_name} 중위",
                                       mob={"width": 360, "height": 240}),
            "trades": charts.responsive(charts.trade_dots, [t for t in tr_list if t["date"] >= cutoff],
                                        mob={"width": 360, "height": 240}),
            "radar": charts.radar([(f["label"].replace("까지 거리", "").replace("반경 1km ", ""),
                                    c.get(f["key"] + "_pct"), factor_med[f["key"]]) for f in factors]) if has_loc_c else "",
            "hist": charts.responsive(charts.histogram, index_values, highlight=c.get("index"), height=180,
                                      mob={"width": 360}),
        }
        loc_rows = [{"label": f["label"], "pct": c.get(f["key"] + "_pct"),
                     "raw": fmt_raw(c.get(f["key"] + "_raw"), f) if f["key"] + "_raw" in c else None}
                    for f in factors]
        neighbors = [r for r in by_dong.get((c["gu"], c["dong"]), []) if r["complex_id"] != cid and not r["small"]][:6]
        html = tpl.render(
            c=c, charts=c_charts, recent=tr_list[:15], root="../", page_path=f"apt/{c['slug']}.html",
            latlng=geo.get(cid),
            kakao_js_key=kakao_js_key, loc_rows=loc_rows, neighbors=neighbors,
            summary=_summary(c, n_total, gu_med, factors, years, meta.get("real_returns"), cfg.region_name),
            n_total=n_total, **common)
        (out_dir / "apt" / f"{c['slug']}.html").write_text(html, encoding="utf-8")
    write_sitemap(out_dir, cfg.site.get("base_url", ""),
                  [f"{n}.html" for n in APP_PAGES + ["stations"]] + [f"apt/{r['slug']}.html" for r in rows])
    return len(rows)


APP_PAGES = ["compare", "finder", "my"]
STATION_RADIUS = 700  # 역세권으로 보는 거리(m)


def station_name(raw) -> str | None:
    """카카오 장소 이름 '정부청사역 대전1호선' → '정부청사역'."""
    if raw is None or (isinstance(raw, float) and raw != raw) or not str(raw).strip():
        return None
    return str(raw).split()[0]

# 단지 카드의 다섯 항목 점수: (열 이름, 표시 이름, 설명)
STATS = [
    ("location_score", "입지", "역·학교·학원·마트·병원 접근성"),
    ("stat_growth", "성장성", "10년 수익률 백분위 (없으면 5년)"),
    ("stat_momentum", "상승세", "최근 5년 수익률 백분위"),
    ("stat_value", "가성비", "입지에 비해 가격이 얼마나 낮은지"),
    ("stat_activity", "거래량", "최근 3년 거래가 얼마나 활발한지"),
]


def add_game_stats(table: pd.DataFrame, trades: pd.DataFrame, meta: dict) -> pd.DataFrame:
    """단지 카드용 0~100 항목 점수. 모두 소규모를 뺀 단지 분포 기준 백분위입니다."""
    from .location import percentile

    t = table.copy()
    main = t.index[~t["small"].astype(bool)]
    tr = trades.copy()
    tr["date"] = pd.to_datetime(tr["date"])
    asof = pd.Timestamp(meta["asof"].replace(".", "-") + "-01") + pd.offsets.MonthEnd(0)
    recent = tr[(tr["date"] > asof - pd.DateOffset(years=3)) & ~tr["cancelled"].astype(bool)]
    act = recent.groupby("complex_id").size().reindex(t.index).fillna(0)
    t["stat_activity"] = percentile(act, ref=main)
    y10 = next((c for c in t.columns if c.startswith("cagr_10y_pct")), None)
    y5 = next((c for c in t.columns if c.startswith("cagr_5y_pct")), None)
    t["stat_growth"] = (t[y10] if y10 else pd.Series(float("nan"), index=t.index))
    if y5:
        t["stat_growth"] = t["stat_growth"].fillna(t[y5])
        t["stat_momentum"] = t[y5]
    else:
        t["stat_momentum"] = float("nan")
    price_pct = percentile(t["price_ref"], ref=main)
    t["stat_value"] = percentile(t["location_score"] - price_pct, ref=main)
    return t


def station_groups(rows: list[dict]) -> list[dict]:
    """역세권(700m 안) 단지를 가장 가까운 역별로 묶고, 단지가 많은 역부터."""
    groups: dict[str, list] = {}
    for r in rows:
        name = station_name(r.get("subway_name_raw"))
        dist = r.get("subway_raw")
        if r["small"] or not name or _nan(dist) or dist is None or dist > STATION_RADIUS:
            continue
        groups.setdefault(name, []).append(r)
    out = []
    for name, items in groups.items():
        items.sort(key=lambda r: -(r.get("index") if not _nan(r.get("index")) else -1))
        prices = [r["price_ref"] for r in items if not _nan(r.get("price_ref"))]
        idx = [r["index"] for r in items if not _nan(r.get("index"))]
        out.append({"name": name, "items": items, "n": len(items),
                    "price": float(pd.Series(prices).median()) if prices else float("nan"),
                    "index": float(pd.Series(idx).median()) if idx else float("nan")})
    return sorted(out, key=lambda g: (-g["n"], g["name"]))


def _r(x, nd=0):
    return None if _nan(x) else (round(float(x)) if nd == 0 else round(float(x), nd))


def write_complexes(out_dir: Path, rows: list[dict], factors: list[dict]) -> None:
    import json
    data = []
    for r in rows:
        data.append({
            "s": r["slug"], "n": r["name"], "gu": r["gu"], "d": r["dong"],
            "i": _r(r.get("index")), "g": r["grade"], "rk": r.get("rank"),
            "p": _r(r.get("price_ref")), "pt": eok(r.get("price_ref")) if not _nan(r.get("price_ref")) else None,
            "st": [_r(r.get(k)) for k, _, _ in STATS],
            "c10": _r(r.get("cagr_10y") * 100, 1) if not _nan(r.get("cagr_10y")) else None,
            "c5": _r(r.get("cagr_5y") * 100, 1) if not _nan(r.get("cagr_5y")) else None,
            "f": {f["key"]: _r(r.get(f["key"] + "_raw")) for f in factors},
            "y": r.get("build_year"), "la": _r(r.get("lat"), 6), "ln": _r(r.get("lng"), 6),
            "h": bool(r.get("new_high_recent")),
            "dd": _r(r.get("from_peak") * 100, 1) if not _nan(r.get("from_peak")) else None,
            "py": _r(r.get("peak_year")),
            "stn": station_name(r.get("subway_name_raw")),
            "nw": bool(r.get("is_new")),
            "lp": eok(r.get("last_price"), 2) if not _nan(r.get("last_price")) else None,
            "ld": r["last_date"].strftime("%Y.%m.%d") if not _nan(r.get("last_date")) and r.get("last_date") is not None else None,
        })
    meta = {"stats": [{"k": k, "n": n, "desc": d} for k, n, d in STATS], "complexes": data}
    (out_dir / "complexes.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_sitemap(out_dir: Path, base: str, apt_paths: list[str]) -> None:
    """검색엔진 제출용 sitemap.xml 과 robots.txt."""
    if not base:
        return
    from datetime import date
    from xml.sax.saxutils import escape as xml_escape

    today = date.today().isoformat()
    entries = [("", "1.0"), ("methodology.html", "0.3")] + [(p, "0.5" if "/" not in p else "0.7") for p in apt_paths]
    urls = "".join(
        f"<url><loc>{xml_escape(base + path)}</loc><lastmod>{today}</lastmod><priority>{pri}</priority></url>\n"
        for path, pri in entries)
    (out_dir / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n",
        encoding="utf-8")
    (out_dir / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n", encoding="utf-8")
