"""지표표를 정적 HTML 사이트로 내보냅니다 (메인, 단지별 페이지, 산출 방법)."""
from __future__ import annotations

import hashlib
import math
import re
import shutil
from pathlib import Path

import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import charts, trends
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


def fmt_raw(v, factor: dict, c: dict | None = None) -> str:
    """입지 원래 값: 거리는 m/km, 개수는 '곳', 학원가는 '둔산 학원가 15분'."""
    if factor["kind"] == "value":
        names = (c or {}).get(factor["key"] + "_names_raw")
        return names if isinstance(names, str) and names else ("-" if _nan(v) else f"{v:+.1f}%")
    if factor["kind"] == "score":
        name, mins = (c or {}).get(factor["key"] + "_name_raw"), (c or {}).get(factor["key"] + "_min_raw")
        return "-" if not name or _nan(mins) else f"{name} {int(mins)}분"
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
    charts.REGION = cfg.region_name
    out_dir = Path(out_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    (out_dir / "apt").mkdir(parents=True)
    shutil.copytree(ROOT / "static", out_dir / "static")
    # 정적 파일이 바뀌면 주소 뒤 ?v= 값이 바뀌어 브라우저가 예전 CSS·JS를 쓰지 않습니다.
    h = hashlib.sha1()
    for f in sorted((ROOT / "static").rglob("*")):
        if f.is_file():
            h.update(f.read_bytes())
    env.globals["v"] = h.hexdigest()[:8]

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
        d["small_reason"] = (d.get("small_reason") or "소규모") if d["small"] else ""
        d["new_high"] = bool(d.get("new_high")) if not _nan(d.get("new_high")) else False
        d["new_high_recent"] = bool(d.get("new_high_recent")) if not _nan(d.get("new_high_recent")) else False
        ll = geo.get(cid)
        d["lat"], d["lng"] = (ll[0], ll[1]) if ll else (None, None)
        rows.append(d)

    # 구별 통계
    gus = list(cfg.districts.values())
    if cfg.raw["region"].get("group_by") == "dong":  # 구가 없는 지역: 단지가 많은 동부터
        gus = list(main_t["gu"].value_counts().index)
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
                         "c10": sub[f"cagr_{years[0]}y"].median() if f"cagr_{years[0]}y" in sub else float("nan"),
                         "highs": int(sub.get("new_high_recent", pd.Series(dtype=bool)).fillna(False).astype(bool).sum()),
                         "best_name": sub.loc[best, "name"] if best is not None else None,
                         "best_slug": slug(best) if best is not None else None})
    gu_med = {g["gu"]: g["price"] for g in gu_stats if not _nan(g["price"])}
    gu_boards = _gu_boards(gu_stats, main_t, years[0])

    # TOP 목록
    by_id = {r["complex_id"]: r for r in rows}

    def top(df, col, k=5):
        return [by_id[cid] for cid in df.nlargest(k, col).index]

    has_loc = main_t["location_score"].notna().any()
    priced = main_t.dropna(subset=["price_ref"])
    # 입지 대비 가격이 좋은 단지: 입지는 대전 중간 이상, 가격은 중간 이하. 입지 좋은 순.
    # 기준(중간값)은 아파트 단지로 잡고, 빌라형(소규모·원룸형)도 '빌라' 필터에서 볼 수 있게 함께 담습니다.
    value_list, value_ref = [], {}
    if has_loc and not priced.empty:
        loc_med, price_med = priced["location_score"].median(), priced["price_ref"].median()
        every = table.dropna(subset=["price_ref", "location_score"])
        cand = every[(every["location_score"] > loc_med) & (every["price_ref"] < price_med)]
        cand = cand.sort_values(["location_score", "price_ref"], ascending=[False, True])
        small = cand["small"].astype(bool)
        keep = set(cand[~small].index[:30]) | set(cand[small].index[:30])
        value_list = [by_id[cid] for cid in cand.index if cid in keep]
        value_ref = {"loc_med": loc_med, "price_med": price_med}
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

    link = "apt/{}.html"
    index_charts = {
        "map": charts.responsive(charts.dot_map, [dict(r, href=link.format(r["slug"])) for r in rows if not r["small"]],
                                mob={"width": 360, "max_height": 440}) if geo else "",
        "hist": charts.responsive(charts.histogram, list(main_t["index"]), mob={"width": 360}),
    }
    # 지도, 검색, 단지 비교, 조건으로 찾기, 카드 저장이 함께 쓰는 단지 데이터 (소규모 제외).
    # 페이지에 넣지 않고 따로 받아 첫 화면을 가볍게 합니다.
    write_complexes(out_dir, [r for r in rows if not r["small"]], factors,
                    {"asof": meta["asof"], "region": cfg.region_name, "url": cfg.site.get("base_url", "")})
    common = dict(meta=meta, region=cfg.region_name, demo=demo, ref_area=int(ref),
                  transit=_transit(cfg), regions=cfg.site.get("regions", []),
                  unit="동" if cfg.raw["region"].get("group_by") == "dong" else "구",
                  example_dong=cfg.raw["region"].get("example_dong", "둔산동"),
                  window=cfg.metrics["window_months"], years=years, factors=factors, gus=gus,
                  grades=charts.GRADES, grade_legend=charts.grade_legend(), site=cfg.site, stats=STATS)

    month = _month_view(trades, main_t, rows, by_id, meta, cfg)
    (out_dir / "index.html").write_text(env.get_template("index.html").render(
        rows=rows, root="", page_path="", charts=index_charts, tops=tops, gu_stats=gu_stats, gu_boards=gu_boards,
        value_list=value_list, value_ref=value_ref, board=month["board"], ticker=month["ticker"],
        kakao_js_key=kakao_js_key, **common), encoding="utf-8")
    (out_dir / "rank.html").write_text(env.get_template("rank.html").render(
        root="", page_path="rank.html", ranks=month["ranks"], **common), encoding="utf-8")
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
                                            marker=50, marker_label=f"{cfg.region_name} 중간(50)",
                                            desk={"width": 520}, mob={"width": 340}),
            "price": charts.responsive(charts.line_compare, main, region_line, "이 단지", f"{cfg.region_name} 중위",
                                       mob={"width": 360, "height": 240}),
            "trades": charts.responsive(charts.trade_dots, [t for t in tr_list if t["date"] >= cutoff],
                                        mob={"width": 360, "height": 240}),
            "radar": charts.radar([(f["label"].replace("까지 거리", "").replace("반경 1km ", "").replace("주요 ", "").replace(" 접근성", "").split(" (")[0],
                                    c.get(f["key"] + "_pct"), factor_med[f["key"]]) for f in factors]) if has_loc_c else "",
            "hist": charts.responsive(charts.histogram, index_values, highlight=c.get("index"), height=180,
                                      mob={"width": 360}),
        }
        loc_rows = [{"label": f["label"], "pct": c.get(f["key"] + "_pct"), "score": f["kind"] == "score",
                     "raw": fmt_raw(c.get(f["key"] + "_raw"), f, c) if f["key"] + "_raw" in c else None}
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
                  [f"{n}.html" for n in APP_PAGES + ["stations", "rank"]] + [f"apt/{r['slug']}.html" for r in rows],
                  [g.get("url", "") for g in cfg.site.get("regions", [])])
    return len(rows)


