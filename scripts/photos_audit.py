"""현장 사진 저장소 읽기 전용 감사 (운영을 바꾸지 않음): 로그인 없는 사람 눈으로 본 노출 상태를 판정합니다.

사용: python scripts/photos_audit.py https://○○○.supabase.co sb_publishable_...   (둘 다 사이트 화면에 원래 내려가는 공개용 값)
      또는 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 환경 변수.
사진 내용은 읽지 않습니다. 없는 파일 주소만 두드려 '버킷이 공개인지'를 알아내고, 목록 요청으로 둘러보기가 막혀 있는지 봅니다.
종료 코드: 0 = 비공개이고 목록도 막힘, 2 = 공개 상태(알려진 현재 상태, 이전 절차 필요), 1 = 확인 실패
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _call(url: str, key: str, method: str = "GET", body: dict | None = None) -> tuple[int, str]:
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read(4000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read(4000).decode("utf-8", "ignore")


def classify_public_probe(photos_reply: str, missing_bucket_reply: str) -> str:
    """같은 '없는 파일' 요청에 photos 버킷이 '객체 없음'으로 답하고 가짜 버킷이 '버킷 없음'으로 답하면 photos 는 공개 버킷."""
    if "Bucket not found" in missing_bucket_reply and "Bucket not found" in photos_reply:
        return "private"        # 공개 경로에서 photos 가 존재하지 않는 것처럼 답함 = 비공개
    if "Object not found" in photos_reply and "Bucket not found" in missing_bucket_reply:
        return "public"
    return "unknown"


def classify_list(status: int, body: str) -> tuple[str, int | None]:
    """로그인 없이 목록을 요청했을 때 항목이 돌아오면 'listable'."""
    if status in (401, 403):
        return "blocked", None
    try:
        data = json.loads(body)
    except ValueError:
        return "unknown", None
    if isinstance(data, list):
        return ("listable" if data else "empty"), len(data)
    return "blocked" if status >= 400 else "unknown", None


def audit(base: str, key: str) -> dict:
    base = base.rstrip("/")
    _, a = _call(f"{base}/storage/v1/object/public/photos/__audit__/none.jpg", key)
    _, b = _call(f"{base}/storage/v1/object/public/__nobucket__/none.jpg", key)
    st, body = _call(f"{base}/storage/v1/object/list/photos", key, "POST", {"prefix": "", "limit": 1, "offset": 0})
    lst, n = classify_list(st, body)
    return {"bucket": classify_public_probe(a, b), "anonymous_list": lst, "listed_items": n}


def main(argv: list[str]) -> int:
    url = argv[1] if len(argv) > 1 else os.environ.get("SUPABASE_URL", "")
    key = argv[2] if len(argv) > 2 else os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not url.startswith("https://") or not key:
        print("주소와 공개용 키가 필요합니다", file=sys.stderr)
        return 1
    r = audit(url, key)
    print(json.dumps(r, ensure_ascii=False))
    if r["bucket"] == "unknown":
        return 1
    if r["anonymous_list"] == "listable":
        print("::error::로그인 없이 사진 목록이 열립니다: 정책을 바로 점검하세요")
        return 1
    return 2 if r["bucket"] == "public" else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
