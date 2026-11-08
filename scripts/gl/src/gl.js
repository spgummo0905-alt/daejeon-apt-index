// 일조 3D 시제품 (실험). 그리기만 한다: 건물 위치·높이·가림 판정은 preview-calc.js / shadow.js 결과(o)를 그대로 받는다.
// 좌표: 세계(동 +x, 북 +y, 위 +z, 미터) -> three(x, 위, -y).  카메라: SVG 입체와 같은 방향(남쪽 위에서, 28° 비틀기).
// 실제 외관 자료가 없으므로 창문·벽 재질·조경은 그리지 않는다. 벽의 가는 줄은 '층 수'를 나타내는 구분선일 뿐이다.
import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Group, Mesh, LineSegments, Shape, ShapeGeometry, ExtrudeGeometry, EdgesGeometry,
  MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial, ShadowMaterial, PlaneGeometry, CylinderGeometry, SphereGeometry, HemisphereLight,
  DirectionalLight, Vector3, Vector2, Raycaster, CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, PCFSoftShadowMap, SRGBColorSpace, Quaternion
} from 'three';

const RAD = Math.PI / 180, ROT = 28, ELEV = 50, FOV = 22;
const SR = Math.sin(ROT * RAD), CR = Math.cos(ROT * RAD), SE = Math.sin(ELEV * RAD), CE = Math.cos(ELEV * RAD);
const FWDH = new Vector3(-SR, 0, -CR), RIGHT = new Vector3(CR, 0, -SR), UP = new Vector3(0, 1, 0);
const FWD3 = new Vector3(-SR * CE, -SE, -CR * CE), CUP = new Vector3(-SR * SE, CE, -CR * SE);   // 카메라가 보는 방향 / 화면 위쪽
const TANV = Math.tan(FOV * RAD / 2);
const w3 = (x, y, z) => new Vector3(x, z, -y);

const PAL = {
  light: { own: [0x3b82d4, 0x8fc1f3], blk: [0xe2cdb7, 0xf3e9de], now: [0xf0a25c, 0xfbdab8], oth: [0xd3d9e0, 0xeceff3], sky: 0xeaf2ff, gnd: 0xc4ccd6, hemi: 1.55, sun: 2.7, shadow: 0.30, edgeOwn: 0x0c3463, edgeOth: 0x8794a3, edgeA: 0.34 },
  dark:  { own: [0x4d90e0, 0x9cc8f5], blk: [0x8d7966, 0xb09a86], now: [0xe0904a, 0xf2bd86], oth: [0x56606c, 0x6c7784], sky: 0x6b7a92, gnd: 0x2a3038, hemi: 1.25, sun: 2.3, shadow: 0.46, edgeOwn: 0xcfe4fb, edgeOth: 0x9aa6b4, edgeA: 0.30 },
};

let _sup = null;
function supported() {
  if (_sup !== null) return _sup;
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
    _sup = !!g; const x = g && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
  } catch (e) { _sup = false; }
  return _sup;
}

function floorTex() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 64); g.fillStyle = '#d9dee5'; g.fillRect(0, 61, 4, 3);
  const t = new CanvasTexture(c); t.wrapT = RepeatWrapping; t.wrapS = ClampToEdgeWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}

function cleanPoly(poly) {
  const pts = [];
  for (const q of poly) { const p = pts[pts.length - 1]; if (!p || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) pts.push(q); }
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 0.01) pts.pop();
  return pts.length >= 3 ? pts : null;
}
function buildGeo(pts, h, fh) {
  const g = new ExtrudeGeometry(new Shape(pts.map(q => new Vector2(q[0], q[1]))), { depth: h, bevelEnabled: false, curveSegments: 1 });
  const pos = g.attributes.position, uv = g.attributes.uv, side = g.groups[1];
  if (side) for (let i = side.start; i < side.start + side.count; i++) uv.setXY(i, 0.5, pos.getZ(i) / fh);   // 세로 방향 = 층 번호
  uv.needsUpdate = true; g.rotateX(-Math.PI / 2); return g;
}
function blobGeo(pts, grow) {
  let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
  const s = pts.map(q => { const dx = q[0] - cx, dy = q[1] - cy, l = Math.hypot(dx, dy) || 1; return new Vector2(q[0] + dx / l * grow, q[1] + dy / l * grow); });
  const g = new ShapeGeometry(new Shape(s)); g.rotateX(-Math.PI / 2); return g;
}

