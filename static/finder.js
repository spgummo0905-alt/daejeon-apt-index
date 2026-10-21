(function () {
  const { el } = DJ;
  const nowYear = new Date().getFullYear();
  const CONDS = [
    { id: "subway", label: "🚇 역세권", desc: "지하철역 700m 안", test: c => c.f.subway != null && c.f.subway <= 700 },
    { id: "school", label: "🎒 초품아", desc: "초등학교 400m 안", test: c => c.f.elementary != null && c.f.elementary <= 400 },
    { id: "academy", label: "📚 학원가", desc: "반경 1km 학원 상위권", test: (c, ctx) => c.f.academy != null && c.f.academy >= ctx.academyQ },
    { id: "mart", label: "🛒 대형마트", desc: "대형마트 1km 안", test: c => c.f.mart != null && c.f.mart <= 1000 },
    { id: "new", label: "✨ 신축", desc: "준공 10년 이내", test: c => c.y && c.y >= nowYear - 10 },
    { id: "rising", label: "📈 상승세", desc: "최근 5년 기세 상위 40%", test: c => c.st[2] != null && c.st[2] >= 60 },
  ];
  const state = Object.assign({ budget: 8, gus: [], conds: ["subway"] }, DJ.load("finder", {}));

  DJ.data().then(d => {
    const priced = d.complexes.filter(c => c.p);
    const maxB = Math.ceil(Math.max(...priced.map(c => c.p)) / 10000);
    const acad = d.complexes.map(c => c.f.academy).filter(v => v != null).sort((x, y) => x - y);
    const ctx = { academyQ: acad.length ? acad[Math.floor(acad.length * 0.7)] : Infinity };
    const range = document.getElementById("budget");
    range.max = Math.max(2, maxB);
    range.value = Math.min(state.budget, range.max);
    const gus = [...new Set(d.complexes.map(c => c.gu))];

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

    let touched = false;
    function update() {
      document.getElementById("budget-val").textContent = range.value + "억 이하";
      const want = CONDS.filter(cd => state.conds.includes(cd.id));
      const list = priced
        .filter(c => c.p <= state.budget * 10000 && (!state.gus.length || state.gus.includes(c.gu)))
        .map(c => ({ c, met: want.filter(cd => cd.test(c, ctx)) }))
        .sort((x, y) => (y.met.length - x.met.length) || ((y.c.i || 0) - (x.c.i || 0)));
      const perfect = list.filter(x => x.met.length === want.length).length;
      document.getElementById("finder-count").textContent = want.length
        ? "조건을 모두 만족하는 단지 " + perfect + "곳 · 예산 안 단지 " + list.length + "곳"
        : "예산 안 단지 " + list.length + "곳 (조건을 고르면 더 좁혀집니다)";
      const grid = document.getElementById("finder-results");
      grid.replaceChildren();
      list.slice(0, 30).forEach(({ c, met }) => {
        const card = DJ.card(c, d.stats);
        if (want.length) {
          const tag = el("div", "match " + (met.length === want.length ? "full" : ""),
            "조건 " + met.length + "/" + want.length + (met.length ? " · " + met.map(m => m.label).join(" ") : ""));
          card.prepend(tag);
        }
        grid.append(card);
      });
      if (!list.length) grid.append(el("p", "muted center", "예산을 조금 올리거나 지역을 넓혀 보세요."));
      DJ.save("finder", state);
      if (touched) DJ.unlock("finder");
      touched = true;
    }
    update();
  });
})();
