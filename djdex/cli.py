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
from . import kakao, location, metrics, molit, site
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
    molit.collect(key, cfg.districts, months, cfg.paths.raw, cfg.collect["endpoint"],
                  cfg.collect["rows_per_page"], refresh=recent)
    if cfg.collect.get("collect_presale"):
        try:
            molit.collect(key, cfg.districts, months, cfg.paths.raw_presale, cfg.collect["presale_endpoint"],
                          cfg.collect["rows_per_page"], refresh=recent)
        except (molit.MolitError, requests.RequestException) as e:
            print(f"::warning::분양권·입주권 수집 실패(활용신청 승인 전이면 정상), 매매 거래로만 진행합니다: {e}")
    rows = molit.load_raw(cfg.paths.raw, cfg.districts, cfg.paths.raw_presale)
    pd.DataFrame(rows).to_csv(cfg.paths.trades, index=False)
    print(f"거래 {len(rows):,}건 → {cfg.paths.trades}")


def _complex_list(trades: pd.DataFrame) -> list[dict]:
    cols = ["complex_id", "name", "gu", "dong", "jibun"]
    return (trades.sort_values("date").drop_duplicates("complex_id", keep="last")[cols]
            .astype(str).to_dict("records"))


def _read_trades(cfg) -> pd.DataFrame:
    if not cfg.paths.trades.exists():
        sys.exit(f"{cfg.paths.trades} 가 없습니다. `python -m djdex collect` 를 먼저 실행하세요.")
    return pd.read_csv(cfg.paths.trades, dtype={"jibun": str})


def cmd_locate(cfg, args) -> None:
    client = kakao.Kakao(_need("KAKAO_REST_KEY"))
    trades = _read_trades(cfg)
    kakao.enrich(_complex_list(trades), cfg.location_factors + cfg.location_extras, cfg.region_name,
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
    priced = main.dropna(subset=["price_ref", "location_score"])
    cand = priced[(priced["location_score"] > priced["location_score"].median())
                  & (priced["price_ref"] < priced["price_ref"].median())].sort_values("location_score", ascending=False)
    big = main.nlargest(8, "n_trades")
    for title, df in (("입지 대비 저렴 상위", cand.head(30)), ("거래 많은 단지", big)):
        for cid, r in df.iterrows():
            print(f"[규모:{title}] " + " | ".join(f"{c}={r[c]}" for c in cols))


def _score_and_build(cfg, trades, poi_df, geo, out, demo=False, kakao_js_key=None):
    cpi = CPI.load(cfg.paths.cpi)
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
            found = location.detect_hubs(poi_df, geo, key=key, dongs=dongs)
            for h in found:
                print(f"[{label}] 학원 밀집도로 찾은 학원가: {h['name']} ({h['lat']}, {h['lng']}) 단지 {h['members']}곳,"
                      f" 학원 {h['strength']:.0f}곳, 만점 {h['weight']}, 역 {h['stations'] or '-'}")
            auto = found or auto
        hubs = cfg.hub.get("hubs") or (auto if cfg.hub.get("auto") else [])
        if hubs:
            hub = location.hub_access(poi_df, geo, {**cfg.hub, "hubs": hubs})
            poi_df = poi_df.drop(columns=[c for c in hub.columns if c in poi_df], errors="ignore").join(hub)
    # 입지점수는 소규모 단지를 뺀 분포 기준이라 metrics 안에서 계산합니다.
    table, hist, meta = metrics.compute(trades, cfg.metrics, cfg.filters, cpi=cpi,
                                        components=cfg.index_components,
                                        poi=poi_df if not poi_df.empty else None,
                                        factors=cfg.location_factors)
    if not demo:
        _log_complex_sizes(table)
    n = site.build(table, hist, trades, meta, cfg, out, demo=demo,
                   kakao_js_key=kakao_js_key or os.environ.get("KAKAO_JS_KEY") or None, geo=geo)
    return table, meta, n


def cmd_build(cfg, args) -> None:
    trades = _read_trades(cfg)
    poi = json.loads(cfg.paths.poi.read_text(encoding="utf-8")) if cfg.paths.poi.exists() else {}
    geo = json.loads(cfg.paths.geo.read_text(encoding="utf-8")) if cfg.paths.geo.exists() else {}
    if not poi:
        print("입지 정보(data/poi.json)가 없어 입지점수 없이 만듭니다. `locate` 를 먼저 돌리세요.")
    poi_df = pd.DataFrame.from_dict(poi, orient="index")
    out = Path(args.out or ROOT / "site")
    table, meta, n = _score_and_build(cfg, trades, poi_df, geo, out)
    table.to_csv(cfg.paths.scores)
    print(f"단지 {n}개, 기준 {meta['asof']} → {out}")


def cmd_all(cfg, args) -> None:
    cmd_collect(cfg, args)
    if os.environ.get("KAKAO_REST_KEY"):
        try:
            cmd_locate(cfg, args)
        except requests.RequestException as e:
            # 입지 수집이 실패해도 이미 받은 실거래 데이터로 사이트는 만듭니다.
            # (실패하면 Actions 캐시가 저장되지 않아 실거래 수집을 처음부터 다시 하게 됩니다.)
            detail = getattr(getattr(e, "response", None), "text", "")[:300]
            print(f"::warning::카카오 입지 수집 실패, 입지점수 없이 진행합니다: {e} {detail}")
    cmd_build(cfg, args)


def cmd_demo(cfg, args) -> None:
    trades, poi_df, geo = demo_mod.generate(cfg.districts, cfg.location_factors)
    out = Path(args.out or ROOT / "site-demo")
    _, meta, n = _score_and_build(cfg, trades, poi_df, geo, out, demo=True,
                                  kakao_js_key=os.environ.get("KAKAO_JS_KEY") or None)
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
    for name in ("build", "demo"):
        sub.add_parser(name).add_argument("--out", help="사이트 출력 폴더")
    args = p.parse_args(argv)
    cfg = config_mod.load(args.config, args.data)
    cfg.paths.data.mkdir(parents=True, exist_ok=True)
    {"collect": cmd_collect, "locate": cmd_locate, "build": cmd_build,
     "all": cmd_all, "demo": cmd_demo}[args.cmd](cfg, args)
