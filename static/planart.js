// 단지 배치도 그림(공용): 일조 미리보기와 같은 건축물 자료(동마다 바닥 모양·층수)를 도면처럼 그립니다.
// 값을 새로 만들지 않습니다. 북쪽이 위, 밝을수록 높은 동. 카드(cover.js)와 단지 상세 큰 카드(cardgen.js)가 함께 씁니다.
(function () {
  "use strict";
  const DJ = window.DJ; if (!DJ) return;
  const NS = "http://www.w3.org/2000/svg";
  const mk = (n, a) => { const e = document.createElementNS(NS, n); if (a) for (const k in a) e.setAttribute(k, a[k]); return e; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let plans = null, uid = 0;
  DJ.getPlans = function () {
    if (!plans) plans = fetch((window.DJ_ROOT || "") + "plans.json").then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    return plans;
  };
  // 층수 → 색 (모든 단지 같은 기준: 5층 이하 어두운 청회, 50층 이상 밝은 청백)
  const LO = [86, 112, 158], HI = [232, 240, 252];
  const tone = f => { const t = clamp((f - 5) / 45, 0, 1); return "rgb(" + LO.map((v, i) => Math.round(v + (HI[i] - v) * t)).join(",") + ")"; };
  const rgb = a => "rgb(" + a.join(",") + ")";

  // o: {W,H,padX,padT,padB,fs(글자 크기, 화면 12px 이상이 되게 호출하는 쪽이 정함),legendY,scale}
  DJ.planSvg = function (doc, o) {
    const W = o.W, H = o.H, padX = o.padX, padT = o.padT, padB = o.padB, fs = o.fs, id = "pa" + (++uid);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, est = false, fMax = 0, fMin = 1e9;
    doc.forEach(d => {
      if (d[1]) est = true; if (d[0] > fMax) fMax = d[0]; if (d[0] < fMin && d[0] > 0) fMin = d[0];
      for (let i = 2; i < d.length; i += 2) { x0 = Math.min(x0, d[i]); x1 = Math.max(x1, d[i]); y0 = Math.min(y0, d[i + 1]); y1 = Math.max(y1, d[i + 1]); }
    });
    const k = Math.min((W - 2 * padX) / Math.max(x1 - x0, 1), (H - padT - padB) / Math.max(y1 - y0, 1));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, oy = padT + (H - padT - padB) / 2;
    const X = x => W / 2 + (x - cx) * k, Y = y => oy - (y - cy) * k;
    const svg = mk("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", class: "hc-plan", "aria-hidden": "true" });
    const defs = mk("defs");
    const bg = mk("radialGradient", { id: id + "b", cx: "50%", cy: "46%", r: "75%" });
    [["0", "#21457f"], ["1", "#0d2145"]].forEach(s => bg.append(mk("stop", { offset: s[0], "stop-color": s[1] })));
    const blur = mk("filter", { id: id + "s", x: "-10%", y: "-10%", width: "130%", height: "130%" }); blur.append(mk("feGaussianBlur", { stdDeviation: Math.max(.6, fs * .12) }));
    const lg = mk("linearGradient", { id: id + "l", x1: "0", x2: "1", y1: "0", y2: "0" });
    lg.append(mk("stop", { offset: "0", "stop-color": rgb(LO) }), mk("stop", { offset: "1", "stop-color": rgb(HI) }));
    defs.append(bg, blur, lg); svg.append(defs);
    svg.append(mk("rect", { width: W, height: H, fill: "url(#" + id + "b)" }));
    // 격자: 작은 눈금과 굵은 눈금(도면 느낌, 값 없음)
    const gs = Math.round(Math.min(W, H) / 5), g = mk("g", { stroke: "#9db8e8", fill: "none" });
    for (let x = gs / 2; x < W; x += gs / 2) g.append(mk("line", { x1: x, y1: 0, x2: x, y2: H, "stroke-width": (x % gs ? .25 : .5) * (fs / 8), opacity: x % gs ? .1 : .16 }));
    for (let y = gs / 2; y < H; y += gs / 2) g.append(mk("line", { x1: 0, y1: y, x2: W, y2: y, "stroke-width": (y % gs ? .25 : .5) * (fs / 8), opacity: y % gs ? .1 : .16 }));
    svg.append(g);
    const polys = doc.slice().sort((a, b) => a[0] - b[0]).map(d => {
      const pts = []; for (let i = 2; i < d.length; i += 2) pts.push(X(d[i]).toFixed(1) + "," + Y(d[i + 1]).toFixed(1));
      return { d, pts: pts.join(" ") };
    });
    // 그림자: 높은 동일수록 길게(남동쪽으로), 한 덩어리로 흐림
    const sh = mk("g", { filter: "url(#" + id + "s)", fill: "#050d20", opacity: ".55" });
    polys.forEach(p => { const e = mk("polygon", { points: p.pts }); const l = clamp(p.d[0] / 50, .15, 1) * fs * .55; e.setAttribute("transform", "translate(" + (l * .8).toFixed(1) + "," + l.toFixed(1) + ")"); sh.append(e); });
    svg.append(sh);
    const sw = Math.max(.5, fs * .09);
    polys.forEach(p => {
      const col = tone(p.d[0]);
      svg.append(mk("polygon", { points: p.pts, fill: col, stroke: "rgba(255,255,255,.7)", "stroke-width": sw, "stroke-linejoin": "round", opacity: p.d[1] ? ".6" : "1" }));
    });
    // 방위표(북쪽 위): 원 + 화살 + N. 상세 큰 카드는 위·아래에 배지가 올라가므로 방위표·범례를 왼쪽 위에 모읍니다
    const left = o.layout === "detail", cr = fs * 1.15, cxn = left ? padX + cr : W - padX - cr * .6, cyn = Math.max(padT * .5, cr + fs * .3);
    const nz = mk("g");
    nz.append(mk("circle", { cx: cxn, cy: cyn, r: cr, fill: "rgba(8,20,45,.55)", stroke: "rgba(255,255,255,.55)", "stroke-width": sw }),
      mk("path", { d: "M" + cxn + "," + (cyn - cr * .78) + " L" + (cxn + cr * .3) + "," + (cyn + cr * .15) + " L" + cxn + "," + (cyn - cr * .05) + " L" + (cxn - cr * .3) + "," + (cyn + cr * .15) + "Z", fill: "#fff" }));
    const nt = mk("text", { x: cxn, y: cyn + cr * .78, "text-anchor": "middle", "font-size": fs * .8, "font-weight": 800, fill: "#e8f0fc" }); nt.textContent = "N"; nz.append(nt); svg.append(nz);
    // 높이 범례(낮음→높음). 층수가 모두 같으면 한 번만
    const lw = fs * 5, lx = left ? cxn + cr + fs * .9 : W - padX - lw, ly = left ? cyn + fs * .55 : o.legendY;
    const lo = fMin === 1e9 ? fMax : fMin, same = lo === fMax;
    svg.append(mk("rect", { x: lx, y: ly - fs * .3, width: lw, height: fs * .45, rx: fs * .22, fill: "url(#" + id + "l)", stroke: "rgba(255,255,255,.5)", "stroke-width": sw * .6 }));
    const mkT = (x, a, t) => { const e = mk("text", { x, y: ly - fs * .55, "text-anchor": a, "font-size": fs * .85, "font-weight": 700, fill: "#dbe7fb" }); e.textContent = t; return e; };
    if (same) svg.append(mkT(lx + lw / 2, "middle", fMax + "층 동")); else svg.append(mkT(lx, "start", lo + "층"), mkT(lx + lw, "end", fMax + "층"));
    let scaleM = 0;
    if (o.scale && !left) {
      const cand = [10, 20, 25, 50, 100, 200, 300, 500].filter(m => m * k <= (W - 2 * padX) * .28 && m * k >= fs * 2.2).pop();
      if (cand) { scaleM = cand; const sx = padX, sy = o.legendY, bw = cand * k;
        svg.append(mk("path", { d: "M" + sx + "," + (sy - fs * .55) + " V" + sy + " H" + (sx + bw) + " V" + (sy - fs * .55), fill: "none", stroke: "#dbe7fb", "stroke-width": sw * 1.2 }));
        const st = mk("text", { x: sx + bw / 2, y: sy - fs * .8, "text-anchor": "middle", "font-size": fs * .85, "font-weight": 700, fill: "#dbe7fb" }); st.textContent = cand + "m"; svg.append(st); }
    }
    return { svg, est, fMax, scaleM };
  };
  // 건축물 자료가 없는 단지: 가짜 건물 대신 빈 도면 바탕(격자)만 그립니다
  DJ.planBlank = function (o) {
    const id = "pb" + (++uid), W = o.W, H = o.H, fs = o.fs;
    const svg = mk("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", class: "hc-plan", "aria-hidden": "true" });
    const defs = mk("defs"), bg = mk("radialGradient", { id: id, cx: "50%", cy: "46%", r: "75%" });
    [["0", "#21457f"], ["1", "#0d2145"]].forEach(x => bg.append(mk("stop", { offset: x[0], "stop-color": x[1] }))); defs.append(bg); svg.append(defs);
    svg.append(mk("rect", { width: W, height: H, fill: "url(#" + id + ")" }));
    const gs = Math.round(Math.min(W, H) / 5), g = mk("g", { stroke: "#9db8e8", fill: "none" });
    for (let x = gs / 2; x < W; x += gs / 2) g.append(mk("line", { x1: x, y1: 0, x2: x, y2: H, "stroke-width": (x % gs ? .25 : .5) * (fs / 8), opacity: x % gs ? .1 : .16 }));
    for (let y = gs / 2; y < H; y += gs / 2) g.append(mk("line", { x1: 0, y1: y, x2: W, y2: y, "stroke-width": (y % gs ? .25 : .5) * (fs / 8), opacity: y % gs ? .1 : .16 }));
    svg.append(g);
    const t = mk("text", { x: W / 2, y: H * .36, "text-anchor": "middle", "font-size": fs * 1.1, "font-weight": 700, fill: "#cfdcf5" }); t.textContent = "건축물 자료가 없어 배치도를 그리지 않았어요"; svg.append(t);
    return svg;
  };
})();
