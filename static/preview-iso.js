// 일조 미리보기 2.5D(등각 투영) 그리기. 순수 계산 + SVG 글자 만들기, 라이브러리 없음.
// 계산(해 위치·앞 동 가림)은 shadow.js / preview-calc.js 결과를 그대로 받아 그리기만 한다. 여기서 새로 판정하지 않는다.
//  - 카메라: 남쪽에서 북쪽을 바라보고(창이 있는 남쪽 면이 보이게) 약간 비틀어 옆면도 보이게 한다. 사용자가 돌리지 않는다(고정 시점).
//  - 그림자는 shadow.js 의 shadowPoly 를 땅 위(z=0)에 그대로 올린다. 실내로 들어오는 햇빛과는 다르다.
//  - 해로 향하는 선(ray)은 선택한 창 높이에서 해 쪽으로 뻗는다. 가려질 때는 shadow.js 의 hitT 로 처음 닿는 앞 동에서 끊는다.
(function (root) {
  'use strict';
  const S = (typeof module !== 'undefined' && module.exports) ? require('./shadow.js') : root.DJShadow;
  const RAD = Math.PI / 180, CAM = { rot: 28, tilt: 52 };
  const SR = Math.sin(CAM.rot * RAD), CR = Math.cos(CAM.rot * RAD), ST = Math.sin(CAM.tilt * RAD), CT = Math.cos(CAM.tilt * RAD);
  const f1 = n => n.toFixed(1);
  const pts = a => a.map(q => f1(q[0]) + ',' + f1(q[1])).join(' ');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 세계(동 +x, 북 +y, 위 +z, 미터) -> 화면(오른쪽 +x, 아래 +y)
  function P(x, y, z) { const u = x * CR + y * SR, v = -x * SR + y * CR; return [u, -(v * ST + z * CT)]; }
  const depth = (x, y) => -x * SR + y * CR;                       // 클수록 멀리(북쪽) 있다
  const CAMH = [SR, -CR];                                          // 장면에서 카메라 쪽 수평 방향

  function area(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], c = p[(i + 1) % p.length]; a += q[0] * c[1] - c[0] * q[1]; } return a; }
  function center(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
  const polyOf = (b, tid) => (b.id === tid && b.rect) ? b.rect : b.poly;

  // 선택한 창에서 해 쪽으로 뻗는 선. blds 는 계산에 쓴 건물 목록(선택한 동 제외: C.variant 의 blds 에서 자기 자신을 뺀 것).
  // 처음 닿는 앞 동 거리 T 와 그 동 id 를 돌려준다(없으면 T=null). shadow.js cellBy 와 같은 식(hitT, hOf)이다.
  function ray(fi, z, slot, blds, selfId) {
    const az = slot.az * RAD, alt = slot.alt * RAD, ux = Math.sin(az), uy = Math.cos(az), tan = Math.tan(alt);
    let T = null, by = null;
    for (const o of blds) {
      if (o.id === selfId) continue;
      const t = S.hitT(fi.cx, fi.cy, ux, uy, o.poly);
      if (t !== null && z + t * tan < S.hOf(o) && (T === null || t < T)) { T = t; by = o.id; }
    }
    return { px: fi.cx, py: fi.cy, z, ux, uy, tan, T, by, hit: T !== null };
  }

  // 그림에 담을 영역(화면 좌표). aspect = 가로/세로. wide 면 계산에 쓴 건물 전부.
  function bounds(o, aspect) {
    const out = [];
    const add = (poly, h) => { for (const q of poly) { out.push(P(q[0], q[1], 0)); out.push(P(q[0], q[1], h)); } };
    const tb = o.items.find(b => b.id === o.tid);
    if (o.wide) { for (const b of o.items) add(polyOf(b, o.tid), b.h); }
    else {
      add(polyOf(tb, o.tid), tb.h);
      for (const id of o.fitIds) { const b = o.items.find(x => x.id === id); if (b) add(b.poly, b.h); }
      if (o.rayEnd) out.push(P(o.rayEnd[0], o.rayEnd[1], o.rayEnd[2]));
    }
    let x0 = Math.min(...out.map(p => p[0])), x1 = Math.max(...out.map(p => p[0])), y0 = Math.min(...out.map(p => p[1])), y1 = Math.max(...out.map(p => p[1]));
    const pad = o.wide ? 14 : 22; x0 -= pad; x1 += pad; y0 -= pad * 1.6; y1 += pad;
    let w = x1 - x0, h = y1 - y0; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const minW = 120; if (w < minW) w = minW; if (h < minW / aspect) h = minW / aspect;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // o: { items, tid, fl, fh, sun:{alt,az,up}, state, blockIds:Set, nowIds:Set, fi, ray, wide, label(b), num(b), SRC(b) }
  function render(o, view, rw) {
    const k = view.w / (rw || 358), fs = 14 * k;
    const sun = o.sun, tb = o.items.find(b => b.id === o.tid), tp = polyOf(tb, o.tid);
    let s = '<defs><pattern id="iShadow" patternUnits="userSpaceOnUse" width="' + 7 * k + '" height="' + 7 * k + '" patternTransform="rotate(45)"><rect width="' + 7 * k + '" height="' + 7 * k + '" fill="rgba(68,86,106,.14)"/><rect width="' + 2.2 * k + '" height="' + 7 * k + '" fill="rgba(68,86,106,.55)"/></pattern>' +
      ['own:#5aa0e6:#2a6fb8:#17508f', 'blk:#f6e6d3:#e4d3c1:#d3bea8', 'now:#f9c690:#f1b172:#d98f4a', 'oth:#eef1f5:#d7dde4:#bcc5cf'].map(x => { const a = x.split(':'); return '<linearGradient id="gA' + a[0] + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a[1] + '"/><stop offset="1" stop-color="' + a[2] + '"/></linearGradient><linearGradient id="gB' + a[0] + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a[2] + '"/><stop offset="1" stop-color="' + a[3] + '"/></linearGradient>'; }).join('') +
      '<linearGradient id="gSh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3c4f66" stop-opacity=".34"/><stop offset="1" stop-color="#3c4f66" stop-opacity=".12"/></linearGradient></defs>';
    // 땅 위 그림자(가리는 동만, 선택한 시각)
    if (sun.up && sun.alt >= 1) {
      for (const b of o.items) {
        if (!o.blockIds.has(b.id)) continue;
        const sp = S.shadowPoly({ poly: b.poly, h: b.h, f: b.f }, sun);
        if (sp) s += '<polygon points="' + pts(sp.map(q => P(q[0], q[1], 0))) + '" fill="url(#gSh)" opacity="' + (o.nowIds.has(b.id) ? 1 : .55) + '"/>';
      }
    }
    // 건물: 먼 것부터(북쪽부터) 그려서 앞 건물이 위에 겹친다
    const order = o.items.map(b => ({ b, d: (c => depth(c[0], c[1]))(center(polyOf(b, o.tid))) })).sort((a, c) => c.d - a.d).map(x => x.b);
    const labels = [];
    const vis = b => { const p = polyOf(b, o.tid); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of p) for (const z of [0, b.h]) { const a = P(q[0], q[1], z); if (a[0] < x0) x0 = a[0]; if (a[0] > x1) x1 = a[0]; if (a[1] < y0) y0 = a[1]; if (a[1] > y1) y1 = a[1]; } const m = 12 * k; return x1 > view.x - m && x0 < view.x + view.w + m && y1 > view.y - m && y0 < view.y + view.h + m; };
    for (const b of order) {
      const role = b.id === o.tid ? 'own' : (o.blockIds.has(b.id) ? 'blk' : 'oth');
      if (role === 'oth' && !vis(b)) continue;
      const poly = polyOf(b, o.tid), sg = area(poly) >= 0 ? 1 : -1, n = poly.length;
      { const cc = center(poly), grow = (pp, a) => pp.map(q => { const dx = q[0] - cc[0], dy = q[1] - cc[1], l = Math.hypot(dx, dy) || 1; return P(q[0] + dx / l * a, q[1] + dy / l * a, 0); });
        s += '<polygon class="iso-ao" points="' + pts(grow(poly, 5)) + '"/><polygon class="iso-ao" points="' + pts(grow(poly, 2)) + '"/>'; }
      let g = '<g class="iso-b iso-' + role + (role === 'blk' && o.nowIds.has(b.id) ? ' iso-now' : '') + '"' + (b.k === 'own' && o.calcable(b) ? ' data-b="' + b.id + '"' : '') + '>';
      g += '<title>' + esc(o.label(b)) + ' ' + b.f + '층 · ' + (b.h ? b.h.toFixed(1) + ' m' : '') + ' · ' + esc(o.SRC(b)) + (role === 'blk' ? ' · 하루 중 가리는 동' : '') + (role === 'own' ? ' · 선택한 동' : '') + '</title>';
      const walls = [];
      for (let i = 0; i < n; i++) {
        const a = poly[i], c = poly[(i + 1) % n], dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy); if (len < 0.01) continue;
        const nx = sg * dy / len, ny = -sg * dx / len, vis = nx * CAMH[0] + ny * CAMH[1];
        if (vis <= 0.02) continue;
        walls.push({ a, c, vis, d: depth((a[0] + c[0]) / 2, (a[1] + c[1]) / 2) });
      }
      walls.sort((x, y) => y.d - x.d);
      for (const w of walls) g += '<polygon class="iso-w ' + (w.vis > 0.55 ? 'iso-wa' : 'iso-wb') + '" points="' + pts([P(w.a[0], w.a[1], 0), P(w.c[0], w.c[1], 0), P(w.c[0], w.c[1], b.h), P(w.a[0], w.a[1], b.h)]) + '"/>';
      g += '<polygon class="iso-r" points="' + pts(poly.map(q => P(q[0], q[1], b.h))) + '"/>';
      g += '</g>';
      s += g;
      if (role !== 'oth') { const c = center(poly), top = P(c[0], c[1], b.h); labels.push({ role, x: top[0], y: top[1] - 6 * k, b }); }
    }
    // 고른 층의 띠: 남쪽 면(창이 있다고 가정한 면)에 같은 비율로 올린다. 앞 동에 가려져 안 보이는 일이 없도록 건물을 다 그린 뒤 맨 위에 그린다.
    { const fi = o.fi, z0 = (o.fl - 1) * o.fh, z1 = Math.min(o.fl * o.fh, tb.h), a = fi.a, e = [a[0] + fi.ex * fi.len, a[1] + fi.ey * fi.len], off = 0.12;
      const A = [a[0] + fi.nx * off, a[1] + fi.ny * off], E = [e[0] + fi.nx * off, e[1] + fi.ny * off];
      s += '<polygon class="iso-band' + (fi.nx * CAMH[0] + fi.ny * CAMH[1] > 0 ? '' : ' iso-bandback') + '" points="' + pts([P(A[0], A[1], z0), P(E[0], E[1], z0), P(E[0], E[1], z1), P(A[0], A[1], z1)]) + '"/>'; }
    // 해 쪽 선
    const r = o.ray;
    if (r && sun.up && (o.state === 'sun' || o.state === 'shade')) {
      const L = r.hit ? r.T : 70, ex = r.px + r.ux * L, ey = r.py + r.uy * L, ez = r.z + L * r.tan;
      const a = P(r.px, r.py, r.z), e = P(ex, ey, ez);
      s += '<line class="iso-ray-halo" x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(e[0]) + '" y2="' + f1(e[1]) + '" stroke-width="' + 6 * k + '"/>';
      s += '<line class="iso-ray ' + o.state + '" x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(e[0]) + '" y2="' + f1(e[1]) + '" stroke-width="' + 2.6 * k + '"' + (r.hit ? '' : ' stroke-dasharray="' + 7 * k + ' ' + 4 * k + '"') + '/>';
      s += '<circle cx="' + f1(a[0]) + '" cy="' + f1(a[1]) + '" r="' + 6 * k + '" fill="#f5b21a" stroke="#15212c" stroke-width="' + 2.2 * k + '"/>';
      const lw = 52 * k, lx = Math.min(Math.max(a[0] + 12 * k, view.x + 4 * k), view.x + view.w - lw - 4 * k), ly = a[1] + 22 * k;
      s += '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1] + 6 * k) + '" x2="' + f1(lx + lw / 2) + '" y2="' + f1(ly - 11 * k) + '" stroke="#15212c" stroke-width="' + 1.4 * k + '"/>' +
           '<rect x="' + f1(lx) + '" y="' + f1(ly - 11 * k) + '" width="' + f1(lw) + '" height="' + f1(22 * k) + '" rx="' + 5 * k + '" fill="#f5b21a" stroke="#15212c" stroke-width="' + 1.6 * k + '"/>' +
           '<text class="iso-t on" x="' + f1(lx + lw / 2) + '" y="' + f1(ly + 0.5 * k) + '" font-size="' + fs * 0.95 + '" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="#15212c">' + o.fl + '층 창</text>';
      if (r.hit) {
        s += '<circle cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="' + 6.5 * k + '" fill="#fff" stroke="#c1121f" stroke-width="' + 2.6 * k + '"/><path d="M' + f1(e[0] - 3.4 * k) + ',' + f1(e[1] - 3.4 * k) + ' l' + f1(6.8 * k) + ',' + f1(6.8 * k) + ' m' + f1(-6.8 * k) + ',0 l' + f1(6.8 * k) + ',' + f1(-6.8 * k) + '" stroke="#c1121f" stroke-width="' + 2.2 * k + '" fill="none"/>';
      } else {
        s += '<circle cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="' + 9 * k + '" fill="#f5b21a" stroke="#15212c" stroke-width="' + 2 * k + '"/><text class="iso-t on" x="' + f1(e[0]) + '" y="' + f1(e[1] + 0.5 * k) + '" font-size="' + fs * 0.85 + '" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="#15212c">해</text>';
      }
    }
    // 이름표(겹치면 건너뜀)
    const placed = [{ x: view.x + view.w - 26 * k, y: view.y + 28 * k, w: 44 * k, h: 60 * k }];
    const free = (x, y, t) => { const w = t.length * 0.62 * fs + 6 * k, h = fs + 4 * k; for (const q of placed) if (Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < (q.h + h) / 2) return false; placed.push({ x, y, w, h }); return true; };
    const inV = (x, y) => x > view.x + 6 * k && x < view.x + view.w - 6 * k && y > view.y + 6 * k && y < view.y + view.h - 4 * k;
    labels.sort((a, c) => (a.role === 'own' ? -1 : 0) - (c.role === 'own' ? -1 : 0));
    // 장면 글자는 중요한 2개만: 내 동 + 지금(없으면 가장 크게) 가리는 동. 나머지 동은 모양과 색으로만 구분(그림 안 글자 폭주 방지)
    const keep = new Set([o.tid].concat(o.nowIds.size ? [...o.nowIds].slice(0, 1) : o.fitIds.slice(0, 1)));
    for (const l of labels) {
      if (!keep.has(l.b.id)) continue;
      const no = o.num(l.b) || o.label(l.b), t = l.role === 'own' ? '내 동 ' + no : no + ' 앞 동';   // 동 번호가 없는 단지(가동·나동)는 이름으로
      const tt = t + ' · ' + l.b.f + '층', size = fs * (l.role === 'own' ? 1.1 : 0.95);
      const half = tt.length * 0.62 * size / 2 + 4 * k;               // 글자 폭 어림: 장면 가장자리 밖으로 잘리지 않게 안쪽으로 밀어 넣음
      const lx = Math.min(Math.max(l.x, view.x + half + 4 * k), view.x + view.w - half - 4 * k);
      if (inV(lx, l.y) && free(lx, l.y, tt)) s += '<text class="iso-t" x="' + f1(lx) + '" y="' + f1(l.y) + '" font-size="' + size + '" font-weight="800" text-anchor="middle" fill="' + (l.role === 'own' ? '#0a2f57' : '#6b2c00') + '">' + esc(tt) + '</text>';
    }
    // 북쪽 표시: 화면에서 북쪽이 어느 쪽인지
    const nv = [P(0, 1, 0)[0] - P(0, 0, 0)[0], P(0, 1, 0)[1] - P(0, 0, 0)[1]], nl = Math.hypot(nv[0], nv[1]), nx0 = view.x + view.w - 26 * k, ny0 = view.y + 30 * k, L2 = 18 * k;
    s += '<rect x="' + f1(nx0 - 20 * k) + '" y="' + f1(ny0 - 24 * k) + '" width="' + 40 * k + '" height="' + 54 * k + '" rx="' + 6 * k + '" fill="#fff" fill-opacity=".92" stroke="#c9d2db" stroke-width="' + k + '"/>';
    const tx = nx0 + nv[0] / nl * L2 * 0.9, ty = ny0 + nv[1] / nl * L2 * 0.9;
    s += '<line x1="' + f1(nx0) + '" y1="' + f1(ny0 + 6 * k) + '" x2="' + f1(tx) + '" y2="' + f1(ty + 6 * k) + '" stroke="#15212c" stroke-width="' + 3 * k + '" stroke-linecap="round"/><circle cx="' + f1(tx) + '" cy="' + f1(ty + 6 * k) + '" r="' + 3.4 * k + '" fill="#15212c"/>';
    s += '<text x="' + f1(nx0) + '" y="' + f1(ny0 + 24 * k) + '" font-size="' + fs + '" font-weight="800" text-anchor="middle" fill="#15212c" class="iso-t on">북</text>';
    return s;
  }

  const api = { P, depth, ray, bounds, render, polyOf, CAM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PVIso = api;
})(typeof window !== 'undefined' ? window : globalThis);
