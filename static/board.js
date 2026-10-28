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

  // 온도 순서(뜨거운 동네부터): 카드의 이전·다음 넘기기
  const order = tiles.filter(t => t.dataset.rank).sort((a, b) => a.dataset.rank - b.dataset.rank);
  const total = +card.dataset.of || order.length;
  const pctRow = (label, p) => {  // 온도를 이룬 값: 다른 동네보다 얼마나 높은지
    const row = el("div", "hc-why-row");
    const track = el("span", "hc-track"), fill = el("span", "hc-fill " + (p >= 50 ? "hot" : "cool"));
    track.append(fill);
    row.append(el("span", "hc-bar-label", label), track, el("span", "hc-why-val", p >= 50 ? "상위 " + Math.max(1, 100 - p) + "%" : "하위 " + Math.max(1, p) + "%"));
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.max(4, p) + "%"; }));
    return row;
  };

  function show(g, quiet) {
    if (sel) { sel.classList.remove("sel"); const n = names.get(sel.dataset.key); if (n) n.classList.remove("on"); }
    sel = g;
    g.classList.add("sel");
    layer.appendChild(g); // 고른 동을 맨 위로 (테두리가 이웃에 가리지 않게). 누른 뒤라 클릭을 방해하지 않음
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
    if (d.rank) {
      const r = el("p", "hc-rank");
      r.append(el("strong", "", "온도 순위 " + d.rank + "위"), document.createTextNode(" / " + total + "개 동"));
      if (d.gu !== d.dong && +d.guOf > 1) r.append(el("span", "muted", " · " + d.gu + " 안 " + d.guRank + "위"));
      card.append(r);
    }
    const big = el("div", "hc-big");
    if (d.chg !== "") {
      const v = parseFloat(d.chg);
      const num = el("strong", "hc-chg " + (v > 0 ? "pos" : v < 0 ? "neg" : ""), (v > 0 ? "+" : "") + v.toFixed(1) + "%");
      big.append(num, el("span", "muted", "최근 6개월 가격 · 1년 전 같은 기간 대비"));
      if (!quiet) DJ.countUp(num, 500);
    } else {
      big.append(el("strong", "hc-chg", "-"), el("span", "muted", "비교할 거래가 부족합니다"));
    }
    card.append(big);
    const last3 = +d.last3, usual = +d.usual;
    const max = Math.max(last3, usual, 1);
    card.append(bar("최근 3개월", last3, max, last3 >= usual ? "hot" : "cool"), bar("1년 평균", Math.round(usual), max, "base"));
    // 온도는 이렇게: 가격 흐름 6 + 거래 흐름 4 (다른 동네와 견준 순위)
    if (d.pc !== "" && d.pv !== "") {
      const why = el("div", "hc-why");
      why.append(el("p", "hc-sub", "산출 기준"), pctRow("가격 흐름", +d.pc), pctRow("거래 흐름", +d.pv),
                 el("p", "hc-note muted", "가격 60%, 거래 40% 비중으로 다른 동네와 비교합니다"));
      card.append(why);
    }
    const facts = el("dl", "hc-facts");
    [["단지", d.n + "곳"], ["84㎡ 중간 가격", d.price || "-"], ["최근 신고가", +d.highs ? d.highs + "곳" : "없음"]]
      .forEach(([k, v]) => facts.append(el("dt", "", k), el("dd", "", v)));
    card.append(facts);
    let top = [];
    try { top = JSON.parse(d.top || "[]"); } catch (e) { /* 없음 */ }
    if (top.length) {
      const box = el("div", "hc-top");
      box.append(el("p", "hc-sub", "이 동네 지수 상위"));
      const ol = el("ol");
      top.forEach(([s, n, gr, idx]) => {
        const a = el("a"); a.href = "apt/" + s + ".html";
        a.append(el("span", "grade g-" + gr, gr), el("span", "hc-top-name", n), el("span", "hc-top-score", idx + "점"));
        const li = el("li"); li.append(a); ol.append(li);
      });
      box.append(ol);
      card.append(box);
    }
    const foot = el("div", "hc-foot");
    const jump = el("button", "btn hc-list", "이 동네 단지 모두 보기");
    jump.type = "button";
    jump.addEventListener("click", () => DJ.showArea && DJ.showArea(d.gu, d.dong));
    foot.append(jump);
    const i = order.indexOf(g);
    if (i >= 0 && order.length > 1) {
      const nav = el("div", "hc-nav");
      const mk = (txt, to, label) => {
        const b = el("button", "hc-step", txt); b.type = "button"; b.setAttribute("aria-label", label);
        b.disabled = !to; if (to) b.addEventListener("click", () => show(to));
        return b;
      };
      nav.append(mk("‹ 더 강한", order[i - 1], "흐름이 더 강한 동네 보기"), el("span", "muted", (i + 1) + " / " + order.length),
                 mk("더 약한 ›", order[i + 1], "흐름이 더 약한 동네 보기"));
      foot.append(nav);
    }
    card.append(foot);
  }

  // 누르기: 지도 전체에서 받아, 누른 자리의 동을 찾습니다
  svg.addEventListener("click", e => {
    let g = e.target.closest && e.target.closest(".dm");
    if (!g) { const h = document.elementFromPoint(e.clientX, e.clientY); g = h && h.closest && h.closest(".dm"); }
    if (g) show(g);
  });
  // 마우스를 올린 동은 위에 테두리만 덧그림 (동 자체를 옮기면 누르는 도중 클릭이 사라짐)
  const hl = svg.querySelector(".dm-hl");
  tiles.forEach(g => {
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(g); } });
    if (!hl) return;
    g.addEventListener("pointerenter", () => {
      hl.setAttribute("d", g.getAttribute("d"));
      hl.setAttribute("class", "dm-hl on b" + g.dataset.band);
    });
    g.addEventListener("pointerleave", () => hl.setAttribute("class", "dm-hl"));
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
