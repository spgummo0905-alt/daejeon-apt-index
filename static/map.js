// 지도 화면: 단지 좌표를 점으로 그리고, 점을 누르면 아래 요약 시트를 엽니다.
// 카카오 지도 SDK(홈과 같은 공개 JavaScript 키)가 준비되면 실제 지도 위에 가격 핀을 올리고, 키·도메인·쿼터·네트워크 문제로 안 뜨면 점 지도가 그대로 대체합니다.
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
  let fromList = false, km = null, ALL = [], NOXY = [], full = null, vb = null, band = 0, q = "", sel = null, view = "map", sunSet = new Set(), pinOf = new Map(), shown = [];
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
    const nq2 = norm(q), lim2 = BANDS[band][1], nu = NOXY.filter(c => (!lim2 || (c.p != null && c.p <= lim2)) && (!nq2 || norm(c.n + c.gu + c.d).includes(nq2))).length;
    const ub = $("[data-mp-unk]"); ub.hidden = !nu; ub.textContent = `지도에 없는 단지 ${nu.toLocaleString()}곳 ›`;
    apply(); if (km) realShow(); if (view === "list") buildList();
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
    // 좌표가 없는 단지: 지도에는 점을 만들지 않고(임의 위치 금지) 목록 끝에 '위치 미확인'으로만 알림
    const nq = norm(q), lim = BANDS[band][1], unk = NOXY.filter(c => (!lim || (c.p != null && c.p <= lim)) && (!nq || norm(c.n + c.gu + c.d).includes(nq)));
    if (unk.length) {
      const h = document.createElement("p"); h.className = "mp-unk-h"; h.textContent = `지도에 없는 단지 ${unk.length}곳 · 위치 정보가 없어 지도에는 표시하지 못했어요`;
      const ul2 = document.createElement("ul"); ul2.className = "mp-ul mp-unk";
      unk.slice(0, 30).forEach(c => { const li = document.createElement("li"), a = document.createElement("a"); a.href = DJ.href(c); const l = document.createElement("span"); l.className = "mp-ul-l"; const n = document.createElement("b"), p = document.createElement("span"); n.textContent = c.n; p.className = "mp-ul-p"; p.textContent = DJ.place(c) + " · 위치 미확인"; l.append(n, p); const v = document.createElement("span"); v.className = "mp-ul-v"; v.textContent = c.pt || "-"; a.append(l, v); li.append(a); ul2.append(li); });
      listBox.append(h, ul2);
    }
    if (!rows.length) { const p = document.createElement("p"); p.className = "muted mp-empty"; p.textContent = "조건에 맞는 단지가 없어요. 가격대나 검색어를 바꿔 보세요."; listBox.append(p); }
    if (more) { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = `나머지 ${rows.length - 60}곳 더 보기`; b.addEventListener("click", () => { listBox.dataset.all = "1"; buildList(); }); listBox.append(b); }
  }

  function fillSheet(c) {
    // 핀을 누르면 단지 카드(미니) 한 장: 이름·지역·등급·84㎡ 추정가·지수. 값은 complexes.json 그대로
    $("[data-sh-card]").replaceChildren(DJ.hc.mini(c, { idx: true }));
    $("[data-sh-detail]").href = DJ.href(c);
    const sun = $("[data-sh-sun]"); sun.hidden = !sunSet.has(c.s); sun.href = (window.DJ_ROOT || "") + "preview.html#c=" + encodeURIComponent(c.s);
    // 펼치면 보이는 추가 정보: 이미 있는 값만 (준공·세대수·가까운 역). 없는 값은 줄 자체를 만들지 않음
    const more = $("[data-sh-more]"); more.replaceChildren();
    const rows = [["준공", c.y ? c.y + "년" : null], ["세대수", c.hh ? c.hh.toLocaleString() + "세대" : null], ["가까운 역", c.stn && c.f && c.f.subway != null ? `${c.stn} ${Math.round(c.f.subway)}m` : null]];
    rows.forEach(([k, v]) => { if (!v) return; const d = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; d.append(dt, dd); more.append(d); });
    more.dataset.empty = more.childNodes.length ? "" : "1";
    paintFav(c.s);
  }
  function setExpanded(on) {   // 기본 높이(지도를 반 이상 남김) ↔ 확장 높이
    sheet.classList.toggle("expanded", on);
    const g = $("[data-mp-expand]"); g.setAttribute("aria-expanded", String(on)); g.setAttribute("aria-label", on ? "요약 접기" : "요약 펼치기");
    const m = $("[data-sh-more]"); m.hidden = !on || !!m.dataset.empty;
  }
  function paintFav(s) { const on = DJ.isFav(s), b = $("[data-sh-fav]"); b.setAttribute("aria-pressed", on); b.textContent = on ? "후보에 담았어요 ✓" : "후보에 담기"; }
  function select(s, opts) {
    const c = ALL.find(x => x.s === s); if (!c) return;
    const first = !sel; sel = s; fillSheet(c); if (opts && opts.focus) fromList = true;
    if (sheet.classList.contains("expanded")) setExpanded(true);   // 펼친 채로 다른 핀을 눌러도 유지
    sheet.classList.add("open");
    if (first) try { history.pushState({ mp: 1 }, ""); } catch (e) {}
    if (view === "list") setView("map");
    if (km) { realFocus(c); if (opts && opts.focus) sheet.querySelector("[data-mp-close]").focus({ preventScroll: true }); return; }
    // 고른 점을 요약 시트에 가리지 않는 위쪽 40% 자리로
    const w = Math.min(vb.w, Math.max(full.w / 12, Math.min(vb.w, full.w / 6))), h = w * vb.h / vb.w;
    setVb({ x: c._x - w / 2, y: c._y - h * .38, w, h }, true);
    if (opts && opts.focus) sheet.querySelector("[data-mp-close]").focus({ preventScroll: true });
  }
  function closeSheet() { sel = null; setExpanded(false); sheet.classList.remove("open"); if (fromList) { fromList = false; $('[data-mp-view="list"]').focus({ preventScroll: true }); } apply(); realPaint(); if (history.state && history.state.mp) try { history.back(); } catch (e) {} }
  function setView(v) {
    view = v; stage.hidden = v !== "map"; listBox.hidden = v !== "list";
    $$("[data-mp-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mpView === v));
    if (v === "list") buildList(); else { fit(); apply(); if (km) km.map.relayout(); }
  }

  // ----- 실제 지도(카카오): 준비되면 점 지도를 가리고 가격 핀을 올립니다. 안 되면 아무것도 바꾸지 않습니다 -----
  const note = () => root.querySelector(".mp-note");
  function realPaint() {
    if (!km) return;
    km.ov.forEach((o, s) => { const on = s === sel; o.el.classList.toggle("on", on); o.ov.setZIndex(on ? 9 : 1); });
  }
  function realShow() {   // 지금 조건(가격대·검색)에 맞는 단지만 지도에 둠
    km.clus.clear(); km.clus.addMarkers(shown.map(c => km.ov.get(c.s).ov)); realPaint();
  }
  function realFocus(c) {   // 고른 단지를 요약 시트에 가리지 않는 위쪽으로, 묶음에 숨지 않게 가까이
    const m = km.map, pos = new kakao.maps.LatLng(c.la, c.ln);
    if (m.getLevel() > 4) m.setLevel(4);
    m.setCenter(pos); m.panBy(0, Math.round(stage.clientHeight * .2)); realPaint();
  }
  function startReal() {
    if (km || !ALL.length) return;
    const box = $("[data-mp-km]"); box.hidden = false;
    const map = new kakao.maps.Map(box, { center: new kakao.maps.LatLng(ALL[0].la, ALL[0].ln), level: 8 });
    const clus = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 6, gridSize: 70, calculator: [10, 50, 150],
      styles: [34, 42, 50, 58].map((n, i) => ({ width: n + "px", height: n + "px", lineHeight: n + "px", borderRadius: n / 2 + "px", background: ["rgba(85,152,231,.92)", "rgba(42,120,214,.92)", "rgba(28,92,171,.92)", "rgba(16,66,129,.92)"][i], color: "#fff", textAlign: "center", fontWeight: "700", border: "2px solid #fff" })) });
    const ov = new Map();
    ALL.forEach(c => {
      const el = document.createElement("button"); el.type = "button"; el.className = "mp-kp" + (c.g === "S" ? " g-S" : ""); el.tabIndex = -1; el.setAttribute("aria-hidden", "true"); el.textContent = c.pt || c.n;
      el.addEventListener("click", e => { e.stopPropagation(); select(c.s); });
      ov.set(c.s, { el, ov: new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(c.la, c.ln), content: el, xAnchor: .5, yAnchor: 1, clickable: true }) });
    });
    // 처음 범위: 바깥으로 튄 단지를 빼고(상하위 2%) 대부분이 보이게
    const las = ALL.map(c => c.la).sort((a, b) => a - b), lns = ALL.map(c => c.ln).sort((a, b) => a - b), at = (a, p) => a[Math.round((a.length - 1) * p)];
    const bounds = new kakao.maps.LatLngBounds(new kakao.maps.LatLng(at(las, .02), at(lns, .02)), new kakao.maps.LatLng(at(las, .98), at(lns, .98)));
    map.setBounds(bounds);
    kakao.maps.event.addListener(map, "click", () => { if (sel) closeSheet(); });
    km = { map, clus, ov }; root.classList.add("mp-real"); realShow();
    if (sel) { const c = ALL.find(x => x.s === sel); if (c) realFocus(c); }
    if (note()) note().hidden = true;
  }
  function tryReal() {
    if (!window.kakao || !kakao.maps || !kakao.maps.load) {   // SDK 없음: 점 지도 그대로
      if (document.querySelector('script[src*="dapi.kakao.com"]') && note()) note().textContent = "바탕 지도를 불러오지 못해 점으로 보여요. 목록으로도 볼 수 있어요";   // 키는 있는데 실패(도메인·쿼터·네트워크)
      return;
    }
    let done = false;
    const giveUp = setTimeout(() => { if (!done && note()) note().textContent = "바탕 지도를 불러오지 못해 점으로 보여요. 목록으로도 볼 수 있어요"; }, 8000);
    try { kakao.maps.load(() => { try { startReal(); done = true; clearTimeout(giveUp); } catch (e) { if (note()) note().textContent = "바탕 지도를 불러오지 못해 점으로 보여요. 목록으로도 볼 수 있어요"; } }); } catch (e) {}
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
    else if (b.dataset.mpZoom) { if (km) km.map.setLevel(km.map.getLevel() + (b.dataset.mpZoom === "in" ? -1 : 1), { animate: !calm() }); else { const s = size(); zoomAt(s.l + s.w / 2, s.t + s.h / 2, b.dataset.mpZoom === "in" ? .6 : 1 / .6); } }
    else if (b.hasAttribute("data-mp-close")) closeSheet();
    else if (b.hasAttribute("data-mp-expand")) setExpanded(!sheet.classList.contains("expanded"));
    else if (b.hasAttribute("data-mp-unk")) { setView("list"); const h = listBox.querySelector(".mp-unk-h"); if (h) { h.setAttribute("tabindex", "-1"); h.scrollIntoView({ block: "start" }); h.focus({ preventScroll: true }); } }
    else if (b.hasAttribute("data-sh-fav")) {
      if (sel) { const s = sel, was = DJ.isFav(s), now = DJ.toggleFav(s); paintFav(s); const c = ALL.find(x => x.s === s);
        if (now && !was && DJ.toastUndo) DJ.toastUndo((c ? c.n : "단지") + " 후보에 담았어요", "", () => { if (DJ.isFav(s)) DJ.toggleFav(s); if (sel === s) paintFav(s); }); }
    }
    else if (b.dataset.band != null) { band = +b.dataset.band; $$("[data-band]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.band === band)); build(); }
    else if (b.dataset.s && listBox.contains(b)) select(b.dataset.s, { focus: true });
  });
  $("[data-mp-q]").addEventListener("input", e => { q = e.target.value; build(); });
  $("[data-mp-q]").addEventListener("keydown", e => { if (e.key === "Enter" && shown.length) { e.preventDefault(); select(shown[0].s); e.target.blur(); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sel) closeSheet(); });
  addEventListener("popstate", () => { if (sel) { sel = null; sheet.classList.remove("open"); apply(); realPaint(); } });
  addEventListener("resize", () => { if (vb) { fit(); apply(); } if (km) km.map.relayout(); });

  const chips = $("[data-mp-chips]");
  BANDS.forEach((b, i) => { const x = document.createElement("button"); x.type = "button"; x.className = "chip"; x.dataset.band = i; x.setAttribute("aria-pressed", i === 0); x.textContent = b[0]; chips.append(x); });

  DJ.data().then(d => {
    ALL = d.complexes.filter(c => c.la != null && c.ln != null); NOXY = d.complexes.filter(c => c.la == null || c.ln == null);
    if (!ALL.length) { root.querySelector(".mp-note").textContent = "표시할 단지 위치 자료가 아직 없어요"; return; }
    project(); fit(); build(); tryReal();
    const p = new URLSearchParams(location.search), qs = p.get("q");
    if (qs) { q = qs; $("[data-mp-q]").value = qs; build(); }
    const want = p.get("s"); if (want && pinOf.has(want)) select(want);
    fetch("preview/list.json").then(r => r.ok ? r.json() : []).then(l => { sunSet = new Set((Array.isArray(l) ? l : []).map(x => x.s)); if (sel) { const c = ALL.find(x => x.s === sel); if (c) fillSheet(c); } }).catch(() => {});
  }).catch(() => { root.querySelector(".mp-note").textContent = "단지 자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."; });
})();
