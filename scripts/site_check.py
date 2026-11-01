"""임시 점검: 청주 단지 차트 자료(d/<slug>.json)."""
import json, requests
B = "https://www.jipgam.kr/cheongju/"
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (site-check)"
def show(v, depth=0):
    if isinstance(v, dict): return {k: show(x, depth + 1) for k, x in list(v.items())[:25]} if depth < 3 else f"dict({len(v)})"
    if isinstance(v, list): return f"list({len(v)}) first={json.dumps(v[:2], ensure_ascii=False)[:200]} last={json.dumps(v[-1:], ensure_ascii=False)[:160]}"
    return v
for slug in ("43113-544", "818098c7e5de", "43113-526"):
    r = s.get(B + f"apt/d/{slug}.json", timeout=30); print(slug, r.status_code, len(r.content))
    if r.ok: print(json.dumps(show(r.json()), ensure_ascii=False, indent=1)[:4000])
r = s.get("https://www.jipgam.kr/apt/d/30170-41.json", timeout=30); print("대전 예시", r.status_code)
if r.ok: print(json.dumps(show(r.json()), ensure_ascii=False, indent=1)[:2500])
