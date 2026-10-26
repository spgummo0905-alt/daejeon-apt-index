"""명령줄 진입점.

  python -m djdex collect   국토부 실거래가 수집 (DATA_GO_KR_KEY 필요)
  python -m djdex locate    카카오로 좌표와 주변 시설 수집 (KAKAO_REST_KEY 필요)
  python -m djdex build     지표 계산 후 site/ 에 정적 사이트 생성
  python -m djdex all       위 세 단계를 차례로
  python -m djdex demo      가짜 데이터로 site-demo/ 생성 (키 불필요)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

import pandas as pd
import requests

from . import config as config_mod
from . import demo as demo_mod
from . import bldg, ecos, elev, fee, kakao, kapt, location, metrics, molit, osm, reviews, school, site
from .cpi import CPI
from .config import ROOT


def _need(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        sys.exit(f"환경변수 {name} 가 필요합니다. README의 'API 키 준비'를 참고하세요.")
    return v


def cmd_collect(cfg, args) -> None:
    key = _need("DATA_GO_KR_KEY")
    end = args.end or date.today().strftime("%Y%m")
    months = molit.month_range(args.start or cfg.collect["start_ym"], end)
    recent = set(months[-cfg.collect["refresh_recent_months"]:])
    budget = cfg.collect.get("max_calls_per_run")
    molit.collect(key, cfg.districts, months, cfg.paths.raw, cfg.collect["endpoint"],
                  cfg.collect["rows_per_page"], refresh=recent, budget=budget)
    if cfg.collect.get("collect_presale"):
        try:
            molit.collect(key, cfg.districts, months, cfg.paths.raw_presale, cfg.collect["presale_endpoint"],
                          cfg.collect["rows_per_page"], refresh=recent, budget=budget)
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::분양권·입주권 수집 실패(활용신청 승인 전이면 정상), 매매 거래로만 진행합니다: {e}")
    rows = molit.load_raw(cfg.paths.raw, cfg.districts, cfg.paths.raw_presale)
    pd.DataFrame(rows).to_csv(cfg.paths.trades, index=False)
    print(f"거래 {len(rows):,}건 → {cfg.paths.trades}")
    have, need = molit.progress(cfg.paths.raw, cfg.districts, months) if budget else (1, 1)
    # 나눠 받는 지역은 매매를 다 모은 뒤에 전월세를 받습니다 (매매가 먼저 공개돼야 하니까).
    if cfg.collect.get("collect_rent") and have >= need:
        rent_months = [ym for ym in months if ym >= cfg.collect.get("rent_start_ym", "201101")]
        try:
            molit.collect(key, cfg.districts, rent_months, cfg.paths.raw_rent, cfg.collect["rent_endpoint"],
                          cfg.collect["rows_per_page"], refresh=recent, budget=budget)
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::전월세 수집이 중간에 멈췄습니다(활용신청 승인 전이면 정상), 받은 데까지만 씁니다: {e}")
        rents = molit.load_rent(cfg.paths.raw_rent, cfg.districts, rows)
        pd.DataFrame(rents).to_csv(cfg.paths.rents, index=False)
        print(f"전월세 {len(rents):,}건 (전세 {sum(1 for r in rents if not r['monthly']):,}건) → {cfg.paths.rents}")
    if cfg.collect.get("collect_kapt") and have >= need:
        try:
            kapt.collect(key, cfg.districts, cfg.paths.kapt, budget=budget)
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::단지 정보(K-apt) 수집 실패(활용신청 승인 전이면 정상), 세대수·주차 없이 진행합니다: {e}")
    if budget:
        # 나눠 받는 지역: 매매 실거래를 모든 구·달 다 받았으면 READY 를 남겨 사이트를 만들고 공개합니다.
        print(f"[{cfg.region_name}] 실거래 {have:,} / {need:,} (구×달) 받음")
        if have >= need:
            (cfg.paths.data / "READY").write_text(f"{have}\n", encoding="utf-8")


def _complex_list(trades: pd.DataFrame) -> list[dict]:
    """단지마다 complex_id, name, gu, dong, jibun 과 거래 수 n."""
    cols = ["complex_id", "name", "gu", "dong", "jibun"]
    n = trades["complex_id"].astype(str).value_counts()
    rows = (trades.sort_values("date").drop_duplicates("complex_id", keep="last")[cols]
            .astype(str).to_dict("records"))
    return [dict(r, n=int(n.get(r["complex_id"], 0))) for r in rows]


def _read_trades(cfg) -> pd.DataFrame:
    if not cfg.paths.trades.exists():
        sys.exit(f"{cfg.paths.trades} 가 없습니다. `python -m djdex collect` 를 먼저 실행하세요.")
    return pd.read_csv(cfg.paths.trades, dtype={"jibun": str, "apt_dong": str})


def cmd_locate(cfg, args) -> None:
    client = kakao.Kakao(_need("KAKAO_REST_KEY"))
    trades = _read_trades(cfg)
    complexes = _complex_list(trades)
    if cfg.raw["region"].get("group_by") == "dong":  # 구가 없는 지역은 주소에 구 이름을 넣지 않습니다
        complexes = [dict(c, gu="") for c in complexes]
    kakao.enrich(complexes, cfg.location_factors + cfg.location_extras, cfg.geo_region,
                 cfg.paths.geo, cfg.paths.poi, client)


def _log_complex_sizes(table: pd.DataFrame) -> None:
    """빌라형 단지를 가려낼 기준을 정하려고, 규모 관련 값을 빌드 로그에 남깁니다."""
    cols = ["name", "dong", "build_year", "n_trades", "peak_trades", "main_area", "max_floor", "n_dong", "n_areas"]
    if not set(cols) <= set(table.columns) or "location_score" not in table:
        return
    main = table[~table["small"].astype(bool)]
    known = main["n_dong"].notna()
    print(f"[규모] 아파트 {len(main)}곳 중 동 이름이 있는 곳 {int(known.sum())}곳,"
          f" 동 1개 {int((main['n_dong'] == 1).sum())}곳, 2개 {int((main['n_dong'] == 2).sum())}곳")
    reasons = table.loc[table["small"].astype(bool), "small_reason"].value_counts().to_dict()
    print(f"[규모] 아파트 외: {reasons}")
    lone = table[table["small_reason"] == "나홀로"].nlargest(15, "n_trades")
    for cid, r in lone.iterrows():
        print("[규모:나홀로 거래 많은 순] " + " | ".join(f"{c}={r[c]}" for c in cols))
    priced = main.dropna(subset=["price_ref", "location_score"])
    cand = priced[(priced["location_score"] > priced["location_score"].median())
                  & (priced["price_ref"] < priced["price_ref"].median())].sort_values("location_score", ascending=False)
    big = main.nlargest(8, "n_trades")
    for title, df in (("입지 대비 저렴 상위", cand.head(30)), ("거래 많은 단지", big)):
        for cid, r in df.iterrows():
            print(f"[규모:{title}] " + " | ".join(f"{c}={r[c]}" for c in cols))


def _score_and_build(cfg, trades, poi_df, geo, out, demo=False, kakao_js_key=None, macro=None, rents=None,
                     kinfo=None, supply=None, outside=None, hill=None):
    cpi = CPI.load(cfg.paths.cpi)
    if cfg.raw["region"].get("group_by") == "dong":
        # 구가 없는 지역(세종)은 동을 '구' 자리에 넣어 구별 비교·필터를 동 단위로 봅니다.
        trades = trades.assign(gu=trades["dong"])
    hubs = []
    if not poi_df.empty and geo and any(f["kind"] == "score" for f in cfg.location_factors):
        # 학원 밀집도로 찾은 학원가: config 에 hubs 가 없고 auto = true 면 이것을 쓰고,
        # hubs 가 있으면 비교용으로 로그에만 남깁니다. 수학 학원 수(입시 학원가 대용)가 있으면 그것을 씁니다.
        dongs = trades.groupby("complex_id")["dong"].last().to_dict()
        auto = []
        for key, label in (("academy", "학원 수"), ("academy_math", "수학 학원 수")):
            if key not in poi_df:
                continue
            vals = pd.to_numeric(poi_df[key], errors="coerce").dropna()
            if not vals.empty:
                print(f"[{label}] 단지 {len(vals)}곳, 중간 {vals.median():.0f}, 상위 10% {vals.quantile(0.9):.0f}, 최대 {vals.max():.0f}")
            found = location.detect_hubs(poi_df, geo, key=key, dongs=dongs, **cfg.hub.get("detect", {}))
            for h in found:
                print(f"[{label}] 학원 밀집도로 찾은 학원가: {h['name']} ({h['lat']}, {h['lng']}) 단지 {h['members']}곳,"
                      f" 학원 {h['strength']:.0f}곳, 만점 {h['weight']}, 역 {h['stations'] or '-'}")
            auto = found or auto
        hubs = cfg.hub.get("hubs") or (auto if cfg.hub.get("auto") else [])
        if hubs:
            hub = location.hub_access(poi_df, geo, {**cfg.hub, "hubs": hubs})
            poi_df = poi_df.drop(columns=[c for c in hub.columns if c in poi_df], errors="ignore").join(hub)
    for f in cfg.location_factors:
        if f.get("osm_route") and not demo and not poi_df.empty and geo:
            # OSM 노선 정류장까지 거리는 캐시된 정류장으로 매번 다시 계산합니다 (예전 카카오 값은 버림).
            stops = osm.load(cfg.paths.osm_stops)
            near = osm.nearest(geo, stops, f["key"], f["radius"])
            poi_df = poi_df.drop(columns=[f["key"], f["key"] + "_name"], errors="ignore").join(near)
            if not stops:
                print(f"::warning::{f['label']}: 정류장 정보가 없어 이 항목을 빼고 계산합니다")
    if not poi_df.empty and geo and cfg.school and any(f["kind"] == "value" for f in cfg.location_factors):
        sch = school.load(cfg.paths.school, cfg.school, cfg.region_name)
        if not sch.empty:
            mid = school.for_complexes(geo, sch, cfg.school.get("radius", 1500), cfg.school.get("max_schools", 3))
            poi_df = poi_df.drop(columns=[c for c in mid.columns if c in poi_df], errors="ignore").join(mid)
            top = sch.sort_values("net_in", ascending=False)
            print(f"[학군] 중학교 {len(sch)}곳, 순전입률 중간 {sch['net_in'].median():+.1f}%")
            print("[학군] 순전입 상위: " + ", ".join(f"{r['name']} {r['net_in']:+.1f}%" for _, r in top.head(8).iterrows()))
            print("[학군] 순전입 하위: " + ", ".join(f"{r['name']} {r['net_in']:+.1f}%" for _, r in top.tail(5).iterrows()))
    # 입지점수는 소규모 단지를 뺀 분포 기준이라 metrics 안에서 계산합니다.
    table, hist, meta = metrics.compute(trades, cfg.metrics, cfg.filters, cpi=cpi,
                                        components=cfg.index_components,
                                        poi=poi_df if not poi_df.empty else None,
                                        factors=cfg.location_factors)
    meta["hubs"] = hubs
    if not demo:
        _log_complex_sizes(table)
        for f in cfg.location_factors:  # 입지 항목마다 값이 있는 단지 수 (지역마다 빠진 항목 점검)
            col = pd.to_numeric(poi_df.get(f["key"], pd.Series(dtype=float)), errors="coerce")
            print(f"[입지] {f['label']}: 값 있는 단지 {int(col.notna().sum())}/{len(poi_df)}"
                  + (f", 중간 {col.median():.0f}" if col.notna().any() else ""))
            if f.get("keep_name") and f["key"] + "_name" in poi_df:
                names = poi_df[f["key"] + "_name"].dropna().value_counts().head(8)
                if len(names):
                    print(f"[입지] {f['label']} 가장 많이 잡힌 곳: " + ", ".join(f"{n}({c})" for n, c in names.items()))
    n = site.build(table, hist, trades, meta, cfg, out, demo=demo,
                   kakao_js_key=kakao_js_key or os.environ.get("KAKAO_JS_KEY") or None, geo=geo,
                   macro=macro if macro is not None else ecos.load(cfg.paths.macro), rents=rents, kinfo=kinfo,
                   supply=supply, outside=outside, hill=hill)
    return table, meta, n


def _log_coverage(cfg, trades, supply, kinfo) -> None:
    """공급면적·단지 정보가 전체 단지에 얼마나 붙었는지 (단지 수, 거래 기준), 거래가 많은 단지 다섯 곳 예시."""
    cx = sorted(_complex_list(trades), key=lambda c: -c["n"])
    if not cx:
        return
    total = sum(c["n"] for c in cx) or 1
    for label, has in (("공급면적", lambda c: (supply or {}).get(c["complex_id"])),
                       ("단지 정보", lambda c: (kinfo or {}).get(c["complex_id"])),
                       ("관리비", lambda c: ((kinfo or {}).get(c["complex_id"]) or {}).get("fee"))):
        got = [c for c in cx if has(c)]
        print(f"[반영] {label}: 단지 {len(got):,} / {len(cx):,}곳 ({len(got) / len(cx):.0%}), "
              f"거래 기준 {sum(c['n'] for c in got) / total:.0%}")
    for c in cx[:5]:
        pairs = (supply or {}).get(c["complex_id"])
        area = ", ".join(f"전용 {e:g}㎡ → 공급 {s:.1f}㎡ ({round(s / site.PY)}평)" for e, s in pairs[:4]) if pairs \
            else "공급면적 아직 없음"
        ki = (kinfo or {}).get(c["complex_id"]) or {}
        print(f"[예시] {c['name']} ({c['dong']}, 거래 {c['n']:,}건): {area} · 단지 정보 "
              + (f"{ki.get('name')} {ki.get('hh')}세대" if ki else "없음"))


def cmd_build(cfg, args) -> None:
    trades = _read_trades(cfg)
    poi = json.loads(cfg.paths.poi.read_text(encoding="utf-8")) if cfg.paths.poi.exists() else {}
    geo = json.loads(cfg.paths.geo.read_text(encoding="utf-8")) if cfg.paths.geo.exists() else {}
    if not poi:
        print("입지 정보(data/poi.json)가 없어 입지점수 없이 만듭니다. `locate` 를 먼저 돌리세요.")
    poi_df = pd.DataFrame.from_dict(poi, orient="index")
    out = Path(args.out or ROOT / "site")
    rents = pd.read_csv(cfg.paths.rents, dtype={"jibun": str, "contract": str}) if cfg.paths.rents.exists() else None
    kinfo = None
    if cfg.paths.kapt.exists():
        kl = kapt.load(cfg.paths.kapt, cfg.districts)
        kinfo = kapt.match(_complex_list(trades), kl, geo, log=print)
        hh = sorted(v["hh"] for v in kinfo.values() if v.get("hh"))
        print(f"단지 정보(K-apt) {len(kl):,}곳 중 {len(kinfo):,}곳을 실거래 단지에 이음 "
              f"(실거래 단지 {trades['complex_id'].nunique():,}곳)"
              + (f", 세대수 중간 {hh[len(hh) // 2]:,} · 최대 {hh[-1]:,}" if hh else ""))
        fees = fee.load(cfg.paths.kapt)
        if fees:   # 화면에 쓰기 전에 항목 구조와 ㎡당 금액이 그럴듯한지 로그로 확인
            fee.log_fields(cfg.paths.kapt)
            area = {k["code"]: k.get("marea") for k in kl}
            per = sorted(v["total"] / area[c] for c, v in fees.items() if area.get(c))
            print(f"관리비(공용관리비) {len(fees):,}곳" + (f", ㎡당 중간 {per[len(per) // 2]:,.0f}원 · "
                  f"아래 10% {per[len(per) // 10]:,.0f}원 · 위 10% {per[len(per) * 9 // 10]:,.0f}원" if per else ""))
            for v in kinfo.values():   # 단지 정보에 관리비를 붙여 단지 페이지에서 ㎡당 금액으로 보여 줌
                f = fees.get(v.get("code"))
                if f:
                    v["fee"] = {"ym": f["ym"], "total": f["total"]}
    supply = bldg.load(cfg.paths.bldg)
    _log_coverage(cfg, trades, supply, kinfo)
    if supply:
        ids = set(trades["complex_id"].astype(str))
        hit = [v for k, v in supply.items() if k in ids]
        ratios = sorted(e / s for v in hit for e, s in v)
        print(f"공급면적(건축물대장) {len(supply):,}곳 중 {len(hit):,}곳을 실거래 단지에 이음 (실거래 단지 {len(ids):,}곳)"
              + (f", 전용률 중간 {ratios[len(ratios) // 2]:.3f} · 범위 {ratios[0]:.2f}~{ratios[-1]:.2f}" if ratios else ""))
    outside = reviews.load(cfg.paths.kapt / "reviews.json", region=cfg.region_name,
                           complexes={c["complex_id"]: c for c in _complex_list(trades)})
    hill = elev.load(cfg.paths.elev)
    if hill:
        print(f"언덕(고저차) {len(hill):,}곳 (역 단면 {sum(1 for v in hill.values() if v.get('pf')):,}곳)")
    table, meta, n = _score_and_build(cfg, trades, poi_df, geo, out, rents=rents, kinfo=kinfo, supply=supply,
                                      outside=outside, hill=hill)
    table.to_csv(cfg.paths.scores)
    print(f"단지 {n}개, 기준 {meta['asof']} → {out}")


def _outside_reviews(cfg) -> None:
    """바깥 후기: 카카오맵 장소 잇기, 네이버 블로그·카페 글 (네이버 키가 있을 때). 거래가 많은 단지부터."""
    try:
        trades = _read_trades(cfg)
        order = trades["complex_id"].value_counts()
        cx = sorted(_complex_list(trades), key=lambda c: -order.get(c["complex_id"], 0))
        geo = json.loads(cfg.paths.geo.read_text(encoding="utf-8")) if cfg.paths.geo.exists() else {}
        path = cfg.paths.kapt / "reviews.json"
        reviews.kakao_places(cx, geo, path, kakao.Kakao(os.environ["KAKAO_REST_KEY"]), time_limit=900)
        nid, nsec = os.environ.get("NAVER_CLIENT_ID", "").strip(), os.environ.get("NAVER_CLIENT_SECRET", "").strip()
        if nid and nsec:
            reviews.naver_posts(cx, path, nid, nsec, budget=int(cfg.collect.get("naver_calls_per_run", 4000)),
                               region=cfg.region_name, time_limit=600)
    except Exception as e:   # 바깥 후기는 없어도 사이트는 만듭니다
        print(f"::warning::바깥 후기 잇기 실패, 검색 버튼만 둡니다: {e!r}")


def cmd_slow(cfg, args) -> None:
    """오래 걸리는 수집: 관리비·단지 정보 나머지·카카오맵 장소·네이버 글·공급면적(건축물대장).
    배포가 끝난 뒤에 돌려 하루 한도 안에서 며칠에 걸쳐 이어 받고, 받은 것은 다음 배포부터 화면에 나옵니다.
    한 가지가 시간을 다 쓰지 않게 단계마다 시간 상한을 두고, 오래 걸리는 공급면적은 맨 뒤에 둡니다.
    관리비를 단지 정보보다 먼저: 단지 정보 API 를 몰아서 부른 직후엔 포털이 관리비에 'HTTP 에러'를 줘서
    (대전·서울은 매번 실패, 그 단계가 없던 세종만 받아졌음)."""
    if cfg.collect.get("max_calls_per_run") and not (cfg.paths.data / "READY").exists():
        return   # 실거래를 다 모으기 전인 지역(서울)
    key = _need("DATA_GO_KR_KEY")
    # 몰아받기(catchup.yml): 고른 단계만, 평소보다 많은 호출·긴 시간으로 (하루 호출 한도가 남은 날)
    only = set((getattr(args, "only", None) or "fee,kapt,reviews,bldg").split(","))
    mins = lambda v, default: v * 60 if v else default
    if "fee" in only and cfg.collect.get("collect_fee") and cfg.paths.kapt.exists():
        try:
            fee.collect(key, cfg.paths.kapt, cfg.districts,
                        budget=getattr(args, "fee_calls", None) or int(cfg.collect.get("fee_calls_per_run", 2400)),
                        time_limit=mins(getattr(args, "fee_minutes", None), 480))
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::관리비 수집 실패, 관리비 없이 진행합니다: {e}")
    if "kapt" in only and cfg.collect.get("collect_kapt"):
        # 배포 전 단계에서 시간 안에 다 못 받은 단지 정보(세대수·주차 등)를 이어서
        try:
            kapt.collect(key, cfg.districts, cfg.paths.kapt, time_limit=mins(getattr(args, "kapt_minutes", None), kapt.SLOW_TIME),
                         cools=kapt.SLOW_COOLS)
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::단지 정보(K-apt) 이어 받기 실패: {e}")
    if "reviews" in only and os.environ.get("KAKAO_REST_KEY") and cfg.paths.trades.exists():
        _outside_reviews(cfg)
    if "bldg" in only and cfg.collect.get("collect_bldg"):
        try:
            bldg.collect(key, [cfg.paths.raw, cfg.paths.raw_presale], cfg.paths.bldg,
                         budget=getattr(args, "bldg_calls", None) or int(cfg.collect.get("bldg_calls_per_run", 4500)),
                         time_limit=mins(getattr(args, "bldg_minutes", None), 900))
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::공급면적(건축물대장) 수집 실패, 전용면적만 보여 줍니다: {e}")


def cmd_feeprobe(cfg, args) -> None:
    """관리비 API 점검 (수동): 단지 네 곳 × 최근 석 달 × JSON/XML 응답을 한 줄씩. 받아 둔 목록이 없으면 첫 구 목록을 받아 씀."""
    key = _need("DATA_GO_KR_KEY")
    cs = fee.codes(cfg.paths.kapt, cfg.districts)
    if not cs:
        first = next(iter(cfg.districts))
        cs = [it["kaptCode"] for it in kapt.fetch_list(key, first) if it.get("kaptCode")]
    pick = cs[:: max(1, len(cs) // 4)][:4]
    print(f"[관리비 점검] {cfg.region_name}: 목록 {len(cs):,}곳 중 {', '.join(pick)}")
    fee.probe(key, pick)


def cmd_elev(cfg, args) -> None:
    """언덕(고저차): 새 단지만 지형 타일로 계산 (키 없이). 역 좌표는 카카오 키가 있을 때 찾습니다."""
    if not cfg.paths.geo.exists():
        print("단지 좌표(geo.json)가 없어 언덕 계산을 건너뜁니다")
        return
    geo = json.loads(cfg.paths.geo.read_text(encoding="utf-8"))
    poi = json.loads(cfg.paths.poi.read_text(encoding="utf-8")) if cfg.paths.poi.exists() else {}
    f = next((f for f in cfg.location_factors if f["key"] == "subway"), None)
    stops = osm.load(cfg.paths.osm_stops) if f and f.get("osm_route") else None
    key = os.environ.get("KAKAO_REST_KEY", "").strip()
    elev.collect(geo, poi, cfg.paths.elev, client=kakao.Kakao(key) if key and not stops else None, stops=stops)


def cmd_all(cfg, args) -> None:
    cmd_collect(cfg, args)
    if os.environ.get("KAKAO_REST_KEY"):
        try:
            cmd_locate(cfg, args)
            if cfg.paths.kapt.exists():   # 단지 정보(K-apt) 주소 → 좌표 (지번·이름으로 못 이을 때 씀)
                kapt.locate(cfg.paths.kapt, cfg.districts, kakao.Kakao(os.environ["KAKAO_REST_KEY"]), cfg.geo_region)
        except requests.RequestException as e:
            # 입지 수집이 실패해도 이미 받은 실거래 데이터로 사이트는 만듭니다.
            # (실패하면 Actions 캐시가 저장되지 않아 실거래 수집을 처음부터 다시 하게 됩니다.)
            detail = getattr(getattr(e, "response", None), "text", "")[:300]
            print(f"::warning::카카오 입지 수집 실패, 입지점수 없이 진행합니다: {e} {detail}")
    for f in cfg.location_factors:
        if f.get("osm_route") and cfg.paths.geo.exists():
            try:
                osm.collect(f["osm_route"], json.loads(cfg.paths.geo.read_text(encoding="utf-8")), cfg.paths.osm_stops)
            except (ValueError, OSError) as e:  # 정류장을 못 받아도 사이트는 만듭니다 (그 항목만 빠짐)
                print(f"::warning::OSM 정류장 수집 실패: {e}")
    try:
        cmd_elev(cfg, args)
    except Exception as e:   # 언덕 자료가 없어도 사이트는 만듭니다
        print(f"::warning::언덕(고저차) 계산 실패, 이번에는 빼고 만듭니다: {e!r}")
    cmd_school(cfg, args)
    cmd_build(cfg, args)


def cmd_school(cfg, args) -> None:
    """학교알리미(중학교 위치·전출입)와 ECOS(물가·금리). 호출이 적어 배포 때도 받습니다 (이미 받은 해는 건너뜀)."""
    if os.environ.get("SCHOOLINFO_KEY") and cfg.school:
        try:
            school.collect(os.environ["SCHOOLINFO_KEY"], cfg.school, list(cfg.districts), cfg.paths.school,
                           date.today().year)
        except (requests.RequestException, ValueError) as e:
            print(f"::warning::학교알리미 수집 실패, 학군 항목 없이 진행합니다: {e}")
    if os.environ.get("ECOS_KEY"):
        # 물가·금리: 시세 차트의 실질 보기와 금리 표시 (없으면 그 부분만 빠짐)
        macro = ecos.fetch(os.environ["ECOS_KEY"], cfg.collect["start_ym"])
        if macro:
            ecos.save(cfg.paths.macro, macro)
            print("ECOS " + ", ".join(f"{k} {len(v)}개월(~{max(v)})" for k, v in macro.items()))


def cmd_demo(cfg, args) -> None:
    trades, poi_df, geo = demo_mod.generate(cfg.districts, cfg.location_factors)
    out = Path(args.out or ROOT / "site-demo")
    _, meta, n = _score_and_build(cfg, trades, poi_df, geo, out, demo=True,
                                  kakao_js_key=os.environ.get("KAKAO_JS_KEY") or None, macro=demo_mod.macro(),
                                  rents=demo_mod.rents(trades), kinfo=demo_mod.kinfo(trades),
                                  supply=demo_mod.supply(trades), outside=demo_mod.outside(trades),
                                  hill=demo_mod.hill(trades))
    print(f"[데모] 가짜 단지 {n}개 → {out / 'index.html'}")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="djdex", description="대전 아파트 지수")
    p.add_argument("--config", type=Path, help="설정 파일 (기본: config.toml)")
    p.add_argument("--data", type=Path, help="데이터 폴더 (기본: data/)")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("collect", "all"):
        s = sub.add_parser(name)
        s.add_argument("--start", help="수집 시작 YYYYMM")
        s.add_argument("--end", help="수집 끝 YYYYMM (기본: 이번 달)")
        s.add_argument("--out", help="사이트 출력 폴더")
    sub.add_parser("locate")
    s = sub.add_parser("slow", help="공급면적·관리비·후기 이어 받기 (배포 뒤에)")
    s.add_argument("--only", help="받을 단계만 쉼표로: fee,kapt,reviews,bldg (기본: 모두)")
    for k in ("fee", "bldg"):
        s.add_argument(f"--{k}-calls", type=int, help="이번 실행의 호출 수 상한 (기본: 설정 값)")
    for k in ("fee", "kapt", "bldg"):
        s.add_argument(f"--{k}-minutes", type=float, help="이 단계의 시간 상한(분) (기본: 평소 값)")
    sub.add_parser("feeprobe", help="관리비 API 점검 (응답을 한 줄씩)")
    sub.add_parser("school", help="학교알리미 중학교 전출입과 물가·금리만 받기 (빠름)")
    sub.add_parser("elev", help="언덕(고저차)만 계산 (지형 타일, 새 단지만)")
    for name in ("build", "demo"):
        sub.add_parser(name).add_argument("--out", help="사이트 출력 폴더")
    args = p.parse_args(argv)
    cfg = config_mod.load(args.config, args.data)
    cfg.paths.data.mkdir(parents=True, exist_ok=True)
    {"collect": cmd_collect, "locate": cmd_locate, "build": cmd_build,
     "all": cmd_all, "demo": cmd_demo, "slow": cmd_slow, "school": cmd_school, "feeprobe": cmd_feeprobe,
     "elev": cmd_elev}[args.cmd](cfg, args)
