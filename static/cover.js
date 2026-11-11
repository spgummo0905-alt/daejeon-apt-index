// 카드 표지의 실제 항공 사진: 카드마다 그 단지의 가장 가까운 사진(18단계) 한 장.
// 키는 여기에 없습니다(서버 함수에만). 화면에 가까워진 카드만 불러오고, 못 받으면 사진 칸을 지웁니다(빈 칸·깨진 그림 없음).
// 사진은 저장하지 않으며 브라우저가 1시간만 보관합니다. 출처 문구는 사진이 하나라도 나오면 화면 맨 아래에 붙입니다.
(function () {
  "use strict";
  const api = String(window.DJ_SAT || "").replace(/\/$/, "");
  if (!api) return;
  const Z = 18, N = 2 ** Z;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let noted = false;

  // 단지 좌표 → 그 좌표가 든 사진 한 장 안에서의 위치(0~1)
  function place(lat, lng) {
    const fx = (lng + 180) / 360 * N;
    const fy = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N;
    return { x: fx - Math.floor(fx), y: fy - Math.floor(fy) };
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function note() {
    if (noted) return; noted = true;
    const p = document.createElement("p");
    p.className = "hc-srcnote";
    p.textContent = "카드 속 항공 사진 출처: 브이월드(국토교통부) · 촬영 시점이 달라 지금 모습과 다를 수 있어요";
    (document.querySelector("main") || document.body).append(p);
  }

  // 사진 한 장(약 120m 폭)에서 단지가 가장자리에 가까울 때만 옆 사진을 붙여, 단지가 항상 보이는 창 한가운데 오게 한다(사진 수는 1~4장).
  const T = 1.25;   // 사진 한 장의 폭 = 칸 폭의 1.25배 (약간 확대해서 단지가 또렷하게)
  // 단지 배치도: 일조 미리보기와 같은 건축물 자료(동마다 바닥 모양·층수)가 있는 단지는 사진 대신 배치도를 그린다. 값을 새로 만들지 않고, 없으면 항공 사진 그대로.
  let plans = null;
  function getPlans() {
    if (!plans) plans = fetch((window.DJ_ROOT || "") + "plans.json").then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    return plans;
  }
  const NS = "http://www.w3.org/2000/svg";
  const mk = (n, a) => { const e = document.createElementNS(NS, n); Object.keys(a || {}).forEach(k => e.setAttribute(k, a[k])); return e; };
  function tone(f) {   // 층수 → 남색 위 청회→밝은 청백 농도 (모든 단지 같은 기준: 5층 이하 옅게, 50층 이상 진하게)
    const t = clamp((f - 5) / 45, 0, 1), a = [95, 118, 160], b = [225, 235, 250];   // 낮은 동은 어둡게, 높은 동은 밝게 (어두운 바탕에서 높은 동이 먼저 보이게)
    return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
  }
  function drawPlan(box, doc) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, est = false;
    doc.forEach(d => { if (d[1]) est = true; for (let i = 2; i < d.length; i += 2) { x0 = Math.min(x0, d[i]); x1 = Math.max(x1, d[i]); y0 = Math.min(y0, d[i + 1]); y1 = Math.max(y1, d[i + 1]); } });
    const W = 200, H = 100, pad = 14, top = pad, bot = 28, k = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1), (H - top - bot) / Math.max(y1 - y0, 1)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, oy = top + (H - top - bot) / 2;   // 아래 28은 라벨 자리
    const svg = mk("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", class: "hc-plan" });
    doc.slice().sort((a, b) => a[0] - b[0]).forEach(d => {
      const pts = []; for (let i = 2; i < d.length; i += 2) pts.push((W / 2 + (d[i] - cx) * k).toFixed(1) + "," + (oy - (d[i + 1] - cy) * k).toFixed(1));
      const col = tone(d[0]);   // 추정한 동은 옅게(구분은 색 농도 + 아래 글자 "일부 추정"), 가는 동도 보이게 같은 색 가는 선을 둘러 줌
      svg.append(mk("polygon", { points: pts.join(" "), fill: col, stroke: col, "stroke-width": "1", "stroke-linejoin": "round", opacity: d[1] ? ".62" : "1" }));
    });
    box.classList.add("plan", "on");
    const tag = document.createElement("span"); tag.className = "hc-plantag"; tag.textContent = est ? "배치도 · 일부 추정" : "배치도";
    const nn = document.createElement("span"); nn.className = "hc-plannorth"; nn.textContent = "N↑"; nn.setAttribute("aria-hidden", "true");
    box.prepend(svg); box.append(tag, nn);
    notePlan();
  }
  let notedPlan = false;
  function notePlan() {
    if (notedPlan) return; notedPlan = true;
    const p = document.createElement("p"); p.className = "hc-srcnote";
    p.textContent = "카드 속 배치도: 건축물 자료로 그린 동 위치와 높이예요(북쪽이 위, 밝을수록 높은 동). 실제 외관은 아니에요";
    (document.querySelector("main") || document.body).append(p);
  }

  function load(box) {
    if (box.dataset.cv) return; box.dataset.cv = "1";
    const slug = box.dataset.s;
    if (slug) { getPlans().then(P => { if (P[slug]) drawPlan(box, P[slug]); else photo(box); }); return; }
    photo(box);
  }

  function photo(box) {
    const lat = +box.dataset.la, lng = +box.dataset.ln;
    if (!isFinite(lat) || !isFinite(lng)) { box.hidden = true; return; }
    const o = place(lat, lng);
    const dxs = o.x < 0.4 ? [-1, 0] : o.x > 0.6 ? [0, 1] : [0];      // 창 폭이 사진의 0.8배라서 가운데 0.4~0.6 이면 한 장으로 충분
    const dys = o.y < 0.2 ? [-1, 0] : o.y > 0.8 ? [0, 1] : [0];      // 창 높이가 사진의 0.4배
    const strip = document.createElement("span"); strip.className = "hc-strip";
    let left = dxs.length * dys.length, bad = false;
    const done = () => {
      if (--left) return;
      if (bad) { box.hidden = true; box.classList.add("off"); return; }   // 못 받으면 칸을 지움
      const w = box.clientWidth || 160, h = box.clientHeight || w / 2, tile = T * w;
      const W = dxs.length * tile, H = dys.length * tile;
      const px = (dxs.indexOf(0) + o.x) * tile, py = (dys.indexOf(0) + o.y) * tile;
      const sx = clamp(px - w / 2, 0, W - w), sy = clamp(py - h / 2, 0, H - h);
      strip.style.cssText = `width:${W}px;height:${H}px;grid-template-columns:repeat(${dxs.length},${tile}px);grid-template-rows:repeat(${dys.length},${tile}px);transform:translate(${-sx}px,${-sy}px)`;
      const pin = box.querySelector(".hc-pin");
      if (pin) { pin.style.left = (((px - sx) / w) * 100).toFixed(1) + "%"; pin.style.top = (((py - sy) / h) * 100).toFixed(1) + "%"; }
      box.classList.add("on"); note();
    };
    dys.forEach(dy => dxs.forEach(dx => {
      const i = new Image(); i.alt = ""; i.decoding = "async"; i.draggable = false; i.referrerPolicy = "strict-origin-when-cross-origin";
      i.onload = done; i.onerror = () => { bad = true; done(); };
      strip.append(i); i.src = `${api}/tile?lat=${lat}&lng=${lng}&z=${Z}&dx=${dx}&dy=${dy}`;
    }));
    box.prepend(strip);
  }

  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: "240px" })
    : null;
  function watch(root) {
    (root.querySelectorAll ? root.querySelectorAll(".hc-photo:not([data-cv])") : []).forEach(b => io ? io.observe(b) : load(b));
    if (root.matches && root.matches(".hc-photo:not([data-cv])")) io ? io.observe(root) : load(root);
  }
  watch(document);
  // 카드첩·필터처럼 나중에 그려지는 카드도 잡는다
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) watch(n); }))).observe(document.body, { childList: true, subtree: true });
})();
