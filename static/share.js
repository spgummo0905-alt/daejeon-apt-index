// 가족과 함께 보기: 관심 화면에서 만든 링크(share.html?t=…)로 들어와 그 사람의 관심 단지·임장 코스·임장 노트(사진 포함)를
// 보기 전용으로 봅니다. 로그인 없이, Supabase shared_view 함수가 링크가 살아 있을 때만 돌려줍니다.
// 다른 지역 단지는 그 지역 화면의 같은 링크로 안내합니다.
(function () {
  const box = document.querySelector("[data-sh-body]");
  if (!box) return;
  const { el } = DJ;
  const title = document.querySelector("[data-sh-title]"), lead = document.querySelector("[data-sh-lead]");
  const t = new URLSearchParams(location.search).get("t") || "";
  const eok = m => (m >= 10000 ? (+(m / 10000).toFixed(2)) + "억" : Math.round(m).toLocaleString() + "만");
  const day = d => (d ? d.slice(5).replace("-", ".") : "");
  const fail = msg => { title.textContent = "기록을 볼 수 없어요"; lead.textContent = msg; };
  if (!DJ.sb) { fail("이 사이트에서는 함께 보기를 쓸 수 없어요."); return; }
  if (!/^[0-9a-f]{24,80}$/.test(t)) { fail("링크 주소가 잘못됐어요. 받은 링크를 다시 눌러 주세요."); return; }

  Promise.all([DJ.sb.call("/rest/v1/rpc/shared_view", { method: "POST", body: { t } }), DJ.data()]).then(([r, d]) => {
    if (!r || !r.data) { fail("링크가 끊겼거나 바뀌었어요. 보내 준 분께 새 링크를 받아 주세요."); return; }
    const data = r.data, favs = data.favs || [], course = (data.course && data.course.list) || [];
    const visits = Object.keys(data).filter(k => k.startsWith("visit:")).map(k => ({ s: k.slice(6), v: Object.assign({ c: [], x: {}, m: "", q: [], p: [] }, data[k]) }))
      .filter(({ v }) => v.d || v.m || v.q.length || v.p.length || v.c.some(Boolean) || Object.values(v.x).some(Boolean));
    const all = new Set([...favs, ...course, ...visits.map(x => x.s)]);
    const here = [...all].filter(s => d.bySlug[s]), away = [...all].filter(s => !d.bySlug[s]);
    title.textContent = `${r.name}님의 임장 기록`;
    lead.textContent = `관심 단지 ${favs.length}곳 · 임장 노트 ${visits.length}곳 · 보기 전용이에요. 기록이 바뀌면 이 화면에도 바로 반영돼요.`;
    document.title = `${r.name}님의 임장 기록 · ${document.body.dataset.region || ""} 아파트 지수`;

    // 1. 임장 노트 (다녀온 날 최근 순)
    const notes = visits.filter(x => d.bySlug[x.s]).sort((a, b) => (b.v.d || "").localeCompare(a.v.d || ""));
    if (notes.length) {
      const sec = el("section", "panel sh-sec");
      sec.append(el("h2", "", "임장 노트"));
      notes.forEach(({ s, v }) => {
        const c = d.bySlug[s], items = DJ.visitItems(c, document.body.dataset.region);
        const art = el("article", "sh-note");
        const head = el("a", "sh-head");
        head.href = DJ.href(c);
        head.append(el("span", "grade g-" + c.g, c.g), el("b", "", c.n), el("span", "muted", DJ.place(c) + (v.d ? ` · ${day(v.d)} 다녀옴` : "")));
        art.append(head);
        const done = items.filter(([id]) => v.x[id]).map(([, x]) => x).concat(DJ.CHECK.filter((_, i) => v.c[i]));
        if (done.length) {
          const ul = el("ul", "sh-done");
          done.forEach(x => ul.append(el("li", "", "✓ " + x)));
          art.append(ul);
        }
        if (v.q.length) {
          const q = el("p", "sh-q");
          q.append(el("b", "", "들은 호가 "), document.createTextNode(v.q.map(([p, f, won, dd]) =>
            [p ? p + "평" : "", f ? f + "층" : "", eok(won), dd ? `(${day(dd)})` : ""].filter(Boolean).join(" ")).join(", ")));
          art.append(q);
        }
        if (v.m) art.append(el("p", "sh-memo", v.m));
        if (v.p.length) {
          const ph = el("div", "sh-photos");
          v.p.forEach(([path], i) => {
            const a = el("a"); a.href = DJ.photoUrl(path); a.target = "_blank"; a.rel = "noopener";
            const img = el("img"); img.src = DJ.photoUrl(path); img.alt = `${c.n} 현장 사진 ${i + 1}`; img.loading = "lazy";
            a.append(img); ph.append(a);
          });
          art.append(ph);
        }
        sec.append(art);
      });
      box.append(sec);
    }

    // 2. 임장 코스 (짠 순서 그대로)
    const cs = course.filter(s => d.bySlug[s]);
    if (cs.length > 1) {
      const sec = el("section", "panel sh-sec");
      sec.append(el("h2", "", "임장 코스"), el("p", "muted", (data.course.mode === "car" ? "차로" : "걸어서") + " 둘러볼 단지예요."));
      const ol = el("ol", "sh-course");
      cs.forEach(s => { const c = d.bySlug[s], li = el("li", ""), a = el("a", "", c.n); a.href = DJ.href(c); li.append(a, el("span", "muted", " " + DJ.place(c))); ol.append(li); });
      sec.append(ol);
      box.append(sec);
    }

    // 3. 관심 단지 (노트가 없는 곳)
    const rest = favs.filter(s => d.bySlug[s] && !notes.some(x => x.s === s));
    if (rest.length) {
      const sec = el("section", "panel sh-sec");
      sec.append(el("h2", "", "관심 단지"));
      const ul = el("ul", "sh-favs");
      rest.forEach(s => {
        const c = d.bySlug[s], li = el("li", ""), a = el("a", "");
        a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("b", "", c.n), el("span", "muted", DJ.place(c) + (c.p ? ` · 84㎡ ${eok(c.p)}` : "")));
        li.append(a); ul.append(li);
      });
      sec.append(ul);
      box.append(sec);
    }

    // 다른 지역 단지는 그 지역 화면으로
    if (away.length) {
      let regions = [];
      try { regions = JSON.parse(box.dataset.regions || "[]"); } catch (e) { /* 지역 목록 없음 */ }
      const others = regions.filter(g => g.name !== box.dataset.region && g.url);
      const p = el("p", "sh-away muted", `다른 지역 단지 ${away.length}곳도 있어요. `);
      others.forEach(g => { const a = el("a", "", g.name + "에서 보기"); a.href = g.url + "share.html?t=" + t; p.append(a, document.createTextNode(" ")); });
      box.append(p);
    }
    if (!here.length && !away.length) box.append(el("p", "panel muted", "아직 공유된 관심 단지나 임장 노트가 없습니다."));
  }).catch(() => fail("기록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."));
})();
