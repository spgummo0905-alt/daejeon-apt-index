"""관심 단지 새 소식 알림 (scripts/push_send.py): 소식 고르기, 알림 문구, 암호화·서명"""
import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import push_send as ps  # noqa: E402

BY = {
    "a": {"s": "a", "n": "가람", "tc": 12, "ld": "2026.10.20", "p": 52000, "h": True, "u": "apt/a.html"},
    "b": {"s": "b", "n": "나래", "tc": 5, "ld": "2026.09.01", "p": 31000, "h": False, "u": "sejong/apt/b.html"},
    "c": {"s": "c", "n": "다솜", "tc": 3, "ld": "2026.08.01", "p": 40000, "h": False, "u": "apt/c.html"},
}


def test_news_for_matches_in_app_rules():
    seen = {"a": [10, "2026.10.01", 51800], "b": [5, "2026.09.01", 30000], "gone": [1, "", 1]}
    items, nxt = ps.news_for(["a", "b", "c"], seen, BY, 500)
    got = {n["s"]: n for n in items}
    assert got["a"]["trades"] == 2 and got["a"]["high"] and "dp" not in got["a"]   # 200만 차이는 기준(500만) 아래
    assert got["b"]["dp"] == [30000, 31000] and "trades" not in got["b"]
    assert "c" not in got and nxt["c"] == [3, "2026.08.01", 40000]               # 처음 보는 관심 단지는 기준만
    assert nxt["a"] == [12, "2026.10.20", 52000] and "gone" not in nxt           # 알린 단지는 기준을 지금으로, 뺀 단지는 지움
    # 소식이 없으면 기준을 그대로 두어 조금씩 바뀐 시세도 쌓이게
    items2, nxt2 = ps.news_for(["a"], {"a": [12, "2026.10.20", 51700]}, BY, 500)
    assert not items2 and nxt2["a"] == [12, "2026.10.20", 51700]
    # 시세 알림을 끈 사람(dp 0)은 거래만
    assert not ps.news_for(["b"], seen, BY, 0)[0]


def test_message_links_from_site_root():
    one = ps.message([dict(trades=1, s="b", name="나래", u="sejong/apt/b.html")], "https://x.io/app/")
    assert one["url"] == "https://x.io/app/sejong/apt/b.html#trades" and one["title"] == "관심 단지 새 소식"
    many = [dict(trades=i + 1, s=str(i), name=f"단지{i}", u="apt/x.html") for i in range(4)]
    m = ps.message(many + [dict(dp=[50000, 56000], s="z", name="자이", u="apt/z.html")], "https://x.io/app/")
    assert m["url"] == "https://x.io/app/my.html#news" and m["title"] == "관심 단지 새 소식 5곳"
    assert m["body"].count("\n") == 2 and m["body"].endswith("외 3곳")
    assert "84㎡ 시세 5억 → 5.6억" in ps.message([dict(dp=[50000, 56000], s="z", name="자이", u="u")])["body"]


def test_load_complexes_keeps_region_paths(tmp_path):
    (tmp_path / "sejong").mkdir()
    (tmp_path / "complexes.json").write_text(json.dumps({"complexes": [{"s": "a", "n": "가람"}]}), encoding="utf-8")
    (tmp_path / "small.json").write_text(json.dumps({"complexes": [{"s": "v", "n": "빌라"}]}), encoding="utf-8")
    (tmp_path / "sejong" / "complexes.json").write_text(json.dumps({"complexes": [{"s": "b", "n": "나래"}]}), encoding="utf-8")
    by = ps.load_complexes(tmp_path)
    assert by["a"]["u"] == "apt/a.html" and by["b"]["u"] == "sejong/apt/b.html" and by["v"]["u"] == "apt/v.html"


def test_encrypt_and_vapid_signature():
    crypto = pytest.importorskip("cryptography")
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    assert crypto

    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    d = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
    ua = ec.generate_private_key(ec.SECP256R1())
    ua_pub = ua.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    secret = b"0123456789abcdef"
    msg = "관심 단지 새 소식".encode()
    body = ps.encrypt(msg, b64(ua_pub), b64(secret))
    # 받는 기기 쪽 풀기 (RFC 8291)
    salt, rs, idlen = body[:16], int.from_bytes(body[16:20], "big"), body[20]
    as_pub = body[21:21 + idlen]
    assert rs == 4096 and idlen == 65
    shared = ua.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
    hk = lambda s, info, n, k: HKDF(hashes.SHA256(), n, s, info).derive(k)
    ikm = hk(secret, b"WebPush: info\x00" + ua_pub + as_pub, 32, shared)
    pt = AESGCM(hk(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)).decrypt(
        hk(salt, b"Content-Encoding: nonce\x00", 12, ikm), body[21 + idlen:], None)
    assert pt == msg + b"\x02"

    class Store:
        rows: list = []
        def get(self, *a, **k): return self.rows
        def post(self, path, body, upsert=False): self.rows = [body]
    st = Store()
    pub, priv = ps.vapid_keys(st)
    assert ps.vapid_keys(st) == (pub, priv) and len(d(pub)) == 65
    h = ps.vapid_header("https://fcm.googleapis.com/fcm/send/abc", pub, priv)
    t, k = h.split("t=")[1].split(", k=")
    head, claims, sig = t.split(".")
    assert json.loads(d(claims))["aud"] == "https://fcm.googleapis.com" and k == pub
    raw = d(sig)
    ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), d(k)).verify(
        encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
        (head + "." + claims).encode(), ec.ECDSA(hashes.SHA256()))


def test_setup_sql_and_prefs_row():
    root = Path(__file__).resolve().parents[1]
    sql = (root / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    for name in ("push_subs", "push_state", "push_keys", "push_key()", "push_sub_put(ep text", "push_sub_del(ep text"):
        assert name in sql
    assert "revoke all on public.push_subs, public.push_state, public.push_keys from anon, authenticated" in sql
    assert "data-push-seg" in (root / "templates" / "_prefs.html").read_text(encoding="utf-8")
    assert 'addEventListener("push"' in (root / "static" / "sw.js").read_text(encoding="utf-8")