function mount(el, cb) {
  cb = cb || {};
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dmq = matchMedia('(prefers-color-scheme: dark)');
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const labs = document.createElement('div'); labs.className = 'gl-labs'; labs.setAttribute('aria-hidden', 'true');
  el.appendChild(canvas); el.appendChild(labs);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  const cores = navigator.hardwareConcurrency || 4;
  const qmode = cb.quality || 'auto';                                  // 'hi' | 'lo' | 'auto'
  const basePr = Math.min(window.devicePixelRatio || 1, cores <= 4 ? 1.5 : 2); let pr = qmode === 'lo' ? 1 : basePr, level = qmode === 'lo' ? 1 : 0;
  renderer.setPixelRatio(pr); renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  const cam = new PerspectiveCamera(FOV, 1, 5, 2000);
  const hemi = new HemisphereLight(0xffffff, 0x888888, 1.5); scene.add(hemi);
  const sun = new DirectionalLight(0xfff3dc, 2.6); sun.castShadow = true; const smHi = innerWidth < 700 ? 1024 : 2048, smLo = 512; sun.shadow.mapSize.set(qmode === 'lo' ? smLo : smHi, qmode === 'lo' ? smLo : smHi);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.7; scene.add(sun); scene.add(sun.target);
  const ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.3 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const bGroup = new Group(); scene.add(bGroup);
  const fx = new Group(); scene.add(fx);                                // 층 띠 · 해 쪽 선 · 표시
  const tex = floorTex();
  const M = {}; let palName = '';
  function setPal() {
    const name = dmq.matches ? 'dark' : 'light'; if (name === palName) return; palName = name; const P = PAL[name];
    for (const r of ['own', 'blk', 'now', 'oth']) {
      if (M[r]) { M[r].cap.color.setHex(P[r][1]); M[r].wall.color.setHex(P[r][0]); }
      else M[r] = { cap: new MeshStandardMaterial({ color: P[r][1], roughness: 0.9 }), wall: new MeshStandardMaterial({ color: P[r][0], roughness: 0.85, map: tex }) };
    }
    if (!M.eOwn) { M.eOwn = new LineBasicMaterial({ color: P.edgeOwn, transparent: true, opacity: 0.55 }); M.eOth = new LineBasicMaterial({ color: P.edgeOth, transparent: true, opacity: P.edgeA * 0.5 }); M.blob = new MeshBasicMaterial({ color: 0x182a44, transparent: true, opacity: 0.06, depthWrite: false }); }
    else { M.eOwn.color.setHex(P.edgeOwn); M.eOth.color.setHex(P.edgeOth); M.eOth.opacity = P.edgeA * 0.5; }
    hemi.color.setHex(P.sky); hemi.groundColor.setHex(P.gnd);
  }
  const cache = new Map(); let curItems = null;
  function clearAll() { for (const e of cache.values()) { e.geo.dispose(); e.edge.dispose(); e.b1.dispose(); e.b2.dispose(); bGroup.remove(e.group); } cache.clear(); }
  const labEls = {};
  function lab(k, cls) { if (!labEls[k]) { const d = document.createElement('div'); d.className = 'gl-lab ' + cls; labs.appendChild(d); labEls[k] = d; } return labEls[k]; }

  let W = 1, H = 1, last = null, want = false, raf = 0, camState = null, anim = null, fitKey = '', lastCfg = {}, rms = 0;
  const camNow = { t: new Vector3(), d: 200 };
  function place() { cam.position.copy(camNow.t).addScaledVector(FWD3, -camNow.d); cam.up.copy(CUP); cam.lookAt(camNow.t); cam.updateMatrixWorld(); cam.updateProjectionMatrix(); }
  function fitPoints(pts, inset, top, bot) {
    let r0 = 1e9, r1 = -1e9, u0 = 1e9, u1 = -1e9, f0 = 1e9, f1 = -1e9;
    for (const p of pts) { const r = p.dot(RIGHT), u = p.dot(CUP), f = p.dot(FWD3); r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u); f0 = Math.min(f0, f); f1 = Math.max(f1, f); }
    top = top || 0; bot = bot || 0; const Hh = Math.max(60, H - top - bot), asp = Math.max(0.3, (W - inset) / Hh), hr = (r1 - r0) / 2 * 1.14, hu = (u1 - u0) / 2 * 1.2, hf = (f1 - f0) / 2;
    const tv = TANV * Hh / H, d = Math.max(hu / tv, hr / (tv * asp)) + hf * 0.75 + 20;
    const t = new Vector3().addScaledVector(RIGHT, (r0 + r1) / 2).addScaledVector(CUP, (u0 + u1) / 2).addScaledVector(FWD3, (f0 + f1) / 2);
    const wpp = 2 * d * TANV / H; t.addScaledVector(RIGHT, -(inset / 2) * wpp); t.addScaledVector(CUP, ((top - bot) / 2) * wpp);          // 왼쪽 조작부만큼 건물을 오른쪽으로
    return { t, d };
  }
  function goto(target, instant) {
    if (instant || reduce() || !camState) { camNow.t.copy(target.t); camNow.d = target.d; camState = target; anim = null; place(); return; }
    anim = { t0: performance.now(), from: { t: camNow.t.clone(), d: camNow.d }, to: target }; camState = target; kick();
  }
  function stepAnim(now) {
    if (!anim) return false; const k = Math.min(1, (now - anim.t0) / 260), e = 1 - Math.pow(1 - k, 3);
    camNow.t.lerpVectors(anim.from.t, anim.to.t, e); camNow.d = anim.from.d + (anim.to.d - anim.from.d) * e; place();
    if (k >= 1) anim = null; return true;
  }
  // 느린 기기 보호: 연속 그리기 간격이 길면 한 단계 낮추고, 그래도 느리면 기존 SVG 그림으로 돌아간다(조용히 멈추거나 버벅이지 않게)
  let lastDraw = 0, slowN = 0, okN = 0;
  function watch(now) {
    if (qmode !== 'auto') { lastDraw = now; return; }
    const dt = now - lastDraw; lastDraw = now; if (dt > 400 || dt < 1) return;      // 쉬었다 다시 그린 간격은 무시
    if (dt > 70) { slowN++; okN = 0; } else { okN++; if (okN > 4) slowN = Math.max(0, slowN - 1); }
    if (slowN >= 6) {
      slowN = 0;
      if (level === 0) { level = 1; pr = 1; renderer.setPixelRatio(1); renderer.setSize(W, H, false); sun.shadow.mapSize.set(512, 512); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } kick(); if (cb.onLevel) cb.onLevel(1); }
      else if (cb.onSlow) cb.onSlow();
    }
  }
  function kick() { want = true; if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) { raf = 0; const moving = stepAnim(now); if (want || moving) { want = false; draw(); } if (anim) kick(); }
  function draw() { const t0 = performance.now(); watch(t0); renderer.render(scene, cam); rms = rms ? rms * 0.8 + (performance.now() - t0) * 0.2 : performance.now() - t0; placeLabels(); }

  function resize() {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight); if (w === W && h === H) return false;
    W = w; H = h; renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); return true;
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (resize() && last) { fitKey = ''; update(last, lastCfg); } }) : null; if (ro) ro.observe(el);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (cb.onLost) cb.onLost(); });

  // ---- 라벨(HTML 겹침): 중요한 것만 ----
  const labInfo = {};
  function placeLabels() {
    const placed = [];
    for (const k of ['own', 'blk', 'win']) {
      const L = labInfo[k], d = labEls[k]; if (!d) continue;
      if (!L) { d.style.display = 'none'; continue; }
      d.style.display = ''; d.textContent = L.text;
      const v = L.p.clone().project(cam); let x = (v.x * 0.5 + 0.5) * W + (L.dx || 0), y = (-v.y * 0.5 + 0.5) * H + (L.dy || 0);
      const w = d.offsetWidth || 90, hh = d.offsetHeight || 24;
      x = Math.min(Math.max(x, w / 2 + 4), W - w / 2 - 4); y = Math.min(Math.max(y, hh + 4), H - 4);
      for (const q of placed) if (Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < hh + 2) y = q.y + hh + 4;
      placed.push({ x, y, w }); d.style.transform = 'translate(' + (x - w / 2).toFixed(1) + 'px,' + (y - hh).toFixed(1) + 'px)';
    }
  }

  // ---- 갱신 ----
  function update(o, cfg) {
    cfg = cfg || {}; lastCfg = cfg; last = o; resize(); setPal(); const P = PAL[palName];
    if (o.items !== curItems) { clearAll(); curItems = o.items; fitKey = ''; }
    const tb = o.items.find(b => b.id === o.tid), polyOf = cfg.polyOf, tp = polyOf(tb, o.tid);
    let cx = 0, cy = 0; for (const q of tp) { cx += q[0]; cy += q[1]; } cx /= tp.length; cy /= tp.length;
    const need = new Set(); for (const id of o.fitIds) need.add(id); need.add(o.tid);
    const vis = [];
    for (const b of o.items) {
      const pb = polyOf(b, o.tid); let bx = 0, by = 0; for (const q of pb) { bx += q[0]; by += q[1]; } bx /= pb.length; by /= pb.length;
      const dd = Math.hypot(bx - cx, by - cy);
      if (need.has(b.id) || dd < (o.wide ? 230 : 160)) vis.push({ b, dd });
    }
    vis.sort((a, c) => a.dd - c.dd); if (vis.length > 90) vis.length = 90;
    const seen = new Set(), meshes = []; let R = 40;
    for (const { b, dd } of vis) {
      seen.add(b.id); const pb = polyOf(b, o.tid), key = b.id + (b.id === o.tid ? 'r' : 'p');
      let e = cache.get(b.id);
      if (!e || e.key !== key) {
        if (e) { e.geo.dispose(); e.edge.dispose(); e.b1.dispose(); e.b2.dispose(); bGroup.remove(e.group); cache.delete(b.id); }
        const pts = cleanPoly(pb); if (!pts) continue;
        let geo; try { geo = buildGeo(pts, b.h, o.fh0 ? o.fh0(b) : (b.h / Math.max(1, b.f))); } catch (err) { continue; }
        const mesh = new Mesh(geo, [M.oth.cap, M.oth.wall]); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.id = b.id;
        const edge = new EdgesGeometry(geo, 60), lines = new LineSegments(edge, M.eOth);
        const b1 = blobGeo(pts, 2.2), b2 = blobGeo(pts, 5.5), m1 = new Mesh(b1, M.blob), m2 = new Mesh(b2, M.blob); m1.position.y = 0.06; m2.position.y = 0.04; m1.renderOrder = m2.renderOrder = -1;
        const group = new Group(); group.add(m2, m1, mesh, lines); bGroup.add(group);
        e = { key, geo, edge, b1, b2, group, mesh, lines }; cache.set(b.id, e);
      }
      e.group.visible = true; meshes.push(e.mesh);
      const role = b.id === o.tid ? 'own' : (o.nowIds.has(b.id) ? 'now' : (o.blockIds.has(b.id) ? 'blk' : 'oth'));
      if (e.role !== role) { e.role = role; e.mesh.material = [M[role].cap, M[role].wall]; e.lines.material = role === 'oth' ? M.eOth : M.eOwn; }
      R = Math.max(R, dd + 40);
    }
    for (const [id, e] of cache) if (!seen.has(id)) e.group.visible = false;
    pickMeshes = meshes;

    // 해와 그림자
    const s = o.sun, up = s.up && s.alt >= 1; const ctr = w3(cx, cy, 0);
    ground.scale.set(R * 3, R * 3, 1); ground.position.copy(ctr); ground.material.opacity = P.shadow;
    sun.visible = up; hemi.intensity = up ? P.hemi : P.hemi * 0.62; sun.intensity = P.sun;
    if (up) {
      const az = s.az * RAD, al = Math.max(s.alt, 2) * RAD, dir = new Vector3(Math.sin(az) * Math.cos(al), Math.sin(al), -Math.cos(az) * Math.cos(al));
      sun.position.copy(ctr).addScaledVector(dir, R + 400); sun.target.position.copy(ctr); sun.target.updateMatrixWorld();
      const c = sun.shadow.camera; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = R * 2 + 800; c.updateProjectionMatrix();
    }
    ground.visible = up;

    // 카메라 맞춤(동·넓게 보기·크기가 바뀔 때만: 시간·층을 움직여도 화면이 흔들리지 않는다)
    const key = o.tid + '|' + (o.wide ? 1 : 0) + '|' + (o.nowIds.size ? [...o.nowIds][0] : o.fitIds[0]) + '|' + W + 'x' + H + '|' + (cfg.inset || 0) + '|' + (cfg.top || 0) + '|' + (cfg.bot || 0);
    if (key !== fitKey) {
      const first = fitKey === ''; fitKey = key; const pts = [];
      const addB = (b, rect) => { const pb = polyOf(b, rect ? o.tid : null); for (const q of pb) { pts.push(w3(q[0], q[1], 0)); pts.push(w3(q[0], q[1], b.h)); } };
      if (o.wide) for (const { b } of vis) addB(b, true); else { addB(tb, true); if (!o.fitIds.length) { for (const [dx, dy] of [[-38, -38], [38, -38], [38, 38], [-38, 38]]) pts.push(w3(cx + dx, cy + dy, 0)); pts.push(w3(cx, cy, tb.h * 1.08)); } for (const id of (o.nowIds.size ? [...o.nowIds].slice(0, 1) : o.fitIds.slice(0, 1))) { const b = o.items.find(x => x.id === id); if (b) addB(b, false); } }
      goto(fitPoints(pts, cfg.inset || 0, cfg.top || 0, cfg.bot || 0), first || cfg.instant);
    }

    // 고른 층 띠 + 해 쪽 선
    while (fx.children.length) { const c = fx.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose && !c.userData.keep) c.material.dispose(); }
    const fi = o.fi, z0 = (o.fl - 1) * o.fh, z1 = Math.min(o.fl * o.fh, tb.h), a = fi.a, ex = a[0] + fi.ex * fi.len, ey = a[1] + fi.ey * fi.len, off = 0.35;
    const A = w3(a[0] + fi.nx * off, a[1] + fi.ny * off, z0), B2 = w3(ex + fi.nx * off, ey + fi.ny * off, z0), C = w3(ex + fi.nx * off, ey + fi.ny * off, z1), D = w3(a[0] + fi.nx * off, a[1] + fi.ny * off, z1);
    const front = fi.nx * SR + fi.ny * -CR > 0;
    const quad = (pp, col, op, depth) => { const g = new PlaneGeometry(1, 1); const arr = new Float32Array([pp[0].x, pp[0].y, pp[0].z, pp[1].x, pp[1].y, pp[1].z, pp[2].x, pp[2].y, pp[2].z, pp[0].x, pp[0].y, pp[0].z, pp[2].x, pp[2].y, pp[2].z, pp[3].x, pp[3].y, pp[3].z]);
      g.setAttribute('position', new (g.attributes.position.constructor)(arr, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.setIndex(null); const m = new Mesh(g, new MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: depth, depthWrite: false, side: 2 })); m.renderOrder = 5; return m; };
    const grow = (p, q, amt) => { const v = new Vector3().subVectors(q, p).setLength(amt); return v; };
    fx.add(quad([A, B2, C, D], 0xffd166, front ? 0.96 : 0.55, front));
    if (front) fx.add(quad([A, B2, C, D], 0xffd166, 0.32, false));
    const u = new Vector3(0, 1, 0), pad = 0.6;       // 빛 번짐 띠: 살짝 더 크게
    const gA = A.clone().addScaledVector(u, -pad), gB = B2.clone().addScaledVector(u, -pad), gC = C.clone().addScaledVector(u, pad), gD = D.clone().addScaledVector(u, pad);
    fx.add(quad([gA, gB, gC, gD], 0xffc23d, front ? 0.28 : 0.15, front));
    const wp = w3(o.ray.px, o.ray.py, o.ray.z);
    const r = o.ray, sc = camNow.d * 0.0036;
    if (r && s.up && (o.state === 'sun' || o.state === 'shade')) {
      const L = r.hit ? r.T : 70, e2 = w3(r.px + r.ux * L, r.py + r.uy * L, r.z + L * r.tan), col = o.state === 'shade' ? 0xc1121f : 0xc47f00;
      const mk = (p, q) => { const len = p.distanceTo(q); const g = new CylinderGeometry(sc, sc, len, 6, 1); const m = new Mesh(g, new MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 })); m.position.copy(p).add(q).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, new Vector3().subVectors(q, p).normalize()); m.renderOrder = 8; return m; };
      if (r.hit) fx.add(mk(wp, e2)); else { const dir = new Vector3().subVectors(e2, wp), total = dir.length(); dir.normalize(); for (let t = 0; t < total; t += 11) fx.add(mk(wp.clone().addScaledVector(dir, t), wp.clone().addScaledVector(dir, Math.min(total, t + 7)))); }
      const dot = (p, rad, col2, ring) => { const m = new Mesh(new SphereGeometry(rad, 14, 10), new MeshBasicMaterial({ color: col2, depthTest: false })); m.position.copy(p); m.renderOrder = 9; if (ring) { const o2 = new Mesh(new SphereGeometry(rad * 1.35, 14, 10), new MeshBasicMaterial({ color: 0xffffff, depthTest: false })); o2.position.copy(p); o2.renderOrder = 8; fx.add(o2); } fx.add(m); };
      dot(wp, sc * 2.2, 0xf5b21a, true);
      if (r.hit) dot(e2, sc * 2.0, 0xc1121f, true); else dot(e2, sc * 2.6, 0xf5b21a, true);
    }
    // 이름표(내 동 + 지금 가리는 동 + 층 창)
    const no = bb => o.num(bb) || o.label(bb);
    labInfo.own = { p: w3(cx, cy, tb.h), text: '내 동 ' + no(tb) + ' · ' + tb.f + '층', dy: -8 };
    const kid = o.nowIds.size ? [...o.nowIds][0] : o.fitIds[0], kb = kid && kid !== o.tid ? o.items.find(x => x.id === kid) : null;
    if (kb && vis.some(v => v.b.id === kb.id)) { const pb = polyOf(kb, null); let kx = 0, ky = 0; for (const q of pb) { kx += q[0]; ky += q[1]; } labInfo.blk = { p: w3(kx / pb.length, ky / pb.length, kb.h), text: no(kb) + ' 앞 동 · ' + kb.f + '층', dy: -8 }; } else labInfo.blk = null;
    labInfo.win = { p: wp, text: o.fl + '층 창', dx: 34, dy: 30 };
    lab('own', 'own'); lab('blk', 'blk'); lab('win', 'win');
    kick();
  }

  let pickMeshes = []; const rc = new Raycaster(), ndc = new Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!down || !last) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (d > 10 || dt > 600) return;
    const rect = canvas.getBoundingClientRect(); ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    rc.setFromCamera(ndc, cam); const hit = rc.intersectObjects(pickMeshes, false)[0];
    let id = hit && hit.object.userData.id;
    if ((!id || !(cb.canPick ? cb.canPick(id) : true)) && cb.canPick) {                  // 손가락이 건물 가장자리를 빗나가도 가장 가까운 '고를 수 있는 동'(반경 30px 이내)을 고른다
      let best = null, bd = 30;
      for (const [bid, en] of cache) { if (!en.group.visible || !cb.canPick(bid)) continue; const q = projectCenter(bid); if (!q) continue; const dd = Math.hypot(q.x - (e.clientX - rect.left), q.y - (e.clientY - rect.top)); if (dd < bd) { bd = dd; best = bid; } }
      if (best) id = best;
    }
    if (id && cb.onPick) cb.onPick(id);
  });

  function stats() { const i = renderer.info; return { level, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, buildings: pickMeshes.length, renderMs: +rms.toFixed(2), pixelRatio: pr, canvas: W + 'x' + H }; }
  function bench(n) { const gl = renderer.getContext(); const t0 = performance.now(); for (let i = 0; i < n; i++) { renderer.render(scene, cam); } gl.finish(); return (performance.now() - t0) / n; }
  function dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); clearAll(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* 무시 */ } canvas.remove(); labs.remove(); }
  resize(); setPal();
  function projectCenter(id) { const e = cache.get(id); if (!e) return null; e.mesh.geometry.computeBoundingBox(); const bb = e.mesh.geometry.boundingBox, c = bb.getCenter(new Vector3()); c.y = bb.max.y * 0.55; const v = c.project(cam); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }; }
  function project(id) { const e = cache.get(id); if (!e || !e.group.visible) return null; e.mesh.geometry.computeBoundingBox(); const bb = e.mesh.geometry.boundingBox; const c = bb.getCenter(new Vector3()); c.y = bb.max.y * 0.55; const v = c.project(cam); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, ok: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 }; }
  function roles() { const r = {}; for (const [id, e] of cache) if (e.group.visible) r[id] = e.role; return r; }
  return { update, resize, dispose, stats, bench, roles, project, redraw: kick };
}

window.PVGL = { supported, mount };
