"""임시 점검: 청주 신영지웰푸르지오 단지 페이지의 최근 거래 표·차트 자료를 로그에 남깁니다."""
import json, re, requests
B = "https://www.jipgam.kr/cheongju/"
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (site-check)"
rows = s.get(B + "complexes.json", timeout=30).json()["complexes"]
hits = [c for c in rows if "지웰푸르지오" in c["n"] or "테크노폴리스" in c["n"]]
for c in hits:
    print(json.dumps({k: c.get(k) for k in ("s", "n", "d", "y", "tc", "lp", "ld", "lr", "i")}, ensure_ascii=False))
for c in [x for x in hits if x["s"] in ("43113-544", "818098c7e5de", "4a12f766079f")]:
    r = s.get(B + "apt/" + c["s"] + ".html", timeout=30); r.encoding = "utf-8"; h = r.text
    m = re.search(r'<tbody data-k="s">(.*?)</tbody>', h, re.S)
    trs = re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S) if m else []
    print(c["n"], r.status_code, "매매 줄", len(trs), "trades 섹션", 'id="trades"' in h, "차트", h.count("data-chart"), "길이", len(h))
    print("   첫/끝 줄:", [re.sub(r"<[^>]+>|\s+", " ", t).strip() for t in (trs[:2] + trs[-2:])])
    for t in trs[:0]:
        print("   ", re.sub(r"<[^>]+>|\s+", " ", t).strip())
    i = h.find('id="trades"'); print("   섹션 앞부분:", re.sub(r"\s+", " ", h[i:i + 900]) if i > 0 else "없음")
    j = h.find('id="chart'); print("   차트:", re.sub(r"\s+", " ", h[j:j+600]) if j > 0 else "없음")
    print("   그래프 자료 길이:", len(re.findall(r"data-pts=", h)), h.count("<svg"))
    for pat in ("거래가 없", "거래 내역이 없", "아직 거래", "분양권"):
        print("   ", pat, h.count(pat))