def _gu_boards(gu_stats: list[dict], main_t: pd.DataFrame, y: int) -> list[dict]:
    """구별 비교 보드: 항목마다 구를 높은 순으로 줄 세우고, 지역 전체 중간값과의 차이를 붙입니다."""
    def signed(v, fmt):
        return ("+" if v > 0 else "−" if v < 0 else "±") + fmt(abs(v))
    specs = [
        ("price", "집값", "84㎡ 환산 중위가", main_t["price_ref"].median(), eok,
         lambda d: signed(d, lambda x: f"{x / 10000:.1f}억" if x >= 1000 else f"{x:,.0f}만")),
        ("index", "종합 지수", "종합 지수 중위값", main_t["index"].median(), lambda v: f"{v:.0f}점",
         lambda d: signed(d, lambda x: f"{x:.0f}점")),
        ("c10", f"{y}년 수익률", f"{y}년 연평균 수익률 중위값",
         main_t[f"cagr_{y}y"].median() if f"cagr_{y}y" in main_t else float("nan"), fmt_pct,
         lambda d: signed(d * 100, lambda x: f"{x:.1f}%p")),
        ("location", "입지", "입지점수 중위값", main_t["location_score"].median(), lambda v: f"{v:.0f}점",
         lambda d: signed(d, lambda x: f"{x:.0f}점")),
    ]
    boards = []
    for key, tab, title, ref, fmt, dfmt in specs:
        items = [g for g in gu_stats if not _nan(g.get(key))]
        if not items:
            continue
        items.sort(key=lambda g: -g[key])
        lo = min(0.0, min(g[key] for g in items))
        span = (max(g[key] for g in items) - lo) or 1
        width = lambda v: max(2.0, (v - lo) / span * 100)
        boards.append({
            "key": key, "tab": tab, "title": title,
            "ref_text": "-" if _nan(ref) else fmt(ref),
            "ref_pos": None if _nan(ref) else round(min(100.0, width(ref)), 1),
            "rows": [{"gu": g["gu"], "n": g["n"], "text": fmt(g[key]), "w": round(width(g[key]), 1),
                      "diff": None if _nan(ref) else dfmt(g[key] - ref),
                      "up": None if _nan(ref) else g[key] > ref} for g in items],
        })
    return boards


