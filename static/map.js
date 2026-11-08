// 지도 화면: 단지 좌표를 점으로 그리고, 점을 누르면 아래 요약 시트를 엽니다 (바탕 지도·외부 지도 SDK 없음).
// 가격·지수는 complexes.json 값 그대로(84㎡ 기준 추정 시세). 일조는 미리보기가 열린 단지에만 연결합니다.
// 지도는 끌어서 이동·두 손가락 확대·+/− 버튼, 키보드와 화면 읽기는 같은 선택을 쓰는 '목록' 보기로 합니다.
(function () {
  "use strict";
  const root = document.getElementById("mp");
  if (!root || !window.DJ) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const BANDS = [["전체", 0], ["3억 이하", 30000], ["5억 이하", 50000], ["7억 이하", 70000]];   // p 는 만원 단위
  const svg = $("[data-mp-svg]"), stage = $("[data-mp-stage]"), listBox = $("[data-mp-list]"), sheet = $("[data-mp-sheet]");
  const calm = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ALL = [], full = null, vb = null, band = 0, q = "", sel = null, view = "map", sunSet = new Set(), pinOf = new Map(), shown = [];
  const norm = s => String(s || "").replace(/\s+/g, "").toLowerCase();
  const gLayer = mk("g", {}), lLayer = mk("g", {});
  svg.append(gLayer, lLayer);

  function project() {
    const pts = ALL, lats = pts.map(c => c.la).sort((a, b) => a - b), lngs = pts.map(c => c.ln).sort((a, b) => a - b);
    const pick = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)))];
    const lat0 = (lats[0] + lats[lats.length - 1]) / 2, kx = Math.cos(lat0 * Math.PI / 180);
    const latMax = lats[lats.length - 1], lngMin = lngs[0];
    const span = Math.max((lngs[lngs.length - 1] - lngMin) * kx, latMax - lats[0]) || 1, K = 1000 / span;
    pts.forEach(c => { c._x = (c.ln - lngMin) * kx * K; c._y = (latMax - c.la) * K; });
    // 처음 보이는 범위는 바깥으로 튄 단지를 빼고(상하위 2%), 모두 닿을 수 있게 전체 범위는 따로 둠
    const xs = pts.map(c => c._x).sort((a, b) => a - b), ys = pts.map(c => c._y).sort((a, b) => a - b);
    const x0 = pick(xs, .02), x1 = pick(xs, .98), y0 = pick(ys, .02), y1 = pick(ys, .98);
    const pad = Math.max(x1 - x0, y1 - y0, 1) * .08;
    full = { x: xs[0] - pad, y: ys[0] - pad, w: xs[xs.length - 1] - xs[0] + 2 * pad, h: ys[ys.length - 1] - ys[0] + 2 * pad };
    vb = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }
  const size = () => { const r = svg.getBoundingClientRect(); return { w: r.width || 360, h: r.height || 480, l: r.left, t: r.top }; };
  function fit() {   // 화면 비율에 맞춰 보이는 범위를 넓힘(찌그러지지 않게)
    const s = size(), ar = s.w / s.h, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    let w = vb.w, h = vb.h;
    if (w / h < ar) w = h * ar; else h = w / ar;
    vb = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  function apply() {
    svg.setAttribute("viewBox", `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`);
    const k = vb.w / size().w;   // 화면 1px 이 지도 몇 칸인지: 점 크기는 확대해도 같게
    pinOf.forEach((g, s) => {
      const on = s === sel, dot = g.firstChild, hit = g.lastChild;
      dot.setAttribute("r", ((on ? 11 : 6.5) * k).toFixed(3)); dot.setAttribute("stroke-width", ((on ? 3 : 2) * k).toFixed(3));
      hit.setAttribute("r", (22 * k).toFixed(3));
    });
    labels(k);
  }
  function labels(k) {   // 고른 점은 가격을 늘 보여 주고, 많이 확대해 점이 적게 보일 때는 가격을 함께
    lLayer.replaceChildren();
    const inView = shown.filter(c => c._x >= vb.x && c._x <= vb.x + vb.w && c._y >= vb.y && c._y <= vb.y + vb.h);
    const want = new Set(inView.length <= 24 ? inView.map(c => c.s) : []);
    if (sel) want.add(sel);
    shown.forEach(c => {
      if (!want.has(c.s)) return;
      const on = c.s === sel, t = mk("text", { x: c._x.toFixed(2), y: (c._y - (on ? 18 : 12) * k).toFixed(2), "text-anchor": "middle", "font-size": ((on ? 15 : 13) * k).toFixed(3), class: "mp-lab" + (on ? " on" : ""), "aria-hidden": "true" });
      t.textContent = c.pt || c.n; lLayer.append(t);
    });
  }
  function setVb(next, tween) {
    const from = vb; vb = next; fit();
    if (!tween || calm()) { apply(); return; }
    const to = vb, t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / 200), e = 1 - Math.pow(1 - p, 3);
      vb = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
      apply(); if (p < 1) requestAnimationFrame(step); else { vb = to; apply(); }
    })(t0);
  }
  function zoomAt(px, py, f) {   // 화면 좌표(px, py)가 가리키는 지점을 고정한 채 확대·축소
    const s = size(), wx = vb.x + (px - s.l) * vb.w / s.w, wy = vb.y + (py - s.t) * vb.h / s.h;
    const w = Math.min(full.w * 1.3, Math.max(full.w / 80, vb.w * f)), g = w / vb.w;
    vb = { x: wx - (px - s.l) * w / s.w, y: wy - (py - s.t) * (vb.h * g) / s.h, w, h: vb.h * g };
    apply();
  }

  function visible() {
    const nq = norm(q), lim = BANDS[band][1];
    return ALL.filter(c => (!lim || (c.p != null && c.p <= lim)) && (!nq || norm(c.n + c.gu + c.d).includes(nq)));
  }
  function build() {
    shown = visible(); pinOf = new Map(); gLayer.replaceChildren();
    const frag = document.createDocumentFragment();
    shown.forEach(c => {
      const g = mk("g", { class: "mp-pin", "data-s": c.s, transform: `translate(${c._x.toFixed(2)} ${c._y.toFixed(2)})` });
      g.append(mk("circle", { class: "dot", r: 6, cx: 0, cy: 0 }), mk("circle", { class: "hit", r: 20, cx: 0, cy: 0 }));
      pinOf.set(c.s, g); frag.append(g);
    });
    gLayer.append(frag);
    if (sel && !pinOf.has(sel)) closeSheet();
    $("[data-mp-count]").textContent = `${shown.length.toLocaleString()}곳`;
    apply(); if (view === "list") buildList();
  }
  function buildList() {
    const rows = shown.slice().sort((a, b) => (b.i == null ? -1 : b.i) - (a.i == null ? -1 : a.i)), more = rows.length > 60 && !listBox.dataset.all;
    listBox.replaceChildren();
    const ul = document.createElement("ul"); ul.className = "mp-ul";
    (more ? rows.slice(0, 60) : rows).forEach(c => {
      const li = document.createElement("li"), b = document.createElement("button"); b.type = "button"; b.dataset.s = c.s; if (c.s === sel) b.setAttribute("aria-current", "true");
      const n = document.createElement("b"), p = document.createElement("span"), v = document.createElement("span");
      n.textContent = c.n; p.className = "mp-ul-p"; p.textContent = DJ.place(c) + (c.i == null ? "" : ` · 지수 ${c.i}점`); v.className = "mp-ul-v"; v.textContent = c.pt || "-";
      const l = document.createElement("span"); l.className = "mp-ul-l"; l.append(n, p); b.append(l, v); li.append(b); ul.append(li);
    });
    listBox.append(ul);
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted mp-empty"; p.textContent = "조건에 맞는 단지가 없어요. 가격대나 검색어를 바꿔 보세요."; listBox.append(p); }
    if (more) { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = `나머지 ${rows.length - 60}곳 더 보기`; b.addEventListener("click", () => { listBox.dataset.all = "1"; buildList(); }); listBox.append(b); }
  }

  function fillSheet(c) {
    $("[data-sh-place]").textContent = DJ.place(c);
    $("[data-sh-name]").textContent = c.n;
    $("[data-sh-price]").textContent = c.pt || "자료 없음";
    $("[data-sh-idx]").textContent = c.i == null ? "-" : c.i + "점";
    $("[data-sh-grade]").textContent = c.g && c.g !== "-" ? c.g + "등급" : "-";
    $("[data-sh-detail]").href = DJ.href(c);
    const sun = $("[data-sh-sun]"); sun.hidden = !sunSet.has(c.s); sun.href = (window.DJ_ROOT || "") + "preview.html#c=" + encodeURIComponent(c.s);
    paintFav(c.s);
  }
  function paintFav(s) { const on = DJ.isFav(s), b = $("[data-sh-fav]"); b.setAttribute("aria-pressed", on); b.textContent = on ? "후보에 담았어요 ✓" : "후보에 담기"; }
  function select(s, opts) {
    const c = ALL.find(x => x.s === s); if (!c) return;
    const first = !sel; sel = s; fillSheet(c);
    sheet.classList.add("open");
    if (first) try { history.pushState({ mp: 1 }, ""); } catch (e) {}
    if (view === "list") setView("map");
    // 고른 점을 요약 시트에 가리지 않는 위쪽 40% 자리로
    const w = Math.min(vb.w, Math.max(full.w / 12, Math.min(vb.w, full.w / 6))), h = w * vb.h / vb.w;
    setVb({ x: c._x - w / 2, y: c._y - h * .38, w, h }, true);
    if (opts && opts.focus) sheet.querySelector("a,button").focus({ preventScroll: true });
  }
  function closeSheet() { sel = null; sheet.classList.remove("open"); apply(); if (history.state && history.state.mp) try { history.back(); } catch (e) {} }
  function setView(v) {
    view = v; stage.hidden = v !== "map"; listBox.hidden = v !== "list";
    $$("[data-mp-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mpView === v));
    if (v === "list") buildList(); else { fit(); apply(); }
  }

  // ----- 손가락 조작: 한 손가락 끌기=이동, 두 손가락=확대, 점을 톡 누르면 선택 -----
  const ptrs = new Map(); let moved = false, pinch0 = 0;
  const dist = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  svg.addEventListener("pointerdown", e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    if (ptrs.size === 2) { pinch0 = dist(); svg.setPointerCapture(e.pointerId); }
  });
  svg.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1) {
      if (!moved && Math.hypot(dx, dy) < 6) return;
      if (!moved) { moved = true; svg.setPointerCapture(e.pointerId); }
      const k = vb.w / size().w; vb = { x: vb.x - dx * k, y: vb.y - dy * k, w: vb.w, h: vb.h }; p.x = e.clientX; p.y = e.clientY; apply();
    } else if (ptrs.size === 2) {
      moved = true; p.x = e.clientX; p.y = e.clientY;
      const a = [...ptrs.values()], d = dist(); if (pinch0 > 0 && d > 0) zoomAt((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2, pinch0 / d); pinch0 = d;
    }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * .0015)); }, { passive: false });
  svg.addEventListener("click", e => {
    if (moved) return;
    const g = e.target.closest && e.target.closest("[data-s]");
    if (g) select(g.dataset.s); else if (sel) closeSheet();
  });

  root.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !root.contains(b)) return;
    if (b.dataset.mpView) setView(b.dataset.mpView);
    else if (b.dataset.mpZoom) { const s = size(); zoomAt(s.l + s.w / 2, s.t + s.h / 2, b.dataset.mpZoom === "in" ? .6 : 1 / .6); }
    else if (b.hasAttribute("data-mp-close")) closeSheet();
    else if (b.hasAttribute("data-sh-fav")) { if (sel) { DJ.toggleFav(sel); paintFav(sel); } }
    else if (b.dataset.band != null) { band = +b.dataset.band; $$("[data-band]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.band === band)); build(); }
    else if (b.dataset.s && listBox.contains(b)) select(b.dataset.s, { focus: true });
  });
  $("[data-mp-q]").addEventListener("input", e => { q = e.target.value; build(); });
  $("[data-mp-q]").addEventListener("keydown", e => { if (e.key === "Enter" && shown.length) { e.preventDefault(); select(shown[0].s); e.target.blur(); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sel) closeSheet(); });
  addEventListener("popstate", () => { if (sel) { sel = null; sheet.classList.remove("open"); apply(); } });
  addEventListener("resize", () => { if (vb) { fit(); apply(); } });

  const chips = $("[data-mp-chips]");
  BANDS.forEach((b, i) => { const x = document.createElement("button"); x.type = "button"; x.className = "chip"; x.dataset.band = i; x.setAttribute("aria-pressed", i === 0); x.textContent = b[0]; chips.append(x); });

  DJ.data().then(d => {
    ALL = d.complexes.filter(c => c.la != null && c.ln != null);
    if (!ALL.length) { root.querySelector(".mp-note").textContent = "표시할 단지 위치 자료가 아직 없어요"; return; }
    project(); fit(); build();
    const p = new URLSearchParams(location.search), qs = p.get("q");
    if (qs) { q = qs; $("[data-mp-q]").value = qs; build(); }
    const want = p.get("s"); if (want && pinOf.has(want)) select(want);
    fetch("preview/list.json").then(r => r.ok ? r.json() : []).then(l => { sunSet = new Set((Array.isArray(l) ? l : []).map(x => x.s)); if (sel) { const c = ALL.find(x => x.s === sel); if (c) fillSheet(c); } }).catch(() => {});
  }).catch(() => { root.querySelector(".mp-note").textContent = "단지 자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."; });
})();
