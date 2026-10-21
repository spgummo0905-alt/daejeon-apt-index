// 동네 온도 지도: 동 영역이 가운데부터 차례로 나타나고, 누르면 오른쪽 카드에 동네 요약.
(function () {
  const sec = document.getElementById("heat");
  if (!sec) return;
  const { el } = DJ;
  const svg = document.getElementById("heat-svg");
  const layer = svg.querySelector(".hm-dongs");
  const card = document.getElementById("heat-card");
  const tiles = Array.from(svg.querySelectorAll(".dm"));
  const byKey = new Map(tiles.map(t => [t.dataset.key, t]));
  const names = new Map(Array.from(svg.querySelectorAll(".dm-name")).map(t => [t.dataset.for, t]));
  let sel = null;

  DJ.onView([sec], () => {
    sec.classList.add("in");
    // 펼치기가 끝나면 지연을 없애 손에 붙는 반응으로
    setTimeout(() => sec.classList.add("ready"), DJ.calm ? 0 : 1100);
  }, { threshold: 0.15 });

  function bar(label, value, max, tone) {
    const row = el("div", "hc-bar");
    row.append(el("span", "hc-bar-label", label));
    const track = el("span", "hc-track");
    const fill = el("span", "hc-fill " + (tone || ""));
    track.append(fill);
    row.append(track, el("span", "hc-bar-val", value + "건"));
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.min(100, max ? value / max * 100 : 0) + "%"; }));
    return row;
  }

  function show(g, quiet) {
    if (sel) { sel.classList.remove("sel"); const n = names.get(sel.dataset.key); if (n) n.classList.remove("on"); }
    sel = g;
    g.classList.add("sel");
    layer.appendChild(g); // 고른 동을 맨 위로 (테두리가 이웃에 가리지 않게)
    const nm = names.get(g.dataset.key);
    if (nm) nm.classList.add("on");
    sec.querySelectorAll(".hr-item").forEach(b => b.classList.toggle("on", b.dataset.key === g.dataset.key));
    const d = g.dataset;
    card.replaceChildren();
    card.classList.remove("swap");
    void card.offsetWidth;
    card.classList.add("swap");
    const head = el("div", "hc-head");
    head.append(el("span", "hc-band b" + d.band, d.name), el("span", "muted", d.gu === d.dong ? "" : d.gu));
    card.append(head, el("h3", "hc-name", d.dong));
    const big = el("div", "hc-big");
    if (d.chg !== "") {
      const v = parseFloat(d.chg);
      const num = el("strong", "hc-chg " + (v > 0 ? "pos" : v < 0 ? "neg" : ""), (v > 0 ? "+" : "") + v.toFixed(1) + "%");
      big.append(num, el("span", "muted", "최근 6개월 가격, 1년 전 같은 때보다"));
      if (!quiet) DJ.countUp(num, 500);
    } else {
      big.append(el("strong", "hc-chg", "-"), el("span", "muted", "견줄 거래가 부족합니다"));
    }
    card.append(big);
    const last3 = +d.last3, usual = +d.usual;
    const max = Math.max(last3, usual, 1);
    card.append(bar("최근 3개월", last3, max, last3 >= usual ? "hot" : "cool"), bar("1년 평균", Math.round(usual), max, "base"));
    const facts = el("dl", "hc-facts");
    [["단지", d.n + "곳"], ["84㎡ 중간 가격", d.price || "-"]].forEach(([k, v]) => facts.append(el("dt", "", k), el("dd", "", v)));
    card.append(facts);
    if (d.bestSlug) {
      const a = el("a", "hc-best");
      a.href = "apt/" + d.bestSlug + ".html";
      a.append(el("span", "muted", "이 동네 지수 1위"), el("span", "grade g-" + d.bestGrade, d.bestGrade), el("strong", "", d.best), el("span", "hc-go", "→"));
      card.append(a);
    }
    const jump = el("button", "btn hc-list", "이 동네 단지 모두 보기");
    jump.type = "button";
    jump.addEventListener("click", () => DJ.showArea && DJ.showArea(d.gu, d.dong));
    card.append(jump);
  }

  tiles.forEach(g => {
    g.addEventListener("click", () => show(g));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(g); } });
    // 마우스를 올린 동의 테두리가 이웃에 가리지 않게 (고른 동보다는 아래)
    g.addEventListener("pointerenter", () => { if (g !== sel) layer.insertBefore(g, sel || null); });
  });
  sec.querySelectorAll(".hr-item").forEach(b => b.addEventListener("click", () => {
    const g = byKey.get(b.dataset.key);
    if (!g) return;
    show(g);
    // 좁은 화면에서는 카드가 지도 아래에 있어 카드로 데려갑니다
    if (window.matchMedia("(max-width: 860px)").matches) card.scrollIntoView({ behavior: DJ.calm ? "auto" : "smooth", block: "nearest" });
  }));

  // 온도 칸: 누르면 그 온도만 남기고 나머지는 흐리게 (다시 누르면 해제)
  const steps = Array.from(sec.querySelectorAll(".hs-step"));
  steps.forEach(c => c.addEventListener("click", () => {
    const on = c.getAttribute("aria-pressed") !== "true";
    steps.forEach(o => o.setAttribute("aria-pressed", "false"));
    c.setAttribute("aria-pressed", on ? "true" : "false");
    sec.classList.toggle("filtering", on);
    tiles.forEach(g => g.classList.toggle("match", on && g.dataset.band === c.dataset.band));
    names.forEach((n, k) => n.classList.toggle("match", on && byKey.get(k) && byKey.get(k).dataset.band === c.dataset.band));
  }));

  const start = byKey.get(card.dataset.start);
  if (start) show(start, true);
})();
