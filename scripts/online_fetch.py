"""지금 접속 중인 사람 수를 online.json 한 장으로 만듭니다 (online-data 가지, .github/workflows/online.yml 이 5분마다).
사이트 화면(static/online.js)과 같은 Supabase 실시간 접속자 목록('site:online')에 잠깐 들어가 사람 수를 읽고 나옵니다 (키는 로그에 찍지 않음).
결과: {"u": 갱신 시각, "n": 접속자 수}  (이 스크립트 자신은 세지 않음)"""
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import websockets

HOST = urlparse(os.environ.get("SUPABASE_URL", "").strip()).netloc
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
TOPIC = "realtime:site:online"
ME = "counter-" + os.urandom(3).hex()


async def count():
    """들어가서 '나도 있어요'를 알린 뒤(그래야 목록을 보내 줘요) 목록을 받아 세고, 나 자신은 빼요"""
    url = f"wss://{HOST}/realtime/v1/websocket?apikey={KEY}&vsn=1.0.0"
    async with websockets.connect(url, open_timeout=20) as ws:
        await ws.send(json.dumps({"topic": TOPIC, "event": "phx_join", "ref": "1", "payload": {
            "config": {"broadcast": {"self": False, "ack": False}, "presence": {"key": ME}, "private": False}, "access_token": KEY}}))
        keys, got = set(), False
        loop = asyncio.get_event_loop()
        end = loop.time() + 12
        while loop.time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), max(0.5, end - loop.time())))
            except asyncio.TimeoutError:
                break
            if m.get("topic") != TOPIC:
                continue
            ev, pl = m.get("event"), m.get("payload") or {}
            if ev == "phx_reply" and pl.get("status") != "ok":
                raise RuntimeError("참가 실패")
            if ev == "phx_reply" and not got and m.get("ref") == "1":
                await ws.send(json.dumps({"topic": TOPIC, "event": "presence", "ref": "2", "payload": {"type": "presence", "event": "track", "payload": {"id": ME}}}))
            elif ev == "presence_state":
                keys, got = set(pl.keys()), True
                end = min(end, loop.time() + 2.5)   # 곧이어 오는 변화까지만 조금 더 기다림
            elif ev == "presence_diff":
                keys |= set((pl.get("joins") or {}).keys())
                keys -= set((pl.get("leaves") or {}).keys())
        if not got and not keys:
            raise RuntimeError("접속자 목록을 받지 못함")
        return len([k for k in keys if k != ME])


def main():
    if not (HOST and KEY):
        print("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 가 없어 건너뜁니다.")
        return 0
    try:
        n = asyncio.run(count())
    except Exception as e:   # 키가 섞인 주소가 로그에 남지 않게 종류만
        print(f"[접속자] 실패: {type(e).__name__}: {str(e)[:100].replace(KEY, '***')}")
        return 1
    kst = datetime.now(timezone(timedelta(hours=9)))
    with open(sys.argv[1] if len(sys.argv) > 1 else "online.json", "w", encoding="utf-8") as f:
        json.dump({"u": kst.isoformat(timespec="seconds"), "n": n}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[접속자] 지금 {n}명")
    return 0


if __name__ == "__main__":
    sys.exit(main())
