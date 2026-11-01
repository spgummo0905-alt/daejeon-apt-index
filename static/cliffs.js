// 메인 지도 아래 '가까운데 값이 크게 다른 곳': 걸어서 10분 안(600m)인데 84㎡ 가격이 1.4배 넘게(1.5억 넘게) 나는 두 단지.
// 같은 동네인데 왜 값이 다른지 임장 때 확인할 곳을 짚어 줍니다. 자료로 보이는 차이(연식·역 거리·세대수·학군·언덕)를 붙이고,
// '지도에서 보기'는 카카오 지도에서 두 단지를 금색 선으로 이어 보여줍니다 (kmap.js 의 DJ.kmap.focusPair).
(function () {
  const box = document.querySelector("[data-cliffs]");
  if (!box) return;
  const { el } = DJ;
  const SHOW = 3, MAX = 6;
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(1)) + "억" : Math.round(v).toLocaleString() + "만");
  function km(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const h = Math.sin(r(b.la - a.la) / 2) ** 2 + Math.cos(r(a.la)) * Math.cos(r(b.la)) * Math.sin(r(b.ln - a.ln) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // 600m 안 단지끼리만 견주도록 약 600m 칸으로 나눠 이웃 칸만 봅니다. 차이가 큰 순으로, 한 단지는 한 번만,
  // 구가 여럿인 지역은 구마다 한 쌍씩 (한 동네에만 몰리지 않게)
  function cliffs(cs) {
    const cell = 0.006, grid = new Map(), key = (x, y) => x + "," + y;
    cs.forEach(c => {
      const k = key(Math.floor(c.ln / cell), Math.floor(c.la / cell));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c);
    });
    const out = [];
    cs.forEach(a => {
      const gx = Math.floor(a.ln / cell), gy = Math.floor(a.la / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        (grid.get(key(gx + dx, gy + dy)) || []).forEach(b => {
          if (b.p <= a.p || b.s === a.s) return;
          const d = km(a, b);
          if (d > 0.6 || b.p / a.p < 1.4 || b.p - a.p < 15000) return;
          out.push({ lo: a, hi: b, d, gap: b.p - a.p });
        });
      }
    });
    out.sort((x, y) => y.gap - x.gap);
    const manyGu = new Set(cs.map(c => c.gu)).size >= 3;
    const used = new Set(), gus = new Set(), top = [];
    for (const x of out) {
      if (used.has(x.lo.s) || used.has(x.hi.s) || (manyGu && gus.has(x.hi.gu))) continue;
      used.add(x.lo.s); used.add(x.hi.s); gus.add(x.hi.gu);
      top.push(x);
      if (top.length === MAX) break;
    }
    return top;
  }
  // 자료로 보이는 차이. 없으면 현장에서 찾아볼 곳
  function clues(x) {
    const a = x.hi, b = x.lo, out = [];
    if (a.y && b.y && Math.abs(a.y - b.y) >= 8) out.push(`${a.y}년식 vs ${b.y}년식`);
    const sa = a.f && a.f.subway, sb = b.f && b.f.subway;
    if (sa != null && sb != null && Math.abs(sa - sb) >= 300 && Math.min(sa, sb) <= 800) out.push(`역까지 ${Math.round(sa)}m vs ${Math.round(sb)}m`);
    if (a.hh && b.hh && Math.max(a.hh, b.hh) / Math.min(a.hh, b.hh) >= 2) out.push(`${a.hh.toLocaleString()}세대 vs ${b.hh.toLocaleString()}세대`);
    if (a.ed != null && b.ed != null && Math.abs(a.ed - b.ed) >= 15) out.push(`학군 점수 ${a.ed} vs ${b.ed}`);
    const ha = a.hl && a.hl[0], hb = b.hl && b.hl[0];
    if (ha != null && hb != null && Math.abs(ha - hb) >= 20) out.push(`주변 고저차 ${Math.round(ha)}m vs ${Math.round(hb)}m`);
    return out.slice(0, 3);
  }

  function card(x, k) {
    const li = el("li", "cliff");
    const dl = el("dl", "cl-pair");
    [[x.hi, "hi"], [x.lo, "lo"]].forEach(([c, cls]) => {
      const dt = el("dt"), a = el("a", "", c.n);
      a.href = DJ.href(c);
      dt.append(a);
      dl.append(dt, el("dd", cls, eok(c.p)));
    });
    const c = clues(x);
    li.append(dl,
      el("p", "cl-gap", `직선 ${Math.round(x.d * 1000)}m 거리 · 84㎡ 환산가 ${eok(x.gap)} 차이`),
      el("p", "cl-why", c.length ? "자료로 보이는 차이: " + c.join(" · ") : "자료상으로는 큰 차이가 보이지 않습니다. 현장에서 확인해 볼 만한 곳입니다."));
    const row = el("div", "cl-act");
    const go = el("button", "chip sm", "지도에서 보기");
    go.type = "button";
    go.dataset.cliffGo = k;
    go.hidden = !DJ.kmap;
    const cmp = el("a", "chip sm", "나란히 비교");
    cmp.href = "compare.html?s=" + [x.hi.s, x.lo.s].map(encodeURIComponent).join(",");
    row.append(go, cmp);
    li.append(row);
    return li;
  }

  DJ.data().then(d => {
    const cs = d.complexes.filter(c => c.la != null && c.ln != null && c.p && !c.sm);
    const list = cliffs(cs);
    if (!list.length) return;
    const ol = box.querySelector("ol"), more = box.querySelector("[data-cliffs-more]");
    list.forEach((x, k) => { const li = card(x, k); li.hidden = k >= SHOW; ol.append(li); });
    if (list.length > SHOW) {
      more.hidden = false;
      more.textContent = `${list.length - SHOW}곳 더 보기`;
      more.addEventListener("click", () => { ol.querySelectorAll("li").forEach(li => { li.hidden = false; }); more.hidden = true; });
    }
    box.hidden = false;
    ol.addEventListener("click", e => {
      const b = e.target.closest("[data-cliff-go]");
      if (!b || !DJ.kmap) return;
      const x = list[+b.dataset.cliffGo];
      ol.querySelectorAll(".cliff").forEach((li, i) => li.classList.toggle("on", i === +b.dataset.cliffGo));
      DJ.kmap.focusPair(x.hi, x.lo);
    });
    // 카카오 지도가 늦게 뜨면 그때 '지도에서 보기'를 보여줌
    document.addEventListener("dj:kmap-ready", () => { ol.querySelectorAll("[data-cliff-go]").forEach(b => { b.hidden = false; }); });
  });
})();
