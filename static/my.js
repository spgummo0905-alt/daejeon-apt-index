(function () {
  const { el } = DJ;
  DJ.data().then(d => {
    const favs = DJ.favs().map(s => d.bySlug[s]).filter(Boolean);
    const recent = DJ.recent().map(r => d.bySlug[r.s]).filter(Boolean);
    const seen = [...favs, ...recent];

    // 도감: 등급 5칸 + 구 5칸
    const col = document.getElementById("collection");
    const grades = ["S", "A", "B", "C", "D"], gus = [...new Set(d.complexes.map(c => c.gu))];
    const got = new Set(seen.map(c => c.g)), gotGu = new Set(seen.map(c => c.gu));
    const row = (title, items, have, cls) => {
      const r = el("div", "col-row");
      r.append(el("span", "col-title", title + " " + items.filter(x => have.has(x)).length + "/" + items.length));
      const slots = el("div", "col-slots");
      items.forEach(x => slots.append(el("span", "col-slot " + (have.has(x) ? "on " + cls + x : ""), x)));
      r.append(slots);
      col.append(r);
    };
    row("등급", grades, got, "g-");
    row("지역", gus, gotGu, "gu-");

    const favBox = document.getElementById("favs");
    if (!favs.length) favBox.append(el("p", "muted", "아직 찜한 단지가 없어요. 단지 페이지에서 ☆ 찜하기를 눌러 보세요."));
    favs.forEach(c => favBox.append(DJ.card(c, d.stats)));
    if (favs.length >= 2) {
      const b = document.getElementById("fav-battle");
      b.hidden = false;
      b.href = "compare.html?a=" + encodeURIComponent(favs[0].s) + "&b=" + encodeURIComponent(favs[1].s);
    }

    const got2 = DJ.unlocked();
    const ach = document.getElementById("achievements");
    DJ.achievements.forEach(a => {
      const on = !!got2[a.id];
      const card = el("div", "ach " + (on ? "on" : ""));
      card.append(el("span", "ach-icon", on ? a.icon : "🔒"), el("strong", "", a.name),
                  el("span", "muted", on ? a.desc + " · " + got2[a.id] : a.desc));
      ach.append(card);
    });

    const rec = document.getElementById("recent");
    if (!recent.length) rec.append(el("p", "muted", "아직 둘러본 단지가 없어요."));
    recent.forEach(c => { const a = el("a", "chip", c.g + " " + c.n); a.href = DJ.href(c); rec.append(a); });
  });
})();