def _transit(cfg) -> dict:
    """역세권 화면 문구: 대전은 지하철역, 세종은 BRT 정류장처럼 지역마다 다릅니다."""
    t = {"tab": "역세권", "stop": "지하철역", "short": "역"}
    t.update(cfg.site.get("transit", {}))
    return t


HEX = 34  # 시황 보드 육각 타일 반지름(px)


def _short_dong(name: str) -> str:
    """'가수원동' → '가수원', '목동' → '목동' (두 글자는 그대로)."""
    n = str(name)
    return n[:-1] if len(n) > 2 and n[-1] in "동가" else n


def _month_view(trades, main_t, rows, by_id, meta, cfg) -> dict:
    """이번 달 볼거리: 시황 보드(동별 육각 타일), 랭킹 다섯 가지, 화제의 단지 띠."""
    asof = pd.Timestamp(meta["asof"].replace(".", "-") + "-01") + pd.offsets.MonthEnd(0)
    sale = trends._sale(trades, cfg.filters, keep=main_t.index)
    chg = trends.recent_change(sale, asof)
    cnt = trends.recent_count(sale, asof)
    deals = trends.top_deals(sale, asof)

    def item(cid, value, sub="", tone=""):
        r = by_id[cid]
        return {"slug": r["slug"], "name": r["name"], "gu": r["gu"], "dong": r["dong"], "grade": r["grade"],
                "value": value, "sub": sub, "tone": tone}

    up = chg[chg > 0].sort_values(ascending=False).head(10)
    down = chg[chg < 0].sort_values().head(10)
    busy = cnt.sort_values(ascending=False).head(10)
    highs = main_t[main_t.get("new_high_recent", pd.Series(False, index=main_t.index)).fillna(False).astype(bool)]
    highs = highs.sort_values(["last_date", "last_price"], ascending=False).head(10) if not highs.empty else highs
    ranks = [
        {"key": "up", "tab": "많이 오른", "title": "1년 전보다 많이 오른 단지",
         "note": "최근 6개월 ㎡당 중위가를 1년 전 같은 6개월과 비교 (양쪽 모두 거래 3건 이상)",
         "items": [item(c, f"{v * 100:+.1f}%", f"{eok(main_t.at[c, 'price_ref'])} · 84㎡", "up") for c, v in up.items()]},
        {"key": "high", "tab": "신고가", "title": "최근 신고가 단지",
         "note": "마지막 거래가 같은 면적대 이전 최고가를 넘은 단지 (최근 90일)",
         "items": [item(c, eok(r["last_price"]), f"{r['last_area']:.0f}㎡ · {r['last_date']:%m.%d}", "up")
                   for c, r in highs.iterrows()]},
        {"key": "busy", "tab": "거래 활발", "title": "최근 3개월 거래가 많은 단지",
         "note": "최근 3개월 매매 신고 건수 (해제 거래 제외)",
         "items": [item(c, f"{int(v)}건", f"{eok(main_t.at[c, 'price_ref'])} · 84㎡") for c, v in busy.items()]},
        {"key": "deal", "tab": "최고가 거래", "title": "최근 3개월 가장 비싼 거래",
         "note": "단지마다 가장 비싼 한 건 (실거래 금액 그대로, 84㎡ 환산 아님)",
         "items": [item(r["complex_id"], eok(r["price"]), f"{r['area']:.0f}㎡ · {pd.Timestamp(r['date']):%m.%d}")
                   for _, r in deals.iterrows()]},
        {"key": "down", "tab": "많이 내린", "title": "1년 전보다 많이 내린 단지",
         "note": "최근 6개월 ㎡당 중위가를 1년 전 같은 6개월과 비교 (양쪽 모두 거래 3건 이상)",
         "items": [item(c, f"{v * 100:+.1f}%", f"{eok(main_t.at[c, 'price_ref'])} · 84㎡", "down") for c, v in down.items()]},
    ]
    ranks = [r for r in ranks if r["items"]]

    # 화제의 단지 띠: 신고가 · 많이 오른 · 거래 활발에서 겹치지 않게 골라 섞습니다.
    ticker, seen = [], set()
    pools = [("신고가", [(i, i["value"]) for i in next((r["items"] for r in ranks if r["key"] == "high"), [])[:5]]),
             ("상승", [(i, i["value"]) for i in next((r["items"] for r in ranks if r["key"] == "up"), [])[:4]]),
             ("거래", [(i, i["value"]) for i in next((r["items"] for r in ranks if r["key"] == "busy"), [])[:3]])]
    for k in range(5):
        for tag, pool in pools:
            if k < len(pool) and pool[k][0]["slug"] not in seen:
                seen.add(pool[k][0]["slug"])
                ticker.append(dict(pool[k][0], tag=tag))

    # 시황 보드: 동별 온도를 육각 타일로 (실제 위치에 가깝게)
    board = None
    heat = trends.dong_heat(sale, main_t, asof)
    pts = {}
    for r in rows:
        if not r["small"] and r.get("lat") and r.get("lng"):
            pts.setdefault((r["gu"], r["dong"]), []).append((r["lat"], r["lng"]))
    cent = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in pts.items() if k in heat.index}
    if len(cent) >= 5:
        cells = trends.hex_layout(cent)
        w3 = math.sqrt(3) * HEX
        xy = {k: (w3 * (q + r / 2), 1.5 * HEX * r) for k, (q, r) in cells.items()}
        x0 = min(v[0] for v in xy.values()) - w3 / 2 - 4
        y0 = min(v[1] for v in xy.values()) - HEX - 4
        best = main_t.dropna(subset=["index"]).sort_values("index", ascending=False).groupby(["gu", "dong"]).head(1)
        best = {(r["gu"], r["dong"]): cid for cid, r in best.iterrows()}
        price = main_t.groupby(["gu", "dong"])["price_ref"].median()
        corner = [(math.cos(math.radians(60 * i - 30)), math.sin(math.radians(60 * i - 30))) for i in range(6)]
        tiles = []
        mx, my = sum(v[0] for v in xy.values()) / len(xy), sum(v[1] for v in xy.values()) / len(xy)
        for k, (x, y) in xy.items():
            h = heat.loc[k]
            x, y = x - x0, y - y0
            b = best.get(k)
            tiles.append({
                "gu": k[0], "dong": k[1], "label": _short_dong(k[1]), "x": round(x, 1), "y": round(y, 1),
                "points": " ".join(f"{x + (HEX - 1.5) * cx:.1f},{y + (HEX - 1.5) * cy:.1f}" for cx, cy in corner),
                "band": int(h["band"]), "band_name": h["band_name"], "n": int(h["n"]),
                "chg": None if _nan(h["chg"]) else round(float(h["chg"]) * 100, 1),
                "last3": int(h["last3"]), "usual": round(float(h["prev_q"]), 1),
                "price": None if _nan(price.get(k)) else eok(price.get(k)),
                "best": by_id[b]["name"] if b else None, "best_slug": by_id[b]["slug"] if b else None,
                "best_grade": by_id[b]["grade"] if b else None,
                "ring": int(math.hypot(x + x0 - mx, y + y0 - my) / (w3 * 0.9)),
            })
        tiles.sort(key=lambda t: (t["y"], t["x"]))
        w = max(t["x"] for t in tiles) + w3 / 2 + 4
        hgt = max(t["y"] for t in tiles) + HEX + 4
        counts = {b: sum(1 for t in tiles if t["band"] == b) for b, _ in trends.BANDS + [trends.QUIET]}
        hot = max((t for t in tiles if t["band"]), key=lambda t: (t["band"], t["chg"] or -99), default=None)
        board = {"tiles": tiles, "w": round(w), "h": round(hgt),
                 "bands": [{"band": b, "name": n, "count": counts[b]} for b, n in trends.BANDS + [trends.QUIET]],
                 "start": f"{hot['gu']}|{hot['dong']}" if hot else None}
    return {"ranks": ranks, "ticker": ticker, "board": board}


