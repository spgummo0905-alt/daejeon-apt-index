"""옥상 방문자 수(운영자용, 읽기 전용): 날짜별 '옥상 화면을 연 브라우저' 수와 이번 주 합계.
열쇠는 이 컴퓨터의 ~/.hermes/profiles/design-studio/secrets/roof-stats-key 에서만 읽습니다(저장소에는 없음).
사용: python3 scripts/roof_stats.py https://○○○.supabase.co sb_publishable_...   (둘 다 사이트에 원래 내려가는 공개용 값)
브라우저 수이지 사람 수가 아닙니다(한 사람이 기기 두 개면 2). 자동 조종 브라우저는 세지 않습니다.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request

KEY_FILE = os.path.expanduser("~/.hermes/profiles/design-studio/secrets/roof-stats-key")


def fetch(url: str, anon: str, key: str) -> list[dict]:
    req = urllib.request.Request(url.rstrip("/") + "/rest/v1/rpc/roof_only_stats", method="POST",
                                 data=json.dumps({"k": key}).encode(),
                                 headers={"apikey": anon, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def summarize(rows: list[dict], today: dt.date) -> dict:
    """이번 주 = 월요일부터 오늘까지(KST 기준 날짜). 같은 사람이 여러 날 오면 날마다 1로 세어 더한 값이라 '연인원'입니다."""
    by = {r["d"]: int(r["n"]) for r in rows}
    monday = today - dt.timedelta(days=today.weekday())
    week = sum(n for d, n in by.items() if monday <= dt.date.fromisoformat(d) <= today)
    last7 = sum(n for d, n in by.items() if today - dt.timedelta(days=6) <= dt.date.fromisoformat(d) <= today)
    return {"today": by.get(today.isoformat(), 0), "this_week": week, "last_7_days": last7, "days": dict(sorted(by.items(), reverse=True)[:8])}


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__); return 1
    key = open(KEY_FILE, encoding="utf-8").read().strip()
    rows = fetch(sys.argv[1], sys.argv[2], key)
    today = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).date()
    print(json.dumps(summarize(rows, today), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
