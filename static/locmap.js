// 단지 입지 지도(상세 맨 위 큰 카드): 단지를 가운데 두고 구 경계, 주변 단지 점, 주요 중심지의 방향·직선거리를 그립니다.
// 값은 새로 만들지 않습니다. 구 경계(통계청 2013)와 중심지 좌표는 설정에 있는 것만, 거리는 두 좌표의 직선거리입니다.
// 역·학교·마트·병원은 좌표가 없어 그리지 않습니다(거리 숫자는 아래 '입지' 칸에 있습니다).
(function () {
  "use strict";
  const DJ = window.DJ; if (!DJ) return;
  const NS = "http://www.w3.org/2000/svg";
  const mk = (n, a) => { const e = document.createElementNS(NS, n); if (a) for (const k in a) e.setAttribute(k, a[k]); return e; };
  const GC = { S: "#d4af52", A: "#aeb8c9", B: "#4f8fd8", C: "#8c98ac", D: "#b4bdcb" };
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

  // me: {la, ln, g, n}, map: locmap.json, pts: 같은 지역 단지들 [{la, ln}], o: {W, H, R(가로 반폭 m), fs}
  DJ.locSvg = function (me, map, pts, o) {
    const W = o.W, H = o.H, R = o.R, fs = o.fs, TOP = o.top, BOT = o.bot, cy0 = TOP + (H - TOP - BOT) / 2, ppm = (W / 2) / R;   // TOP/BOT: 순위·실거래 배지가 덮는 띠
    const X = ln => W / 2 + (ln - me.ln) * Math.cos(me.la * Math.PI / 180) * 111320 * ppm;
    const Y = la => cy0 - (la - me.la) * 111320 * ppm;
    const svg = mk("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", class: "mc-loc", role: "img" });
    svg.append(mk("rect", { width: W, height: H, fill: "#0c2230" }));
    const clip = mk("clipPath", { id: "lm-c" }); clip.append(mk("rect", { width: W, height: H })); svg.append(clip);
    const g = mk("g", { "clip-path": "url(#lm-c)" });
    // 구 경계
    const tint = ["#12344a", "#173f57"];
    map.d.forEach((d, i) => {
      let sx = 0, sy = 0, n = 0;
      d.r.forEach(ring => {
        g.append(mk("path", { d: "M" + ring.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("L") + "Z", fill: tint[i % 2], stroke: "rgba(190,215,250,.55)", "stroke-width": 1.6, "stroke-dasharray": "7 5", "stroke-linejoin": "round" }));
        ring.forEach(p => { sx += p[0]; sy += p[1]; n++; });
      });
      const x = X(sx / n), y = Y(sy / n);
      if (x > W * .12 && x < W * .88 && y > TOP + fs && y < H - BOT - fs) {
        const t = mk("text", { x, y, "text-anchor": "middle", "font-size": fs * 1.5, "font-weight": 800, fill: "rgba(215,228,250,.3)" }); t.textContent = d.n; g.append(t);
      }
    });
    svg.append(g);
    // 주변 단지 점 (이 동네가 얼마나 빽빽한지)
    pts.forEach(p => { const x = X(p.ln), y = Y(p.la); if (x < 0 || x > W || y < 0 || y > H) return; svg.append(mk("circle", { cx: x, cy: y, r: fs * .22, fill: "rgba(205,222,255,.5)" })); });
    // 1km 고리
    const r1 = 1000 * ppm;
    svg.append(mk("circle", { cx: W / 2, cy: cy0, r: r1, fill: "rgba(255,255,255,.04)", stroke: "rgba(255,255,255,.38)", "stroke-width": 1.6, "stroke-dasharray": "3 6" }));
    const rl = mk("text", { x: W / 2, y: cy0 + r1 + fs * .9, "text-anchor": "middle", "font-size": fs * .8, "font-weight": 700, fill: "rgba(225,236,255,.7)" }); rl.textContent = "1km"; svg.append(rl);
    // 중심지: 가까운 3곳(8km 안). 화면 밖이면 가장자리에 방향 표시
    const marks = map.m.map(m => ({ n: short(m.n), la: m.la, ln: m.ln, t: m.t, d: meters(me.la, me.ln, m.la, m.ln) }))
      .filter(m => m.d <= 8000).sort((a, b) => a.d - b.d).slice(0, 3);
    const boxes = [{ x: W * .5 - fs * 4, y: cy0 - fs * 2.4, w: fs * 8, h: fs * 2.8 }, { x: 0, y: 0, w: fs * 11, h: TOP }, { x: W - fs * 6, y: 0, w: fs * 6, h: TOP + fs * 2 }, { x: 0, y: H - BOT, w: W, h: BOT }];   // 단지 이름표·위 라벨·순위 배지·아래 배지 자리
    const free = b => boxes.every(q => b.x + b.w < q.x || b.x > q.x + q.w || b.y + b.h < q.y || b.y > q.y + q.h) && b.x >= 2 && b.x + b.w <= W - 2;
    marks.forEach(m => {
      let x = X(m.ln), y = Y(m.la), out = false;
      const xl = 26, xr = W - 26, yt = TOP + 6, yb = H - BOT - 6;
      if (x < xl || x > xr || y < yt || y > yb) {   // 안전 영역 밖이면 가장자리에 방향만 표시
        out = true; const dx = x - W / 2, dy = y - cy0;
        const s = Math.min(dx ? (dx > 0 ? (xr - W / 2) / dx : (xl - W / 2) / dx) : 1e9, dy ? (dy > 0 ? (yb - cy0) / dy : (yt - cy0) / dy) : 1e9);
        x = W / 2 + dx * s; y = cy0 + dy * s;
      }
      const col = m.t === "a" ? "#f2c879" : "#9fe3c8"; boxes.push({ x: x - 10, y: y - 10, w: 20, h: 20 });
      svg.append(mk("line", { x1: W / 2, y1: cy0, x2: x, y2: y, stroke: col, "stroke-width": 2, "stroke-dasharray": "7 5", opacity: out ? .55 : .9 }));
      svg.append(mk("rect", { x: x - 8, y: y - 8, width: 16, height: 16, transform: "rotate(45 " + x + " " + y + ")", fill: col, stroke: "#0c2230", "stroke-width": 2 }));
      const txt = m.n + " " + km(m.d), w = txt.length * fs * .9 + 8, h = fs * 1.3;
      const spots = [[x + 14, y - h / 2], [x - 14 - w, y - h / 2], [x - w / 2, y - h - 12], [x - w / 2, y + 12]];
      const pick = spots.map(s => ({ x: s[0], y: s[1], w, h })).find(free);
      if (!pick) return;   // 자리가 없으면 이름표는 그리지 않음(겹쳐 읽기 어려운 것보다 낫습니다). 거리는 지도 아래 글줄에 있음
      boxes.push(pick);
      const t = mk("text", { x: pick.x + 2, y: pick.y + h * .8, "font-size": fs, "font-weight": 800, fill: m.t === "a" ? "#ffe2ad" : "#c9f3e2", "paint-order": "stroke", stroke: "#0c2230", "stroke-width": 6, "stroke-linejoin": "round" });
      t.setAttribute("aria-hidden", "true"); t.textContent = txt; svg.append(t);
    });
    // 내 단지
    svg.append(mk("circle", { cx: W / 2, cy: cy0, r: fs * 1.7, fill: "rgba(255,214,110,.24)" }), mk("circle", { cx: W / 2, cy: cy0, r: fs * .85, fill: GC[me.g] || "#d4af52", stroke: "#fff", "stroke-width": 3 }));
    const nt = mk("text", { x: W / 2, y: cy0 - fs * 1.35, "text-anchor": "middle", "font-size": fs * 1.05, "font-weight": 800, fill: "#fff", "paint-order": "stroke", stroke: "#0c2230", "stroke-width": 5, "stroke-linejoin": "round" });
    nt.textContent = me.n; svg.append(nt);
    svg.setAttribute("aria-label", me.n + " 위치 지도. " + (marks.length ? marks.map(m => m.n + "까지 직선 " + km(m.d)).join(", ") + "." : "") + " 구 경계는 대략적인 위치입니다.");
    return { svg, marks };
  };
})();
