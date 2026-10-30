"""관심 단지 새 소식 알림 (웹 푸시): 매일 배포가 끝나면 알림을 켠 회원에게 관심 단지의 새 거래·시세 변화를 보냅니다.

- 관심 화면 '새 소식'(app.js DJ.news)과 같은 기준: 지난번 알린 뒤 새 거래가 생겼거나, 84㎡ 시세가
  내 설정의 기준(기본 500만 원) 넘게 바뀌면. 처음 보는 관심 단지는 지금 상태를 기준으로 저장만 합니다.
- 암호화(RFC 8291)와 보낸 곳 서명(VAPID)은 cryptography 로 여기서 직접 합니다.
- 회원별 기준 상태는 push_state, 받을 기기는 push_subs (scripts/supabase_setup.sql). 알림 키(VAPID)는 없으면
  여기서 만들어 push_keys 에 둡니다 (사이트는 push_key() 로 공개 키만 읽음).
- Secrets: SUPABASE_URL, SUPABASE_SECRET_KEY (Supabase → Project Settings → API Keys 의 secret 키). 없으면 건너뜀.
- 로그에는 건수만 남기고 키·주소·회원 정보는 찍지 않습니다.

python scripts/push_send.py site      # site/ 아래 지역별 complexes.json 을 읽음
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

DEFAULT_DP = 500   # 만원, app.js DJ.prefs 기본값과 같게


def load_complexes(site: Path) -> dict[str, dict]:
    """site/ 와 그 아래 지역 폴더의 단지 자료를 단지 주소 이름(slug)으로. 'u' 에 사이트 안 경로를 붙여 둠"""
    by: dict[str, dict] = {}
    for f in sorted(site.glob("**/complexes.json")) + sorted(site.glob("**/small.json")):
        base = f.parent.relative_to(site).as_posix()
        base = "" if base == "." else base + "/"
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for c in d.get("complexes", []):
            by.setdefault(c["s"], dict(c, u=f"{base}apt/{c['s']}.html"))
    return by


def snap(c: dict) -> list:
    return [c.get("tc") or 0, c.get("ld") or "", c.get("p") or 0]


def news_for(favs: list[str], seen: dict, by: dict, dp: int) -> tuple[list[dict], dict]:
    """관심 단지별 새 소식과 다음 기준 상태. 알린 단지만 기준을 지금으로 옮기고(시세는 조금씩 바뀐 것도 쌓이게),
    관심에서 뺀 단지는 기준에서 지움"""
    out, nxt = [], {}
    for s in favs:
        c = by.get(s)
        if not c:
            if s in seen:
                nxt[s] = seen[s]
            continue
        old = seen.get(s)
        if not old:
            nxt[s] = snap(c)
            continue
        n: dict = {}
        more = (c.get("tc") or 0) - (old[0] or 0)
        if more > 0:
            n["trades"] = more
        elif c.get("ld") and old[1] and c["ld"] > old[1]:
            n["trades"] = 1
        if n.get("trades") and c.get("h"):
            n["high"] = True
        p = c.get("p") or 0
        if dp and p and old[2] and abs(p - old[2]) >= dp:
            n["dp"] = [old[2], p]
        if n:
            out.append(dict(n, s=s, name=c.get("n") or s, u=c["u"]))
            nxt[s] = snap(c)
        else:
            nxt[s] = old
    return out, nxt


def _eok(v: float) -> str:
    return f"{round(v / 10000, 1):g}억" if v >= 10000 else f"{round(v):,}만"


def message(items: list[dict], base: str = "") -> dict:
    """알림 한 통: 제목은 몇 곳, 본문은 앞의 두 곳. 한 곳이면 그 단지 거래 목록으로, 여럿이면 관심 화면 '새 소식'으로.
    주소는 사이트 맨 위(base)부터 (지역 폴더마다 알림을 맡는 워커가 달라 상대 주소로는 엇갈림)"""
    def line(n):
        bits = []
        if n.get("trades"):
            bits.append(f"새 거래 {n['trades']}건" + (" (신고가)" if n.get("high") else ""))
        if n.get("dp"):
            bits.append(f"84㎡ 시세 {_eok(n['dp'][0])} → {_eok(n['dp'][1])}")
        return f"{n['name']} {' · '.join(bits)}"
    body = "\n".join(line(n) for n in items[:2]) + (f"\n외 {len(items) - 2}곳" if len(items) > 2 else "")
    return {"title": f"관심 단지 새 소식 {len(items)}곳" if len(items) > 1 else "관심 단지 새 소식",
            "body": body, "url": base + (items[0]["u"] + "#trades" if len(items) == 1 else "my.html#news"), "tag": "djdex-news"}


# ---------- Supabase (secret 키로, 표 규칙을 거치지 않고) ----------
class Store:
    def __init__(self, url: str, key: str, session=None):
        import requests
        self.api = url.rstrip("/") + "/rest/v1/"
        self.h = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):   # 예전 service_role 키
            self.h["Authorization"] = "Bearer " + key
        self.s = session or requests.Session()

    def get(self, path: str, **params) -> list:
        r = self.s.get(self.api + path, headers=self.h, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def post(self, path: str, body, upsert: bool = False) -> None:
        h = dict(self.h, Prefer="resolution=merge-duplicates,return=minimal" if upsert else "return=minimal")
        r = self.s.post(self.api + path, headers=h, data=json.dumps(body), timeout=30)
        r.raise_for_status()

    def delete(self, path: str, **params) -> None:
        self.s.delete(self.api + path, headers=self.h, params=params, timeout=30).raise_for_status()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def encrypt(data: bytes, p256dh: str, auth: str) -> bytes:
    """웹 푸시 본문 암호화 (RFC 8291, aes128gcm): 받는 기기 공개 키와 비밀값으로 한 번 쓰는 키를 만들어 감쌈"""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    ua_pub = _b64d(p256dh)
    secret = _b64d(auth)
    me = ec.generate_private_key(ec.SECP256R1())
    me_pub = me.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = me.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    hk = lambda salt, info, n, key: HKDF(hashes.SHA256(), n, salt, info).derive(key)
    ikm = hk(secret, b"WebPush: info\x00" + ua_pub + me_pub, 32, shared)
    salt = os.urandom(16)
    cek = hk(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)
    nonce = hk(salt, b"Content-Encoding: nonce\x00", 12, ikm)
    body = AESGCM(cek).encrypt(nonce, data + b"\x02", None)
    return salt + (4096).to_bytes(4, "big") + bytes([len(me_pub)]) + me_pub + body


def vapid_header(endpoint: str, pub: str, priv: str, sub: str = "mailto:t0mango@gmail.com") -> str:
    """알림 서버에 '이 사이트가 보냄'을 밝히는 서명 (VAPID, RFC 8292)"""
    import time
    from urllib.parse import urlsplit

    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

    u = urlsplit(endpoint)
    enc = lambda o: _b64(json.dumps(o, separators=(",", ":")).encode())
    msg = enc({"typ": "JWT", "alg": "ES256"}) + "." + enc({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": sub})
    key = ec.derive_private_key(int.from_bytes(_b64d(priv), "big"), ec.SECP256R1())
    r, s = decode_dss_signature(key.sign(msg.encode(), ec.ECDSA(hashes.SHA256())))
    return f"vapid t={msg}.{_b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}, k={pub}"


def push(session, sub: dict, data: bytes, pub: str, priv: str) -> int:
    """알림 한 통 보내고 상태 번호를 돌려줌 (201 정상, 404·410 끊긴 기기)"""
    r = session.post(sub["endpoint"], data=encrypt(data, sub["p256dh"], sub["auth"]), timeout=20, headers={
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": "86400", "Urgency": "normal",
        "Authorization": vapid_header(sub["endpoint"], pub, priv)})
    return r.status_code


def vapid_keys(store: Store) -> tuple[str, str]:
    """알림 키 한 쌍 (공개, 비공개). 처음이면 만들어 저장"""
    rows = store.get("push_keys", select="pub,priv", id="eq.1")
    if rows:
        return rows[0]["pub"], rows[0]["priv"]
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    k = ec.generate_private_key(ec.SECP256R1())
    pub = _b64(k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    priv = _b64(k.private_numbers().private_value.to_bytes(32, "big"))
    store.post("push_keys", {"id": 1, "pub": pub, "priv": priv})
    print("[알림] 알림 키를 새로 만들었습니다")
    return pub, priv


def main(argv: list[str]) -> int:
    url, key = os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        print("[알림] SUPABASE_SECRET_KEY 가 없어 건너뜁니다")
        return 0
    site = Path(argv[0] if argv else "site")
    import tomllib
    base = tomllib.loads(Path("config.toml").read_text(encoding="utf-8")).get("site", {}).get("base_url", "")
    by = load_complexes(site)
    if not by:
        print("[알림] 단지 자료가 없어 건너뜁니다")
        return 0
    store = Store(url, key)
    try:
        pub, priv = vapid_keys(store)
        subs = store.get("push_subs", select="user_id,endpoint,p256dh,auth")
    except Exception as e:   # 표가 아직 없으면(db-setup 전) 조용히
        print(f"[알림] 알림 표를 읽지 못해 건너뜁니다: {type(e).__name__}")
        return 0
    if not subs:
        print("[알림] 알림을 켠 회원이 없습니다")
        return 0
    users = sorted({s["user_id"] for s in subs})
    kv: dict[str, dict] = {u: {} for u in users}
    state: dict[str, dict] = {}
    for i in range(0, len(users), 50):
        ids = "in.(" + ",".join(users[i:i + 50]) + ")"
        for r in store.get("user_kv", select="user_id,k,v", user_id=ids, k="in.(favs,prefs)"):
            kv[r["user_id"]][r["k"]] = r["v"]
        for r in store.get("push_state", select="user_id,seen", user_id=ids):
            state[r["user_id"]] = r["seen"] or {}
    sent = gone = fail = 0
    new_state = []
    for u in users:
        favs = kv[u].get("favs") or []
        dp = (kv[u].get("prefs") or {}).get("dp", DEFAULT_DP)
        items, nxt = news_for([s for s in favs if isinstance(s, str)], state.get(u, {}), by, int(dp or 0))
        new_state.append({"user_id": u, "seen": nxt})
        if not items:
            continue
        data = json.dumps(message(items, base), ensure_ascii=False).encode()
        for s in (x for x in subs if x["user_id"] == u):
            try:
                code = push(store.s, s, data, pub, priv)
            except Exception:   # 주소가 잘못됐거나 연결이 안 되는 기기 (오류 문장은 기기 주소가 섞여 찍지 않음)
                code = 0
            if code in (200, 201, 202):
                sent += 1
            elif code in (404, 410):   # 알림을 끄거나 앱을 지운 기기
                store.delete("push_subs", endpoint="eq." + s["endpoint"])
                gone += 1
            else:
                fail += 1
    for i in range(0, len(new_state), 200):
        store.post("push_state", new_state[i:i + 200], upsert=True)
    print(f"[알림] 회원 {len(users)}명 · 보냄 {sent} · 끊긴 기기 정리 {gone} · 실패 {fail}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
