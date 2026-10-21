// 동네 시황 보드: 육각 타일이 가운데부터 퍼지듯 나타나고, 누르면 오른쪽 카드에 동네 요약.
(function () {
  const sec = document.getElementById("heat");
  if (!sec) return;
  const { el } = DJ;
  const svg = document.getElementById("heat-svg");
  const card = document.getElementById("heat-card");
  const tiles = Array.from(svg.querySelectorAll(".hx"));
  let sel = null;

  DJ.onView([sec], () => {
    sec.classList.add("in");
    // 펼치기가 끝나면 지연을 없애 손에 붙는 반응으로
    setTimeout(() => sec.classList.add("ready"), DJ.calm ? 0 : 900);
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
    if (sel) sel.classList.remove("sel");
    sel = g;
    g.classList.add("sel");
    g.parentNode.appendChild(g); // 고른 타일을 맨 위로
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
      big.append(num, el("span", "muted", "최근 6개월 가격 (1년 전 같은 기간 대비)"));
      if (!quiet) DJ.countUp(num, 500);
    } else {
      big.append(el("strong", "hc-chg", "-"), el("span", "muted", "비교할 거래가 부족합니다"));
    }
    card.append(big);
    const last3 = +d.last3, usual = +d.usual;
    const max = Math.max(last3, usual, 1);
    card.append(bar("최근 3개월", last3, max, last3 >= usual ? "hot" : "cool"), bar("평소 3개월", Math.round(usual), max, "base"));
    const facts = el("dl", "hc-facts");
    [["단지", d.n + "곳"], ["84㎡ 중간값", d.price || "-"]].forEach(([k, v]) => facts.append(el("dt", "", k), el("dd", "", v)));
    card.append(facts);
    if (d.bestSlug) {
      const a = el("a", "hc-best");
      a.href = "apt/" + d.bestSlug + ".html";
      a.append(el("span", "muted", "이 동네 지수 1위"), el("span", "grade g-" + d.bestGrade, d.bestGrade), el("strong", "", d.best), el("span", "hc-go", "→"));
      card.append(a);
    }
    const jump = el("button", "btn hc-list", "이 동네 단지 목록 보기");
    jump.type = "button";
    jump.addEventListener("click", () => {
      const chip = document.querySelector('#gu-filter .chip[data-gu="' + d.gu + '"]');
      if (chip) chip.click();
      const search = document.getElementById("search");
      if (search) { search.value = d.dong; search.dispatchEvent(new Event("input")); }
      document.getElementById("list").scrollIntoView({ behavior: DJ.calm ? "auto" : "smooth" });
    });
    card.append(jump);
  }

  tiles.forEach(g => {
    g.addEventListener("click", () => show(g));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(g); } });
    // 마우스를 올린 타일이 이웃에 가리지 않게 맨 위로
    g.addEventListener("pointerenter", () => { if (g !== sel) svg.insertBefore(g, sel || null); });
  });

  // 온도 칩: 누르면 그 온도만 남기고 나머지는 흐리게 (다시 누르면 해제)
  const chips = Array.from(sec.querySelectorAll(".heat-chip"));
  chips.forEach(c => c.addEventListener("click", () => {
    const on = c.getAttribute("aria-pressed") !== "true";
    chips.forEach(o => o.setAttribute("aria-pressed", "false"));
    c.setAttribute("aria-pressed", on ? "true" : "false");
    sec.classList.toggle("filtering", on);
    tiles.forEach(g => g.classList.toggle("match", on && g.dataset.band === c.dataset.band));
  }));

  const start = tiles.find(g => g.dataset.key === card.dataset.start);
  if (start) show(start, true);
  // 좁은 화면: 보드를 옆으로 밀어 볼 수 있게 하고, 처음엔 가운데를 보여줍니다.
  const wrap = sec.querySelector(".heat-board");
  if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
})();
