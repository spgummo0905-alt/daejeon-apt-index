// 같은 값, 가까운 다른 선택지: 84㎡ 값이 ±10% 안이고 가까운(3km, 모자라면 5km) 단지 세 곳과 이 단지와 다른 점.
// 임장 나간 김에 같은 예산으로 갈 수 있는 곳을 같이 보려고 (코스에 더하기·나란히 비교).
(function () {
  const box = document.querySelector("[data-alts]");
  if (!box) return;
  const { el } = DJ;
  const slug = box.dataset.alts;
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(1)) + "억" : Math.round(v).toLocaleString() + "만");
  const km = (a, b) => {
    const r = x => x * Math.PI / 180, h = Math.sin(r(b.la - a.la) / 2) ** 2 + Math.cos(r(a.la)) * Math.cos(r(b.la)) * Math.sin(r(b.ln - a.ln) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  const dist = k => (k < 1 ? Math.round(k * 1000) + "m" : k.toFixed(1) + "km");

  // 이 단지와 견줘 자료로 보이는 차이 [글, 좋은 쪽이면 true / 나쁜 쪽 false / 중립 null]
  function diffs(o, me) {
    const out = [];
    if (o.y && me.y && Math.abs(o.y - me.y) >= 5) out.push([`${Math.abs(o.y - me.y)}년 ${o.y > me.y ? "더 새것" : "더 오래됨"} (${o.y}년)`, o.y > me.y]);
    const so = o.f && o.f.subway, sm = me.f && me.f.subway;
    if (so != null && sm != null && Math.abs(so - sm) >= 200) out.push([`역까지 ${Math.round(Math.abs(so - sm) / 10) * 10}m ${so < sm ? "더 가까움" : "더 멂"}`, so < sm]);
    else if (so != null && sm == null && so <= 1000) out.push([`역까지 ${dist(so / 1000)} (여긴 역이 멀어요)`, true]);
    if (o.hh && me.hh && Math.max(o.hh, me.hh) / Math.min(o.hh, me.hh) >= 1.5) out.push([`${o.hh.toLocaleString()}세대 (${o.hh > me.hh ? "더 큼" : "더 작음"})`, null]);
    if (o.ed != null && me.ed != null && Math.abs(o.ed - me.ed) >= 10) out.push([`학군 점수 ${o.ed > me.ed ? "+" : "−"}${Math.abs(o.ed - me.ed)}`, o.ed > me.ed]);
    const ho = o.hl && o.hl[0], hm = me.hl && me.hl[0];
    if (ho != null && hm != null && Math.abs(ho - hm) >= 15) out.push([ho < hm ? "더 평탄해요" : "언덕이 더 있어요", ho < hm]);
    if (o.i != null && me.i != null && Math.abs(o.i - me.i) >= 5) out.push([`지수 ${o.i > me.i ? "+" : "−"}${Math.abs(o.i - me.i)}`, o.i > me.i]);
    return out.slice(0, 4);
  }

  DJ.data().then(d => {
    const me = d.bySlug[slug];
    if (!me || !me.p || me.la == null) return;
    const pool = d.complexes.filter(c => c.s !== slug && c.p && c.la != null && !c.sm && Math.abs(c.p / me.p - 1) <= 0.1)
      .map(c => ({ c, k: km(me, c) }));
    let list = pool.filter(x => x.k <= 3);
    if (list.length < 3) list = pool.filter(x => x.k <= 5);
    list = list.sort((a, b) => a.k - b.k).slice(0, 3);
    if (!list.length) return;
    box.querySelector("[data-alts-sub]").textContent =
      `84㎡ 환산가 ${eok(me.p)} 안팎(±10%)이고 직선 ${list[list.length - 1].k <= 3 ? "3km" : "5km"} 안에 있는 단지입니다. 가격대가 비슷한데 어떤 차이가 있는지 함께 비교해 보세요.`;
    const ul = box.querySelector("[data-alts-list]");
    list.forEach(({ c, k }) => {
      const li = el("li", "alt");
      const a = el("a", "alt-head");
      a.href = DJ.href(c);
      const nm = el("span", "alt-name");
      nm.append(el("span", "grade g-" + c.g, c.g), el("b", "", c.n));
      const pr = el("span", "alt-price");
      const gap = Math.round((c.p / me.p - 1) * 100);
      pr.append(el("b", "", eok(c.p)), el("small", "", gap === 0 ? "같은 값" : `${gap > 0 ? "+" : "−"}${Math.abs(gap)}%`));
      a.append(nm, pr);
      const where = el("p", "alt-where", `${DJ.place(c)} · 여기서 ${dist(k)} · 걸어서 약 ${DJ.walkMin(k * 1000)}분`);
      const tags = el("div", "alt-tags");
      const ds = diffs(c, me);
      if (ds.length) ds.forEach(([t, good]) => tags.append(el("span", "alt-tag" + (good === true ? " good" : good === false ? " bad" : ""), t)));
      else tags.append(el("span", "alt-tag", "자료상 큰 차이 없음 · 현장에서 비교해 보기"));
      const acts = el("div", "alt-acts");
      const add = el("button", "chip sm", "임장 코스에 더하기");
      add.type = "button";
      add.addEventListener("click", () => {
        if (DJ.askLogin("임장 코스")) return;
        const n = DJ.addToCourse([slug, c.s]);
        if (n < 0) DJ.toast("임장 코스가 꽉 찼어요", "관심 화면의 임장 코스에서 한 곳을 빼고 다시 더해 주세요");
        else { DJ.toast(n ? "임장 코스에 더했어요" : "이미 코스에 있어요", "관심 화면의 '임장 코스'에서 동선을 볼 수 있어요"); add.textContent = "코스에 있어요 ✓"; add.disabled = true; }
      });
      const cmp = el("a", "chip sm", "나란히 비교");
      cmp.href = (window.DJ_ROOT || "") + "compare.html?s=" + [slug, c.s].map(encodeURIComponent).join(",");
      acts.append(add, cmp);
      li.append(a, where, tags, acts);
      ul.append(li);
    });
    box.hidden = false;
    // 인트로 등에서 '#alts' 로 왔으면 다 그린 뒤 이 칸으로
    if (location.hash === "#alts") requestAnimationFrame(() => box.scrollIntoView({ block: "start" }));
  });
})();
