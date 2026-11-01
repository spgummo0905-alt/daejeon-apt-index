// 내 정보의 '나의 임장': 관심 단지 중 직접 가 본 곳(현장 모드의 '다녀왔어요'), 현장에서 모은 기록 수,
// 아직 안 가 본 관심 단지(임장 코스로 바로 묶기), 마지막 임장. 관심 단지로 저장만 해 두지 않고 직접 가 보게 하려고.
// 기록은 이 기기 것(로그인하면 계정과 맞춘 것)으로 셉니다. 다른 지역 단지도 수에는 넣고, 이름은 이 지역 단지만.
(function () {
  const box = document.querySelector("[data-me-prog]");
  if (!box) return;
  const { el } = DJ;
  const root = window.DJ_ROOT || "";
  const day = d => d.slice(5).replace("-", ".");

  function visits() {
    let keys = [];
    try { keys = Object.keys(localStorage).filter(k => k.startsWith("djdex:visit:")); } catch (e) { /* 저장소를 못 쓰는 브라우저 */ }
    return keys.map(k => { const s = k.slice(12), v = DJ.visit(s); return { s, v, p: (v.p || []).length }; })
      .filter(({ v, p }) => v.d || v.m || v.q.length || p || v.c.some(Boolean) || Object.values(v.x).some(Boolean));
  }
  function icon(id) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("class", "ic"); svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#" + id);
    svg.append(use);
    return svg;
  }

  function draw(d) {
    const favs = DJ.favs(), vs = visits();
    const been = new Set(vs.filter(x => x.v.d).map(x => x.s));
    const favBeen = favs.filter(s => been.has(s)).length;

    // 1. 관심 단지 중 다녀온 곳
    const top = box.querySelector("[data-me-been]");
    top.replaceChildren();
    if (favs.length) {
      const pct = Math.round(favBeen / favs.length * 100);
      const head = el("div", "me-been-top"), t = el("b", "");
      if (favBeen) t.append("관심 단지 ", el("em", "", favs.length + "곳"), " 중 ", el("em", "", favBeen + "곳"), " 다녀왔어요");
      else t.append("관심 단지 ", el("em", "", favs.length + "곳"), ", 아직 직접 가 본 곳은 없어요");
      head.append(t, el("span", "me-pct", pct + "%"));
      const bar = el("div", "me-bar"), fill = el("i");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `관심 단지 ${favs.length}곳 중 ${favBeen}곳 다녀옴`);
      fill.style.width = Math.max(pct, favBeen ? 3 : 0) + "%";
      bar.append(fill);
      top.append(head, bar);
    } else {
      const p = el("p", "me-empty", "아직 저장한 관심 단지가 없습니다. 관심 단지를 저장하면 그중 몇 곳을 직접 다녀왔는지 여기에 표시됩니다. ");
      const a = el("a", "", "단지 둘러보기");
      a.href = root + "index.html";
      p.append(a);
      top.append(p);
    }

    // 2. 모은 기록
    const stats = box.querySelector("[data-me-stats]");
    stats.replaceChildren();
    [["i-star", "관심 단지", favs.length, "곳", "my.html#my-favs"],
     ["i-flag", "다녀온 단지", been.size, "곳", "my.html#notes"],
     ["i-coin", "들은 호가", vs.reduce((n, x) => n + x.v.q.length, 0), "건", "my.html#notes"],
     ["i-camera", "현장 사진", vs.reduce((n, x) => n + x.p, 0), "장", "my.html#notes"]].forEach(([ic, label, n, unit, href]) => {
      const li = el("li"), a = el("a");
      a.href = root + href;
      const num = el("b", "", n.toLocaleString());
      num.append(el("small", "", unit));
      a.append(icon(ic), el("span", "", label), num);
      li.append(a);
      stats.append(li);
    });

    // 3. 아직 안 가 본 관심 단지 (이 지역) → 임장 코스로
    const next = box.querySelector("[data-me-next]"), todo = favs.filter(s => !been.has(s) && d.bySlug[s]);
    next.replaceChildren();
    next.hidden = !todo.length;
    if (todo.length) {
      next.append(el("p", "", `아직 안 가 본 관심 단지 ${todo.length}곳`));
      const ul = el("ul", "me-todo");
      todo.slice(0, 4).forEach(s => {
        const c = d.bySlug[s], li = el("li"), a = el("a");
        a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("b", "", c.n));
        li.append(a);
        ul.append(li);
      });
      if (todo.length > 4) ul.append(el("li", "me-more", `외 ${todo.length - 4}곳`));
      const go = el("button", "btn primary", todo.length > 1 ? "이 단지들로 임장 코스 짜기" : "현장 모드로 미리 보기");
      go.type = "button";
      go.addEventListener("click", () => {
        if (todo.length === 1) { location.href = DJ.href(d.bySlug[todo[0]]) + "#field"; return; }
        const st = DJ.load("course", {}), list = todo.slice(0, 8);
        const same = Array.isArray(st.list) && st.list.length && list.every(s => st.list.includes(s));
        if (!same && Array.isArray(st.list) && st.list.length && !confirm(`지금 임장 코스를 안 가 본 관심 단지 ${list.length}곳으로 바꿀까요?`)) return;
        DJ.save("course", Object.assign(st, { list, auto: false }));
        location.href = root + "my.html#course";
      });
      next.append(ul, go);
    }

    // 4. 마지막 임장
    const last = box.querySelector("[data-me-last]");
    const lv = vs.filter(x => x.v.d && d.bySlug[x.s]).sort((a, b) => b.v.d.localeCompare(a.v.d))[0];
    last.hidden = !lv;
    if (lv) {
      const c = d.bySlug[lv.s];
      last.href = DJ.href(c) + "#field";
      last.replaceChildren(el("span", "me-last-k", "마지막 임장"), el("b", "", c.n), el("span", "muted", `${day(lv.v.d)} · ${DJ.place(c)}`),
        el("span", "me-last-go", "노트 보기 →"));
    }
  }
  const run = () => DJ.data().then(draw).catch(() => {});
  run();
  document.addEventListener("dj:auth", run);
})();