APP_PAGES = ["compare", "finder", "my"]
STATION_RADIUS = 700  # 역세권으로 보는 거리(m)


def station_name(raw) -> str | None:
    """카카오 장소 이름 '정부청사역 대전1호선' → '정부청사역'."""
    if raw is None or (isinstance(raw, float) and raw != raw) or not str(raw).strip():
        return None
    return str(raw).split()[0]

# 단지 카드의 다섯 항목 점수: (열 이름, 표시 이름, 설명)
STATS = [
    ("location_score", "입지", "역·학원가·학교·마트·병원 접근성"),
    ("stat_growth", "성장성", "10년 수익률 백분위 (없으면 5년)"),
    ("stat_momentum", "상승세", "최근 5년 수익률 백분위"),
    ("stat_value", "가성비", "입지에 비해 가격이 얼마나 낮은지"),
    ("stat_activity", "거래량", "최근 3년 거래가 얼마나 활발한지"),
    ("stat_new", "신축도", "준공 1년차 100점, 30년 이상 0점 (분양권 100점)"),
]
NEW_SPAN = 30  # 신축도가 0점이 되는 연차


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
    # 신축도는 백분위가 아니라 연차 그대로: 지수에는 넣지 않고 카드에서 보여주기만 합니다.
    age = int(meta["asof"][:4]) - pd.to_numeric(t.get("build_year"), errors="coerce")
    t["stat_new"] = (100 - (age - 1).clip(lower=0) * 100 / (NEW_SPAN - 1)).clip(0, 100)
    if "price_basis" in t:
        presale = t["price_basis"].fillna("").astype(str).str.contains("분양권")
        t.loc[presale & t["stat_new"].isna(), "stat_new"] = 100.0
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


