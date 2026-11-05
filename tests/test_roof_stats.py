"""옥상 방문자 수(운영자용): 읽기 도구 계산, SQL 안전 조건, 화면 쪽 연결."""
import datetime as dt
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load():
    spec = importlib.util.spec_from_file_location("roof_stats", ROOT / "scripts" / "roof_stats.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_summarize_today_week_and_last7():
    m = _load()
    today = dt.date(2026, 11, 5)   # 목요일 → 이번 주(월~오늘) = 11/2~11/5
    rows = [{"d": "2026-11-05", "n": 7}, {"d": "2026-11-04", "n": 5}, {"d": "2026-11-02", "n": 3},
            {"d": "2026-11-01", "n": 40}, {"d": "2026-10-30", "n": 9}, {"d": "2026-10-29", "n": 100}]
    r = m.summarize(rows, today)
    assert r["today"] == 7
    assert r["this_week"] == 7 + 5 + 3          # 일요일(11/1)은 지난 주
    assert r["last_7_days"] == 7 + 5 + 3 + 40 + 9   # 10/30 ~ 11/5, 10/29 는 제외
    assert m.summarize([], today) == {"today": 0, "this_week": 0, "last_7_days": 0, "days": {}}


def test_sql_is_locked_down_and_holds_no_secret():
    apply = (ROOT / "scripts" / "migrations" / "roof_only_stats_apply.sql").read_text(encoding="utf-8")
    assert "enable row level security" in apply and apply.count("enable row level security") == 2
    assert "__ROOF_STATS_KEY_HASH__" in apply                      # 저장소에는 자리표시자만 (진짜 해시·열쇠 없음)
    assert "revoke all on function public.roof_only_stats(text) from public" in apply
    assert "sha256(convert_to(k, 'utf8'))" in apply and "return;" in apply   # 열쇠가 틀리면 아무것도 안 돌려줌
    assert "set search_path = ''" in apply and "d < today - 30" in apply
    rb = (ROOT / "scripts" / "migrations" / "roof_only_stats_rollback.sql").read_text(encoding="utf-8")
    for s in ("drop function if exists public.roof_only_stats(text)", "drop table if exists public.roof_only_visits", "drop table if exists public.roof_stats_key"):
        assert s in rb
    tool = (ROOT / "scripts" / "roof_stats.py").read_text(encoding="utf-8")
    assert "secrets/roof-stats-key" in tool and "sb_publishable" in tool and "service_role" not in tool


def test_roof_page_counts_only_its_own_visit_quietly():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    assert "roof_only_visit" in js and "navigator.webdriver" in js and "djdex:roofseen" in js
    assert ".catch(() => { /* 서버 준비 전이거나 연결 없음: 조용히 */ });" in js   # 서버가 준비 전이어도 화면에 오류가 뜨지 않음
    assert "roof_only_visit" not in (ROOT / "static" / "online.js").read_text(encoding="utf-8")   # 사이트 전체 집계와 분리
    privacy = (ROOT / "templates" / "privacy.html").read_text(encoding="utf-8")
    assert "옥상에 온 브라우저 수" in privacy and "30일 뒤 지움" in privacy
