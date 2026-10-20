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
    rows = molit.load_raw(cfg.paths.raw, cfg.districts)
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
    kakao.enrich(_complex_list(trades), cfg.location_factors, cfg.region_name,
                 cfg.paths.geo, cfg.paths.poi, client)


def _score_and_build(cfg, trades, poi_df, geo, out, demo=False):
    loc = location.score(poi_df, cfg.location_factors) if not poi_df.empty else None
    cpi = CPI.load(cfg.paths.cpi)
    table, hist, meta = metrics.compute(trades, cfg.metrics, cfg.filters, location=loc, cpi=cpi,
                                        components=cfg.index_components)
    n = site.build(table, hist, trades, meta, cfg, out, demo=demo,
                   kakao_js_key=os.environ.get("KAKAO_JS_KEY") or None, geo=geo)
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
        cmd_locate(cfg, args)
    cmd_build(cfg, args)


def cmd_demo(cfg, args) -> None:
    trades, poi_df, geo = demo_mod.generate(cfg.districts, cfg.location_factors)
    out = Path(args.out or ROOT / "site-demo")
    _, meta, n = _score_and_build(cfg, trades, poi_df, geo, out, demo=True)
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