def write_complexes(out_dir: Path, rows: list[dict], factors: list[dict], info: dict | None = None) -> None:
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
            "hn": r.get("hub_name_raw") if isinstance(r.get("hub_name_raw"), str) else None,
            "hm": None if _nan(r.get("hub_min_raw")) else _r(r.get("hub_min_raw")),
            "nw": bool(r.get("is_new")),
            "lp": eok(r.get("last_price"), 2) if not _nan(r.get("last_price")) else None,
            "ld": r["last_date"].strftime("%Y.%m.%d") if not _nan(r.get("last_date")) and r.get("last_date") is not None else None,
        })
    meta = {"stats": [{"k": k, "n": n, "desc": d} for k, n, d in STATS], "complexes": data, **(info or {})}
    (out_dir / "complexes.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_sitemap(out_dir: Path, base: str, apt_paths: list[str], others: list[str] | None = None) -> None:
    """검색엔진 제출용 sitemap.xml 과 robots.txt. others: 다른 지역 사이트 주소 (robots 에 사이트맵 추가)."""
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
    maps = [base] + [u for u in (others or []) if u and u != base]
    (out_dir / "robots.txt").write_text("User-agent: *\nAllow: /\n" + "".join(f"Sitemap: {u}sitemap.xml\n" for u in maps),
                                        encoding="utf-8")
