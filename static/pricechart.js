// 단지 페이지 시세 차트: 평형·기간·보기(명목·실질·시장 흐름)를 바꿔 가며 추정 시세와 실거래를 봅니다.
// 자료: apt/d/<단지>.json (평형별 추정 시세·80% 범위, 거래), market.json (지역·구 지수와 거래량, 물가·금리)
// 문구는 textContent 로만 넣습니다.
(function () {
  const root = document.querySelector("[data-pc]");
  if (!root || !window.fetch) return;
  const NS = "http://www.w3.org/2000/svg";
  const el = DJ.el;
  const F_CANCEL = 1, F_PRESALE = 4, F_LOW = 8;
  const plot = root.querySelector("[data-pc-plot]");
  const gu = root.dataset.gu, region = root.dataset.region;
  const state = { type: 0, years: 10, mode: "nom" };
  let D = null, M = null, T = null;   // 단지 자료, 시장 자료, 고른 평형

  // ---------- 숫자·날짜 ----------
  function eok(v, axis) {
    if (v == null || isNaN(v)) return "-";
    if (v >= 10000) {
      const e = v / 10000, d = axis ? (e % 1 ? 1 : 0) : e >= 10 ? 1 : 2;
      return (+e.toFixed(d)) + "억";
    }
    return Math.round(v).toLocaleString() + "만";
  }
  const pct = (r, d = 1) => r == null || !isFinite(r) ? "-" : (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r * 100).toFixed(d) + "%";
  const abs = i => D.m0 + i;
  const ym = i => { const m = abs(i); return Math.floor(m / 12) + "." + String(m % 12 + 1).padStart(2, "0"); };
  const ymStr = s => { const [y, m] = s.split("-").map(Number); return y * 12 + m - 1 - D.m0; };
  const mk = (series, i) => {   // 시장 자료(market.json)의 같은 달 값
    if (!M || !series) return null;
    const j = abs(i) - M.m0;
    return j >= 0 && j < series.length ? series[j] : null;
  };
  function cpiAt(i) {
    if (!M || !M.cpi) return null;
    for (let k = i; k >= i - 6; k--) { const v = mk(M.cpi, k); if (v != null) return v; }
    return null;
  }
  const hasCpi = () => !!(M && M.cpi && M.cpi.some(v => v != null));
  function avg3(arr, i) {   // i 를 끝으로 석 달 평균 (값 있는 달만)
    let s = 0, n = 0;
    for (let k = i - 2; k <= i; k++) { const v = arr(k); if (v != null) { s += v; n++; } }
    return n ? s / n : null;
  }

  // ---------- SVG ----------
  function s(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function runs(i0, i1, ok) {   // 값이 이어지는 구간들 [[a,b], ...]
    const out = []; let a = null;
    for (let i = i0; i <= i1; i++) {
      if (ok(i)) { if (a === null) a = i; } else if (a !== null) { out.push([a, i - 1]); a = null; }
    }
    if (a !== null) out.push([a, i1]);
    return out;
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * p) return k * p;
    return 10 * p;
  }

  // ---------- 평형 고르기·첫 화면 ----------
  function defaultType() {
    const recent = D.n - 60;
    const cnt = D.types.map(() => 0);
    D.tr.forEach(t => { if (t[0] >= recent && !(t[5] & F_CANCEL)) cnt[t[2]]++; });
    let best = 0;
    D.types.forEach((t, i) => { if (cnt[i] > cnt[best] || (cnt[i] === cnt[best] && t.n > D.types[best].n)) best = i; });
    return best;
  }
  const lastValid = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; };
  const firstValid = arr => arr.findIndex(v => v != null);

  // 보기에 따라 그리는 값: 명목 그대로, 실질은 보기 시작 달 화폐가치로
  function conv(v, i, base) {
    if (v == null) return null;
    if (state.mode !== "real") return v;
    const a = cpiAt(base), b = cpiAt(i);
    return a && b ? v * a / b : null;
  }

  function view() {
    const fv = Math.min(...[firstValid(T.est), D.tr.findIndex(t => t[2] === state.type)].filter(v => v >= 0));
    const e = D.n - 1;
    const st = state.years ? Math.max(fv, e - state.years * 12 + 1) : fv;
    return [Math.max(0, st), e];
  }

  // ---------- 그리기 ----------
  function render() {
    if (!D) return;
    T = D.types[state.type];
    const W = Math.max(300, plot.clientWidth || 640), narrow = W < 560;
    const [i0, i1] = view();
    const base = i0;
    const market = state.mode === "mkt", gapMode = state.mode === "gap", plain = !market && !gapMode;
    // 좁은 화면은 오른쪽 이름표를 차트 안에 넣습니다 (시장 흐름은 오른쪽에 % 눈금)
    const padL = 46, padR = market ? (narrow ? 42 : 56) : (narrow ? 10 : 70), top = market ? 26 : 14;
    const mainH = narrow ? 230 : 300, volH = narrow ? 58 : 70, gap = 30;
    const rates = market && M && M.base && M.base.some(v => v != null);
    // 전세·갭: 거래량은 위(매매)·아래(전세 계약)로 나눠 높게, 그 아래 전세가율
    const volBox = gapMode ? volH + 34 : volH;
    const extra = rates || (gapMode && T.je);
    const rateH = extra ? (narrow ? 70 : 84) : 0;
    const H = top + mainH + gap + volBox + (extra ? gap + rateH : 0) + 24;
    const x = i => padL + (i - i0) / Math.max(1, i1 - i0) * (W - padL - padR);
    const typeTr = D.tr.filter(t => t[2] === state.type && t[0] >= i0 && t[0] <= i1);

    // 선들
    const est = i => conv(T.est[i], i, base);
    const lines = [];
    let E0 = null;
    if (market) {
      // 보기 첫머리에서 단지 시세와 지수가 모두 있는 달을 기준으로 맞춰 그립니다 (같은 비율로 움직였다면의 값)
      const series = [];
      if (M && M.region) series.push({ cls: "pc-reg", s: M.region.idx, name: region + " 전체" });
      if (M && M.gu && M.gu[gu] && gu !== region) series.push({ cls: "pc-gu", s: M.gu[gu].idx, name: gu });
      let b0 = -1;
      for (let i = i0; i <= i1 && b0 < 0; i++) if (T.est[i] != null && series.every(z => mk(z.s, i) != null)) b0 = i;
      series.forEach(z => {
        let a = b0;
        for (let i = i0; i <= i1 && a < 0; i++) if (T.est[i] != null && mk(z.s, i) != null) a = i;
        if (a < 0) return;
        const e0 = T.est[a], v0 = mk(z.s, a);
        lines.push({ cls: z.cls, name: z.name, get: i => { const v = mk(z.s, i); return v != null ? e0 * v / v0 : null; } });
      });
      for (let i = i0; i <= i1; i++) if (T.est[i] != null) { E0 = T.est[i]; break; }
    }
    // 세로 범위
    const vals = [];
    for (let i = i0; i <= i1; i++) {
      if (plain) { [T.lo[i], T.hi[i]].forEach(v => { const c = conv(v, i, base); if (c != null) vals.push(c); }); }
      if (gapMode && T.je && T.je[i] != null) vals.push(T.je[i]);
      const v = est(i); if (v != null) vals.push(v);
      if (state.mode === "real" && T.est[i] != null) vals.push(T.est[i]);
      lines.forEach(l => { const w = l.get(i); if (w != null) vals.push(w); });
    }
    if (plain) typeTr.forEach(t => { if (!(t[5] & F_CANCEL)) { const c = conv(t[3], t[0], base); if (c != null) vals.push(c); } });
    if (!vals.length) { plot.replaceChildren(el("p", "muted", "이 평형은 아직 보여 줄 거래가 없어요.")); return; }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const padV = (hi - lo) * 0.08 || hi * 0.05;
    lo = Math.max(0, lo - padV); hi += padV;
    const step = niceStep(hi - lo, narrow ? 4 : 5);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const y = v => top + (1 - (v - lo) / (hi - lo)) * mainH;

    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "pc-svg", role: "img",
      "aria-label": `${T.k}㎡ 추정 시세 ${ym(i0)}~${ym(i1)}` });
    // 눈금
    const g = s("g", { class: "pc-grid" }, svg);
    for (let v = lo; v <= hi + 1e-6; v += step) {
      s("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v) }, g);
      s("text", { x: padL - 6, y: y(v) + 4, class: "pc-ylab", "text-anchor": "end" }, g, eok(v, true));
      if (market && E0) s("text", { x: W - padR + 6, y: y(v) + 4, class: "pc-ylab" }, g, pct(v / E0 - 1, 0));
    }
    // 대통령 취임 (시장 흐름)
    if (market && M && M.terms) {
      const tg = s("g", { class: "pc-term" }, svg);
      M.terms.forEach(([name, start]) => {
        const i = ymStr(start);
        if (i < i0 || i > i1) return;
        s("line", { x1: x(i), x2: x(i), y1: top - 4, y2: top + mainH }, tg);
        s("text", { x: x(i) + 4, y: top - 8 }, tg, name);
      });
    }
    // 80% 범위
    if (plain) {
      runs(i0, i1, i => T.lo[i] != null && T.hi[i] != null && conv(T.lo[i], i, base) != null).forEach(([a, b]) => {
        let d = "";
        for (let i = a; i <= b; i++) d += (i === a ? "M" : "L") + x(i).toFixed(1) + "," + y(conv(T.hi[i], i, base)).toFixed(1);
        for (let i = b; i >= a; i--) d += "L" + x(i).toFixed(1) + "," + y(conv(T.lo[i], i, base)).toFixed(1);
        s("path", { d: d + "Z", class: "pc-band" }, svg);
      });
      // 달별 최고~최저
      const byM = {};
      typeTr.forEach(t => { if (!(t[5] & F_CANCEL)) (byM[t[0]] = byM[t[0]] || []).push(conv(t[3], t[0], base)); });
      const wg = s("g", { class: "pc-wh" }, svg);
      Object.keys(byM).forEach(k => {
        const v = byM[k].filter(z => z != null);
        if (v.length > 1) s("line", { x1: x(+k), x2: x(+k), y1: y(Math.max(...v)), y2: y(Math.min(...v)) }, wg);
      });
      // 실거래
      const dg = s("g", { class: "pc-dots" }, svg);
      typeTr.forEach(t => {
        const v = conv(t[3], t[0], base);
        if (v == null) return;
        const cx = x(t[0] + (t[1] - 15) / 31), cy = y(Math.min(hi, Math.max(lo, v)));
        if (t[5] & F_CANCEL) {
          const r = 3.2;
          s("path", { d: `M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx + r},${cy - r}L${cx - r},${cy + r}`, class: "pc-x" }, dg);
        } else {
          s("circle", { cx, cy, r: narrow ? 2.2 : 2.6, class: "pc-dot" + (t[5] & F_LOW ? " low" : "") + (t[5] & F_PRESALE ? " pre" : "") }, dg);
        }
      });
      if (state.mode === "real") pathLines(svg, i => T.est[i], "pc-ghost");
    }
    lines.forEach(l => pathLines(svg, l.get, "pc-line " + l.cls));
    if (gapMode && T.je) {   // 매매와 전세 사이 = 갭
      runs(i0, i1, i => T.est[i] != null && T.je[i] != null).forEach(([a, b]) => {
        let d = "";
        for (let i = a; i <= b; i++) d += (i === a ? "M" : "L") + x(i).toFixed(1) + "," + y(T.est[i]).toFixed(1);
        for (let i = b; i >= a; i--) d += "L" + x(i).toFixed(1) + "," + y(T.je[i]).toFixed(1);
        s("path", { d: d + "Z", class: "pc-gap" }, svg);
      });
      pathLines(svg, i => T.je[i], "pc-line pc-je");
    }
    pathLines(svg, est, "pc-line pc-main", i => T.sp[i]);

    // 고점 표시 (명목·실질)
    if (plain) {
      let pk = null, pi = -1;
      for (let i = i0; i <= i1; i++) { const v = est(i); if (v != null && (pk == null || v > pk)) { pk = v; pi = i; } }
      const marks = [];
      if (pk != null) marks.push({ v: pk, cls: "pc-peak", label: "최고", sub: eok(pk) });
      const a = ymStr("2021-01"), b = ymStr("2022-12");
      let p2 = null;
      for (let i = Math.max(a, 0); i <= Math.min(b, D.n - 1); i++) { const v = est(i); if (v != null && (p2 == null || v > p2)) p2 = v; }
      if (p2 != null && p2 >= lo && p2 <= hi && (pk == null || Math.abs(p2 / pk - 1) > 0.02) && i0 <= b)
        marks.push({ v: p2, cls: "pc-peak2", label: "21~22 고점", sub: eok(p2) });
      const pg = s("g", {}, svg);
      let lastY = -99;
      marks.sort((p, q) => q.v - p.v).forEach(mk2 => {
        s("line", { x1: padL, x2: W - padR, y1: y(mk2.v), y2: y(mk2.v), class: mk2.cls }, pg);
        if (narrow) {   // 선 바로 위, 왼쪽 끝에 한 줄로
          const ty = Math.max(y(mk2.v) - 5, lastY + 14);
          s("text", { x: padL + 4, y: ty, class: "pc-lab strong " + mk2.cls }, pg, mk2.label + " " + mk2.sub);
          lastY = ty;
          return;
        }
        const ty = Math.max(y(mk2.v) - 2, lastY + 24);
        s("text", { x: W - padR + 6, y: ty, class: "pc-lab " + mk2.cls }, pg, mk2.label);
        s("text", { x: W - padR + 6, y: ty + 12, class: "pc-lab strong " + mk2.cls }, pg, mk2.sub);
        lastY = ty;
      });
    }
    // 지금 시세
    const li = lastValid(T.est.slice(0, i1 + 1));
    if (li >= i0 && est(li) != null) s("circle", { cx: x(li), cy: y(est(li)), r: 4.5, class: "pc-now" }, svg);

    // 거래량 (분기)
    const vTop = top + mainH + gap;
    const q0 = Math.floor(abs(i0) / 3), q1 = Math.floor(abs(i1) / 3);
    const qa = {}, qb = {};
    if (market) {
      const src = M && (M.gu && M.gu[gu] ? M.gu[gu].vol : M.region && M.region.vol);
      for (let i = i0; i <= i1; i++) { const v = mk(src, i); if (v != null) { const q = Math.floor(abs(i) / 3); qa[q] = (qa[q] || 0) + v; } }
    } else {
      D.tr.forEach(t => {
        if (t[5] & F_CANCEL || t[0] < i0 || t[0] > i1) return;
        const q = Math.floor(abs(t[0]) / 3);
        if (t[2] === state.type) qa[q] = (qa[q] || 0) + 1; else qb[q] = (qb[q] || 0) + 1;
      });
    }
    let vmax = 1;
    for (let q = q0; q <= q1; q++) vmax = Math.max(vmax, (qa[q] || 0) + (gapMode ? 0 : (qb[q] || 0)));
    const vg = s("g", { class: "pc-vol" }, svg);
    if (gapMode) {
      // 위 = 이 평형 매매, 아래 = 전세 계약(신규·갱신·미표기). 눈금은 따로
      const rq = {};
      (T.rv || []).forEach(([m, a, b, c]) => {
        if (m < i0 || m > i1) return;
        const q = Math.floor(abs(m) / 3), r = rq[q] = rq[q] || [0, 0, 0];
        r[0] += a; r[1] += b; r[2] += c;
      });
      let rmax = 1;
      for (let q = q0; q <= q1; q++) if (rq[q]) rmax = Math.max(rmax, rq[q][0] + rq[q][1] + rq[q][2]);
      const upH = volBox * 0.48, dnH = volBox * 0.48, mid = vTop + upH + 2;
      s("text", { x: padL, y: vTop - 8, class: "pc-ylab strong" }, vg, "거래량(분기) · 위 매매 · 아래 전세 계약");
      s("text", { x: padL - 6, y: vTop + 9, class: "pc-ylab", "text-anchor": "end" }, vg, String(vmax));
      s("text", { x: padL - 6, y: mid + dnH, class: "pc-ylab", "text-anchor": "end" }, vg, String(rmax));
      s("line", { x1: padL, x2: W - padR, y1: mid - 1, y2: mid - 1, class: "pc-axis" }, vg);
      const qw = Math.max(1.5, (x(i0 + 3) - x(i0)) - 2);
      for (let q = q0; q <= q1; q++) {
        const cx = x(q * 3 + 1 - D.m0), a = qa[q] || 0, h = a / vmax * upH;
        if (a) s("rect", { x: cx - qw / 2, y: mid - 2 - h, width: qw, height: h, class: "pc-va" }, vg);
        let yy = mid + 1;
        (rq[q] || [0, 0, 0]).forEach((v, k) => {
          if (!v) return;
          const hh = v / rmax * dnH;
          s("rect", { x: cx - qw / 2, y: yy, width: qw, height: hh, class: "pc-rn" + k }, vg);
          yy += hh;
        });
      }
    } else {
    const where = M && M.gu && M.gu[gu] ? gu : region;
    const label = market ? (narrow ? `${where} 거래량(분기)` : `${where} 전체 아파트 매매 거래량(분기)`) : "거래량(분기)";
    s("text", { x: padL, y: vTop - 8, class: "pc-ylab strong" }, vg, label + volChange(market, narrow));
    s("text", { x: padL - 6, y: vTop + 9, class: "pc-ylab", "text-anchor": "end" }, vg, String(vmax));
    const qw = Math.max(1.5, (x(i0 + 3) - x(i0)) - 2);
    const partial = (abs(D.n - 1) % 3) !== 2;
    for (let q = q0; q <= q1; q++) {
      const cx = x(q * 3 + 1 - D.m0), a = qa[q] || 0, b = qb[q] || 0;
      const ha = a / vmax * volH, hb = b / vmax * volH;
      const cls = q === q1 && partial ? " part" : "";
      if (b) s("rect", { x: cx - qw / 2, y: vTop + volH - ha - hb, width: qw, height: hb, class: "pc-vb" + cls }, vg);
      if (a) s("rect", { x: cx - qw / 2, y: vTop + volH - ha, width: qw, height: ha, class: (market ? "pc-vm" : "pc-va") + cls }, vg);
    }
    }
    // 금리 (시장 흐름, 자료가 있을 때)
    let rTop = 0;
    if (gapMode && T.je) {   // 전세가율 = 전세 ÷ 매매
      rTop = vTop + volBox + gap;
      const rg = s("g", { class: "pc-rate" }, svg);
      const ry = v => rTop + (1 - v / 100) * rateH;
      s("text", { x: padL, y: rTop - 8, class: "pc-ylab strong" }, rg, "전세가율 (전세 ÷ 매매)");
      [0, 50, 100].forEach(v => {
        s("line", { x1: padL, x2: W - padR, y1: ry(v), y2: ry(v), class: v ? "pc-gridl" : "pc-axis" }, rg);
        s("text", { x: padL - 6, y: ry(v) + 4, class: "pc-ylab", "text-anchor": "end" }, rg, v + "%");
      });
      pathLines(rg, i => T.est[i] != null && T.je[i] != null ? T.je[i] / T.est[i] * 100 : null, "pc-line pc-je", null, x, ry, i0, i1);
    }
    if (rates) {
      rTop = vTop + volH + gap;
      const rg = s("g", { class: "pc-rate" }, svg);
      let rmax = 0;
      for (let i = i0; i <= i1; i++) [mk(M.base, i), mk(M.mort, i)].forEach(v => { if (v != null) rmax = Math.max(rmax, v); });
      rmax = Math.ceil(rmax + 0.5);
      const ry = v => rTop + (1 - v / rmax) * rateH;
      s("text", { x: padL, y: rTop - 8, class: "pc-ylab strong" }, rg, "금리 · 기준금리 · 주택담보대출(신규)");
      [0, rmax].forEach(v => s("text", { x: padL - 6, y: ry(v) + 4, class: "pc-ylab", "text-anchor": "end" }, rg, v + "%"));
      s("line", { x1: padL, x2: W - padR, y1: ry(0), y2: ry(0), class: "pc-axis" }, rg);
      pathLines(rg, i => mk(M.base, i), "pc-line pc-rbase", null, x, ry, i0, i1);
      pathLines(rg, i => mk(M.mort, i), "pc-line pc-rmort", null, x, ry, i0, i1);
    }
    // 가로축 (해)
    const xg = s("g", { class: "pc-xlab" }, svg);
    const yA = Math.floor(abs(i0) / 12), yB = Math.floor(abs(i1) / 12);
    const every = Math.max(1, Math.ceil((yB - yA + 1) / ((W - padL - padR) / (narrow ? 52 : 64))));
    for (let yr = yA; yr <= yB; yr++) {
      const i = yr * 12 - D.m0;
      if (i < i0 || (yr - yA) % every) continue;
      s("text", { x: x(i), y: H - 6, "text-anchor": "middle", class: "pc-ylab" }, xg, String(yr));
      s("line", { x1: x(i), x2: x(i), y1: top + mainH, y2: top + mainH + 4, class: "pc-axis" }, xg);
    }
    // 마우스·손가락: 세로선과 그 달 설명
    const cross = s("line", { class: "pc-cross", y1: top, y2: (extra ? rTop + rateH : vTop + volBox), visibility: "hidden" }, svg);
    const hit = s("rect", { x: padL, y: 0, width: W - padL - padR, height: H, fill: "transparent", class: "pc-hit" }, svg);
    const move = ev => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const i = Math.round(i0 + (px - padL) / (W - padL - padR) * (i1 - i0));
      if (i < i0 || i > i1) return hideTip();
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      showTip(tipLines(i, lines, base), ev.clientX, ev.clientY);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });

    plot.replaceChildren(svg);
    renderLegend(market, rates, gapMode);
    renderHead();

    function pathLines(parent, get, cls, sparse, xf = x, yf = y, a = i0, b = i1) {
      runs(a, b, i => get(i) != null).forEach(([ra, rb]) => {
        if (!sparse) {
          let d = "";
          for (let i = ra; i <= rb; i++) d += (i === ra ? "M" : "L") + xf(i).toFixed(1) + "," + yf(get(i)).toFixed(1);
          s("path", { d, class: cls }, parent);
          return;
        }
        // 거래 희소 달은 점선
        let i = ra;
        while (i <= rb) {
          const sp = !!sparse(i);
          let j = i;
          while (j + 1 <= rb && !!sparse(j + 1) === sp) j++;
          const from = Math.max(ra, i - 1);
          let d = "";
          for (let k = from; k <= j; k++) d += (k === from ? "M" : "L") + xf(k).toFixed(1) + "," + yf(get(k)).toFixed(1);
          s("path", { d, class: cls + (sp ? " sp" : "") }, parent);
          i = j + 1;
        }
      });
    }
  }

  function volChange(market, narrow) {
    // 최근 3개월 거래량, 1년 전 같은 석 달과 비교
    const e = D.n - 1;
    let a = 0, b = 0;
    if (market) {
      const src = M && (M.gu && M.gu[gu] ? M.gu[gu].vol : M.region && M.region.vol);
      if (!src) return "";
      for (let k = 0; k < 3; k++) { a += mk(src, e - k) || 0; b += mk(src, e - 12 - k) || 0; }
    } else return "";
    return b ? (narrow ? ` · 1년 전 대비 ${pct(a / b - 1)}` : ` · 최근 3개월 1년 전보다 ${pct(a / b - 1)}`) : "";
  }

  function tipLines(i, lines, base) {
    const out = [ym(i)];
    const v = conv(T.est[i], i, base);
    if (v != null) {
      out.push(`추정 시세 ${eok(v)}${T.sp[i] ? " (거래가 드문 달)" : ""}`);
      if (state.mode !== "mkt" && T.lo[i] != null) out.push(`예상 범위 ${eok(conv(T.lo[i], i, base))} ~ ${eok(conv(T.hi[i], i, base))}`);
      if (state.mode === "real") out.push(`명목 ${eok(T.est[i])}`);
    }
    if (state.mode === "gap") {
      const j = T.je && T.je[i];
      if (j != null) {
        out.push(`전세 추정 ${eok(j)}`);
        if (T.est[i] != null) out.push(`갭 ${eok(T.est[i] - j)} · 전세가율 ${Math.round(j / T.est[i] * 100)}%`);
      }
      const rv = (T.rv || []).find(r => r[0] === i);
      if (rv) out.push(`전세 계약 ${rv[1] + rv[2] + rv[3]}건` + (rv[1] || rv[2] ? ` (신규 ${rv[1]} · 갱신 ${rv[2]})` : ""));
    } else if (state.mode === "mkt") {
      lines.forEach(l => { const w = l.get(i); if (w != null) out.push(`${l.name} 흐름대로였다면 ${eok(w)}`); });
      if (M && M.base) { const r1 = mk(M.base, i), r2 = mk(M.mort, i); if (r1 != null) out.push(`기준금리 ${r1}%${r2 != null ? ` · 주담대 ${r2}%` : ""}`); }
    } else {
      const tr = D.tr.filter(t => t[0] === i && t[2] === state.type && !(t[5] & F_CANCEL)).map(t => t[3]);
      const nc = D.tr.filter(t => t[0] === i && t[2] === state.type && (t[5] & F_CANCEL)).length;
      if (tr.length) out.push(`거래 ${tr.length}건 ${tr.length > 1 ? eok(Math.min(...tr)) + " ~ " + eok(Math.max(...tr)) : eok(tr[0])}`);
      if (nc) out.push(`해제 ${nc}건`);
    }
    return out;
  }

  // ---------- 툴팁 (차트 전용) ----------
  const tip = el("div", "tooltip");
  tip.setAttribute("role", "tooltip"); tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(lines, cx, cy) {
    tip.replaceChildren(...lines.map((l, k) => el("div", k ? "" : "tip-head", l)));
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, pad = 14;
    let left = cx + pad, topY = cy - h - pad;
    if (left + w > innerWidth - 8) left = cx - w - pad;
    if (topY < 8) topY = cy + pad;
    tip.style.left = Math.max(8, left) + "px"; tip.style.top = topY + "px";
  }
  function hideTip() { tip.hidden = true; }
  addEventListener("scroll", hideTip, { passive: true });

  // ---------- 위 요약 ----------
  function renderHead() {
    const head = root.querySelector("[data-pc-head]");
    const li = lastValid(T.est);
    const nowB = head.querySelector("[data-pc-now]"), rng = head.querySelector("[data-pc-range]");
    const meta = head.querySelector("[data-pc-meta]"), badge = head.querySelector("[data-pc-badge]");
    const real = head.querySelector("[data-pc-real]");
    head.hidden = false;
    if (li < 0) { nowB.textContent = "-"; rng.textContent = ""; meta.textContent = "시세를 추정할 거래가 부족해요."; badge.hidden = true; return; }
    nowB.textContent = eok(T.est[li]);
    rng.textContent = T.lo[li] != null ? `예상 거래 범위 ${eok(T.lo[li])} ~ ${eok(T.hi[li])} (10건 중 8건)` : "";
    const yr = D.tr.filter(t => t[2] === state.type && t[0] > D.n - 13 && !(t[5] & F_CANCEL));
    const last = D.tr.filter(t => t[2] === state.type && !(t[5] & F_CANCEL)).pop();
    const parts = [`전용 ${T.k}㎡${T.py ? `(${T.py}평)` : ""} 추정 시세`, `최근 12개월 ${yr.length}건`];
    if (last) parts.push(`최근 실거래 ${ym(last[0])}${last[4] > 0 ? " " + last[4] + "층" : ""} ${eok(last[3])}`);
    if (li < D.n - 12) parts.push(`최근 1년 거래가 없어 ${ym(li)} 기준`);
    meta.textContent = parts.join(" · ");
    // 실질 환산
    const [i0] = view();
    const lj = T.je ? lastValid(T.je) : -1;
    if (state.mode === "gap" && lj >= 0) {
      real.hidden = false;
      const sale = T.est[lj];
      real.textContent = `전세 추정 ${eok(T.je[lj])}` + (sale ? ` · 갭 ${eok(sale - T.je[lj])} · 전세가율 ${Math.round(T.je[lj] / sale * 100)}%` : "") +
        (lj < D.n - 6 ? ` (${ym(lj)} 기준)` : "");
    } else if (state.mode === "real" && hasCpi()) {
      real.hidden = false;
      real.textContent = `물가를 빼면 ${eok(conv(T.est[li], li, i0))} (${ym(i0)} 돈 가치로)`;
    } else real.hidden = true;
    // 고점 대비 (전체 기간)
    const useReal = state.mode === "real" && hasCpi();
    let pk = null, pi = -1;
    T.est.forEach((v, i) => {
      if (v == null) return;
      const w = useReal ? conv(v, i, 0) : v;
      if (w != null && (pk == null || w > pk)) { pk = w; pi = i; }
    });
    const cur = useReal ? conv(T.est[li], li, 0) : T.est[li];
    badge.hidden = pk == null || pi === li;
    if (!badge.hidden) {
      const r = cur / pk - 1;
      badge.textContent = r > -0.005 ? `지금이 가장 높아요${useReal ? " (실질)" : ""}`
        : `고점 대비 ${pct(r)} (${useReal ? "실질, " : ""}${ym(pi)} 고점)`;
      badge.classList.toggle("near", r > -0.05);
    }
  }

  function renderLegend(market, rates, gapMode) {
    const box = root.querySelector("[data-pc-legend]");
    const item = (cls, text) => { const s1 = el("span", "pc-key"); s1.append(el("i", cls), document.createTextNode(text)); return s1; };
    const items = [];
    if (gapMode) {
      items.push(item("k-line s1", "매매 추정 시세"));
      items.push(item("k-line je", "전세 추정 보증금"));
      items.push(item("k-gap", "갭(매매 − 전세)"));
      items.push(item("k-bar a", "매매 거래"));
      items.push(item("k-rn0", "전세 신규"));
      items.push(item("k-rn1", "전세 갱신"));
      items.push(item("k-rn2", "2021년 6월 전(구분 없음)"));
    } else if (market) {
      items.push(item("k-line s1", "이 단지 추정 시세"));
      items.push(item("k-line s2", region + " 지수"));
      if (M && M.gu && M.gu[gu] && gu !== region) items.push(item("k-line s3", gu + " 지수"));
      items.push(item("k-vline", "대통령 취임"));
      items.push(item("k-bar m", "지역 거래량"));
      if (rates) { items.push(item("k-line navy", "기준금리")); items.push(item("k-line s1 thin", "주담대 금리")); }
    } else {
      items.push(item("k-line s1", state.mode === "real" ? "실질 추정 시세" : "추정 시세"));
      if (state.mode === "real") items.push(item("k-line ghost", "명목 추정 시세"));
      items.push(item("k-dash s1", "거래가 드문 달"));
      items.push(item("k-band", "예상 거래 범위(80%)"));
      items.push(item("k-dot", "실거래"));
      items.push(item("k-dot low", "저층(1~3층)"));
      items.push(item("k-x", "해제 거래"));
      items.push(item("k-bar", "거래량(이 평형 / 다른 평형)"));
    }
    box.replaceChildren(...items);
  }

  // ---------- 아래 표: 지역과 비교, 임기별 변화, 연도별 거래량 ----------
  function renderTables() {
    const box = root.parentElement.querySelector("[data-pc-tables]");
    if (!box) return;
    box.replaceChildren();
    const e = D.n - 1;
    const fv = firstValid(T.est);
    if (fv < 0) { box.hidden = true; return; }
    box.hidden = false;
    const real = hasCpi();
    const estAt = i => T.est[i] != null ? T.est[i] : null;
    // 지역과 비교
    if (M && M.region) {
      let st = fv;
      while (st < e && (avg3(estAt, st + 2) == null || avg3(i => mk(M.region.idx, i), st + 2) == null)) st++;
      const yrs = (e - st) / 12;
      if (yrs >= 1) {
        const rows = [["이 단지 " + T.k + "㎡", estAt, "s1"], [region, i => mk(M.region.idx, i), "s2"]];
        if (M.gu && M.gu[gu] && gu !== region) rows.push([gu, i => mk(M.gu[gu].idx, i), "s3"]);
        const defl = real ? (cpiAt(st + 2) && cpiAt(e) ? cpiAt(e) / cpiAt(st + 2) : null) : null;
        const t = table(["구분", "명목", ...(defl ? ["실질"] : []), "연평균" + (defl ? "(실질)" : "")]);
        rows.forEach(([name, get, cls]) => {
          const a = avg3(get, st + 2), b = avg3(get, e);
          if (a == null || b == null) return;
          const nom = b / a - 1, re = defl ? (b / a) / defl - 1 : null;
          const yearly = Math.pow(1 + (defl ? re : nom), 1 / yrs) - 1;
          const name1 = el("th"); name1.append(el("i", "pc-sw " + cls), document.createTextNode(name));
          const tr = el("tr"); tr.append(name1, el("td", "", pct(nom)));
          if (defl) tr.append(el("td", "", pct(re)));
          tr.append(el("td", "strong", pct(yearly)));
          t.tb.append(tr);
        });
        box.append(section("지역과 비교", `${ym(st)} ~ ${ym(e)} · 처음과 끝 석 달 평균`, t.t));
      }
    }
    // 임기별
    if (M && M.terms) {
      const t = table(["임기", "관측 구간", "명목", ...(real ? ["실질"] : [])]);
      let any = false;
      M.terms.forEach(([name, a, b]) => {
        let ia = ymStr(a), ib = b ? ymStr(b) : e;
        const clipped = ia < fv;
        ia = Math.max(ia, fv); ib = Math.min(ib, e);
        if (ib - ia < 6) return;
        const va = avg3(estAt, ia + 2), vb = avg3(estAt, ib);
        if (va == null || vb == null) return;
        any = true;
        const tr = el("tr");
        tr.append(el("th", "", name), el("td", "muted", `${ym(ia)}~${ym(ib)}${clipped ? "*" : ""}`), el("td", "", pct(vb / va - 1)));
        if (real) {
          const d = cpiAt(ib) && cpiAt(ia + 2) ? cpiAt(ib) / cpiAt(ia + 2) : null;
          tr.append(el("td", "strong", d ? pct(vb / va / d - 1) : "-"));
        }
        t.tb.append(tr);
      });
      if (any) box.append(section("임기별 추정 시세 변화", `전용 ${T.k}㎡ · *표시는 거래 자료가 시작된 달부터`, t.t));
    }
    // 연도별 거래량 (모든 평형, 해제 제외)
    const byY = {};
    D.tr.forEach(t => { if (!(t[5] & F_CANCEL)) { const yr = Math.floor(abs(t[0]) / 12); byY[yr] = (byY[yr] || 0) + 1; } });
    const lastY = Math.floor(abs(e) / 12);
    const years = [];
    for (let yr = lastY - 9; yr <= lastY; yr++) if (yr >= Math.floor(D.m0 / 12)) years.push(yr);
    if (years.length >= 3) {
      const W = 520, Hh = 150, bw = W / years.length;
      const vmax = Math.max(1, ...years.map(yr => byY[yr] || 0));
      const svg = s("svg", { viewBox: `0 0 ${W} ${Hh + 34}`, class: "pc-years", role: "img", "aria-label": "연도별 거래량" });
      years.forEach((yr, k) => {
        const v = byY[yr] || 0, h = v / vmax * Hh;
        const cx = k * bw + bw / 2, cls = yr === lastY ? "pc-yb part" : "pc-yb";
        s("rect", { x: cx - bw * 0.32, y: 18 + Hh - h, width: bw * 0.64, height: Math.max(h, v ? 2 : 0), rx: 4, class: cls }, svg);
        s("text", { x: cx, y: 18 + Hh - h - 5, "text-anchor": "middle", class: "pc-ylab strong" }, svg, String(v));
        s("text", { x: cx, y: Hh + 34, "text-anchor": "middle", class: "pc-ylab" }, svg, "'" + String(yr).slice(2) + (yr === lastY ? "*" : ""));
      });
      const full = years.filter(yr => yr !== lastY);
      const mean = full.reduce((a, yr) => a + (byY[yr] || 0), 0) / Math.max(1, full.length);
      const topY = full.reduce((a, yr) => (byY[yr] || 0) > (byY[a] || 0) ? yr : a, full[0]);
      // 회전율: 한 해 거래 ÷ 세대수 (단지 정보가 있을 때)
      const turn = D.hh ? ` 세대수(${D.hh.toLocaleString()}세대) 대비 한 해에 ${(mean / D.hh * 100).toFixed(1)}%가 손바뀜한 셈이에요.` : "";
      const note = el("p", "muted pc-note", `${full[0]}~${full[full.length - 1]}년에는 해마다 평균 ${mean.toFixed(1)}건 거래됐고, 가장 많았던 해는 ${topY}년(${byY[topY] || 0}건)이에요.${turn} *${lastY}년은 ${ym(e).split(".")[1] * 1}월까지예요.`);
      box.append(section("연도별 거래량", "모든 평형 · 해제 거래 제외", svg, note));
    }
  }
  function table(heads) {
    const t = el("table", "pc-table"), th = el("thead"), tr = el("tr"), tb = el("tbody");
    heads.forEach(h => tr.append(el("th", "", h)));
    th.append(tr); t.append(th, tb);
    const wrap = el("div", "table-wrap"); wrap.append(t);
    return { t: wrap, tb };
  }
  function section(title, sub, ...kids) {
    const d = el("div", "pc-sec");
    const h = el("h3", "sub", title);
    if (sub) h.append(el("span", "muted", " " + sub));
    d.append(h, ...kids);
    return d;
  }

  // ---------- 조작 ----------
  function controls() {
    const ctrl = root.querySelector("[data-pc-ctrl]");
    const sel = ctrl.querySelector("[data-pc-type]");
    sel.replaceChildren(...D.types.map((t, i) => {
      const o = el("option", "", `전용 ${t.k}㎡${t.py ? ` (${t.py}평)` : ""} · ${t.n}건`);
      o.value = i;
      return o;
    }));
    sel.value = state.type;
    sel.addEventListener("change", () => { state.type = +sel.value; render(); renderTables(); });
    ctrl.querySelectorAll("[data-pc-years]").forEach(b => b.addEventListener("click", () => {
      state.years = +b.dataset.pcYears; mark(ctrl, "[data-pc-years]", b); render();
    }));
    const realBtn = ctrl.querySelector('[data-pc-mode="real"]'), mktBtn = ctrl.querySelector('[data-pc-mode="mkt"]');
    realBtn.hidden = !hasCpi();
    mktBtn.hidden = !(M && M.region);
    const gapBtn = ctrl.querySelector('[data-pc-mode="gap"]');
    if (gapBtn) gapBtn.hidden = !D.types.some(t => t.je);
    ctrl.querySelectorAll("[data-pc-mode]").forEach(b => b.addEventListener("click", () => {
      state.mode = b.dataset.pcMode; mark(ctrl, "[data-pc-mode]", b); render();
    }));
    ctrl.hidden = false;
  }
  function mark(box, sel, on) {
    box.querySelectorAll(sel).forEach(b => { b.classList.toggle("active", b === on); b.setAttribute("aria-pressed", b === on); });
  }

  // ---------- 불러오기 ----------
  const get = url => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
  Promise.all([get(root.dataset.src), get(root.dataset.market)]).then(([d, m]) => {
    if (!d || !d.types || !d.types.length) return;
    D = d; M = m;
    state.type = defaultType();
    T = D.types[state.type];
    controls();
    render();
    renderTables();
    let w = plot.clientWidth;
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (Math.abs(plot.clientWidth - w) > 8) { w = plot.clientWidth; render(); }
    }).observe(plot);
  });
})();
