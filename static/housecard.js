/* 집감 카드 (C0·C1) — 휴대폰 쪽 카드 부품. 서버 틀(templates/_card.html)과 같은 모양, 값은 complexes.json 의 기존 값만 씀(새 계산 없음).
   DJ.hc.mini(c): 미니 카드 · DJ.hc.feature(c, tag): 홈 '이어서 볼 집' 한 장. 건물 그림은 실제 외관이 아닌 추상 그래픽 */
(function () {
  "use strict";
  const DJ = window.DJ; if (!DJ) return;
  const el = DJ.el || ((t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; });
  const art = seed => { const a = el("span", "hc-art v" + ((seed || 0) % 3)); a.setAttribute("aria-hidden", "true"); ["hc-sun", "hc-b b1", "hc-b b2", "hc-b b3"].forEach(c => a.append(el("i", c))); return a; };
  // 수집 카드 그림 = 단지 상세 카드와 같은 야경(cardgen.js drawArt). 처음엔 같은 남색 바탕, 그림은 한가할 때 불러와 덧그림(실패해도 남색 바탕+얇은 건물 모양으로 보임)
  const nightArt = () => { const a = el("span", "hc-art hc-night"); a.setAttribute("aria-hidden", "true"); ["hc-sun", "hc-b b1", "hc-b b2", "hc-b b3"].forEach(c => a.append(el("i", c))); return a; };
  const me = document.currentScript && document.currentScript.src;
  let artLoad = null;
  const ensureArt = () => {
    if (DJ.drawArt) return Promise.resolve(true);
    if (!artLoad) artLoad = new Promise(res => { if (!me) return res(false); const s = document.createElement("script"); s.src = me.replace(/housecard\.js/, "cardgen.js"); s.onload = () => res(!!DJ.drawArt); s.onerror = () => res(false); document.head.append(s); });
    return artLoad;
  };
  const PENDING = ".hc-collect[data-slug] .hc-art.hc-night:not([data-drawn])";
  const paintArt = () => {
    if (!DJ.drawArt) return;
    document.querySelectorAll(PENDING).forEach(span => {
      const a = span.closest(".hc-collect"); span.dataset.drawn = "1";
      const cv = document.createElement("canvas"); cv.setAttribute("aria-hidden", "true");
      try { DJ.drawArt(cv, { s: a.dataset.slug, g: a.dataset.g, d: a.dataset.d || "" }, 0.6); span.append(cv); span.classList.add("drawn"); } catch (e) { /* 그림 실패: 남색 바탕 그대로 */ }
    });
  };
  let tm = 0;
  const scan = () => { clearTimeout(tm); tm = setTimeout(() => { if (document.querySelector(PENDING)) ensureArt().then(ok => ok && paintArt()); }, 60); };
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300));
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  idle(scan);
  const grade = g => { const s = el("span", "hc-grade g-" + g, g === "-" ? "?" : g); const r = el("span", "sr-only", g === "-" ? "미산정" : "등급"); s.append(r); return s; };
  const price = c => { const w = el("span", "hc-price"); if (c.pt) { w.append(el("b", "", c.pt), el("small", "", "84㎡ 추정")); } else w.append(el("b", "none", "가격 계산 보류")); return w; };
  const facts = c => DJ.place(c) + (c.y ? " · " + c.y + "년" : "");
  function mini(c, o) {
    o = o || {};
    const a = el("a", "hc hc-mini g-" + c.g); a.href = DJ.href(c); a.dataset.hc = "mini"; a.dataset.slug = c.s;
    const body = el("span", "hc-body"), name = el("span", "hc-name");
    name.append(el("strong", "", c.n), grade(c.g));
    body.append(el("span", "hc-meta", facts(c) + (o.idx && c.i != null ? " · 지수 " + c.i + "점" : "")), name, price(c));
    a.append(art(c.rk), body, el("span", "hc-go", "›")); a.lastChild.setAttribute("aria-hidden", "true");
    if (o.been && DJ.been) { const b = DJ.been(c); if (b) { a.append(el("span", "cs-stamp", "다녀옴" + (b.d ? " " + b.d.slice(5).replace("-", ".") : ""))); a.classList.add("been"); } }
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
  // 찾기 결과 한 장: 미니 카드 + 관심 별(카드 오른쪽, 44px). 카드 전체는 단지 상세 링크, 별은 기존 관심 저장(DJ.toggleFav) 그대로
  function fcard(c, o) {
    o = o || {};
    const w = el("article", "hc-fcard g-" + c.g);
    if (o.match) w.append(el("div", "match full", o.match));
    w.append(mini(c, o));
    if (o.fav) {
      const b = el("button", "gfav hc-fav"); b.type = "button"; b.append(DJ.icon("star"));
      const paint = () => { const on = DJ.isFav(c.s); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? `${c.n} 관심 단지에서 빼기` : `${c.n} 관심 단지에 담기`); b.title = on ? "관심 단지에서 빼기" : "관심 단지에 담기"; };
      b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); DJ.toggleFav(c.s); paint(); if (!DJ.calm) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } });
      paint(); w.append(b);
    }
    return w;
  }
  // 비교용 세로 카드: 단지 둘 이상을 나란히 놓을 때 (그림 · 이름+등급 · 지역 · 84㎡ 추정가 · 지수). 같은 값, 새 계산 없음
  function col(c) {
    const a = el("a", "hc hc-col g-" + c.g); a.href = DJ.href(c); a.dataset.hc = "col"; a.dataset.slug = c.s;
    const nm = el("span", "hc-name"); nm.append(el("strong", "", c.n), grade(c.g));
    a.append(art(c.rk), nm, el("span", "hc-meta", DJ.place(c) + (c.y ? " · " + c.y + "년" : "")), price(c),
      el("span", "hc-idx", c.i == null ? "지수 미산정" : "지수 " + c.i + "점"));
    return a;
  }
  // 수집 카드(JS): 서버 틀(_card.html collect)과 같은 모양. 등급별 틀, 다녀온 단지는 도장. 금박은 수집 카드에만
  function collect(c, opt) {
    const a = el("a", "hc hc-collect g-" + c.g); a.href = DJ.href(c); a.dataset.hc = "collect"; a.dataset.slug = c.s; a.dataset.g = c.g; a.dataset.d = c.d || ""; if (c.g === "S" || c.g === "A") a.setAttribute("data-holo", "");
    a.setAttribute("aria-label", `${c.n}, ${DJ.place(c)}, ${c.g === "-" ? "미산정" : c.g + "등급"}${c.i == null ? "" : " " + c.i + "점"}`);
    const fr = el("span", "hc-frame"), inn = el("span", "hc-inner"), top = el("span", "hc-top");
    const tl = el("b", "", ""); tl.append(el("span", "hc-brand", "JIPGAM · "), document.createTextNode(c.g === "-" ? "미산정" : c.g + " TIER")); top.append(tl, grade(c.g));
    const foot = el("span", "hc-foot"), l = el("span", "", "집감 지수 "); l.append(el("b", "", c.i == null ? "미산정" : c.i + "점"));
    foot.append(l, el("b", "", c.pt || "-"));
    inn.append(top, nightArt(), el("strong", "hc-cname", c.n), el("span", "hc-meta", facts(c)), foot);
    const b = !(opt && opt.stamp === false) && DJ.been && DJ.been(c); if (b) { inn.append(el("span", "cs-stamp", "다녀옴" + (b.d ? " " + b.d.slice(5).replace("-", ".") : ""))); a.classList.add("been"); }
    fr.append(inn); a.append(fr); return a;
  }
  DJ.hc = { mini, feature, fcard, col, collect, art, grade };

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
  // MY 맨 위 '내 카드첩': 모은 카드 수 + 관심 카드(없으면 최근 본 단지) 2~3장을 바로. 숫자는 기존 앨범·방문 기록에서 세기만 함
  const my = document.querySelector("[data-hc-my]");
  if (my) DJ.data().then(d => {
    const all = d.complexes.filter(c => c.g && c.g !== "-"), n = DJ.albumCount ? DJ.albumCount(all) : 0;
    const cnt = my.querySelector("[data-hc-my-n]"); if (cnt) cnt.textContent = `${n.toLocaleString()}장 모음 · 임장 배지 ${Object.keys(DJ.earned ? DJ.earned() : {}).length}/${DJ.BADGES ? DJ.BADGES.length : 0}개`;
    const seen = new Set(), pick = [];
    [...DJ.favs(), ...DJ.recent().map(r => r && r.s)].forEach(s => { if (s && !seen.has(s) && d.bySlug[s] && pick.length < 3) { seen.add(s); pick.push(d.bySlug[s]); } });
    const rail = my.querySelector("[data-hc-my-rail]"), empty = my.querySelector("[data-hc-my-empty]");
    if (!pick.length) return;
    rail.replaceChildren(...pick.map(collect)); rail.hidden = false; if (empty) empty.hidden = true;
  }).catch(() => {});
})();
