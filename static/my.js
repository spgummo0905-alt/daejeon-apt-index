(function () {
  const { el } = DJ;
  const GRADES = ["S", "A", "B", "C", "D"];
  // 카드첩: 모은 카드 수, 등급별, 구(동)별 진행, 모은 카드 목록, 아직 못 모은 귀한 카드 하나 열어 보기
  function album(d) {
    const sec = document.getElementById("album");
    if (!sec) return;
    const a = DJ.album();
    const all = d.complexes.filter(c => GRADES.includes(c.g));
    const got = all.filter(c => a[c.s]);
    const pct = all.length ? got.length / all.length : 0;
    sec.querySelector("[data-album-total]").textContent = `${got.length.toLocaleString()} / ${all.length.toLocaleString()}장`;
    sec.querySelector("[data-album-bar]").style.width = (got.length ? Math.max(1.5, pct * 100) : 0) + "%";
    const gl = sec.querySelector("[data-album-grades]");
    GRADES.forEach(g => {
      const t = all.filter(c => c.g === g).length;
      if (!t) return;
      const n = got.filter(c => c.g === g).length;
      const li = el("li", n === t ? "full" : "");
      li.append(el("span", "grade g-" + g, g), el("span", "", `${n}/${t}`));
      li.setAttribute("aria-label", `${g}등급 ${t}장 중 ${n}장`);
      gl.append(li);
    });
    sec.querySelector("[data-album-empty]").hidden = got.length > 0;
    // 모은 카드: 등급 높은 순, 같은 등급은 지수 순. 처음엔 12장, 더 보기로 24장씩
    const sorted = got.slice().sort((x, y) => GRADES.indexOf(x.g) - GRADES.indexOf(y.g) || (y.i ?? -1) - (x.i ?? -1));
    const box = sec.querySelector("[data-album-cards]"), more = sec.querySelector("[data-album-more]");
    let shown = 0;
    const draw = k => {
      sorted.slice(shown, shown + k).forEach(c => box.append(DJ.miniCard(c)));
      shown = Math.min(sorted.length, shown + k);
      more.hidden = shown >= sorted.length;
      more.textContent = `${Math.min(24, sorted.length - shown)}장 더 보기`;
    };
    draw(12);
    more.addEventListener("click", () => draw(24));
    // 구(동)별: 모은 비율이 높은 곳부터. 한 동의 카드를 다 모으면 '다 모은 동'
    const areas = {};
    all.forEach(c => {
      const ar = areas[c.gu] || (areas[c.gu] = { n: 0, t: 0, dongs: {} });
      const dg = ar.dongs[c.d] || (ar.dongs[c.d] = { n: 0, t: 0 });
      ar.t++; dg.t++;
      if (a[c.s]) { ar.n++; dg.n++; }
    });
    const al = sec.querySelector("[data-album-areas]");
    Object.entries(areas).sort((x, y) => y[1].n / y[1].t - x[1].n / x[1].t || x[0].localeCompare(y[0], "ko"))
      .forEach(([name, ar]) => {
        const li = el("li", ar.n === ar.t ? "full" : "");
        const bar = el("span", "album-bar sm"); const fill = el("span", "");
        fill.style.width = (ar.n ? Math.max(3, ar.n / ar.t * 100) : 0) + "%";
        bar.append(fill);
        const full = Object.values(ar.dongs).filter(x => x.n === x.t && x.t).length;
        const multi = Object.keys(ar.dongs).length > 1;
        const note = ar.n === ar.t ? "다 모음" : multi && full ? `다 모은 동 ${full}곳` : "";
        li.append(el("span", "aa-name", name), bar, el("span", "aa-n", `${ar.n}/${ar.t}`));
        if (note) li.append(el("span", "aa-note", note));
        al.append(li);
      });
    // 아직 못 모은 카드 중 등급이 가장 높은 것 하나를 골라 열어 보기
    const next = sec.querySelector("[data-album-next]");
    const left = all.filter(c => !a[c.s]);
    if (!left.length) { next.textContent = "이 지역 카드를 모두 모았어요."; next.hidden = false; return; }
    const g = GRADES.find(x => left.some(c => c.g === x));
    const pool = left.filter(c => c.g === g);
    const pickC = pool[Math.floor(Math.random() * pool.length)];
    next.append(el("span", "", `아직 못 모은 ${g}카드 ${pool.length.toLocaleString()}장`));
    const go = el("a", "btn", "하나 열어 보기 →");
    go.href = DJ.href(pickC);
    next.append(go);
    next.hidden = false;
  }

  DJ.data().then(d => {
    album(d);
    const favs = DJ.favs().map(s => d.bySlug[s]).filter(Boolean);
    const recent = DJ.recent().map(r => d.bySlug[r.s]).filter(Boolean);

    const favBox = document.getElementById("favs");
    if (!favs.length) favBox.append(el("p", "muted", "아직 저장한 단지가 없습니다. 단지 페이지 오른쪽 위의 ☆를 누르면 여기에 모입니다."));
    favs.forEach(c => favBox.append(DJ.card(c, d.stats)));
    if (favs.length >= 2) {  // 비교는 네 곳까지
      const b = document.getElementById("fav-battle");
      b.hidden = false;
      b.href = "compare.html?s=" + favs.slice(0, 4).map(c => encodeURIComponent(c.s)).join(",");
      b.querySelector("span").textContent = favs.length > 4 ? "관심 단지 앞 4곳 비교" : "관심 단지끼리 비교";
    }

    // 최근 본 단지: 등급·이름·위치·지수, 관심 단지는 별 표시
    const rec = document.getElementById("recent"), clear = document.getElementById("recent-clear");
    const draw = list => {
      rec.replaceChildren();
      if (!list.length) { rec.append(el("li", "muted", "아직 둘러본 단지가 없습니다.")); clear.hidden = true; return; }
      clear.hidden = false;
      list.forEach(c => {
        const a = el("a", "recent-item"); a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("span", "ri-name", c.n), el("span", "ri-where muted", DJ.place(c)),
                 el("span", "ri-score", c.i == null ? "-" : c.i + "점"));
        if (DJ.isFav(c.s)) a.append(el("span", "ri-star", "★"));
        const li = el("li"); li.append(a); rec.append(li);
      });
    };
    draw(recent);
    clear.addEventListener("click", () => { DJ.save("recent", []); draw([]); });
  });
})();
