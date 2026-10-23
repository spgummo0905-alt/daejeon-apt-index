"""지표표를 정적 HTML 사이트로 내보냅니다 (메인, 단지별 페이지, 산출 방법)."""
from __future__ import annotations

import hashlib
import math
import re
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import shapely
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

from . import charts, heatmap, pricechart, trends
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


def share(top) -> str:
    """'상위 몇 %'를 읽기 쉽게: 절반보다 아래면 '하위 8%'처럼 (상위 92% 대신)."""
    if top is None or _nan(top):
        return "-"
    top = float(top)
    return f"상위 {max(1, round(top))}%" if top <= 50 else f"하위 {max(1, round(100 - top))}%"


def pyeong(area) -> int | None:
    """전용면적(㎡)으로 어림한 공급 평형. 실거래 자료에는 공급면적이 없어 전용률로 거꾸로 셈합니다.
    전용률은 작은 집일수록 낮아(계단·복도 몫이 큼) 면적에 따라 0.74~0.79로 둡니다:
    39㎡ → 16평, 59㎡ → 24평, 74㎡ → 30평, 84㎡ → 34평, 101㎡ → 40평, 114㎡ → 45평."""
    if area is None or _nan(area) or float(area) <= 0:
        return None
    a = float(area)
    ratio = min(0.79, max(0.74, 0.73 + 0.0004 * a))
    return round(a / ratio / 3.3058)


def place(r) -> str:
    """'서구 둔산동'. 구가 없는 지역(세종)은 구 자리에 동이 들어 있어 한 번만: '도담동'."""
    return str(r["dong"]) if r["gu"] == r["dong"] else f"{r['gu']} {r['dong']}"


def area_name(name) -> Markup:
    """'조치원읍 죽림리' → 작은 '조치원읍' 위에 '죽림리' (카드 제목이 두 줄로 깨지지 않게)."""
    head, _, tail = str(name).partition(" ")
    if not tail:
        return Markup(escape(name))
    return Markup(f'<span class="area-sub">{escape(head)}</span>{escape(tail)}')


def _env() -> Environment:
    env = Environment(loader=FileSystemLoader(ROOT / "templates"),
                      autoescape=select_autoescape(["html"]))
    env.filters.update(price=fmt_price, pct=fmt_pct, score=fmt_score, eok=eok, place=place, area=area_name, share=share,
                       pyeong=pyeong)
    env.tests["nan"] = _nan
    return env


def _summary(c: dict, n: int, gu_med: dict, factors: list[dict], years: list[int],
             real: bool, region: str, leader: dict | None = None) -> list[str]:
    """단지 페이지 맨 위 '한눈에 보기' 문장들."""
    out = []
    if not _nan(c["index"]):
        g, gname = grade(c["index"])
        if c.get("rank"):
            out.append(f"종합 지수 {c['index']:.0f}점, {region} {n}개 단지 중 {c['rank']}위로 {share(c['index_top'])}입니다 ({g}등급 {gname}).")
        else:
            out.append(f"종합 지수 {c['index']:.0f}점입니다. 거래가 적은 소규모 단지라 순위와 TOP 목록에서는 뺐습니다.")
    if not _nan(c.get("last_price")):
        kind = "" if c.get("last_kind") == "매매" else f" {c['last_kind']}"
        high = " 같은 면적 기준 신고가입니다." if c.get("new_high") else ""
        py = pyeong(c["last_area"])
        out.append(f"가장 최근 거래는 {c['last_date']:%Y.%m.%d} 전용 {int(c['last_area'])}㎡{f'({py}평)' if py else ''}{kind} "
                   f"{eok(c['last_price'], 2)}입니다.{high}")
    if not _nan(c.get("location_top")):
        best = max(factors, key=lambda f: -1 if _nan(c.get(f["key"] + "_pct")) else c[f["key"] + "_pct"])
        out.append(f"입지점수는 {region} {share(c['location_top'])}이고, 가장 강한 항목은 {best['label']}입니다.")
        if not _nan(c.get("grp_edu_top")):
            out.append(f"학군(중학교 전입·학원가·주변 수학 학원)은 {region} {share(c['grp_edu_top'])}입니다.")
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
            out.append(f"84㎡ 환산가는 {c['gu']} 중간 가격과 거의 같습니다.")
        else:
            out.append(f"84㎡ 환산가는 {c['gu']} 중간 가격보다 {abs(diff) * 100:.0f}% {'비쌉' if diff > 0 else '저렴합'}니다."
                       )
    if leader and not c["small"] and not _nan(c.get("price_ref")):
        if leader["complex_id"] == c["complex_id"]:
            out.append(f"{c['gu']}에서 84㎡ 환산가가 가장 높은 대장 단지입니다.")
        else:
            gap = c["price_ref"] / leader["price"] - 1
            out.append(f"{c['gu']} 대장 단지 {leader['name']}({leader['price_text']})의 {(1 + gap) * 100:.0f}% 가격입니다.")
    return out


