"""함께 있는 옥상 점검: Supabase Realtime 에 두 사람이 같은 방에 들어가 방송이 오가는지 확인합니다 (키는 로그에 찍지 않음).
Secrets: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. 실패하면 Supabase 대시보드 → Realtime 설정에서 공개 채널(Allow public access)이 켜져 있는지 보세요."""
import asyncio
import json
import os
import sys
from urllib.parse import urlparse

import websockets

_u = urlparse(os.environ.get("SUPABASE_URL", "").strip())
HOST = _u.netloc
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
TOPIC = "realtime:roof:probe-" + os.urandom(3).hex()


async def main():
    if not (HOST and KEY):
        print("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 가 없어 건너뜁니다.")
        return 0
    log, ready_a, ready_b, got = [], asyncio.Event(), asyncio.Event(), asyncio.Event()
    url = f"wss://{HOST}/realtime/v1/websocket?apikey={KEY}&vsn=1.0.0"
    try:
        async with websockets.connect(url, open_timeout=20) as wa, websockets.connect(url, open_timeout=20) as wb:
            async def join(ws, name):
                await ws.send(json.dumps({"topic": TOPIC, "event": "phx_join", "ref": "1",
                                          "payload": {"config": {"broadcast": {"self": False, "ack": False}, "presence": {"key": name}, "private": False}, "access_token": KEY}}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 20))
                    if m.get("topic") == TOPIC and m.get("event") == "phx_reply":
                        return (m.get("payload") or {}).get("status"), m.get("payload")
            sa, pa = await join(wa, "a")
            sb, pb = await join(wb, "b")
            print(f"참가: a={sa} b={sb}")
            if sa != "ok" or sb != "ok":
                print("실패 이유:", json.dumps(pa if sa != "ok" else pb, ensure_ascii=False)[:300])
                return 1
            await wa.send(json.dumps({"topic": TOPIC, "event": "broadcast", "ref": "2", "payload": {"type": "broadcast", "event": "pos", "payload": {"x": 1}}}))
            for _ in range(20):
                m = json.loads(await asyncio.wait_for(wb.recv(), 15))
                if m.get("topic") == TOPIC and m.get("event") == "broadcast":
                    print("b가 a의 방송을 받았어요:", (m["payload"] or {}).get("event"))
                    print("OK: 함께 있는 옥상에 필요한 실시간 방송이 됩니다.")
                    return 0
            print("방송을 받지 못했어요.")
            return 1
    except Exception as e:   # 키가 섞인 주소가 로그에 남지 않게 종류만
        print(f"연결 실패: {type(e).__name__}: {str(e)[:120].replace(KEY, '***')}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
