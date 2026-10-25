// 임장 코스: 관심 단지(와 더한 단지)를 가장 짧은 순서로 묶어 하루 동선을 짭니다.
// 구간마다 거리·걸리는 시간과 카카오맵 길찾기, 단지마다 현장 체크리스트와 메모 (모두 이 기기의 브라우저에만).
(function () {
  const sec = document.getElementById("course");
  if (!sec) return;
  const { el } = DJ;
  const MAX = 8;          // 한 코스에 넣는 단지 수 (8곳까지는 모든 순서를 다 견줘 가장 짧은 길을 고름)
  const VISIT = 30;       // 단지 하나 둘러보는 데 드는 분
  const SPEED = { walk: { kmh: 4.5, detour: 1.3, label: "걸어서" }, car: { kmh: 25, detour: 1.4, label: "차로" } };
  // 현장 체크리스트: 지도·숫자로는 알 수 없고 가 봐야 아는 것
  let D = null;
  const state = Object.assign({ mode: "walk", list: null }, DJ.load("course", {}));

  DJ.data().then(d => {
    D = d;
    if (!Array.isArray(state.list)) state.list = DJ.favs().slice(0, MAX);   // 처음엔 관심 단지로
    state.list = state.list.filter(s => d.bySlug[s] && d.bySlug[s].la != null);
    DJ.search(sec.querySelector("[data-cs-add]"), c => {
      const inp = sec.querySelector("[data-cs-add]");
      inp.value = "";
      if (c.la == null) { DJ.toast("위치 정보가 없는 단지예요", "지도에 위치가 없는 단지는 코스에 넣을 수 없어요"); return; }
      if (state.list.includes(c.s)) return;
      if (state.list.length >= MAX) { DJ.toast(`코스에는 ${MAX}곳까지 넣을 수 있어요`, "하루에 둘러보기 알맞은 수예요"); return; }
      state.list.push(c.s);
      draw();
    });
    draw();
  });
  sec.querySelectorAll("[data-cs-mode]").forEach(b => b.addEventListener("click", () => { state.mode = b.dataset.csMode; draw(); }));
  // 내 설정에서 이동 방법을 바꾸면 코스에도 (prefs.js)
  document.addEventListener("dj:mode", e => { state.mode = e.detail; if (D) draw(); });
  sec.querySelector("[data-cs-print]").addEventListener("click", () => {
    sec.querySelectorAll(".cs-check").forEach(x => { x.open = true; });   // 체크리스트까지 펼쳐서 인쇄
    document.body.classList.add("print-course");
    window.print();
    setTimeout(() => document.body.classList.remove("print-course"), 500);
  });
  sec.querySelector("[data-cs-share]").addEventListener("click", () => {
    if (!D || state.list.length < 2) return;
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const stops = order().map(i => D.bySlug[state.list[i]]);
    const text = "임장 코스\n" + stops.map((c, k) => `${k + 1}. ${c.n} (${DJ.place(c)}) ${base}apt/${c.s}.html`).join("\n");
    DJ.share("임장 코스", text, base + "apt/" + stops[0].s + ".html");
  });

  const km = (a, b) => {   // 두 단지 사이 직선거리 (km)
    const R = 6371, r = Math.PI / 180;
    const dLa = (b.la - a.la) * r, dLn = (b.ln - a.ln) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dLn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const mins = d => Math.max(1, Math.round(d * SPEED[state.mode].detour / SPEED[state.mode].kmh * 60));
  const hm = m => m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}`;
  const dist = d => d < 1 ? Math.round(d * 1000 / 10) * 10 + "m" : d.toFixed(1) + "km";

  // 가장 짧은 방문 순서 (시작·끝 자유): 8곳까지라 모든 순서를 다 견줍니다
  function order() {
    const pts = state.list.map(s => D.bySlug[s]);
    const n = pts.length;
    if (n <= 2) return pts.map((_, i) => i);
    const M = pts.map(a => pts.map(b => km(a, b)));
    let best = null, bestLen = Infinity;
    const used = new Array(n).fill(false), path = [];
    (function walk(len) {
      if (len >= bestLen) return;
      if (path.length === n) { bestLen = len; best = path.slice(); return; }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        // 거꾸로 된 같은 길은 한 번만 (첫 단지 번호가 마지막보다 작을 때만)
        if (path.length === n - 1 && path[0] > i) continue;
        used[i] = true; path.push(i);
        walk(len + (path.length > 1 ? M[path[path.length - 2]][i] : 0));
        path.pop(); used[i] = false;
      }
    })(0);
    return best;
  }

  function draw() {
    DJ.save("course", state);
    sec.querySelectorAll("[data-cs-mode]").forEach(b => { const on = b.dataset.csMode === state.mode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); });
    const body = sec.querySelector("[data-cs-body]"), empty = sec.querySelector("[data-cs-empty]");
    const enough = state.list.length >= 2;
    body.hidden = !enough;
    empty.hidden = enough;
    if (!enough) return;
    const idx = order(), stops = idx.map(i => D.bySlug[state.list[i]]);
    const legs = stops.slice(1).map((c, k) => km(stops[k], c));
    const total = legs.reduce((a, b) => a + b, 0), move = legs.reduce((a, d) => a + mins(d), 0);
    const sum = sec.querySelector("[data-cs-sum]");
    sum.replaceChildren();
    [["단지", stops.length + "곳"], ["총 거리", dist(total)], [SPEED[state.mode].label, "약 " + hm(move)], ["둘러보기 포함", "약 " + hm(move + VISIT * stops.length)]]
      .forEach(([k, v]) => { const d = el("div", "cs-kv"); d.append(el("span", "", k), el("b", "", v)); sum.append(d); });
    map(stops);
    const list = sec.querySelector("[data-cs-list]");
    list.replaceChildren();
    stops.forEach((c, k) => {
      const li = el("li", "cs-stop");
      const head = el("div", "cs-head");
      const no = el("span", "cs-no", String(k + 1));
      const t = el("div", "cs-t");
      const a = el("a", "", c.n); a.href = DJ.href(c);
      t.append(a, el("span", "muted", [DJ.place(c), c.pt ? "84㎡ " + c.pt : "", c.g && c.g !== "-" ? c.g + "등급" : ""].filter(Boolean).join(" · ")));
      const del = el("button", "cs-del", "×");
      del.type = "button";
      del.setAttribute("aria-label", c.n + " 코스에서 빼기");
      del.addEventListener("click", () => { state.list = state.list.filter(s => s !== c.s); draw(); });
      head.append(no, t, del);
      li.append(head, checklist(c));
      if (k === 0) li.append(link("이 단지까지 길찾기", `https://map.kakao.com/link/to/${encodeURIComponent(c.n)},${c.la},${c.ln}`, "cs-first"));
      if (k < stops.length - 1) {
        const nx = stops[k + 1], d = legs[k];
        li.append(link(`다음 단지까지 ${dist(d)} · ${SPEED[state.mode].label} 약 ${hm(mins(d))} · 카카오맵 길찾기`,
          `https://map.kakao.com/link/from/${encodeURIComponent(c.n)},${c.la},${c.ln}/to/${encodeURIComponent(nx.n)},${nx.la},${nx.ln}`, "cs-leg"));
      }
      list.append(li);
    });
  }
  function link(text, href, cls) {
    const a = el("a", cls, text + " ›");
    a.href = href; a.target = "_blank"; a.rel = "noopener";
    return a;
  }
  // 현장 체크리스트와 메모: 단지마다 저장 (현장 모드·다른 코스에서도 같은 단지면 이어서).
  // 이 단지 자료로 짚은 항목(언덕·주차·관리비 …)을 먼저, 그다음 기본 항목
  function checklist(c) {
    const v = DJ.visit(c.s), items = DJ.visitItems(c, document.body.dataset.region);
    const det = el("details", "cs-check");
    const sum = el("summary", "");
    const cnt = el("span", "cs-cnt");
    const paint = () => { const [n, all] = DJ.visitDone(v, items); cnt.textContent = `${n}/${all}`; cnt.classList.toggle("done", n === all); };
    sum.append(document.createTextNode("현장 체크리스트 "), cnt);
    if (v.d) sum.append(el("span", "cs-been", v.d.slice(5).replace("-", ".") + " 다녀옴"));
    const ul = el("ul", "");
    const row = (txt, why, on, set) => {
      const lab = el("label", why ? "cs-mine" : "");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = on;
      cb.addEventListener("change", () => { set(cb.checked); DJ.saveVisit(c.s, v); paint(); });
      const t = el("span", "", txt);
      if (why) t.append(el("small", "", why));
      lab.append(cb, t);
      const li = el("li", ""); li.append(lab); ul.append(li);
    };
    items.forEach(([id, txt, why]) => row(txt, why, !!v.x[id], on => { v.x[id] = on; }));
    DJ.CHECK.forEach((txt, i) => row(txt, "", !!v.c[i], on => { v.c[i] = on; }));
    const memo = el("textarea", "cs-memo");
    memo.rows = 2;
    memo.placeholder = "메모 (매물 호가, 동·층, 분위기 등)";
    memo.setAttribute("aria-label", c.n + " 메모");
    memo.value = v.m || "";
    memo.addEventListener("input", () => { v.m = memo.value; DJ.saveVisit(c.s, v); });
    det.append(sum, ul, memo);
    paint();
    return det;
  }
  // 코스 지도: 단지 위치를 비율 그대로 찍고 방문 순서대로 잇습니다 (카카오맵 없이도 보임)
  function map(stops) {
    const box = sec.querySelector("[data-cs-map]");
    const NS = "http://www.w3.org/2000/svg";
    const s = (tag, at, parent) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.append(e); return e; };
    const W = 320, H = 260, P = 34;
    const cos = Math.cos(stops[0].la * Math.PI / 180);
    const xs = stops.map(c => c.ln * cos), ys = stops.map(c => c.la);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 2 * P) / Math.max(x1 - x0, 1e-6), (H - 2 * P) / Math.max(y1 - y0, 1e-6));
    const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const pt = c => [ox + (c.ln * cos - x0) * k, H - (oy + (c.la - y0) * k)];
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "cs-svg", role: "img", "aria-label": "방문 순서 지도: " + stops.map((c, i) => `${i + 1} ${c.n}`).join(", ") });
    s("polyline", { points: stops.map(c => pt(c).join(",")).join(" "), class: "cs-route" }, svg);
    stops.forEach((c, i) => {
      const [x, y] = pt(c);
      s("circle", { cx: x, cy: y, r: 11, class: "cs-dot" }, svg);
      const t = s("text", { x, y: y + 4, class: "cs-dot-no", "text-anchor": "middle" }, svg);
      t.textContent = i + 1;
      // 가장자리 단지는 이름이 지도 밖으로 잘리지 않게 안쪽으로 붙이고, 맨 위 단지는 점 아래에
      const anchor = x > W - 72 ? "end" : x < 72 ? "start" : "middle";
      const nm = s("text", { x: anchor === "end" ? x + 12 : anchor === "start" ? x - 12 : x, y: y < 30 ? y + 28 : y - 16,
        class: "cs-dot-nm", "text-anchor": anchor }, svg);
      nm.textContent = c.n.length > 9 ? c.n.slice(0, 8) + "…" : c.n;
    });
    box.replaceChildren(svg);
  }
})();