def build(table: pd.DataFrame, hist: pd.DataFrame, trades: pd.DataFrame, meta: dict,
          cfg, out_dir: Path, demo: bool = False, kakao_js_key: str | None = None,
          geo: dict | None = None, macro: dict | None = None) -> int:
    env = _env()
    charts.REGION = cfg.region_name
    # 사이트를 만든 날 (한국 시각). 실거래는 매일 새로 받아 반영합니다.
    meta.setdefault("updated", datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y.%m.%d"))
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
    # 입지 묶음(교통·학군·생활) 점수: 묶음 안 항목들의 가중평균. 입지점수 계산은 그대로입니다.
    loc_groups = _loc_groups(cfg, table)
    for g in loc_groups:
        table[f"grp_{g['key']}"] = _group_score(table, g["factors"])
    main_t = table[~table["small"].astype(bool)]
    for g in loc_groups:
        table[f"grp_{g['key']}_top"] = _top_share(main_t[f"grp_{g['key']}"]).reindex(table.index)
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
    area_groups = _area_groups(gus, main_t["gu"].value_counts().to_dict()) if len(gus) > 8 else None
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
                        "value": lambda r: f"{eok(r['last_price'])} · {int(r['last_area'])}㎡ · {r['last_date']:%m.%d}"})

    link = "apt/{}.html"
    index_charts = {
        "map": charts.responsive(charts.dot_map, [dict(r, href=link.format(r["slug"])) for r in rows if not r["small"]],
                                mob={"width": 360, "max_height": 440}) if geo else "",
        "hist": charts.responsive(charts.histogram, list(main_t["index"]), mob={"width": 360}),
    }
    # 지도, 검색, 단지 비교, 조건으로 찾기, 카드 저장이 함께 쓰는 단지 데이터 (소규모 제외).
    # 페이지에 넣지 않고 따로 받아 첫 화면을 가볍게 합니다.
    write_complexes(out_dir, [r for r in rows if not r["small"]], factors,
                    {"asof": meta["asof"], "updated": meta.get("updated"), "region": cfg.region_name,
                     "url": cfg.site.get("base_url", "")})
    common = dict(meta=meta, region=cfg.region_name, demo=demo, ref_area=int(ref),
                  transit=_transit(cfg), regions=cfg.site.get("regions", []),
                  unit="동" if cfg.raw["region"].get("group_by") == "dong" else "구",
                  example_dong=cfg.raw["region"].get("example_dong", "둔산동"),
                  window=cfg.metrics["window_months"], years=years, factors=factors, gus=gus, area_groups=area_groups,
                  grades=charts.GRADES, grade_legend=charts.grade_legend(), site=cfg.site, stats=STATS,
                  exclude_direct=bool(cfg.filters.get("exclude_direct", False)), loc_groups=loc_groups,
                  loc_weight=sum(f["weight"] for g in loc_groups for f in g["factors"]) or 1)

    month = _month_view(trades, main_t, rows, by_id, meta, cfg)
    leader_by_gu = {d["gu"]: d for d in month["leaders"]}
    themes = _themes(main_t, by_id, cfg, meta)
    (out_dir / "themes.html").write_text(env.get_template("themes.html").render(
        root="", page_path="themes.html", themes=themes, **common), encoding="utf-8")
    (out_dir / "index.html").write_text(env.get_template("index.html").render(
        rows=rows, root="", page_path="", charts=index_charts, tops=tops, gu_stats=gu_stats, gu_boards=gu_boards,
        value_list=value_list, value_ref=value_ref, board=month["board"], ticker=month["ticker"],
        leaders=month["leaders"], pulse=month["pulse"],
        hero_cards=sorted((r for r in rows if not r["small"] and r.get("rank")), key=lambda r: r["rank"])[:3],
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
    # 시세 차트: 지역·구 지수와 거래량(모든 단지가 함께 씀), 단지마다 평형별 추정 시세 (apt/d/)
    asof_ts = pd.Timestamp(meta["asof"].replace(".", "-") + "-01")
    asof_m = pricechart.month_no(asof_ts)
    exclude_direct = bool(cfg.filters.get("exclude_direct", False))
    (out_dir / "market.json").write_text(_json.dumps(
        pricechart.market_payload(trades, cfg.filters, asof_ts, cfg.region_name, macro or None),
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out_dir / "apt" / "d").mkdir()
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
        _mark_highs(tr_list, skip_direct=cfg.filters.get("exclude_direct", False))
        pc_data = pricechart.complex_payload(tr_list, _area_types(tr_list), asof_m, exclude_direct)
        if pc_data:
            (out_dir / "apt" / "d" / f"{c['slug']}.json").write_text(
                _json.dumps(pc_data, separators=(",", ":")), encoding="utf-8")
        # 카드에 내세우는 최근 거래는 지수 계산과 같은 기준 (해제·제외한 직거래는 목록에만)
        lead = next((t for t in tr_list if not t.get("cancelled") and not (t.get("direct") and cfg.filters.get("exclude_direct"))),
                    tr_list[0] if tr_list else None)
        has_loc_c = not _nan(c.get("location_score"))
        # 카드의 항목 이름(입지·성장성·상승세)과 같게
        comps = [("입지", c.get("location_score"), fmt_score(c.get("location_score")))]
        comps += [(f"{'성장성' if n == years[0] else '상승세'} · {n}년 수익률", c.get(f"cagr_{n}y_pct"),
                   fmt_score(c.get(f"cagr_{n}y_pct"))) for n in years]
        c_charts = {
            "components": charts.responsive(charts.hbar, [(k, v, s) for k, v, s in comps], vmax=100,
                                            marker=50, marker_label=f"{cfg.region_name} 중간(50)",
                                            desk={"width": 520}, mob={"width": 340}),
            "price": charts.responsive(charts.line_compare, main, region_line, "이 단지", f"{cfg.region_name} 중간값",
                                       mob={"width": 360, "height": 240}),
            "radar": charts.radar([(f.get("short") or f["label"], c.get(f["key"] + "_pct"), factor_med[f["key"]])
                                   for g in loc_groups for f in g["factors"]]) if has_loc_c else "",
            "hist": charts.responsive(charts.histogram, index_values, highlight=c.get("index"), height=180,
                                      mob={"width": 360}),
        }
        loc_sets = [{"key": g["key"], "label": g["label"], "score": c.get(f"grp_{g['key']}"), "top": c.get(f"grp_{g['key']}_top"),
                     "rows": [{"label": f["label"], "pct": c.get(f["key"] + "_pct"), "score": f["kind"] == "score",
                               "raw": fmt_raw(c.get(f["key"] + "_raw"), f, c) if f["key"] + "_raw" in c else None}
                              for f in g["factors"]]}
                    for g in loc_groups]
        neighbors = [r for r in by_dong.get((c["gu"], c["dong"]), []) if r["complex_id"] != cid and not r["small"]][:6]
        shown = tr_list[:TRADE_ROWS]
        html = tpl.render(
            c=c, charts=c_charts, recent=shown, has_pc=bool(pc_data), area_types=_area_types(shown), lead=lead, root="../", page_path=f"apt/{c['slug']}.html",
            latlng=geo.get(cid),
            kakao_js_key=kakao_js_key, loc_sets=loc_sets, neighbors=neighbors,
            summary=_summary(c, n_total, gu_med, factors, years, meta.get("real_returns"), cfg.region_name,
                             leader_by_gu.get(c["gu"])),
            n_total=n_total, chips=_card_chips(c), gems=GEMS.get(c["grade"], 1), **common)
        (out_dir / "apt" / f"{c['slug']}.html").write_text(html, encoding="utf-8")
    write_sitemap(out_dir, cfg.site.get("base_url", ""),
                  [f"{n}.html" for n in APP_PAGES + ["stations", "rank", "themes"]] + [f"apt/{r['slug']}.html" for r in rows],
                  [g.get("url", "") for g in cfg.site.get("regions", [])])
    return len(rows)


def _loc_groups(cfg, table: pd.DataFrame | None = None) -> list[dict]:
    """설정의 입지 묶음 [{key, label, factors: [factor dict]}]. 묶음에 없는 항목은 '기타'로.
    table 을 주면 값이 하나도 없는 항목(예: 학교알리미를 받지 못한 해의 중학교 순전입)은 뺍니다."""
    factors = [f for f in cfg.location_factors
               if table is None or (f["key"] + "_pct" in table and table[f["key"] + "_pct"].notna().any())]
    by_key = {f["key"]: f for f in factors}
    out, used = [], set()
    for g in cfg.raw.get("location", {}).get("groups", []):
        fs = [by_key[k] for k in g["factors"] if k in by_key]
        used.update(f["key"] for f in fs)
        if fs:
            out.append({"key": g["key"], "label": g["label"], "factors": fs})
    rest = [f for f in factors if f["key"] not in used]
    if rest:
        out.append({"key": "etc" if out else "all", "label": "기타" if out else "입지", "factors": rest})
    return out


def _group_score(table: pd.DataFrame, factors: list[dict]) -> pd.Series:
    """묶음 점수: 항목 백분위(학원가는 점수)의 가중평균, 값 있는 항목만으로."""
    num = pd.Series(0.0, index=table.index)
    den = pd.Series(0.0, index=table.index)
    for f in factors:
        col = table.get(f["key"] + "_pct")
        if col is None:
            continue
        num += col.fillna(0) * f["weight"]
        den += col.notna() * f["weight"]
    return (num / den).where(den > 0)


TRADE_ROWS = 80  # 단지 페이지 거래 표에 싣는 최근 거래 수 (처음엔 15건, 나머지는 '더 보기')


def _area_types(trades: list[dict]) -> list[dict]:
    """거래 표 면적 고르기: 전용면적을 1㎡ 단위로 내림해 붙어 있는 값(59·60)은 한 묶음으로.
    거래마다 t['akey'] 에 묶음 이름('84')을 달고, [{key, n}] 을 작은 면적부터 돌려줍니다."""
    ints = sorted({int(t["area"]) for t in trades if not _nan(t.get("area"))})
    group, out = {}, []
    for a in ints:
        if out and a - out[-1][-1] <= 1:
            out[-1].append(a)
        else:
            out.append([a])
    counts: dict[int, int] = {}
    for t in trades:
        if not _nan(t.get("area")):
            counts[int(t["area"])] = counts.get(int(t["area"]), 0) + 1
    for g in out:
        key = str(max(g, key=lambda a: counts.get(a, 0)))
        for a in g:
            group[a] = key
    for t in trades:
        t["akey"] = group.get(int(t["area"])) if not _nan(t.get("area")) else ""
    n = {}
    for t in trades:
        if t["akey"]:
            n[t["akey"]] = n.get(t["akey"], 0) + 1
    areas: dict[str, list] = {}
    for t in trades:
        if t["akey"]:
            areas.setdefault(t["akey"], []).append(float(t["area"]))
    return [{"key": k, "n": n[k], "py": pyeong(sorted(areas[k])[len(areas[k]) // 2])} for k in sorted(n, key=int)]


def _mark_highs(trades: list[dict], band: float = 3, skip_direct: bool = False) -> None:
    """거래마다 'high': 같은 면적대(±band㎡) 이전 매매보다 비싸면 신고가 (해제 거래·분양권, skip_direct면 직거래도 제외).
    면적을 1㎡ 단위로 묶어 최고가를 들고 다녀 거래 수에 비례하는 시간에 끝냅니다."""
    best: dict[int, float] = {}
    for t in sorted(trades, key=lambda t: t["date"]):
        t["high"] = False
        if (t.get("cancelled") or (skip_direct and t.get("direct")) or t.get("kind", "매매") != "매매"
                or _nan(t.get("price")) or _nan(t.get("area"))):
            continue
        a = int(round(t["area"]))
        prev = [best[k] for k in range(a - int(band), a + int(band) + 1) if k in best]
        t["high"] = bool(prev) and t["price"] > max(prev)
        best[a] = max(best.get(a, 0), t["price"])


def _area_groups(gus: list[str], counts: dict) -> list[dict]:
    """동이 많은 지역(세종)의 목록 거르기: '동 지역'과 읍·면별로 묶은 고르기 목록."""
    groups: dict[str, list] = {}
    for g in gus:
        head, _, tail = g.partition(" ")
        groups.setdefault(head if tail else "동 지역", []).append({"value": g, "label": tail or g, "n": counts.get(g, 0)})
    order = sorted(groups, key=lambda k: (k != "동 지역", k))
    return [{"label": k, "items": sorted(groups[k], key=lambda i: i["label"])} for k in order]


def _gu_boards(gu_stats: list[dict], main_t: pd.DataFrame, y: int) -> list[dict]:
    """구별 비교 보드: 항목마다 구를 높은 순으로 줄 세우고, 지역 전체 중간값과의 차이를 붙입니다."""
    def signed(v, fmt):
        return ("+" if v > 0 else "−" if v < 0 else "±") + fmt(abs(v))
    specs = [
        ("price", "집값", "84㎡ 환산가 중간값", main_t["price_ref"].median(), eok,
         lambda d: signed(d, lambda x: f"{x / 10000:.1f}억" if x >= 10000 else f"{round(x, -1):,.0f}만")),
        ("index", "종합 지수", "종합 지수 중간값", main_t["index"].median(), lambda v: f"{v:.0f}점",
         lambda d: signed(d, lambda x: f"{x:.0f}점")),
        ("c10", f"{y}년 수익률", f"{y}년 연평균 수익률 중간값",
         main_t[f"cagr_{y}y"].median() if f"cagr_{y}y" in main_t else float("nan"), fmt_pct,
         lambda d: signed(d * 100, lambda x: f"{x:.1f}%p")),
        ("location", "입지", "입지점수 중간값", main_t["location_score"].median(), lambda v: f"{v:.0f}점",
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


def _short_dong(name: str) -> str:
    """'가수원동' → '가수원', '목동' → '목동' (두 글자는 그대로), '조치원읍 봉산리' → '봉산리'."""
    n = str(name).split()[-1]
    return n[:-1] if len(n) > 2 and n[-1] in "동가" else n


def _month_view(trades, main_t, rows, by_id, meta, cfg) -> dict:
    """이번 달 볼거리: 동네 온도 지도, 랭킹 다섯 가지, 화제의 단지 띠."""
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
         "note": "최근 6개월 ㎡당 중간 가격을 1년 전 같은 기간과 비교 (두 기간 모두 거래 3건 이상)",
         "items": [item(c, f"{v * 100:+.1f}%", f"{eok(main_t.at[c, 'price_ref'])} · 84㎡", "up") for c, v in up.items()]},
        {"key": "high", "tab": "신고가", "title": "최근 신고가 단지",
         "note": "마지막 거래가 같은 면적대 이전 최고가를 넘은 단지 (최근 90일)",
         "items": [item(c, eok(r["last_price"]), f"{int(r['last_area'])}㎡ · {r['last_date']:%m.%d}", "up")
                   for c, r in highs.iterrows()]},
        {"key": "busy", "tab": "거래 활발", "title": "최근 3개월 거래가 많은 단지",
         "note": "최근 3개월 매매 신고 건수 (해제 거래 제외)",
         "items": [item(c, f"{int(v)}건", f"{eok(main_t.at[c, 'price_ref'])} · 84㎡") for c, v in busy.items()]},
        {"key": "deal", "tab": "최고가 거래", "title": "최근 3개월 가장 비싼 거래",
         "note": "단지마다 가장 비싼 한 건 (실거래 금액 그대로, 84㎡ 환산 아님)",
         "items": [item(r["complex_id"], eok(r["price"]), f"{r['area']:.0f}㎡ · {pd.Timestamp(r['date']):%m.%d}")
                   for _, r in deals.iterrows()]},
        {"key": "down", "tab": "많이 내린", "title": "1년 전보다 많이 내린 단지",
         "note": "최근 6개월 ㎡당 중간 가격을 1년 전 같은 기간과 비교 (두 기간 모두 거래 3건 이상)",
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

    # 동네 온도 지도: 단지 위치로 그린 동 영역을 온도 색으로 칠합니다.
    board = None
    heat = trends.dong_heat(sale, main_t, asof)
    pts = {}
    for r in rows:
        if not r["small"] and r.get("lat") and r.get("lng") and (r["gu"], r["dong"]) in heat.index:
            pts.setdefault((r["gu"], r["dong"]), []).append((r["lat"], r["lng"]))
    try:
        shapes = heatmap.build(pts, heatmap.load_districts(cfg.districts)) if len(pts) >= 5 else None
    except (ValueError, shapely.errors.GEOSException) as e:  # 지도를 못 그려도 나머지 화면은 만듭니다
        print(f"::warning::동네 온도 지도를 그리지 못했습니다: {e}")
        shapes = None
    if shapes:
        ranked_t = main_t.dropna(subset=["index"]).sort_values("index", ascending=False)
        best = {(r["gu"], r["dong"]): cid for cid, r in ranked_t.groupby(["gu", "dong"]).head(1).iterrows()}
        # 카드에 보여줄 동네 지수 상위 3곳, 최근 신고가 단지 수
        top3 = {k: [[by_id[c]["slug"], by_id[c]["name"], by_id[c]["grade"], round(float(by_id[c]["index"]))] for c in g.index]
                for k, g in ranked_t.groupby(["gu", "dong"]).head(3).groupby(["gu", "dong"])}
        highs_by = (main_t[main_t.get("new_high_recent", pd.Series(False, index=main_t.index)).fillna(False).astype(bool)]
                    .groupby(["gu", "dong"]).size().to_dict())
        price = main_t.groupby(["gu", "dong"])["price_ref"].median()
        cx, cy = shapes["w"] / 2, shapes["h"] / 2
        areas = sorted((g["area"] for g in shapes["regions"].values()), reverse=True)
        min_label = areas[min(len(areas) - 1, 44)]  # 이름표는 넓은 동부터 45곳까지만 (겹침 방지)
        tiles = []
        for k, g in shapes["regions"].items():
            h = heat.loc[k]
            b = best.get(k)
            tiles.append({
                "gu": k[0], "dong": k[1], "label": _short_dong(k[1]), "d": g["d"], "x": g["x"], "y": g["y"],
                "show_label": g["area"] >= min_label and g["area"] >= 0.35,
                "band": int(h["band"]), "band_name": h["band_name"], "n": int(h["n"]),
                "score": None if _nan(h["score"]) else float(h["score"]),
                "chg": None if _nan(h["chg"]) else round(float(h["chg"]) * 100, 1),
                "last3": int(h["last3"]), "usual": round(float(h["prev_q"]), 1),
                "vol": (f"{h['last3'] / h['prev_q']:.1f}배" if h["prev_q"] >= 0.5 else f"{int(h['last3'])}건"),
                "price": None if _nan(price.get(k)) else eok(price.get(k)),
                "best": by_id[b]["name"] if b else None, "best_slug": by_id[b]["slug"] if b else None,
                "best_grade": by_id[b]["grade"] if b else None,
                "ring": int(math.hypot(g["x"] - cx, g["y"] - cy) / 60),
                "pc": None if _nan(h.get("p_chg")) else round(float(h["p_chg"])),
                "pv": None if _nan(h.get("p_vol")) else round(float(h["p_vol"])),
                "top": top3.get(k, []), "highs": int(highs_by.get(k, 0)),
            })
        counts = {b: sum(1 for t in tiles if t["band"] == b) for b, _ in trends.BANDS + [trends.QUIET]}
        ranked = sorted((t for t in tiles if t["score"] is not None), key=lambda t: (-t["score"], -(t["chg"] or 0)))
        # 온도 순위 (전체·구 안). 카드의 '몇 번째로 뜨거운 동네'와 이전·다음 넘기기에 씁니다.
        for i, t in enumerate(ranked, 1):
            t["rank"] = i
        for gu_name in {t["gu"] for t in ranked}:
            same = [t for t in ranked if t["gu"] == gu_name]
            for i, t in enumerate(same, 1):
                t["gu_rank"], t["gu_of"] = i, len(same)
        hot, cold = ranked[:5], ranked[::-1][:5]
        for i, t in enumerate(hot[:3], 1):
            t["pin"] = i
        board = {"tiles": tiles, "w": shapes["w"], "h": shapes["h"],
                 "districts": shapes["districts"] if len(shapes["districts"]) > 1 else [],
                 "outline": shapes["districts"],
                 "bands": [{"band": b, "name": n, "count": counts[b]} for b, n in trends.BANDS + [trends.QUIET]],
                 "hot": hot, "cold": [t for t in cold if t not in hot], "n_ranked": len(ranked),
                 "start": f"{hot[0]['gu']}|{hot[0]['dong']}" if hot else None}
    # 대장 단지: 구(세종은 동)마다 84㎡ 환산가가 가장 높은 단지. 최근 1년 매매 5건 이상인 단지만.
    year_n = trends.recent_count(sale, asof, 12)
    liquid = main_t[main_t.index.isin(year_n[year_n >= 5].index)].dropna(subset=["price_ref"])
    leaders = []
    for gu, sub in liquid.groupby("gu", sort=False):
        top_id = sub["price_ref"].idxmax()
        all_gu = main_t[main_t["gu"] == gu]["price_ref"].dropna()
        r = by_id[top_id]
        leaders.append({"gu": gu, "slug": r["slug"], "name": r["name"], "grade": r["grade"], "dong": r["dong"],
                        "price": main_t.at[top_id, "price_ref"], "price_text": eok(main_t.at[top_id, "price_ref"]),
                        "chg": None if top_id not in chg.index else round(float(chg[top_id]) * 100, 1),
                        "ratio": round(float(all_gu.median() / main_t.at[top_id, "price_ref"]) * 100) if len(all_gu) else None,
                        "n": int(len(all_gu)), "complex_id": top_id})
    leaders.sort(key=lambda d: -d["price"])
    # 첫 화면 숫자 줄: 최근 3개월 매매와 최근 신고가 단지 수
    pulse = {"recent3": int(cnt.sum()),
             "highs": int(main_t.get("new_high_recent", pd.Series(dtype=bool)).fillna(False).astype(bool).sum())}
    return {"ranks": ranks, "ticker": ticker, "board": board, "leaders": leaders, "pulse": pulse}


def _themes(main_t, by_id, cfg, meta) -> list[dict]:
    """테마 모음: 생활 조건으로 묶은 단지 목록 (종합 지수 높은 순, 테마마다 THEME_ROWS 곳까지 싣고 화면엔 12곳씩)."""
    t = main_t
    asof_year = int(meta["asof"][:4])
    tr = _transit(cfg)
    col = lambda k: t[k] if k in t else pd.Series(float("nan"), index=t.index)
    defs = [
        ("school", "초품아", "초등학교까지 400m 안", col("elementary_raw") <= 400,
         lambda c: f"초등학교 {t.at[c, 'elementary_raw']:.0f}m"),
        ("transit", tr["tab"], f"{tr['stop']}까지 700m 안", col("subway_raw") <= 700,
         lambda c: f"{station_name(t.at[c, 'subway_name_raw']) or tr['stop']} {t.at[c, 'subway_raw']:.0f}m"),
        ("hub", "학원가 도보권", "주요 학원가까지 15분 안 (도보·지하철)", col("hub_min_raw") <= 15,
         lambda c: f"{t.at[c, 'hub_name_raw']} {t.at[c, 'hub_min_raw']:.0f}분"),
        ("district", "학군 상위", "학군 점수(중학교 전입·학원가·주변 수학 학원) 상위 20%", col("grp_edu_top") <= 20,
         lambda c: f"학군 {t.at[c, 'grp_edu']:.0f}점"),
        ("new", "신축 10년", f"{asof_year - 9}년 이후 준공", col("build_year") >= asof_year - 9,
         lambda c: f"{int(t.at[c, 'build_year'])}년 준공"),
        ("value", "입지 대비 가격", "가성비 점수 상위 20%", col("stat_value") >= 80,
         lambda c: f"84㎡ {eok(t.at[c, 'price_ref'])}"),
    ]
    out = []
    for key, title, desc, mask, fact in defs:
        sel = t[mask.fillna(False)].dropna(subset=["index"]).sort_values("index", ascending=False)
        if sel.empty:
            continue
        items = []
        for cid in sel.index[:THEME_ROWS]:
            r = by_id[cid]
            try:
                f = fact(cid)
            except (KeyError, TypeError, ValueError):
                f = ""
            items.append({"slug": r["slug"], "name": r["name"], "grade": r["grade"], "gu": r["gu"], "dong": r["dong"],
                          "index": r["index"], "fact": f})
        out.append({"key": key, "title": title, "desc": desc, "count": int(len(sel)), "items": items,
                    "by_gu": {str(k): int(v) for k, v in sel["gu"].value_counts().items()}})
    return out


THEME_ROWS = 400  # 구별로 걸러도 끝까지 볼 수 있게 넉넉히 (화면엔 12곳씩, 나머지는 숨겨 둠)
APP_PAGES = ["compare", "finder", "my"]
STATION_RADIUS = 700  # 역세권으로 보는 거리(m)


# 메인 카드 바닥의 희귀도 보석 수 (카드 이미지와 같게)
GEMS = {"S": 5, "A": 4, "B": 3, "C": 2, "D": 1}


def _card_chips(c: dict) -> list[str]:
    """메인 카드 그림 위 작은 아이콘 줄: 가까운 역(정류장)과 학원가."""
    chips = []
    stn, dist = station_name(c.get("subway_name_raw")), c.get("subway_raw")
    if stn and not _nan(dist):
        chips.append(("train", f"{stn} {dist:.0f}m"))
    hub, mins = c.get("hub_name_raw"), c.get("hub_min_raw")
    if isinstance(hub, str) and not _nan(mins) and mins <= 25:
        chips.append(("book", f"{hub} {mins:.0f}분"))
    return chips


def station_name(raw) -> str | None:
    """카카오 장소 이름 '정부청사역 대전1호선' → '정부청사역'."""
    if raw is None or (isinstance(raw, float) and raw != raw) or not str(raw).strip():
        return None
    return str(raw).split()[0]

# 단지 카드의 다섯 항목 점수: (열 이름, 표시 이름, 설명)
STATS = [
    ("location_score", "입지", "교통·학군·생활 편의 (아래 '입지는 어떤가')"),
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
            "f": {f["key"]: _r(r.get(f["key"] + "_raw"), 1 if f["kind"] == "value" else 0) for f in factors},
            "y": r.get("build_year"), "la": _r(r.get("lat"), 6), "ln": _r(r.get("lng"), 6),
            "h": bool(r.get("new_high_recent")),
            "dd": _r(r.get("from_peak") * 100, 1) if not _nan(r.get("from_peak")) else None,
            "py": _r(r.get("peak_year")),
            "stn": station_name(r.get("subway_name_raw")),
            "hn": r.get("hub_name_raw") if isinstance(r.get("hub_name_raw"), str) else None,
            "hm": None if _nan(r.get("hub_min_raw")) else _r(r.get("hub_min_raw")),
            "nw": bool(r.get("is_new")),
            "ed": _r(r.get("grp_edu")),
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
