// 단지 입지 지도(상세 맨 위 큰 카드): 단지를 가운데 두고 우리 구, 반경 1km 원, 가까운 중심지 이름표를 그립니다.
// 값은 새로 만들지 않습니다. 구 경계(통계청 2013)와 중심지 좌표는 설정에 있는 것만, 거리는 두 좌표의 직선거리입니다.
// 지도에 그리는 모든 표시 옆에는 이름을 적고, 이름을 붙일 수 없는 표시(이름 없는 점·마름모·점선)는 그리지 않습니다.
// 역·학교·마트·병원은 좌표가 없어 지도에 그리지 않습니다(거리 숫자는 지도 아래 칸, 병원은 반경 1km 안 개수).
(function () {
  "use strict";
  const DJ = window.DJ; if (!DJ) return;
  const NS = "http://www.w3.org/2000/svg";
  const mk = (n, a) => { const e = document.createElementNS(NS, n); if (a) for (const k in a) e.setAttribute(k, a[k]); return e; };
  const GC = { S: "#d4af52", A: "#aeb8c9", B: "#4f8fd8", C: "#8c98ac", D: "#b4bdcb" };
  const BG = "#0c2230", LAND = "#16405a", MINT = "#8fe0c4";
  let pm = null;
  DJ.getLocMap = function () {
    if (!pm) pm = fetch((window.DJ_ROOT || "") + "locmap.json").then(r => (r.ok ? r.json() : null)).catch(() => null);
    return pm;
  };
  function meters(la0, ln0, la, ln) {
    const dy = (la - la0) * 111320, dx = (ln - ln0) * 111320 * Math.cos((la + la0) / 2 * Math.PI / 180);
    return Math.hypot(dx, dy);
  }
  const short = n => String(n).replace(/\(.*?\)/g, "").trim();
  const km = m => (m / 1000).toFixed(1) + "km";
  const tw = t => [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 30 : ch === " " ? 11 : 17), 0);   // 글자 폭 어림(한글 30, 숫자·영문 17)
  const ARROW = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  function inside(pt, ring) {   // 점이 구 경계 안에 있는지
    let on = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) on = !on;
    }
    return on;
  }

  // me: {la, ln, g, n}, map: locmap.json, o: {W, H, R(가로 반폭 m), maxMarks}. 두 번째 자리 값(옛 '주변 단지 점')은 쓰지 않음
  DJ.locSvg = function (me, map, _unused, o) {
    const W = o.W, H = o.H, R = o.R, cy = H / 2 + 10, ppm = (W / 2) / R, maxMarks = o.maxMarks || 3, M = 18, PH = 52;
    const X = ln => W / 2 + (ln - me.ln) * Math.cos(me.la * Math.PI / 180) * 111320 * ppm;
    const Y = la => cy - (la - me.la) * 111320 * ppm;
    const svg = mk("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", class: "mc-loc", role: "img" });
    svg.append(mk("rect", { width: W, height: H, fill: BG }));
    const clip = mk("clipPath", { id: "lm-c" }); clip.append(mk("rect", { width: W, height: H })); svg.append(clip);
    const g = mk("g", { "clip-path": "url(#lm-c)" });
    let gu = "";
    map.d.forEach(d => {   // 이 단지가 속한 구만 칠함(다른 구 경계는 그리지 않음)
      if (!d.r.some(ring => inside([me.ln, me.la], ring))) return;
      gu = d.n;
      d.r.forEach(ring => g.append(mk("path", { d: "M" + ring.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("L") + "Z", fill: LAND, stroke: "rgba(255,255,255,.35)", "stroke-width": 1.5 })));
    });
    svg.append(g);
    const placed = [], box = (x, y, w, h) => placed.push({ x, y, w, h });
    const free = q => q.x >= M && q.x + q.w <= W - M && q.y >= M && q.y + q.h <= H - M && placed.every(p => q.x + q.w < p.x || q.x > p.x + p.w || q.y + q.h < p.y || q.y > p.y + p.h);
    // 반경 1km 원(실선 하나뿐)과 이름
    const r1 = 1000 * ppm;
    svg.append(mk("circle", { cx: W / 2, cy, r: r1, fill: "rgba(255,255,255,.05)", stroke: "rgba(255,255,255,.7)", "stroke-width": 2 }));
    const rl = mk("text", { x: W / 2, y: cy + r1 + 32, "text-anchor": "middle", "font-size": 28, "font-weight": 800, fill: "#fff" }); rl.textContent = "반경 1km"; svg.append(rl);
    box(W / 2 - 90, cy + r1 + 6, 180, 38);
    box(W / 2 - 150, cy - 96, 300, 66);   // 단지 이름 자리
    box(W / 2 - 36, cy - 36, 72, 72);     // 가운데 점 자리
    // 가까운 중심지 이름표: 학원가 1곳 + 중심지 최대 (maxMarks-1)곳, 8km 안
    const all = map.m.map(m => ({ n: short(m.n), t: m.t, la: m.la, ln: m.ln, d: meters(me.la, me.ln, m.la, m.ln) })).filter(m => m.d <= 8000);
    const picked = [...all.filter(m => m.t === "a").sort((a, b) => a.d - b.d).slice(0, 1), ...all.filter(m => m.t !== "a").sort((a, b) => a.d - b.d).slice(0, maxMarks - 1)].sort((a, b) => a.d - b.d);
    const pos = m => {   // 화면 밖이면 가장자리로 당김(방향 화살표를 이름표에 붙임)
      let x = X(m.ln), y = Y(m.la); const dx = x - W / 2, dy = y - cy, xl = M + 10, xr = W - M - 10, yt = M + 10, yb = H - M - 10;
      let out = false;
      if (x < xl || x > xr || y < yt || y > yb) {
        out = true;
        const s = Math.min(dx > 0 ? (xr - W / 2) / dx : dx < 0 ? (xl - W / 2) / dx : 1e9, dy > 0 ? (yb - cy) / dy : dy < 0 ? (yt - cy) / dy : 1e9);
        x = W / 2 + dx * s; y = cy + dy * s;
      }
      return { x, y, out, dx, dy };
    };
    const at = picked.map(pos);
    at.forEach(p => box(p.x - 14, p.y - 14, 28, 28));   // 먼저 모든 표시점 자리를 잡아 이름표가 덮지 않게
    picked.forEach((m, i) => {
      const p = at[i], ang = Math.round(Math.atan2(-p.dy, p.dx) * 4 / Math.PI), label = (p.out ? ARROW[((ang % 8) + 8) % 8] + " " : "") + m.n + " " + km(m.d), w = tw(label) + 38;
      const cands = [[p.x + 18, p.y - PH / 2], [p.x - 18 - w, p.y - PH / 2], [p.x - w / 2, p.y - PH - 14], [p.x - w / 2, p.y + 14], [p.x + 18, p.y - PH - 6], [p.x - 18 - w, p.y - PH - 6], [p.x + 18, p.y + 6], [p.x - 18 - w, p.y + 6]];
      let c = cands.map(q => ({ x: q[0], y: q[1], w, h: PH })).find(free);
      if (!c) for (let yy = M; yy <= H - M - PH && !c; yy += 12) { const q = { x: Math.max(M, Math.min(W - M - w, p.x - w / 2)), y: yy, w, h: PH }; if (free(q)) c = q; }
      if (!c) return;   // 자리가 없으면 이름표는 그리지 않음(겹쳐 읽기 어려운 것보다 낫습니다). 거리는 지도 아래 글줄에 적음
      m.drawn = true; placed.push(c);
      svg.append(mk("line", { x1: W / 2, y1: cy, x2: p.x, y2: p.y, stroke: MINT, "stroke-width": 2.5, opacity: p.out ? .6 : .85 }));
      svg.append(mk("rect", { x: p.x - 9, y: p.y - 9, width: 18, height: 18, transform: "rotate(45 " + p.x + " " + p.y + ")", fill: MINT, stroke: BG, "stroke-width": 3 }));
      svg.append(mk("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: PH / 2, fill: BG, stroke: MINT, "stroke-width": 2.5 }));
      const t = mk("text", { x: c.x + c.w / 2, y: c.y + c.h / 2 + 10, "text-anchor": "middle", "font-size": 30, "font-weight": 800, fill: "#fff" });
      t.setAttribute("aria-hidden", "true"); t.textContent = label; svg.append(t);
    });
    // 구 이름: 빈 모서리에
    if (gu) {
      const w = tw(gu) + 24, cs = [[20, 50], [W - 20 - w + 12, 50], [20, H - 24], [W - 20 - w + 12, H - 24]];
      const q = cs.find(c => free({ x: c[0] - 8, y: c[1] - 34, w, h: 44 })) || cs[2];
      const gt = mk("text", { x: q[0], y: q[1], "font-size": 30, "font-weight": 800, fill: "#cfe3ee" }); gt.textContent = gu; svg.append(gt);
    }
    // 내 단지: 등급색 점과 이름
    svg.append(mk("circle", { cx: W / 2, cy, r: 20, fill: GC[me.g] || "#d4af52", stroke: "#fff", "stroke-width": 4 }));
    const nt = mk("text", { x: W / 2, y: cy - 34, "text-anchor": "middle", "font-size": 34, "font-weight": 900, fill: "#fff", "paint-order": "stroke", stroke: BG, "stroke-width": 8, "stroke-linejoin": "round" });
    nt.textContent = me.n; svg.append(nt);
    svg.setAttribute("aria-label", me.n + " 위치 지도. " + (gu ? gu + "에 있습니다. " : "") + (picked.length ? picked.map(m => m.n + "까지 직선 " + km(m.d)).join(", ") + "." : "") + " 구 경계는 대략적인 위치입니다.");
    return { svg, marks: picked, hidden: picked.filter(m => !m.drawn) };
  };
})();
