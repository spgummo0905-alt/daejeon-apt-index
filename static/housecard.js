/* 집감 카드 (C0·C1) — 휴대폰 쪽 카드 부품. 서버 틀(templates/_card.html)과 같은 모양, 값은 complexes.json 의 기존 값만 씀(새 계산 없음).
   DJ.hc.mini(c): 미니 카드 · DJ.hc.feature(c, tag): 홈 '이어서 볼 집' 한 장. 건물 그림은 실제 외관이 아닌 추상 그래픽 */
(function () {
  "use strict";
  const DJ = window.DJ; if (!DJ) return;
  const el = DJ.el || ((t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; });
  const art = seed => { const a = el("span", "hc-art v" + ((seed || 0) % 3)); a.setAttribute("aria-hidden", "true"); ["hc-sun", "hc-b b1", "hc-b b2", "hc-b b3"].forEach(c => a.append(el("i", c))); return a; };
  const grade = g => { const s = el("span", "hc-grade g-" + g, g === "-" ? "?" : g); const r = el("span", "sr-only", "등급"); s.append(r); return s; };
  const price = c => { const w = el("span", "hc-price"); if (c.pt) { w.append(el("b", "", c.pt), el("small", "", "84㎡ 추정")); } else w.append(el("b", "none", "가격 계산 보류")); return w; };
  const facts = c => DJ.place(c) + (c.y ? " · " + c.y + "년" : "");
  function mini(c) {
    const a = el("a", "hc hc-mini g-" + c.g); a.href = DJ.href(c); a.dataset.hc = "mini"; a.dataset.slug = c.s;
    const body = el("span", "hc-body"), name = el("span", "hc-name");
    name.append(el("strong", "", c.n), grade(c.g));
    body.append(el("span", "hc-meta", facts(c)), name, price(c));
    a.append(art(c.rk), body, el("span", "hc-go", "›")); a.lastChild.setAttribute("aria-hidden", "true");
    return a;
  }
  function feature(c, tag) {
    const a = el("a", "hc-feature g-" + c.g); a.href = DJ.href(c); a.dataset.hc = "feature"; a.dataset.slug = c.s;
    const body = el("span", "hc-body"), name = el("span", "hc-name");
    name.append(el("strong", "", c.n), grade(c.g));
    if (tag) body.append(el("span", "hc-tag", tag));
    body.append(name, el("span", "hc-meta", facts(c) + (c.i != null ? " · 지수 " + c.i + "점" : "")), price(c));
    a.append(art(c.rk), body);
    return a;
  }
  DJ.hc = { mini, feature, art, grade };

  // 홈: 이어서 볼 집 (가장 최근에 본 단지 → 없으면 관심 단지 첫 번째 → 없으면 빈 상태 그대로)
  const box = document.querySelector("[data-hc-feature]");
  if (box) {
    const rec = DJ.recent().map(r => r && r.s).filter(Boolean), favs = DJ.favs();
    const want = rec[0] || favs[0];
    if (want) DJ.data().then(d => {
      const c = d.bySlug[want]; if (!c) return;
      const tag = rec[0] === want ? "최근 살펴본 단지" : "관심 단지";
      const empty = box.querySelector("[data-hc-feat-empty]");
      const card = feature(c, tag);
      if (empty) empty.replaceWith(card); else box.append(card);
      const more = box.querySelector("[data-hc-feat-more]"); if (more) more.hidden = false;
    }).catch(() => {});
  }
})();
