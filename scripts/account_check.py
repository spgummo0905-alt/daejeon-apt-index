"""카카오 로그인 저장소(Supabase) 점검.

GitHub Secrets 의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 로 공개용 주소만 불러 봅니다 (키는 로그에 찍지 않음).
  python scripts/account_check.py          설정 점검: 카카오 켜짐, 로그인 요청(scope·돌아올 주소), 표·함수
  python scripts/account_check.py --ping   매일 밤 배포 때: 무료 프로젝트가 잠들지 않게 ping 한 번
"""
from __future__ import annotations

import os
import sys
from urllib.parse import parse_qs, urlparse

import requests

_u = urlparse(os.environ.get("SUPABASE_URL", "").strip())
URL = f"{_u.scheme}://{_u.netloc}" if _u.netloc else ""   # 끝에 /rest/v1 같은 경로가 붙어 있어도 주소만
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
SITE = "https://spgummo0905-alt.github.io/daejeon-apt-index/"


def mask(s: str) -> str:
    return s[:3] + "***" if s else "(없음)"


def code_of(r: requests.Response) -> str:
    try:
        d = r.json()
        return str(d.get("code") or d.get("error_code") or d.get("error") or "")
    except ValueError:
        return ""


def main(argv: list[str]) -> int:
    if not (URL and KEY):
        print("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 가 없어 건너뜁니다.")
        return 0
    h = {"apikey": KEY}
    ping = requests.post(f"{URL}/rest/v1/rpc/ping", headers=h, json={}, timeout=30)
    print(f"ping: HTTP {ping.status_code} {ping.text.strip()[:40] if ping.ok else code_of(ping)}")
    if "--ping" in argv:
        return 0

    host = urlparse(URL).hostname or ""
    print(f"저장소 주소: https://{host.split('.')[0][:4]}….{'.'.join(host.split('.')[1:])}")
    if _u.path.strip("/"):
        print(f"  (Secrets 의 주소 끝 경로 /{_u.path.strip('/')} 는 떼고 씁니다)")
    st = requests.get(f"{URL}/auth/v1/settings", headers=h, timeout=30)
    if st.ok:
        ext = st.json().get("external", {})
        print(f"로그인 설정: 카카오 {'켜짐' if ext.get('kakao') else '꺼짐'} · 새 가입 {'막힘' if st.json().get('disable_signup') else '허용'}")
    else:
        print(f"로그인 설정: HTTP {st.status_code} {code_of(st)}")

    # 로그인 버튼이 여는 주소: 카카오로 넘어가는지, 어떤 동의항목(scope)을 묻는지, 돌아올 주소가 무엇인지
    au = requests.get(f"{URL}/auth/v1/authorize", params={"provider": "kakao", "redirect_to": SITE,
                                                         "code_challenge": "x" * 43, "code_challenge_method": "s256"},
                      headers=h, allow_redirects=False, timeout=30)
    loc = au.headers.get("Location", "")
    if loc:
        u = urlparse(loc)
        q = parse_qs(u.query)
        print(f"로그인 요청: {u.netloc}{u.path} · scope={q.get('scope', ['(없음)'])[0]} · "
              f"client_id={mask(q.get('client_id', [''])[0])} · redirect_uri={q.get('redirect_uri', ['(없음)'])[0].split('://')[-1].split('.', 1)[-1]}")
    else:
        print(f"로그인 요청: HTTP {au.status_code} {code_of(au) or au.text[:120]}")

    # 표·함수: 로그인 안 한 상태에선 막혀야 정상 (permission denied = 있음, 못 찾음 = 아직 안 만듦)
    tb = requests.get(f"{URL}/rest/v1/user_kv", params={"select": "k", "limit": "1"}, headers=h, timeout=30)
    sp = requests.post(f"{URL}/rest/v1/rpc/sync_put", headers=h, json={"items": []}, timeout=30)
    for name, r in (("user_kv 표", tb), ("sync_put 함수", sp)):
        c = code_of(r)
        if r.status_code in (401, 403) or c == "42501":
            state = "있음 (로그인 전엔 막힘, 정상)"
        elif c in ("42P01", "PGRST205", "PGRST202") or r.status_code == 404:
            state = "없음 (SQL 을 아직 실행하지 않음)"
        elif r.ok:
            state = "있음 (주의: 로그인 없이 열림)" if name.startswith("user_kv") and r.json() else "있음"
        else:
            state = f"HTTP {r.status_code} {c}"
        print(f"{name}: {state}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
