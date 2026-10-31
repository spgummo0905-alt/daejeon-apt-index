// 집감 옥상: 밤 옥상에서 불꽃놀이를 보고 고기를 구우며 쉬어가는 1인용 공간.
// - 캔버스 한 장에 그림 (그림 파일 없음), 소리는 브라우저에서 만들고 기본은 꺼짐
// - 야경은 내가 고른 동네의 이름으로 정한 모양이고, 그 동네 숫자 한 줄을 하늘에 띄움
// - 오늘의 미션 3개·연속 방문·칭호는 이 기기(로그인하면 계정)에 저장 (djdex:roof)
(function () {
  const box = document.getElementById("roof");
  if (!box) return;
  const cv = box.querySelector(".roof-cv"), ctx = cv.getContext("2d");
  const $ = s => box.querySelector(s);
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!CanvasRenderingContext2D.prototype.roundRect) {   // 옛 브라우저용 둥근 사각형
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    };
  }
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PAL = ["#ffd8a8", "#ffb3c7", "#a9d6ff", "#c9b6ff", "#fff3b0", "#b8f0d0"];
  const say = (t, s) => (DJ.toast ? DJ.toast(t, s) : 0);

  // ---------- 기록: 오늘의 미션, 연속 방문, 칭호 ----------
  const MISSIONS = [
    { k: "fw", n: 3, t: "불꽃놀이 3번 즐기기" },
    { k: "bbq", n: 2, t: "고기 2점 맛있게 먹기" },
    { k: "wish", n: 1, t: "별똥별에 소원 빌기" },
  ];
  const TITLES = [[30, "옥상 주인"], [14, "옥상 지킴이"], [5, "옥상 단골"], [0, "옥상 새내기"]];
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let st = Object.assign({ last: "", streak: 0, days: 0, m: { fw: 0, bbq: 0, wish: 0 }, done: "", sound: false, town: "" }, DJ.load("roof", {}));
  const today = ymd(new Date()), yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (st.last !== today) {
    st.streak = st.last === ymd(yd) ? st.streak + 1 : 1;
    st.days += 1; st.last = today; st.m = { fw: 0, bbq: 0, wish: 0 };
    DJ.save("roof", st);
  }
  const saveSt = () => DJ.save("roof", st);
  const doneCount = () => MISSIONS.filter(m => st.m[m.k] >= m.n).length;
  function paintMissions() {
    $("[data-roof-mcount]").textContent = `${doneCount()}/${MISSIONS.length}`;
    const title = TITLES.find(t => st.days >= t[0])[1];
    $("[data-roof-rank]").textContent = `${title} · 연속 ${st.streak}일째 · 함께한 날 ${st.days}일`;
    const ul = $("[data-roof-list]");
    ul.replaceChildren(...MISSIONS.map(m => {
      const li = document.createElement("li"), v = Math.min(st.m[m.k], m.n);
      li.className = v >= m.n ? "ok" : "";
      li.innerHTML = `<span>${v >= m.n ? "✓" : "○"}</span><b></b><i>${v}/${m.n}</i>`;
      li.querySelector("b").textContent = m.t;
      return li;
    }));
  }
  function bump(k) {
    const m = MISSIONS.find(x => x.k === k), before = st.m[k];
    st.m[k] = before + 1;
    saveSt(); paintMissions();
    if (before + 1 === m.n) say("미션 완료", m.t);
    if (doneCount() === MISSIONS.length && st.done !== today) {   // 오늘 미션을 모두 끝내면 한 번 큰 불꽃
      st.done = today; saveSt();
      say("오늘의 옥상 미션 완료", "푹 쉬세요. 내일 또 와요.");
      for (let i = 0; i < 5; i++) setTimeout(() => launch(rnd(.2, .8) * W, rnd(.12, .34) * H, true), 600 + i * 520);
    }
  }

  // ---------- 장면 ----------
  let W = 0, H = 0, dpr = 1, bg = null, seed = 1, town = null;
  const stars = [], smoke = [], rockets = [], parts = [], foods = [];
  let shoot = null, nextShoot = performance.now() + rnd(14000, 26000);
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let bottomH = 90;   // 아래 버튼 줄 높이: 불판은 그 바로 위에 놓음
  const floorY = () => Math.min(H * 0.74, H - bottomH - 110), horizon = () => floorY() - 4;
  const grill = () => { const w = Math.min(W * 0.62, 330), h = Math.min(H * 0.05, 30); return { x: (W - w) / 2, w, y: H - bottomH - h - 26, h }; };

  function drawStatic() {
    bg = document.createElement("canvas"); bg.width = W * dpr; bg.height = H * dpr;
    const g = bg.getContext("2d"); g.scale(dpr, dpr);
    const sky = g.createLinearGradient(0, 0, 0, floorY());
    sky.addColorStop(0, "#070d1f"); sky.addColorStop(.6, "#15244a"); sky.addColorStop(1, "#33355f");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // 달
    const mr = Math.min(W, H) * 0.052, mx = W * 0.8, my = H * 0.14;
    const glow = g.createRadialGradient(mx, my, mr * .6, mx, my, mr * 4);
    glow.addColorStop(0, "rgba(255,240,200,.28)"); glow.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = glow; g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    g.fillStyle = "#fff3d6"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = "rgba(220,200,160,.35)";
    [[-.3, -.2, .22], [.25, .15, .16], [-.1, .4, .12]].forEach(([a, b, r]) => { g.beginPath(); g.arc(mx + a * mr, my + b * mr, r * mr, 0, TAU); g.fill(); });
    // 동네 이름으로 정한 스카이라인 (두 겹)
    const R = mulberry(seed);
    [[0.55, "#1a2548", .5, .18, 22], [1, "#0d1430", .8, .3, 30]].forEach(([k, col, lit, tall, minW], layer) => {
      let x = -10;
      while (x < W + 10) {
        const bw = minW + R() * 44 * (W < 500 ? .6 : 1), bh = H * (0.08 + R() * tall) * (layer ? 1 : .85);
        const y = horizon() - bh;
        g.fillStyle = col; g.fillRect(x, y, bw, horizon() - y + 4);
        if (R() < .25) g.fillRect(x + bw * .4, y - H * .03, 2, H * .03);   // 안테나
        for (let wy = y + 8; wy < horizon() - 6; wy += 11) for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          if (R() < (town ? clamp(0.18 + town.lit * .5, .15, .6) : .3) * lit) { g.fillStyle = R() < .8 ? "rgba(255,214,140,.75)" : "rgba(170,205,255,.7)"; g.fillRect(wx, wy, 3.2, 4.6); }
        }
        x += bw + R() * 6;
      }
    });
    // 옥상 바닥과 난간
    const fl = g.createLinearGradient(0, floorY(), 0, H);
    fl.addColorStop(0, "#232c47"); fl.addColorStop(1, "#0d1222");
    g.fillStyle = fl; g.fillRect(0, floorY(), W, H - floorY());
    g.fillStyle = "#2f3a5c"; g.fillRect(0, floorY() - 7, W, 9);
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(0, floorY() - 7, W, 1.5);
    g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1;
    for (let i = 1; i < 9; i++) { const yy = floorY() + (H - floorY()) * (i / 9) ** 1.6; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    // 줄조명 기둥과 전선
    g.strokeStyle = "#394567"; g.lineWidth = 3;
    [W * .06, W * .94].forEach(px => { g.beginPath(); g.moveTo(px, floorY() - 6); g.lineTo(px, H * .43); g.stroke(); });
    g.strokeStyle = "rgba(180,190,220,.5)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(W * .06, H * .43); g.quadraticCurveTo(W * .5, H * .64, W * .94, H * .43); g.stroke();
    // 불판 몸체
    const gr = grill();
    g.fillStyle = "#1a1e2c"; g.fillRect(gr.x + 10, gr.y + gr.h, 6, H * .05); g.fillRect(gr.x + gr.w - 16, gr.y + gr.h, 6, H * .05);
    g.fillStyle = "#222737"; g.beginPath(); g.roundRect(gr.x, gr.y, gr.w, gr.h, 8); g.fill();
  }

  function resize() {
    const r = box.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(280, Math.round(r.width)); H = Math.max(420, Math.round(r.height));
    bottomH = $(".roof-bottom").offsetHeight || 90;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    stars.length = 0;
    for (let i = 0; i < Math.round(W * H / 5200); i++) stars.push({ x: Math.random() * W, y: Math.random() * horizon() * .9, r: rnd(.4, 1.5), p: rnd(0, TAU), s: rnd(.6, 1.8) });
    drawStatic();
  }

  // ---------- 불꽃 ----------
  function launch(tx, ty, free) {
    if (rockets.length > 6) return;
    rockets.push({ x: tx + rnd(-30, 30), y: H * .72, tx, ty, v: rnd(5.2, 6.6), c: pick(PAL), free });
    sndBoom(false);
  }
  function burst(x, y, c) {
    const kind = pick(["peony", "ring", "willow", "heart"]), n = calm ? 38 : kind === "willow" ? 70 : 90, c2 = pick(PAL);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * TAU, sp = rnd(1.2, 3.1);
      if (kind === "ring") sp = 2.8;
      if (kind === "heart") { const t = a; const hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); parts.push({ x, y, vx: hx * .14, vy: hy * .14, life: 0, max: rnd(60, 80), c, s: 1.7, g: .018, willow: false }); continue; }
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: kind === "willow" ? rnd(85, 120) : rnd(50, 80), c: i % 3 ? c : c2, s: rnd(1.2, 2), g: kind === "willow" ? .035 : .028, willow: kind === "willow" });
    }
    sndBoom(true);
  }

  // ---------- 고기 굽기 ----------
  const FOOD = {
    pork: { name: "삼겹살", w: 58, h: 22 }, shrimp: { name: "새우", w: 46, h: 26 },
    mushroom: { name: "버섯", w: 40, h: 30 }, corn: { name: "옥수수", w: 54, h: 22 },
  };
  function slotX(i) { const g = grill(); return g.x + g.w * (i + .5) / 4; }
  function addFood(kind) {
    const used = new Set(foods.map(f => f.slot)), slot = [0, 1, 2, 3].find(i => !used.has(i));
    if (slot === undefined) return say("불판이 가득 찼어요", "먹거나 치우고 올려 보세요");
    foods.push({ kind, slot, c: [0, 0], down: 0, t: 0, flip: 0 });
    hint("뒤집어 가며 노릇하게 구워 보세요. 다 익으면 눌러서 먹어요.");
    sndSizz();
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const CK = { pork: [[238, 160, 170], [216, 150, 96], [120, 70, 40], [34, 26, 24]], shrimp: [[210, 190, 190], [240, 120, 70], [200, 80, 40], [40, 28, 24]],
    mushroom: [[214, 196, 170], [190, 150, 100], [130, 90, 56], [36, 28, 22]], corn: [[250, 228, 130], [248, 205, 70], [200, 140, 40], [48, 34, 22]] };
  function colorAt(kind, v) {
    const k = CK[kind], p = clamp(v, 0, 1.3) / 1.3 * 3, i = Math.min(2, Math.floor(p));
    return mix(k[i], k[i + 1], p - i);
  }
  const ready = f => Math.min(f.c[0], f.c[1]) >= .55 && Math.max(f.c[0], f.c[1]) <= 1.05;
  const burnt = f => Math.max(f.c[0], f.c[1]) > 1.15;
  function tapFood(f) {
    if (ready(f)) {
      foods.splice(foods.indexOf(f), 1);
      for (let i = 0; i < 14; i++) smoke.push({ x: slotX(f.slot), y: grill().y - 12, vx: rnd(-.5, .5), vy: rnd(-1.1, -.3), a: .5, r: rnd(2, 4), life: 0, max: 40, warm: true });
      bump("bbq"); say("맛있게 먹었어요", FOOD[f.kind].name + " 😋");
    } else if (burnt(f)) {
      foods.splice(foods.indexOf(f), 1); say("조금 탔어요", "괜찮아요, 다시 구워 봐요");
    } else { f.down = 1 - f.down; f.flip = 1; }
  }
  function drawFood(f, now) {
    const sp = FOOD[f.kind], x = slotX(f.slot), gr = grill(), up = 1 - f.down;
    const col = colorAt(f.kind, f.c[up]), y = gr.y - sp.h * .55 - (f.flip > 0 ? Math.sin(f.flip * Math.PI) * 26 : 0);
    ctx.save(); ctx.translate(x, y);
    if (f.flip > 0) ctx.scale(1, Math.cos(f.flip * Math.PI) * .9 + .1);
    ctx.fillStyle = `rgb(${col})`; ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (f.kind === "shrimp") { ctx.ellipse(0, 0, sp.w / 2, sp.h / 2, -.25, 0, TAU); }
    else if (f.kind === "mushroom") { ctx.arc(0, 4, sp.w / 2, Math.PI, TAU); ctx.lineTo(sp.w / 2, 4); ctx.closePath(); }
    else if (f.kind === "corn") { ctx.roundRect(-sp.w / 2, -sp.h / 2, sp.w, sp.h, 11); }
    else { ctx.roundRect(-sp.w / 2, -sp.h / 2, sp.w, sp.h, 5); }
    ctx.fill(); ctx.stroke();
    if (f.kind === "pork") { ctx.fillStyle = "rgba(255,240,235,.35)"; for (let i = -1; i <= 1; i++) ctx.fillRect(-sp.w / 2 + 6, i * 6 - 1, sp.w - 12, 3); }
    if (f.kind === "corn") { ctx.fillStyle = "rgba(255,255,255,.18)"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 9, 0, 2.4, 0, TAU); ctx.fill(); } }
    ctx.restore();
    if (ready(f)) {   // 다 익으면 은은한 금빛 테두리
      ctx.save(); ctx.globalAlpha = .45 + .25 * Math.sin(now / 260); ctx.strokeStyle = "#ffe6a0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, sp.w * .62, 0, TAU); ctx.stroke(); ctx.restore();
    }
    if (burnt(f)) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "700 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("탔어요", x, y - sp.h - 8); }
  }

  // ---------- 소리 (기본 꺼짐, 아주 부드럽게) ----------
  const snd = { c: null, master: null, sizz: null, noise: null };
  function initAudio() {
    if (snd.c) return true;
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return false;
    const c = snd.c = new A(); snd.master = c.createGain(); snd.master.gain.value = 0; snd.master.connect(c.destination);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }   // 갈색 소음 = 바람
    const wb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), wd = wb.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    snd.noise = wb;
    const wind = c.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    const wg = c.createGain(); wg.gain.value = .2; wind.connect(lp).connect(wg).connect(snd.master); wind.start();
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = .09; lg.gain.value = .08; lfo.connect(lg).connect(wg.gain); lfo.start();
    [110, 164.81, 277.18].forEach((f, i) => {   // 잔잔한 울림 (A 계열 화음)
      const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.value = .014 - i * .002;
      const l2 = c.createOscillator(), lg2 = c.createGain(); l2.frequency.value = .05 + i * .03; lg2.gain.value = .006; l2.connect(lg2).connect(g.gain); l2.start();
      o.connect(g).connect(snd.master); o.start();
    });
    const sz = c.createBufferSource(); sz.buffer = wb; sz.loop = true;
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200;
    snd.sizz = c.createGain(); snd.sizz.gain.value = 0; sz.connect(hp).connect(snd.sizz).connect(snd.master); sz.start();
    return true;
  }
  function setSound(on) {
    st.sound = on; saveSt();
    const b = $("[data-roof-sound]"); b.textContent = on ? "소리 켜짐" : "소리 꺼짐"; b.setAttribute("aria-pressed", String(on));
    if (!initAudio()) return;
    snd.c.resume(); snd.master.gain.setTargetAtTime(on ? .7 : 0, snd.c.currentTime, .5); sndSizz();
  }
  function sndBoom(big) {
    if (!st.sound || !snd.c) return;
    const c = snd.c, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(big ? 80 : 150, t); o.frequency.exponentialRampToValueAtTime(big ? 38 : 90, t + .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(big ? .07 : .025, t + .03); g.gain.exponentialRampToValueAtTime(.0008, t + (big ? .9 : .35));
    o.connect(g).connect(snd.master); o.start(t); o.stop(t + 1);
    if (big) {
      const s = c.createBufferSource(); s.buffer = snd.noise; const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = .7;
      const g2 = c.createGain(); g2.gain.setValueAtTime(0, t + .05); g2.gain.linearRampToValueAtTime(.02, t + .1); g2.gain.exponentialRampToValueAtTime(.0005, t + .7);
      s.connect(bp).connect(g2).connect(snd.master); s.start(t + .05, rnd(0, 1), .8);
    }
  }
  function sndSizz() { if (!st.sound || !snd.sizz) return; snd.sizz.gain.setTargetAtTime(Math.min(.05, foods.length * .016), snd.c.currentTime, .25); }

  // ---------- 그리기 ----------
  const hintEl = $("[data-roof-hint]");
  let hintT = 0;
  function hint(t) { hintEl.textContent = t; hintEl.classList.add("on"); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove("on"), 5200); }

  let last = performance.now(), run = true;
  function frame(now) {
    if (!run) return;
    const dt = Math.min(48, now - last) / 16.67; last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    // 별
    ctx.fillStyle = "#fff";
    stars.forEach(s => { ctx.globalAlpha = .35 + .5 * Math.abs(Math.sin(now / 1100 * s.s + s.p)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); });
    ctx.globalAlpha = 1;
    // 별똥별
    if (!shoot && now > nextShoot && !calm) { shoot = { x: rnd(W * .15, W * .7), y: rnd(H * .06, H * .2), t: 0 }; hint("별똥별이 지나가요. 눌러서 소원을 빌어 보세요."); }
    if (shoot) {
      shoot.t += dt; const k = shoot.t / 130, sx = shoot.x + k * W * .28, sy = shoot.y + k * H * .16;
      const gr = ctx.createLinearGradient(sx, sy, sx - 80, sy - 30); gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = gr; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 80, sy - 30); ctx.stroke();
      shoot.px = sx; shoot.py = sy;
      if (k >= 1) { shoot = null; nextShoot = now + rnd(20000, 38000); }
    }
    // 줄조명
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, x = W * .06 + (W * .88) * t, y = (1 - t) * (1 - t) * H * .43 + 2 * (1 - t) * t * H * .64 + t * t * H * .43;
      const c = ["255,214,140", "255,184,150", "190,215,255"][i % 3], p = .55 + .35 * Math.sin(now / 900 + i * .9);
      const gl = ctx.createRadialGradient(x, y + 5, 0, x, y + 5, 14); gl.addColorStop(0, `rgba(${c},${.55 * p})`); gl.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gl; ctx.fillRect(x - 14, y - 9, 28, 28);
      ctx.fillStyle = `rgba(${c},${.6 + .4 * p})`; ctx.beginPath(); ctx.arc(x, y + 5, 2.6, 0, TAU); ctx.fill();
    }
    // 불꽃
    ctx.globalCompositeOperation = "lighter";
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.y -= r.v * dt; r.v *= Math.pow(.992, dt);
      ctx.fillStyle = r.c; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(r.x, r.y, 2, 0, TAU); ctx.fill();
      ctx.globalAlpha = .25; ctx.fillRect(r.x - 1, r.y, 2, 16);
      if (r.y <= r.ty || r.v < 1.1) { burst(r.x, r.y, r.c); rockets.splice(i, 1); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      const px = p.x, py = p.y; p.vx *= Math.pow(.985, dt); p.vy = p.vy * Math.pow(.985, dt) + p.g * dt * 4; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = (1 - p.life / p.max) ** 1.5;
      ctx.globalAlpha = a * .85; ctx.strokeStyle = p.c; ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // 불판 숯불과 연기
    const gr = grill();
    const glow = ctx.createRadialGradient(W / 2, gr.y + gr.h * .5, 4, W / 2, gr.y + gr.h * .5, gr.w * .7);
    glow.addColorStop(0, `rgba(255,120,50,${.22 + .06 * Math.sin(now / 400)})`); glow.addColorStop(1, "rgba(255,120,50,0)");
    ctx.fillStyle = glow; ctx.fillRect(gr.x - 40, gr.y - gr.h * 2, gr.w + 80, gr.h * 6);
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1.5;
    for (let i = 0; i <= 12; i++) { const gx = gr.x + 6 + (gr.w - 12) * i / 12; ctx.beginPath(); ctx.moveTo(gx, gr.y - 2); ctx.lineTo(gx, gr.y + 3); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,150,70,.55)";
    for (let i = 0; i < 18; i++) { const cx = gr.x + 12 + (gr.w - 24) * (i + .5) / 18; ctx.globalAlpha = .45 + .4 * Math.sin(now / 330 + i * 1.7); ctx.fillRect(cx - 4, gr.y + gr.h - 7, 8, 4); }
    ctx.globalAlpha = 1;
    if (!calm && Math.random() < (.12 + foods.length * .1) * dt) smoke.push({ x: gr.x + rnd(.1, .9) * gr.w, y: gr.y - 6, vx: rnd(-.12, .12), vy: rnd(-.5, -.25), a: .1 + Math.min(.12, foods.length * .03), r: rnd(5, 9), life: 0, max: rnd(120, 190) });
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i]; s.life += dt; if (s.life >= s.max) { smoke.splice(i, 1); continue; }
      s.x += (s.vx + Math.sin(now / 700 + i) * .12) * dt; s.y += s.vy * dt; s.r += .05 * dt;
      ctx.fillStyle = s.warm ? `rgba(255,200,130,${s.a * (1 - s.life / s.max)})` : `rgba(210,215,230,${s.a * (1 - s.life / s.max)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    // 음식 익히기
    foods.forEach(f => {
      f.c[f.down] += dt * 16.67 / 12000;
      if (f.flip > 0) f.flip = Math.max(0, f.flip - dt * .06);
      drawFood(f, now);
    });
    requestAnimationFrame(frame);
  }

  // ---------- 누르기 ----------
  cv.addEventListener("pointerdown", e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (shoot && shoot.px && Math.hypot(x - shoot.px, y - shoot.py) < 46) {   // 별똥별 소원
      shoot = null; nextShoot = performance.now() + rnd(20000, 38000);
      for (let i = 0; i < 16; i++) parts.push({ x, y, vx: rnd(-1.6, 1.6), vy: rnd(-1.6, 1.6), life: 0, max: 60, c: "#fff3b0", s: 1.6, g: .006, willow: false });
      bump("wish"); say("소원을 빌었어요 ✨", "좋은 집, 좋은 하루가 되길"); return;
    }
    const f = foods.find(f => Math.abs(x - slotX(f.slot)) < 34 && Math.abs(y - (grill().y - 14)) < 34);
    if (f) { tapFood(f); sndSizz(); return; }
    if (y < floorY() - 14) { launch(x, clamp(y, H * .08, H * .5), false); bump("fw"); }
  });
  $("[data-roof-fire]").addEventListener("click", () => { launch(rnd(.2, .8) * W, rnd(.12, .4) * H, false); bump("fw"); });
  box.querySelectorAll("[data-roof-food]").forEach(b => b.addEventListener("click", () => addFood(b.dataset.roofFood)));
  $("[data-roof-sound]").addEventListener("click", () => setSound(!st.sound));
  const sheet = $("[data-roof-sheet]"), mb = $("[data-roof-mission]");
  mb.addEventListener("click", () => { sheet.hidden = !sheet.hidden; mb.setAttribute("aria-expanded", String(!sheet.hidden)); });
  $("[data-roof-close]").addEventListener("click", () => { sheet.hidden = true; mb.setAttribute("aria-expanded", "false"); });

  // ---------- 동네 고르기와 한 줄 ----------
  const sel = $("[data-roof-town]"), statEl = $("[data-roof-stat]");
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(1)) + "억" : Math.round(v).toLocaleString() + "만");
  function setTown(gu, byGu) {
    const cs = byGu[gu] || []; if (!cs.length) { town = null; statEl.textContent = ""; seed = hash("집감"); drawStatic(); return; }
    const ps = cs.map(c => c.p).filter(Boolean).sort((a, b) => a - b), med = ps.length ? ps[ps.length >> 1] : 0;
    const trades = cs.reduce((s, c) => s + (c.tc || 0), 0);
    town = { gu, lit: clamp(cs.length / 80, 0, 1) }; seed = hash(gu); st.town = gu; saveSt();
    statEl.textContent = `${gu} · 단지 ${cs.length.toLocaleString()}곳${med ? " · 84㎡ 중간 " + eok(med) : ""}${trades ? " · 거래 " + trades.toLocaleString() + "건" : ""}`;
    drawStatic();
  }
  DJ.data().then(d => {
    const byGu = {}; (d.complexes || []).forEach(c => { if (c.gu) (byGu[c.gu] = byGu[c.gu] || []).push(c); });
    const gus = Object.keys(byGu).sort((a, b) => byGu[b].length - byGu[a].length);
    sel.replaceChildren(...gus.map(g => { const o = document.createElement("option"); o.value = g; o.textContent = g; return o; }));
    const rec = (DJ.recent && DJ.recent()[0]) || {}, first = [st.town, rec.gu].find(g => g && byGu[g]) || gus[0];
    if (first) { sel.value = first; setTown(first, byGu); }
    sel.addEventListener("change", () => setTown(sel.value, byGu));
  }).catch(() => { seed = hash("집감"); drawStatic(); });

  // ---------- 사진으로 저장 ----------
  $("[data-roof-photo]").addEventListener("click", async () => {
    const w = 1080, h = 1350, o = document.createElement("canvas"); o.width = w; o.height = h;
    const g = o.getContext("2d"), s = Math.max(w / cv.width, (h - 150) / cv.height), dw = cv.width * s, dh = cv.height * s;
    g.fillStyle = "#0a1224"; g.fillRect(0, 0, w, h); g.drawImage(cv, (w - dw) / 2, 0, dw, dh);
    const bar = g.createLinearGradient(0, h - 190, 0, h); bar.addColorStop(0, "rgba(8,12,28,0)"); bar.addColorStop(1, "rgba(8,12,28,.92)");
    g.fillStyle = bar; g.fillRect(0, h - 190, w, 190);
    try { await document.fonts.ready; } catch (e) { /* 글꼴 대기 실패는 무시 */ }
    g.fillStyle = "#fff"; g.font = "800 46px 'Pretendard Variable', sans-serif"; g.textAlign = "left";
    g.fillText("집감 옥상", 60, h - 82); g.fillStyle = "rgba(255,255,255,.72)"; g.font = "600 30px 'Pretendard Variable', sans-serif";
    g.fillText(town ? `${town.gu}의 밤` : "잠깐 쉬어가요", 60, h - 34);
    const sym = new Image(); await new Promise(ok => { sym.onload = sym.onerror = ok; sym.src = "static/brand/symbol-96.png"; });
    if (sym.naturalWidth) g.drawImage(sym, w - 130, h - 130, 72, 72);
    o.toBlob(async b => {
      if (!b) return;
      const file = new File([b], "jipgam-rooftop.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "집감 옥상" }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
      const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "jipgam-rooftop.png"; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); say("사진을 저장했어요", "갤러리에서 확인해 보세요");
    }, "image/png");
  });

  // ---------- 시작 ----------
  seed = hash(st.town || "집감");
  resize(); paintMissions();
  new ResizeObserver(() => resize()).observe(box);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { run = false; if (snd.c) snd.c.suspend(); }
    else { run = true; last = performance.now(); if (snd.c && st.sound) snd.c.resume(); requestAnimationFrame(frame); }
  });
  if (st.sound) {   // 이전에 소리를 켜 뒀어도, 브라우저 규칙상 처음 누를 때부터 시작
    $("[data-roof-sound]").textContent = "소리 켜짐"; $("[data-roof-sound]").setAttribute("aria-pressed", "true");
    const once = () => { setSound(true); cv.removeEventListener("pointerdown", once, true); };
    cv.addEventListener("pointerdown", once, true);
  }
  setTimeout(() => hint("하늘을 눌러 불꽃을 쏘고, 아래 버튼으로 고기를 구워 보세요."), 1800);
  requestAnimationFrame(frame);
  box.dataset.ready = "1";
})();
