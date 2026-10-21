(function () {
  const { el } = DJ;
  const MAX = 4;
  const params = new URLSearchParams(location.search);
  let picked = (params.get("s") || [params.get("a"), params.get("b")].filter(Boolean).join(",")).split(",").filter(Boolean).slice(0, MAX);
  const out = document.getElementById("vs-result");
  const shareBtn = document.getElementById("vs-share");

  // 비교 표의 행: 값, 표시, 좋은 쪽(high/low/null)
  const ROWS = [
    ["종합 지수", c => c.i, c => c.i == null ? "-" : c.i + "점", "high"],
    ["84㎡ 환산가", c => c.p, c => c.pt || "-", "low"],
    ["입지", c => c.st[0], c => c.st[0] ?? "-", "high"],
    ["성장성", c => c.st[1], c => c.st[1] ?? "-", "high"],
    ["상승세", c => c.st[2], c => c.st[2] ?? "-", "high"],
    ["가성비", c => c.st[3], c => c.st[3] ?? "-", "high"],
    ["거래량", c => c.st[4], c => c.st[4] ?? "-", "high"],
    ["신축도", c => c.st[5], c => c.st[5] ?? "-", "high"],
    ["10년 연평균", c => c.c10, c => c.c10 == null ? "-" : (c.c10 > 0 ? "+" : "") + c.c10 + "%", "high"],
    ["5년 연평균", c => c.c5, c => c.c5 == null ? "-" : (c.c5 > 0 ? "+" : "") + c.c5 + "%", "high"],
    ["전고점 대비", c => c.dd, c => c.dd == null ? "-" : (c.dd > 0 ? "+" : "") + Math.round(c.dd) + "%" + (c.py ? " (" + c.py + ")" : ""), null],
    ["지하철역", c => c.f.subway, c => c.f.subway == null ? "-" : (c.stn ? c.stn + " " : "") + c.f.subway + "m", "low"],
    ["학군 (중학교 순전입)", c => c.f.school_mid, c => c.f.school_mid == null ? "-" : (c.f.school_mid > 0 ? "+" : "") + c.f.school_mid + "%", "high"],
    ["주요 학원가", c => c.hm, c => c.hm == null ? "-" : c.hn + " " + c.hm + "분", "low"],
    ["초등학교", c => c.f.elementary, c => c.f.elementary == null ? "-" : c.f.elementary + "m", "low"],
    ["준공", c => c.y, c => c.y ? c.y + "년" : "-", null],
  ];

  DJ.data().then(d => {
    picked = picked.filter(s => d.bySlug[s]);
    const input = document.getElementById("pick");
    DJ.search(input, c => {
      if (!picked.includes(c.s)) picked = [...picked, c.s].slice(-MAX);
      input.value = "";
      render(d);
    });
    document.getElementById("vs-random").addEventListener("click", () => {
      const pool = d.complexes.filter(c => c.i != null);
      const x = pool[Math.floor(Math.random() * pool.length)];
      const same = pool.filter(c => c.gu === x.gu && c.s !== x.s).sort(() => Math.random() - 0.5);
      picked = [x.s, ...same.slice(0, 2).map(c => c.s)];
      render(d);
    });
    render(d);
  });

  function render(d) {
    const box = document.getElementById("picked");
    box.replaceChildren();
    picked.forEach(s => {
      const c = d.bySlug[s];
      const chip = el("button", "chip active", c.n + " ×");
      chip.type = "button";
      chip.title = "비교에서 빼기";
      chip.addEventListener("click", () => { picked = picked.filter(x => x !== s); render(d); });
      box.append(chip);
    });
    // 관심 단지·최근 본 단지는 한 번 눌러 바로 추가
    const quick = [...new Set([...DJ.favs(), ...DJ.recent().map(r => r.s)])]
      .filter(s => d.bySlug[s] && !picked.includes(s)).slice(0, 8);
    const qbox = document.getElementById("quick-chips");
    qbox.replaceChildren();
    document.getElementById("quick-add").hidden = !quick.length || picked.length >= MAX;
    quick.forEach(s => {
      const c = d.bySlug[s];
      const b = el("button", "chip", "+ " + c.n);
      b.type = "button";
      if (DJ.isFav(s)) b.append(el("span", "qa-star", "★"));
      b.addEventListener("click", () => { picked = [...picked, s].slice(-MAX); render(d); });
      qbox.append(b);
    });
    history.replaceState(null, "", picked.length ? "?s=" + picked.map(encodeURIComponent).join(",") : location.pathname);
    const cs = picked.map(s => d.bySlug[s]);
    out.replaceChildren();
    shareBtn.hidden = cs.length < 2;
    if (cs.length < 2) { out.append(el("p", "muted center", "단지를 두 곳 이상 고르면 여기에 비교 결과가 나옵니다.")); return; }

    // 항목별 1위 횟수
    const wins = cs.map(() => 0);
    const table = el("table", "cmp-table");
    const thead = el("thead"), hr = el("tr");
    hr.append(el("th", "", ""));
    cs.forEach(c => { const th = el("th"); const a = el("a", "", c.n); a.href = DJ.href(c);
      th.append(el("span", "grade g-" + c.g, c.g), document.createTextNode(" "), a); hr.append(th); });
    thead.append(hr); table.append(thead);
    const tb = el("tbody");
    ROWS.forEach(([name, get, show, better]) => {
      const tr = el("tr");
      tr.append(el("th", "", name));
      const vals = cs.map(get);
      const valid = vals.filter(v => v != null);
      const best = better && valid.length > 1 ? (better === "high" ? Math.max(...valid) : Math.min(...valid)) : null;
      const unique = best != null && vals.filter(v => v === best).length === 1;
      cs.forEach((c, k) => {
        const td = el("td", "", String(show(c)));
        if (unique && vals[k] === best) { td.classList.add("best"); if (name !== "84㎡ 환산가" && name !== "종합 지수") wins[k]++; }
        tr.append(td);
      });
      tb.append(tr);
    });
    table.append(tb);
    const top = wins.indexOf(Math.max(...wins));
    const verdict = el("p", "verdict", cs.length === 2
      ? (wins[0] === wins[1] ? "두 단지가 항목별로 비슷합니다"
         : DJ.josa(cs[top].n, "이/가") + " 비교 항목 " + (ROWS.length - 2) + "개 중 " + wins[top] + "개에서 앞섭니다")
      : "항목별로 가장 좋은 곳: " + cs.map((c, k) => c.n + " " + wins[k] + "개").join(", "));
    const wrap = el("div", "table-wrap cmp-wrap"); wrap.append(table);
    const cards = el("div", "card-grid");
    cs.forEach(c => cards.append(DJ.card(c, d.stats, { others: cs.filter(o => o !== c) })));
    out.append(verdict, wrap, el("p", "muted center small", "표시된 칸이 그 항목에서 가장 좋은 값입니다 (가격·거리는 낮을수록)."), cards);
    out.classList.remove("pop"); void out.offsetWidth; out.classList.add("pop");
    shareBtn.onclick = () => DJ.share("단지 비교: " + cs.map(c => c.n).join(" · "),
      DJ.josa(cs.map(c => c.n).join(", "), "을/를") + " 입지·수익률·가격으로 비교했습니다");
  }
})();
