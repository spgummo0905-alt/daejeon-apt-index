// 메인 지도의 '3D 시세': 단지마다 84㎡ 가격만큼 솟은 기둥으로, 어디가 높고(비싸고) 어디가 낮은지 한눈에.
// 가까운데 값이 크게 다른 곳(가격 절벽)을 골라 보여줘서, 임장 때 그 차이의 이유를 확인하게 합니다.
// 3D 라이브러리(deck.gl)는 '3D 시세'를 누를 때만 받아 옵니다. 배경 지도는 CARTO(OpenStreetMap).
// 지도 위 거르기(가격대·조건)를 고르면 맞는 단지만 진하게 남깁니다 (kmap.js 의 dj:kmap 이벤트).
(function () {
  const sec = document.getElementById("map"), wrap = document.getElementById("kmap-wrap");
  const box = document.getElementById("m3d"), seg = document.querySelector("[data-m3d-seg]");
  if (!sec || !wrap || !box || !seg) return;
  const { el } = DJ;
  const LIB = "https://unpkg.com/deck.gl@9.3.11/dist.min.js";
  const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;
  const TILE = s => ["a", "b", "c"].map(h => `https://${h}.basemaps.cartocdn.com/${s}/{z}/{x}/{y}@2x.png`);
  // 가격대 색: 한 가지 파랑의 밝기 단계 (낮음 → 높음). 어두운 화면은 반대로 밝아질수록 비쌈
  const RAMP = { light: ["#86b6ef", "#3987e5", "#1c5cab", "#0d366b"], dark: ["#184f95", "#2a78d6", "#6da7ec", "#cde2fb"] };
  const GOLD = [212, 175, 82];
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(1)) + "억" : Math.round(v).toLocaleString() + "만");
  const calm = DJ.calm;

  let lib = null, view = null, deckgl = null, data = null, on = null, pick = null, pair = null, spin = null, scale = 0;

  function load() {
    lib = lib || new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = LIB; s.async = true;
      s.onload = () => (window.deck ? ok(window.deck) : no(new Error("deck")));
      s.onerror = no;
      document.head.append(s);
    });
    return lib;
  }
  function km(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const h = Math.sin(r(b.la - a.la) / 2) ** 2 + Math.cos(r(a.la)) * Math.cos(r(b.la)) * Math.sin(r(b.ln - a.ln) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // 가격대: 지도 거르기와 같은 4분위 경계 (10억 아래 0.5억, 위 1억 단위)
  function bands(cs) {
    const ps = cs.map(c => c.p).sort((a, b) => a - b);
    const nice = v => { const e = v / 10000; return e < 10 ? Math.round(e * 2) / 2 : Math.round(e); };
    const q = [0.25, 0.5, 0.75].map(k => nice(ps[Math.floor(ps.length * k)] || 0)).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    return q;
  }
  const bandOf = (q, p) => { const e = p / 10000; let k = 0; while (k < q.length && e > q[k]) k++; return k; };

  // 가격 절벽: 600m 안인데 84㎡ 가격이 1.4배 넘게 나는 두 단지. 차이가 큰 순으로, 한 단지는 한 번만
  function cliffs(cs) {
    const cell = 0.006, grid = new Map();
    const key = (x, y) => x + "," + y;
    cs.forEach(c => {
      const k = key(Math.floor(c.ln / cell), Math.floor(c.la / cell));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c);
    });
    const out = [];
    cs.forEach(a => {
      const gx = Math.floor(a.ln / cell), gy = Math.floor(a.la / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        (grid.get(key(gx + dx, gy + dy)) || []).forEach(b => {
          if (b.p <= a.p || b.s === a.s) return;
          const d = km(a, b);
          if (d > 0.6 || b.p / a.p < 1.4 || b.p - a.p < 15000) return;
          out.push({ lo: a, hi: b, d, gap: b.p - a.p });
        });
      }
    });
    out.sort((x, y) => y.gap - x.gap);
    const used = new Set(), top = [];
    for (const x of out) {
      if (used.has(x.lo.s) || used.has(x.hi.s)) continue;
      used.add(x.lo.s); used.add(x.hi.s);
      top.push(x);
      if (top.length === 3) break;
    }
    return top;
  }
  // 자료로 보이는 차이 (연식·역 거리·세대수·학군). 없으면 현장에서 볼 것
  function clues(x) {
    const a = x.hi, b = x.lo, out = [];
    if (a.y && b.y && Math.abs(a.y - b.y) >= 8) out.push(`${a.y}년식 vs ${b.y}년식`);
    const sa = a.f && a.f.subway, sb = b.f && b.f.subway;
    if (sa != null && sb != null && Math.abs(sa - sb) >= 300) out.push(`역 ${Math.round(sa)}m vs ${Math.round(sb)}m`);
    if (a.hh && b.hh && Math.max(a.hh, b.hh) / Math.min(a.hh, b.hh) >= 2) out.push(`${a.hh.toLocaleString()}세대 vs ${b.hh.toLocaleString()}세대`);
    if (a.ed != null && b.ed != null && Math.abs(a.ed - b.ed) >= 15) out.push(`학군 점수 ${a.ed} vs ${b.ed}`);
    return out.slice(0, 2);
  }

  function paintCliffs(list) {
    const host = document.querySelector("[data-m3d-cliffs]");
    if (!host) return;
    const ol = host.querySelector("ol");
    ol.replaceChildren(...list.map((x, k) => {
      const li = el("li", "m3d-cliff");
      const head = el("div", "m3d-cl-h");
      const a = el("a", "", x.hi.n); a.href = DJ.href(x.hi);
      const b = el("a", "", x.lo.n); b.href = DJ.href(x.lo);
      head.append(a, el("b", "m3d-cl-p", eok(x.hi.p)), el("span", "m3d-cl-vs", "↔"), b, el("b", "m3d-cl-p", eok(x.lo.p)));
      const c = clues(x);
      const meta = el("p", "m3d-cl-m", `걸어서 ${Math.round(x.d * 1000 / 67)}분 거리(${Math.round(x.d * 1000)}m)인데 84㎡가 ${eok(x.gap)} 차이 · ` +
        (c.length ? "자료로 보이는 차이: " + c.join(", ") : "자료로는 큰 차이가 안 보여요. 현장에서 이유를 찾아볼 곳"));
      const row = el("div", "m3d-cl-act");
      const fly = el("button", "chip sm", "3D로 보기");
      fly.type = "button";
      fly.addEventListener("click", () => focusPair(k));
      const cmp = el("a", "chip sm", "나란히 비교");
      cmp.href = "compare.html?s=" + [x.hi.s, x.lo.s].map(encodeURIComponent).join(",");
      row.append(fly, cmp);
      li.append(head, meta, row);
      return li;
    }));
    host.hidden = !list.length;
  }

  function layers(d) {
    const tone = dark() ? RAMP.dark : RAMP.light;
    const col = tone.map(rgb);
    const pairSet = pair ? new Set([pair.hi.s, pair.lo.s]) : null;
    const out = [
      new d.TileLayer({
        id: "base", data: TILE(dark() ? "dark_all" : "light_all"), minZoom: 0, maxZoom: 19, tileSize: 256,
        renderSubLayers: p => {
          const [[w, s], [e, n]] = p.tile.boundingBox;
          return new d.BitmapLayer(p, { data: null, image: p.data, bounds: [w, s, e, n] });
        },
      }),
      new d.ColumnLayer({
        id: "apt", data: data.cs, diskResolution: 10, radius: rad(), extruded: true, pickable: true, autoHighlight: true,
        highlightColor: [...GOLD, 255], elevationScale: scale,
        getPosition: c => [c.ln, c.la], getElevation: c => Math.min(c.p, data.cap),
        getFillColor: c => {
          if (pairSet && pairSet.has(c.s)) return [...GOLD, 255];
          if (pick && pick.s === c.s) return [...GOLD, 255];
          const base = col[bandOf(data.q, c.p)];
          return on && !on.has(c.s) ? (dark() ? [90, 96, 108, 70] : [170, 174, 182, 70]) : [...base, pairSet ? 120 : 235];
        },
        updateTriggers: { getFillColor: [on && on.size, pick && pick.s, pair && pair.hi.s, dark()] },
        material: { ambient: 0.45, diffuse: 0.6, shininess: 24, specularColor: [60, 64, 70] },
        onHover: info => tip(info), onClick: info => { if (info.object) select(info.object); },
      }),
    ];
    if (pair) out.push(new d.LineLayer({
      id: "pair", data: [pair], getSourcePosition: x => [x.hi.ln, x.hi.la], getTargetPosition: x => [x.lo.ln, x.lo.la],
      getColor: [...GOLD, 255], getWidth: 4, widthUnits: "pixels",
    }), new d.TextLayer({   // 두 기둥 꼭대기에 이름과 가격
      id: "pair-label", data: [pair.hi, pair.lo], characterSet: "auto", fontFamily: "Pretendard Variable, Pretendard, sans-serif", fontWeight: 700,
      getPosition: c => [c.ln, c.la, Math.min(c.p, data.cap) * scale], getText: c => `${c.n.length > 14 ? c.n.slice(0, 13) + "…" : c.n}  ${eok(c.p)}`,
      getSize: 13, getPixelOffset: [0, -14], getColor: dark() ? [255, 255, 255, 255] : [16, 21, 29, 255],
      background: true, getBackgroundColor: dark() ? [20, 26, 36, 230] : [255, 255, 255, 235], backgroundPadding: [6, 3],
      updateTriggers: { getPosition: scale },
      parameters: { depthCompare: "always", depthWriteEnabled: false },   // 다른 기둥에 가려지지 않게
    }));
    return out;
  }
  function redraw() { if (deckgl) deckgl.setProps({ layers: layers(window.deck) }); }
  // 기둥 굵기: 멀리서는 굵게(잘 보이게), 가까이 들어가면 실제 단지 크기쯤으로 가늘게
  let lastR = 0;
  const rad = () => Math.max(28, Math.min(data.r, data.r * Math.pow(2, (data.home.zoom - (view ? view.zoom : data.home.zoom)) * 0.85)));

  function tip(info) {
    const t = box.querySelector("[data-m3d-tip]");
    if (!info.object) { t.hidden = true; return; }
    const c = info.object;
    t.replaceChildren(el("b", "", c.n), el("span", "", `${DJ.place(c)} · 84㎡ ${c.pt || eok(c.p)} · ${c.g}등급`));
    t.hidden = false;
    const w = box.clientWidth;
    t.style.left = Math.min(Math.max(8, info.x + 14), w - 230) + "px";
    t.style.top = Math.max(8, info.y - 54) + "px";
  }
  function select(c) {
    pick = c;
    const card = box.querySelector("[data-m3d-card]");
    const a = el("a", "m3d-card-n", c.n); a.href = DJ.href(c);
    const go = el("a", "btn", "자세히 →"); go.href = DJ.href(c);
    const txt = el("div");
    txt.append(a, el("span", "muted", `${DJ.place(c)} · 84㎡ ${c.pt || eok(c.p)} · 지수 ${c.i == null ? "-" : c.i} · ${c.g}등급${c.h ? " · 최근 신고가" : ""}`));
    card.replaceChildren(txt, go);
    card.hidden = false;
    redraw();
  }

  function stopSpin() {
    if (spin) cancelAnimationFrame(spin);
    spin = null;
    const b = box.querySelector("[data-m3d-spin]");
    if (b) { b.setAttribute("aria-pressed", "false"); b.classList.remove("active"); }
  }
  function startSpin() {
    if (calm) return;
    const b = box.querySelector("[data-m3d-spin]");
    b.setAttribute("aria-pressed", "true"); b.classList.add("active");
    const step = () => {
      view = Object.assign({}, view, { bearing: (view.bearing + 0.12) % 360 });
      deckgl.setProps({ initialViewState: view });
      spin = requestAnimationFrame(step);
    };
    spin = requestAnimationFrame(step);
  }
  function fly(to, ms) {
    view = Object.assign({}, view, to, calm ? {} : { transitionDuration: ms || 1200, transitionInterpolator: new window.deck.FlyToInterpolator() });
    deckgl.setProps({ initialViewState: view });
  }
  function focusPair(k) {
    pair = data.cl[k];
    pick = null;
    box.querySelector("[data-m3d-card]").hidden = true;
    stopSpin();
    box.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    // 두 단지가 함께 들어오게 맞춘 뒤 조금 물러나서 비스듬히
    const w = box.clientWidth, h = box.clientHeight;
    const vp = new window.deck.WebMercatorViewport({ width: w, height: h }).fitBounds(
      [[Math.min(pair.hi.ln, pair.lo.ln), Math.min(pair.hi.la, pair.lo.la)], [Math.max(pair.hi.ln, pair.lo.ln), Math.max(pair.hi.la, pair.lo.la)]],
      { padding: Math.round(Math.min(w, h) * 0.3) });
    fly({ longitude: vp.longitude, latitude: vp.latitude, zoom: Math.min(vp.zoom, 15.5) - 0.6, pitch: 50, bearing: 24 }, 1600);
    redraw();
  }

  async function build() {
    const status = box.querySelector("[data-m3d-load]");
    status.hidden = false;
    status.textContent = "3D 지도를 불러오는 중…";
    let d;
    try {
      const [lib3d, all] = await Promise.all([load(), DJ.data()]);
      d = lib3d;
      const cs = all.complexes.filter(c => c.la != null && c.ln != null && c.p && !c.sm);
      if (!cs.length) throw new Error("no data");
      // 바깥으로 떨어진 몇 곳 때문에 너무 멀리서 보지 않게 2~98% 범위로 맞춤
      const qv = (arr, k) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * k)];
      const lo = [qv(cs.map(c => c.ln), 0.02), qv(cs.map(c => c.la), 0.02)], hi = [qv(cs.map(c => c.ln), 0.98), qv(cs.map(c => c.la), 0.98)];
      const fit = new d.WebMercatorViewport({ width: box.clientWidth, height: box.clientHeight }).fitBounds([lo, hi], { padding: 40 });
      const span = km({ la: lo[1], ln: lo[0] }, { la: hi[1], ln: hi[0] }) * 1000;
      // 아주 비싼 몇 곳 때문에 나머지가 납작해지지 않게: 높이는 상위 2% 값에 맞추고 그 위는 1.25배까지만
      const capP = qv(cs.map(c => c.p), 0.98);
      data = { cs, q: bands(cs), r: Math.max(55, Math.min(150, span / 190)), top: span * 0.075 / capP, cap: capP * 1.25, cl: cliffs(cs),
               home: { longitude: fit.longitude, latitude: fit.latitude, zoom: fit.zoom, pitch: 52, bearing: -18 } };
    } catch (e) {
      status.textContent = "3D 지도를 불러오지 못했어요. 잠시 뒤 다시 눌러 보세요.";
      lib = null;
      return false;
    }
    view = Object.assign({}, data.home);
    on = DJ.kmapOn || null;
    deckgl = new d.Deck({
      parent: box.querySelector("[data-m3d-canvas]"), initialViewState: view, controller: { touchRotate: true, dragRotate: true },
      layers: layers(d), getCursor: s => (s.isHovering ? "pointer" : s.isDragging ? "grabbing" : "grab"),
      onViewStateChange: ({ viewState, interactionState }) => {
        view = viewState;
        const r = rad();
        if (Math.abs(r - lastR) / r > 0.06) { lastR = r; redraw(); }
        if (interactionState && (interactionState.isDragging || interactionState.isZooming || interactionState.isRotating)) stopSpin();
        return viewState;
      },
      onClick: info => { if (!info.object) { pick = null; box.querySelector("[data-m3d-card]").hidden = true; redraw(); } },
    });
    status.hidden = true;
    legend();
    paintCliffs(data.cl);
    // 기둥이 땅에서 솟아오르는 첫 모습 (움직임 줄이기 설정이면 바로)
    if (calm) { scale = data.top; redraw(); }
    else {
      const t0 = performance.now(), dur = 1300;
      const grow = now => {
        const k = Math.min(1, (now - t0) / dur);
        scale = data.top * (1 - Math.pow(1 - k, 3));
        redraw();
        if (k < 1) requestAnimationFrame(grow); else startSpin();
      };
      requestAnimationFrame(grow);
    }
    return true;
  }
  function legend() {
    const lg = box.querySelector("[data-m3d-legend]");
    const tone = dark() ? RAMP.dark : RAMP.light, q = data.q;
    const labels = q.length ? [`${q[0]}억 이하`, ...q.slice(1).map((v, i) => `${q[i]}~${v}억`), `${q[q.length - 1]}억 넘게`] : ["전체"];
    const row = el("div", "m3d-lg-row");
    labels.forEach((t, k) => {
      const it = el("span", "m3d-lg-i");
      const sw = el("i"); sw.style.background = tone[Math.min(k, tone.length - 1)];
      it.append(sw, el("span", "", t));
      row.append(it);
    });
    lg.replaceChildren(el("b", "", "기둥 높이 = 84㎡ 가격"), row);
  }

  async function setView(v) {
    seg.querySelectorAll("[data-view]").forEach(b => { const x = b.dataset.view === v; b.classList.toggle("active", x); b.setAttribute("aria-pressed", x); });
    wrap.classList.toggle("m3d-on", v === "3d");
    box.hidden = v !== "3d";
    const cl = document.querySelector("[data-m3d-cliffs]");
    if (v !== "3d") { stopSpin(); if (cl) cl.hidden = true; return; }
    if (!deckgl) await build();
    else { redraw(); if (cl) cl.hidden = !data.cl.length; }
  }
  seg.hidden = false;
  seg.addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
  box.querySelector("[data-m3d-spin]").addEventListener("click", () => (spin ? stopSpin() : startSpin()));
  box.querySelector("[data-m3d-top]").addEventListener("click", () => {
    stopSpin();
    const flat = view.pitch < 10;
    fly({ pitch: flat ? 52 : 0, bearing: flat ? -18 : 0 }, 900);
  });
  box.querySelector("[data-m3d-home]").addEventListener("click", () => { stopSpin(); pair = null; redraw(); fly(data.home, 1200); });
  // 지도 거르기(가격대·조건)를 바꾸면 맞는 단지만 진하게
  document.addEventListener("dj:kmap", e => { on = e.detail || null; redraw(); });
})();
