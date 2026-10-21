(function () {
  const { el } = DJ;
  const cfg = (() => { try { return JSON.parse(document.getElementById("finder-cfg").textContent); } catch (e) { return {}; } })();
  const LTV = cfg.ltv || 0.7, DSR = cfg.dsr || 0.4;
  const nowYear = new Date().getFullYear();
  const CONDS = [
    { id: "subway", label: "역세권", desc: "지하철역 700m 안", test: c => c.f.subway != null && c.f.subway <= 700 },
    { id: "school", label: "초품아", desc: "초등학교 400m 안", test: c => c.f.elementary != null && c.f.elementary <= 400 },
    { id: "academy", label: "학원가", desc: "주요 학원가 20분 안 (도보·지하철)", test: (c, ctx) => ctx.hasHub
        ? c.hm != null && c.hm <= 20 : c.f.academy != null && c.f.academy >= ctx.academyQ },
    { id: "mart", label: "대형마트", desc: "대형마트 1km 안", test: c => c.f.mart != null && c.f.mart <= 1000 },
    { id: "new", label: "신축 10년 이내", desc: "준공 10년 이내", test: c => c.y && c.y >= nowYear - 10 },
    { id: "rising", label: "상승세", desc: "최근 5년 상승세 상위 40%", test: c => c.st[2] != null && c.st[2] >= 60 },
    { id: "dip", label: "고점 대비 하락", desc: "전고점보다 10% 이상 낮음", test: c => c.dd != null && c.dd <= -10 },
  ];
  const state = Object.assign({ budget: 8, gus: [], conds: ["subway"], work: "", workDist: 8, here: null,
                                af: { income: "", equity: "", rate: cfg.default_rate || 4, years: cfg.default_years || 30, debt: 0 } },
                              DJ.load("finder", {}));
  const eok = v => (v >= 10000 ? (v / 10000).toFixed(1) + "억" : Math.round(v).toLocaleString() + "만");

  // 두 좌표 사이 직선거리(km)
  function km(a, b, c, d) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  DJ.data().then(d => {
    const priced = d.complexes.filter(c => c.p);
    const maxB = Math.ceil(Math.max(...priced.map(c => c.p)) / 10000);
    const acad = d.complexes.map(c => c.f.academy).filter(v => v != null).sort((x, y) => x - y);
    const ctx = { academyQ: acad.length ? acad[Math.floor(acad.length * 0.7)] : Infinity,
                  hasHub: d.complexes.some(c => c.hm != null) };
    const range = document.getElementById("budget");
    range.max = Math.max(2, maxB);
    range.value = Math.min(state.budget, range.max);
    const gus = [...new Set(d.complexes.map(c => c.gu))];

    // ---------- 감당 가능 금액 ----------
    const af = id => document.getElementById("af-" + id);
    ["income", "equity", "rate", "years", "debt"].forEach(k => {
      af(k).value = state.af[k];
      af(k).addEventListener("input", () => { state.af[k] = af(k).value; afford(); });
    });
    function afford() {
      const out = document.getElementById("af-out");
      out.replaceChildren();
      const income = +state.af.income, equity = +state.af.equity, rate = +state.af.rate, years = +state.af.years, debt = +state.af.debt || 0;
      if (!income || !equity || !years) { out.append(el("p", "muted", "연소득과 자기자본을 넣으면 계산됩니다.")); DJ.save("finder", state); return; }
      const r = rate / 100 / 12, n = years * 12;
      const monthly = Math.max(0, income * DSR - debt) / 12;
      const loanDsr = r > 0 ? monthly * (1 - Math.pow(1 + r, -n)) / r : monthly * n;
      const byDsr = equity + loanDsr, byLtv = equity / (1 - LTV);
      const maxPrice = Math.min(byDsr, byLtv);
      const loan = Math.max(0, maxPrice - equity);
      const pay = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
      const big = el("div", "af-big");
      big.append(el("span", "label", "살 수 있는 최대 가격 (어림)"), el("strong", "", eok(maxPrice)));
      const rows = el("div", "af-rows");
      rows.append(
        el("span", "", "대출 " + eok(loan) + " · 월 상환 약 " + Math.round(pay).toLocaleString() + "만원"),
        el("span", "muted", byDsr < byLtv ? "소득(DSR " + DSR * 100 + "%)이 한도를 정합니다" : "LTV " + LTV * 100 + "% 가 한도를 정합니다"));
      const apply = el("button", "btn primary", "이 금액을 예산으로 적용");
      apply.type = "button";
      apply.addEventListener("click", () => {
        range.value = Math.max(1, Math.min(range.max, Math.floor(maxPrice / 5000) / 2));
        state.budget = +range.value;
        update();
        document.getElementById("finder-count").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      out.append(big, rows, apply);
      DJ.save("finder", state);
    }

    // ---------- 조건 칩 ----------
    function chip(parent, label, on, onClick, title) {
      const b = el("button", "chip" + (on ? " active" : ""), label);
      b.type = "button";
      if (title) b.title = title;
      b.addEventListener("click", () => { onClick(); b.classList.toggle("active"); update(); });
      parent.append(b);
    }
    const guBox = document.getElementById("gu-chips");
    gus.forEach(g => chip(guBox, g, state.gus.includes(g), () => {
      state.gus = state.gus.includes(g) ? state.gus.filter(x => x !== g) : [...state.gus, g];
    }));
    const condBox = document.getElementById("cond-chips");
    CONDS.forEach(cd => chip(condBox, cd.label, state.conds.includes(cd.id), () => {
      state.conds = state.conds.includes(cd.id) ? state.conds.filter(x => x !== cd.id) : [...state.conds, cd.id];
    }, cd.desc));
    range.addEventListener("input", () => { state.budget = +range.value; update(); });

    // ---------- 직장 거리 ----------
    const work = document.getElementById("work"), distWrap = document.getElementById("work-dist-wrap"),
          dist = document.getElementById("work-dist");
    (cfg.workplaces || []).forEach((w, k) => { const o = el("option", "", w.name); o.value = String(k); work.append(o); });
    const hereOpt = el("option", "", "내 위치"); hereOpt.value = "here"; hereOpt.hidden = !state.here; work.append(hereOpt);
    work.value = state.work; dist.value = state.workDist;
    function target() {
      if (state.work === "here" && state.here) return { name: "내 위치", lat: state.here[0], lng: state.here[1] };
      const w = (cfg.workplaces || [])[+state.work];
      return state.work !== "" && w ? w : null;
    }
    work.addEventListener("change", () => { state.work = work.value; update(); });
    dist.addEventListener("input", () => { state.workDist = +dist.value; update(); });
    document.getElementById("work-here").addEventListener("click", () => {
      if (!navigator.geolocation) { DJ.toast("위치를 쓸 수 없습니다", "브라우저가 위치 기능을 지원하지 않습니다"); return; }
      navigator.geolocation.getCurrentPosition(pos => {
        state.here = [pos.coords.latitude, pos.coords.longitude];
        hereOpt.hidden = false; work.value = state.work = "here"; update();
      }, () => DJ.toast("위치를 가져오지 못했습니다", "브라우저의 위치 권한을 확인해 주세요"), { timeout: 8000 });
    });

    function update() {
      document.getElementById("budget-val").textContent = range.value + "억 이하";
      const t = target();
      distWrap.hidden = !t;
      document.getElementById("work-dist-val").textContent = t ? t.name + "까지 " + state.workDist + "km 이내" : "";
      const want = CONDS.filter(cd => state.conds.includes(cd.id));
      const list = priced
        .filter(c => c.p <= state.budget * 10000 && (!state.gus.length || state.gus.includes(c.gu)))
        .map(c => ({ c, met: want.filter(cd => cd.test(c, ctx)), km: t && c.la != null ? km(t.lat, t.lng, c.la, c.ln) : null }))
        .filter(x => !t || (x.km != null && x.km <= state.workDist))
        .sort((x, y) => (y.met.length - x.met.length) || ((y.c.i || 0) - (x.c.i || 0)));
      const perfect = list.filter(x => x.met.length === want.length).length;
      document.getElementById("finder-count").textContent = want.length
        ? "조건을 모두 만족하는 단지 " + perfect + "곳 · 범위 안 단지 " + list.length + "곳"
        : "범위 안 단지 " + list.length + "곳 (조건을 고르면 더 좁혀집니다)";
      const grid = document.getElementById("finder-results");
      grid.replaceChildren();
      list.slice(0, 30).forEach(({ c, met, km: dk }) => {
        const card = DJ.card(c, d.stats);
        const tags = [];
        if (want.length) tags.push("조건 " + met.length + "/" + want.length + (met.length ? " · " + met.map(m => m.label).join(", ") : ""));
        if (dk != null) tags.push(t.name + " " + dk.toFixed(1) + "km");
        if (tags.length) card.prepend(el("div", "match " + (want.length && met.length === want.length ? "full" : ""), tags.join(" · ")));
        grid.append(card);
      });
      if (!list.length) grid.append(el("p", "muted center", "예산을 조금 올리거나 지역·거리를 넓혀 보세요."));
      DJ.save("finder", state);
    }
    afford();
    update();
  });
})();
