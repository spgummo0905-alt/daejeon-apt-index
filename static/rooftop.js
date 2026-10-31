// 집감 옥상: 쉬어가는 3D 공간의 화면·소리·기록. 장면은 rooftop3d.js (three.js) 가 그립니다.
// - 소리는 브라우저에서 만들고 기본은 꺼짐 (환경음·불꽃·효과음을 따로 고르고 조절)
// - 하늘은 지금 시각·달 모양을 계산해서, 날씨는 기상청 자료(서버가 30분마다 받아 둔 weather.json)에서 그 동네 격자를 찾아 반영 (실패해도 그냥 맑게)
// - 오늘의 미션·연속 방문·칭호·별 세기·소원은 이 기기(로그인하면 계정)에 저장 (djdex:roof)
(function () {
  const box = document.getElementById("roof");
  if (!box) return;
  const $ = s => box.querySelector(s), $$ = s => [...box.querySelectorAll(s)];
  const calmMQ = matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const say = (t, s) => (DJ.toast ? DJ.toast(t, s) : 0);
  let api = null;

  // ---------- 기록 ----------
  const MISSIONS = [
    { k: "fw", n: 3, t: "불꽃놀이 3번 즐기기" },
    { k: "bbq", n: 2, t: "고기 2점 맛있게 먹기" },
    { k: "star", n: 5, t: "별 5개 세기" },
    { k: "wish", n: 1, t: "소원 풍등 띄우기" },
  ];
  const TITLES = [[30, "옥상 주인"], [14, "옥상 지킴이"], [5, "옥상 단골"], [0, "옥상 새내기"]];
  const ADJ = ["고요한", "포근한", "느긋한", "다정한", "반짝이는", "든든한", "말랑한", "은은한"], NOUN = ["구름", "달빛", "별", "바람", "노을", "온기", "새벽", "솜사탕"];
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const DEF = { last: "", streak: 0, days: 0, m: { fw: 0, bbq: 0, star: 0, wish: 0 }, done: "", sound: false, town: "", nick: "",
    sky: "night", wx: true, hour: true, bg: false, q: "auto", amb: ["cricket"], on: { amb: true, fw: true, fx: true }, vol: { amb: 50, fw: 60, fx: 60 },
    stars: { d: "", idx: [] }, starTotal: 0, wishes: [], layout: null, net: false, id: "" };
  let st = Object.assign({}, DEF, DJ.load("roof", {}));
  st.m = Object.assign({}, DEF.m, st.m); st.on = Object.assign({}, DEF.on, st.on); st.vol = Object.assign({}, DEF.vol, st.vol);
  if (!st.nick) st.nick = ADJ[(Math.random() * ADJ.length) | 0] + " " + NOUN[(Math.random() * NOUN.length) | 0];
  if (!st.id) st.id = Math.random().toString(36).slice(2, 10);
  const today = ymd(new Date()), yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (st.last !== today) { st.streak = st.last === ymd(yd) ? st.streak + 1 : 1; st.days += 1; st.last = today; st.m = Object.assign({}, DEF.m); }
  if (st.stars.d !== today) st.stars = { d: today, idx: [] };
  DJ.save("roof", st);
  const saveSt = () => DJ.save("roof", st);
  const doneCount = () => MISSIONS.filter(m => st.m[m.k] >= m.n).length;
  function paintMissions() {
    $("[data-roof-mcount]").textContent = `${doneCount()}/${MISSIONS.length}`;
    const title = TITLES.find(t => st.days >= t[0])[1];
    $("[data-roof-rank]").textContent = `${title} · 연속 ${st.streak}일째 · 함께한 날 ${st.days}일 · 센 별 ${st.starTotal}개`;
    $("[data-roof-list]").replaceChildren(...MISSIONS.map(m => {
      const li = document.createElement("li"), v = Math.min(st.m[m.k] || 0, m.n);
      li.className = v >= m.n ? "ok" : "";
      li.innerHTML = `<span>${v >= m.n ? "✓" : "○"}</span><b></b><i>${v}/${m.n}</i>`;
      li.querySelector("b").textContent = m.t;
      return li;
    }));
  }
  function bump(k) {
    const m = MISSIONS.find(x => x.k === k), before = st.m[k] || 0;
    st.m[k] = before + 1; saveSt(); paintMissions();
    if (before + 1 === m.n) say("미션 완료", m.t);
    if (doneCount() === MISSIONS.length && st.done !== today) {
      st.done = today; saveSt(); say("오늘의 옥상 미션 완료", "푹 쉬세요. 내일 또 와요.");
      if (api) api.show();
    }
  }

  // ---------- 소리 ----------
  const A = { c: null, master: null, buses: {}, verb: null, send: null, white: null, brown: null, layers: {}, sizz: null };
  const vol = k => Math.pow(clamp(st.vol[k], 0, 100) / 100, 1.6);
  function initAudio() {
    if (A.c) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return false;
    const c = A.c = new Ctx();
    A.master = c.createGain(); A.master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = .004; comp.release.value = .25;
    A.master.connect(comp); comp.connect(c.destination);
    ["amb", "fw", "fx"].forEach(k => { const g = c.createGain(); g.gain.value = 0; g.connect(A.master); A.buses[k] = g; });
    const len = Math.floor(c.sampleRate * 3.4), ir = c.createBuffer(2, len, c.sampleRate);   // 넓게 울리는 공간 (불꽃 소리가 멀리 퍼지게)
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let p = 0; for (let i = 0; i < len; i++) { const n = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); p = p * .55 + n * .45; d[i] = p; } }
    A.verb = c.createConvolver(); A.verb.buffer = ir; const vg = c.createGain(); vg.gain.value = .9; A.verb.connect(vg); vg.connect(A.master);
    A.send = c.createGain(); A.send.gain.value = 1; A.send.connect(A.verb);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; A.white = nb;
    const bb = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), bd = bb.getChannelData(0); let last = 0; for (let i = 0; i < bd.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.4; } A.brown = bb;
    const sz = c.createBufferSource(); sz.buffer = A.white; sz.loop = true; const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200;
    A.sizz = c.createGain(); A.sizz.gain.value = 0; sz.connect(hp).connect(A.sizz).connect(A.buses.fx); sz.start();
    return true;
  }
  const noiseSrc = (buf, loop) => { const s = A.c.createBufferSource(); s.buffer = buf; s.loop = !!loop; return s; };
  const panner = p => { const c = A.c; if (c.createStereoPanner) { const n = c.createStereoPanner(); n.pan.value = clamp(p || 0, -1, 1); return n; } return c.createGain(); };
  function applyGains() {
    if (!A.c) return;
    const t = A.c.currentTime;
    A.master.gain.setTargetAtTime(st.sound ? .9 : 0, t, .5);
    ["amb", "fw", "fx"].forEach(k => A.buses[k].gain.setTargetAtTime(st.on[k] ? vol(k) : 0, t, .15));
    Object.entries(A.layers).forEach(([k, L]) => L.set(st.sound && st.on.amb && st.amb.includes(k)));
  }
  // 환경음 층: 켜질 때 처음 한 번만 만들고, 이후엔 크기만 올리고 내림
  const LAYERS = {
    cricket(c, out) {   // 귀뚜라미: 높은 소리를 빠르게 끊어 울리고, 느리게 쉬었다 울어요
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      [[4300, 26, 1.9, -.6], [4650, 31, 2.3, .1], [5100, 24, 1.55, .65], [3900, 28, 2.7, -.2]].forEach(([f, pf, gf, pan], i) => {
        const o = c.createOscillator(), a1 = c.createGain(), a2 = c.createGain(), p = panner(pan), lv = c.createGain();
        o.frequency.value = f; a1.gain.value = .5; a2.gain.value = .5; lv.gain.value = .02;
        const l1 = c.createOscillator(), l1g = c.createGain(); l1.frequency.value = pf; l1g.gain.value = .5; l1.connect(l1g).connect(a1.gain); l1.start();
        const l2 = c.createOscillator(), l2g = c.createGain(); l2.type = "triangle"; l2.frequency.value = gf; l2g.gain.value = .5; l2.connect(l2g).connect(a2.gain); l2.start(c.currentTime + i * .37);
        o.connect(a1).connect(a2).connect(lv).connect(p).connect(g); o.start();
      });
      return g;
    },
    bug(c, out) {   // 풀벌레: 낮고 부드러운 찌르르
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      [[2500, 13, .6, -.5], [3050, 17, .85, .5], [2800, 11, .45, 0]].forEach(([f, pf, gf, pan], i) => {
        const o = c.createOscillator(), a1 = c.createGain(), a2 = c.createGain(), p = panner(pan), lv = c.createGain(); o.type = "triangle";
        o.frequency.value = f; a1.gain.value = .5; a2.gain.value = .5; lv.gain.value = .018;
        const l1 = c.createOscillator(), l1g = c.createGain(); l1.frequency.value = pf; l1g.gain.value = .5; l1.connect(l1g).connect(a1.gain); l1.start();
        const l2 = c.createOscillator(), l2g = c.createGain(); l2.frequency.value = gf; l2g.gain.value = .5; l2.connect(l2g).connect(a2.gain); l2.start(c.currentTime + i * .5);
        o.connect(a1).connect(a2).connect(lv).connect(p).connect(g); o.start();
      });
      return g;
    },
    wind(c, out) {
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      const s = noiseSrc(A.brown, true), lp = c.createBiquadFilter(), wg = c.createGain(); lp.type = "lowpass"; lp.frequency.value = 520; wg.gain.value = .3;
      const lf = c.createOscillator(), lfg = c.createGain(); lf.frequency.value = .08; lfg.gain.value = 220; lf.connect(lfg).connect(lp.frequency); lf.start();
      const lf2 = c.createOscillator(), lg2 = c.createGain(); lf2.frequency.value = .13; lg2.gain.value = .12; lf2.connect(lg2).connect(wg.gain); lf2.start();
      s.connect(lp).connect(wg).connect(g); s.start();
      const w2 = noiseSrc(A.white, true), bp = c.createBiquadFilter(), g2 = c.createGain(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 6; g2.gain.value = .012;
      const lf3 = c.createOscillator(), lg3 = c.createGain(); lf3.frequency.value = .06; lg3.gain.value = .01; lf3.connect(lg3).connect(g2.gain); lf3.start();
      w2.connect(bp).connect(g2).connect(g); w2.start();
      return g;
    },
    city(c, out) {   // 먼 도시: 낮은 웅웅거림과 가끔 지나가는 차
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      const s = noiseSrc(A.brown, true), lp = c.createBiquadFilter(), hg = c.createGain(); lp.type = "lowpass"; lp.frequency.value = 240; hg.gain.value = .32; s.connect(lp).connect(hg).connect(g); s.start();
      let tm = 0; const car = () => { if (!A.layers.city || !A.layers.city.on) { tm = setTimeout(car, 4000); return; }
        const t = c.currentTime, n = noiseSrc(A.white, true), bp = c.createBiquadFilter(), cg = c.createGain(), p = panner(rnd(-.9, .9)); bp.type = "bandpass"; bp.Q.value = 1.4;
        const dir = Math.random() < .5 ? 1 : -1; bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(760, t + 1.6); bp.frequency.linearRampToValueAtTime(420, t + 3.4);
        if (p.pan) { p.pan.setValueAtTime(-.8 * dir, t); p.pan.linearRampToValueAtTime(.8 * dir, t + 3.4); }
        cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(.05, t + 1.5); cg.gain.linearRampToValueAtTime(0, t + 3.4);
        n.connect(bp).connect(cg).connect(p).connect(g); n.start(t); n.stop(t + 3.6); tm = setTimeout(car, rnd(5000, 13000)); };
      tm = setTimeout(car, 3000);
      return g;
    },
    rain(c, out) {
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      const s = noiseSrc(A.white, true), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), rg = c.createGain(); hp.type = "highpass"; hp.frequency.value = 1400; lp.type = "lowpass"; lp.frequency.value = 7500; rg.gain.value = .11;
      s.connect(hp).connect(lp).connect(rg).connect(g); s.start();
      const b = noiseSrc(A.brown, true), bl = c.createBiquadFilter(), bg = c.createGain(); bl.type = "lowpass"; bl.frequency.value = 600; bg.gain.value = .1; b.connect(bl).connect(bg).connect(g); b.start();
      return g;
    },
    chime(c, out) {   // 풍경: 가끔 맑은 소리가 한 번씩
      const g = c.createGain(); g.gain.value = 0; g.connect(out); g.connect(A.send);
      const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; let tm = 0;
      const ring = () => { if (!A.layers.chime || !A.layers.chime.on) { tm = setTimeout(ring, 3000); return; }
        const t = c.currentTime, f = notes[(Math.random() * notes.length) | 0], p = panner(rnd(-.7, .7));
        [[1, .05], [2.76, .018], [5.4, .007]].forEach(([m, a]) => { const o = c.createOscillator(), e = c.createGain(); o.type = "sine"; o.frequency.value = f * m; e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + .005); e.gain.exponentialRampToValueAtTime(.0003, t + 3.2 / m ** .4); o.connect(e).connect(p).connect(g); o.start(t); o.stop(t + 3.4); });
        tm = setTimeout(ring, rnd(2600, 8000)); };
      tm = setTimeout(ring, 1500);
      return g;
    },
    fire(c, out) {   // 숯불: 낮은 불 소리와 톡톡 튀는 소리
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      const b = noiseSrc(A.brown, true), lp = c.createBiquadFilter(), bg = c.createGain(); lp.type = "lowpass"; lp.frequency.value = 260; bg.gain.value = .26; b.connect(lp).connect(bg).connect(g); b.start();
      let tm = 0; const pop = () => { if (!A.layers.fire || !A.layers.fire.on) { tm = setTimeout(pop, 2000); return; }
        const t = c.currentTime, n = noiseSrc(A.white, false), bp = c.createBiquadFilter(), e = c.createGain(), p = panner(rnd(-.3, .3)); bp.type = "bandpass"; bp.frequency.value = rnd(1800, 4200); bp.Q.value = 1.2;
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(rnd(.03, .1), t + .002); e.gain.exponentialRampToValueAtTime(.0005, t + rnd(.02, .07));
        n.connect(bp).connect(e).connect(p).connect(g); n.start(t, rnd(0, 1.5), .1); tm = setTimeout(pop, rnd(90, 700)); };
      tm = setTimeout(pop, 500);
      return g;
    },
  };
  function ensureLayer(k) {
    if (A.layers[k] || !LAYERS[k]) return;
    const node = LAYERS[k](A.c, A.buses.amb), L = { on: false, set(on) { L.on = on; node.gain.setTargetAtTime(on ? 1 : 0, A.c.currentTime, 1.1); } };
    A.layers[k] = L;
  }
  const ready = () => A.c && st.sound && A.c.state !== "closed";
  // 불꽃: 쏘는 소리 → (빛이 먼저, 소리는 조금 뒤에) 쾅 하고 터지는 소리와 넓게 퍼지는 울림
  const out = (pan, dest, wet) => { const p = panner(pan), g = A.c.createGain(); g.gain.value = 1; p.connect(dest); g.connect(p); if (wet) { const w = A.c.createGain(); w.gain.value = wet; g.connect(w); w.connect(A.send); } return g; };
  function env(g, t, a, pk, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.exponentialRampToValueAtTime(.0004, t + a + d); }
  const SND = {
    launch(i) {
      if (!ready() || !st.on.fw) return;
      const c = A.c, t = c.currentTime, o = out(i.pan, A.buses.fw, .25);
      const n = noiseSrc(A.white, false), bp = c.createBiquadFilter(), e = c.createGain(); bp.type = "bandpass"; bp.Q.value = 1.1; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 1.5);
      env(e, t, .15, .1, 1.5); n.connect(bp).connect(e).connect(o); n.start(t, rnd(0, 1), 1.8);
      const w = c.createOscillator(), we = c.createGain(); w.type = "sine"; w.frequency.setValueAtTime(760, t); w.frequency.exponentialRampToValueAtTime(2300, t + 1.4); env(we, t, .3, .014, 1.2); w.connect(we).connect(o); w.start(t); w.stop(t + 1.8);
    },
    burst(i) {
      if (!ready() || !st.on.fw) return;
      const c = A.c, k = i.kind, big = i.big, sz = clamp(i.size, .7, 1.8), far = clamp(i.dist / 600, .5, 1.2), t = c.currentTime + clamp(i.dist / 650, .3, .95) + rnd(0, .05);
      const o = out(i.pan, A.buses.fw, big ? 1.2 : .9), g = (v) => v * sz / far ** .6;
      const thump = (at, pk, f0 = 105, f1 = 32, d = 1.0) => { const os = c.createOscillator(), e = c.createGain(); os.type = "sine"; os.frequency.setValueAtTime(f0, at); os.frequency.exponentialRampToValueAtTime(f1, at + .55); env(e, at, .006, pk, d); os.connect(e).connect(o); os.start(at); os.stop(at + d + .2); };
      const crack = (at, pk, f = 2400, q = .8, d = .22) => { const n = noiseSrc(A.white, false), bp = c.createBiquadFilter(), hp = c.createBiquadFilter(), e = c.createGain(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q; hp.type = "highpass"; hp.frequency.value = 500; env(e, at, .002, pk, d); n.connect(bp).connect(hp).connect(e).connect(o); n.start(at, rnd(0, 1), d + .1); };
      const rumble = (at, pk, d = 1.9, f = 360) => { const n = noiseSrc(A.brown, false), lp = c.createBiquadFilter(), e = c.createGain(); lp.type = "lowpass"; lp.frequency.setValueAtTime(f, at); lp.frequency.exponentialRampToValueAtTime(90, at + d); env(e, at, .02, pk, d); n.connect(lp).connect(e).connect(o); n.start(at, rnd(0, 1.5), d + .2); };
      const shimmer = (at, pk, d = 2.6) => { const n = noiseSrc(A.white, false), hp = c.createBiquadFilter(), e = c.createGain(); hp.type = "highpass"; hp.frequency.value = 5200; env(e, at, .2, pk, d); n.connect(hp).connect(e).connect(o); n.start(at, rnd(0, 1), d + .3); };
      const clicks = (at, n, span, pk) => { for (let q = 0; q < n; q++) { const tt = at + Math.random() * span, nn = noiseSrc(A.white, false), bp = c.createBiquadFilter(), e = c.createGain(), p = out(rnd(-.8, .8) + i.pan * .3, A.buses.fw, .5);
        bp.type = "bandpass"; bp.frequency.value = rnd(2200, 5200); bp.Q.value = 1.5; env(e, tt, .001, pk * rnd(.4, 1), rnd(.015, .045)); nn.connect(bp).connect(e).connect(p); nn.start(tt, rnd(0, 1.5), .06); } };
      thump(t, g(big ? 1.0 : .72), big ? 92 : 112, big ? 28 : 34, big ? 1.3 : .95);
      crack(t, g(.42), 2200, .7, big ? .32 : .22); rumble(t + .02, g(big ? .62 : .46), big ? 2.6 : 1.9);
      if (k === "willow" || k === "chrys" || k === "palm") shimmer(t + .12, g(.07), 3.2);
      if (k === "crackle") { clicks(t + .15, 46, 1.6, g(.3)); crack(t, g(.28), 3200, .8, .15); }
      if (k === "crossette") { [.38, .46, .53].forEach(d => crack(t + d, g(.22), 2800, .8, .14)); }
      if (k === "double") { thump(t + .26, g(.55), 120, 40, .8); crack(t + .26, g(.3), 2600, .8, .18); rumble(t + .28, g(.36), 1.6, 300); }
      if (k === "ring" || k === "saturn" || k === "heart") shimmer(t + .1, g(.04), 1.6);
      if (big) { crack(t + .05, g(.3), 1400, .5, .4); }
    },
    sizzle(n) { if (!A.sizz) return; A.sizz.gain.setTargetAtTime(Math.min(.07, n * .02), A.c.currentTime, .3); },
    eat() { if (!ready() || !st.on.fx) return; const c = A.c, t = c.currentTime, o = out(0, A.buses.fx, .1); for (let i = 0; i < 3; i++) { const n = noiseSrc(A.white, false), bp = c.createBiquadFilter(), e = c.createGain(); bp.type = "bandpass"; bp.frequency.value = 1700 + i * 300; bp.Q.value = 2; env(e, t + i * .13, .002, .22, .05); n.connect(bp).connect(e).connect(o); n.start(t + i * .13, i * .2, .1); } },
    meow() { if (!ready() || !st.on.fx) return; const c = A.c, t = c.currentTime, o = out(.1, A.buses.fx, .15), os = c.createOscillator(), e = c.createGain(), bp = c.createBiquadFilter(), vb = c.createOscillator(), vg = c.createGain();
      os.type = "sawtooth"; os.frequency.setValueAtTime(560, t); os.frequency.linearRampToValueAtTime(900, t + .16); os.frequency.linearRampToValueAtTime(620, t + .5); vb.frequency.value = 22; vg.gain.value = 12; vb.connect(vg).connect(os.frequency);
      bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 1.6; env(e, t, .06, .1, .5); os.connect(bp).connect(e).connect(o); os.start(t); vb.start(t); os.stop(t + .7); vb.stop(t + .7); },
    star(n) { if (!ready() || !st.on.fx) return; const c = A.c, t = c.currentTime, o = out(rnd(-.4, .4), A.buses.fx, .8), f = [523.25, 587.33, 659.25, 783.99, 880][n % 5] * (n % 10 >= 5 ? 2 : 1);
      [[1, .07], [2, .02], [3.01, .008]].forEach(([m, a]) => { const os = c.createOscillator(), e = c.createGain(); os.type = "sine"; os.frequency.value = f * m; env(e, t, .01, a, 1.8 / m ** .3); os.connect(e).connect(o); os.start(t); os.stop(t + 2); }); },
    wish() { if (!ready() || !st.on.fx) return; const c = A.c, t = c.currentTime, o = out(0, A.buses.fx, 1);
      [392, 523.25, 659.25, 783.99].forEach((f, i) => { const os = c.createOscillator(), e = c.createGain(); os.type = "sine"; os.frequency.value = f; env(e, t + i * .22, .05, .045, 2.2); os.connect(e).connect(o); os.start(t + i * .22); os.stop(t + 3); }); },
  };
  function setSound(on) {
    st.sound = on; saveSt();
    if (on && !initAudio()) { st.sound = false; say("이 기기에서는 소리를 낼 수 없어요", ""); return paintSettings(); }
    if (A.c) { if (on) { A.c.resume(); st.amb.forEach(ensureLayer); } applyGains(); if (!on) setTimeout(() => { if (!st.sound && A.c) A.c.suspend(); }, 1200); }
    paintSettings();
  }

  // ---------- 설정 창 ----------
  const sw = (el, on) => { el.setAttribute("aria-checked", String(!!on)); };
  function paintSettings() {
    sw($("[data-roof-sound]"), st.sound); sw($("[data-roof-bg]"), st.bg); sw($("[data-roof-wx]"), st.wx); sw($("[data-roof-hour]"), st.hour);
    $$("[data-roof-bus]").forEach(b => { const on = st.on[b.dataset.roofBus]; b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "켜짐" : "멈춤"; });
    $$("[data-roof-amb]").forEach(b => b.setAttribute("aria-pressed", String(st.amb.includes(b.dataset.roofAmb))));
    $$("[data-roof-sky]").forEach(b => b.setAttribute("aria-pressed", String(st.sky === b.dataset.roofSky)));
    $$("[data-roof-q]").forEach(b => b.setAttribute("aria-pressed", String(st.q === b.dataset.roofQ)));
    $$("[data-roof-vol]").forEach(r => { r.value = st.vol[r.dataset.roofVol]; $(`[data-roof-volv="${r.dataset.roofVol}"]`).textContent = st.vol[r.dataset.roofVol] + "%"; });
  }
  $("[data-roof-sound]").addEventListener("click", () => setSound(!st.sound));
  $("[data-roof-bg]").addEventListener("click", () => { st.bg = !st.bg; saveSt(); paintSettings(); });
  $("[data-roof-wx]").addEventListener("click", () => { st.wx = !st.wx; saveSt(); paintSettings(); if (st.wx) loadWeather(); else if (api) { api.setWeather({ cloud: .15, rain: 0, fog: 0, wind: 1 }); stat(); } });
  $("[data-roof-hour]").addEventListener("click", () => { st.hour = !st.hour; saveSt(); paintSettings(); });
  $$("[data-roof-bus]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.roofBus; st.on[k] = !st.on[k]; saveSt(); applyGains(); paintSettings(); }));
  $$("[data-roof-amb]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofAmb, i = st.amb.indexOf(k); if (i >= 0) st.amb.splice(i, 1); else st.amb.push(k); saveSt();
    if (st.sound && !st.on.amb) { st.on.amb = true; }
    if (A.c && st.sound) { ensureLayer(k); applyGains(); }
    else if (!st.sound && st.amb.includes(k)) { setSound(true); }
    paintSettings();
  }));
  $$("[data-roof-vol]").forEach(r => r.addEventListener("input", () => { st.vol[r.dataset.roofVol] = +r.value; $(`[data-roof-volv="${r.dataset.roofVol}"]`).textContent = r.value + "%"; applyGains(); }));
  $$("[data-roof-vol]").forEach(r => r.addEventListener("change", saveSt));
  $$("[data-roof-sky]").forEach(b => b.addEventListener("click", () => { st.sky = b.dataset.roofSky; saveSt(); paintSettings(); if (api) api.setSky(st.sky); }));
  $$("[data-roof-q]").forEach(b => b.addEventListener("click", () => { st.q = b.dataset.roofQ; saveSt(); paintSettings(); if (api) api.setQuality(st.q === "auto" ? (matchMedia("(pointer: coarse)").matches ? "mid" : "high") : st.q); }));
  const openModal = k => { $$("[data-roof-modal]").forEach(m => { m.hidden = m.dataset.roofModal !== k; }); const m = $(`[data-roof-modal="${k}"]`); if (m) { paintSettings(); const f = m.querySelector("textarea, button.rs-sw, button"); setTimeout(() => f && f.focus(), 30); } };
  const closeModal = () => $$("[data-roof-modal]").forEach(m => { m.hidden = true; });
  $$("[data-roof-open]").forEach(b => b.addEventListener("click", () => openModal(b.dataset.roofOpen)));
  $$("[data-roof-mclose]").forEach(b => b.addEventListener("click", closeModal));
  $$("[data-roof-modal]").forEach(m => m.addEventListener("pointerdown", e => { if (e.target === m) closeModal(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // ---------- 아래 버튼 ----------
  const hintEl = $("[data-roof-hint]"); let hintT = 0;
  function hint(t) { hintEl.textContent = t; hintEl.classList.add("on"); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove("on"), 5200); }
  const subs = $$("[data-roof-sub]");
  const closeSubs = () => { subs.forEach(s => { s.hidden = true; }); $$("[data-roof-menu]").forEach(x => x.setAttribute("aria-expanded", "false")); };
  $$("[data-roof-menu]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofMenu, el = $(`[data-roof-sub="${k}"]`), open = el.hidden;
    subs.forEach(s => { s.hidden = true; }); $$("[data-roof-menu]").forEach(x => x.setAttribute("aria-expanded", "false"));
    if (open) { el.hidden = false; b.setAttribute("aria-expanded", "true"); }
  }));
  
  $("[data-roof-fire]").addEventListener("click", () => { if (api) { api.fire(); bump("fw"); } });
  $("[data-roof-show]").addEventListener("click", () => { if (api) { const sec = api.show(); closeSubs(); hint("한바탕 쇼가 시작돼요. 고개를 들어 보세요."); bump("fw"); } });
  $$("[data-roof-food]").forEach(b => b.addEventListener("click", () => {
    if (!api) return; const k = b.dataset.roofFood;
    if (k === "mix") ["shrimp", "mushroom", "corn"].forEach(x => api.addFood(x)); else api.addFood(k);   // 새우·버섯·옥수수는 모둠으로 한 번에
  }));
  // 꾸미기: 고른 것을 바닥에 눌러 놓고, 치우기는 놓인 것을 눌러 치워요
  let deco = null;
  const paintDeco = () => $$("[data-roof-deco]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.roofDeco === deco)));
  $$("[data-roof-deco]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofDeco; deco = deco === k ? null : k; if (api) api.setDeco(deco); paintDeco();
    if (deco) hint(deco === "remove" ? "치울 것을 눌러 보세요." : "놓고 싶은 자리를 눌러 보세요. 다시 누르면 끝나요."); }));
  $("[data-roof-lie]").addEventListener("click", () => { if (api) { api.lie(); closeSubs(); } });
  // 야경 보기: 높은 곳으로 올라가 도시를 내려다봐요
  const viewBtn = $("[data-roof-view]");
  viewBtn.addEventListener("click", () => {
    if (!api) return; const up = api.getView() !== "aerial"; closeSubs(); api.setView(up ? "aerial" : "ground");
    viewBtn.setAttribute("aria-pressed", String(up)); viewBtn.textContent = up ? "🏠 내려가기" : "🌃 야경"; box.dataset.view = up ? "aerial" : "ground";
    if (up) hint("높은 곳에서 본 야경이에요. 화면을 끌면 방향이 바뀌고, 눌러서 불꽃도 쏠 수 있어요.");
  });
  const sheet = $("[data-roof-sheet]"), mb = $("[data-roof-mission]");
  mb.addEventListener("click", () => { sheet.hidden = !sheet.hidden; mb.setAttribute("aria-expanded", String(!sheet.hidden)); });
  $("[data-roof-close]").addEventListener("click", () => { sheet.hidden = true; mb.setAttribute("aria-expanded", "false"); });
  // 별 세기
  const starBtn = $("[data-roof-stars]"), cntEl = $("[data-roof-count]"); let counting = false;
  const paintCount = () => { const n = st.stars.idx.length; cntEl.hidden = !counting; cntEl.textContent = `오늘 센 별 ${n}개 · 별을 눌러 세어 보세요`; starBtn.textContent = counting ? "⭐ 세는 중" : "⭐ 별 세기"; starBtn.setAttribute("aria-pressed", String(counting)); };
  starBtn.addEventListener("click", () => { counting = !counting; if (api) api.setCounting(counting); paintCount(); if (counting) hint("하늘의 별을 하나씩 눌러 보세요. 센 별은 금빛으로 이어져요."); });
  // 소원
  const wt = $("[data-roof-wishtext]"), wlog = $("[data-roof-wishlog]");
  const paintWish = () => { wlog.textContent = st.wishes.length ? `지금까지 띄운 소원 ${st.wishes.length}개` : ""; };
  $("[data-roof-wishgo]").addEventListener("click", () => {
    const t = wt.value.trim(); if (!t) { wt.focus(); return; }
    st.wishes.push({ t, d: today }); st.wishes = st.wishes.slice(-30); saveSt(); wt.value = ""; closeModal(); paintWish();
    if (api) api.wish(t); SND.wish(); bump("wish"); say("풍등을 띄웠어요 🏮", "소원이 하늘로 올라가요");
  });

  // ---------- 동네·날씨 ----------
  const sel = $("[data-roof-town]"), statEl = $("[data-roof-stat]");
  let town = null, wxLine = "";
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(1)) + "억" : Math.round(v).toLocaleString() + "만");
  const stat = () => { statEl.textContent = [town && town.line, wxLine].filter(Boolean).join(" · "); };
  const WX = c => c === 0 ? "맑음" : c <= 3 ? "구름" : c <= 48 ? "안개" : c <= 57 ? "이슬비" : c <= 67 ? "비" : c <= 77 ? "눈" : c <= 82 ? "소나기" : c <= 86 ? "눈" : "뇌우";
  // 기상청 격자 (공식 변환식. scripts/weather_fetch.py 의 grid 와 같아요)
  function kmaGrid(lat, lon) {
    const d = Math.PI / 180, re = 6371.00877 / 5, s1 = 30 * d, s2 = 60 * d, olon = 126 * d, olat = 38 * d;
    const sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(Math.tan(Math.PI * .25 + s2 * .5) / Math.tan(Math.PI * .25 + s1 * .5));
    const sf = Math.pow(Math.tan(Math.PI * .25 + s1 * .5), sn) * Math.cos(s1) / sn, ro = re * sf / Math.pow(Math.tan(Math.PI * .25 + olat * .5), sn);
    const ra = re * sf / Math.pow(Math.tan(Math.PI * .25 + lat * d * .5), sn); let th = lon * d - olon;
    if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
    return [Math.floor(ra * Math.sin(th) + 43 + .5), Math.floor(ro - ra * Math.cos(th) + 136 + .5)];
  }
  const WX_URL = "https://raw.githubusercontent.com/spgummo0905-alt/daejeon-apt-index/weather-data/weather.json";
  async function loadWeather() {
    if (!st.wx || !town || !api) return;
    let all = null;
    try { const c = JSON.parse(sessionStorage.getItem("djdex:roofwx") || "null"); if (c && Date.now() - c.t < 10 * 60e3) all = c.d; } catch (e) { /* 없으면 새로 */ }
    if (!all) {
      try { const r = await fetch(WX_URL); if (!r.ok) throw 0; all = await r.json(); try { sessionStorage.setItem("djdex:roofwx", JSON.stringify({ t: Date.now(), d: all })); } catch (e) { /* 저장 못 해도 됨 */ } }
      catch (e) { return; }   // 날씨를 못 받아도 옥상은 그대로 열려 있어요
    }
    const [gx, gy] = kmaGrid(town.la, town.ln); let best = null, bd = 5;
    Object.entries(all.g || {}).forEach(([k, v]) => { const [x, y] = k.split("_").map(Number), dd = Math.hypot(x - gx, y - gy); if (dd < bd) { bd = dd; best = v; } });
    if (!best) return;
    const rainy = best.pty === 1 || best.pty === 2 || best.pty === 5 || best.pty === 6, snowy = best.pty === 3 || best.pty === 7, foggy = best.reh >= 98 && best.wsd < 1.6;
    api.setWeather({ cloud: best.sky >= 4 ? .92 : best.sky === 3 ? .62 : .12, rain: rainy || snowy ? clamp(.4 + best.rn1 / 6, .4, 1) : 0, fog: foggy ? .7 : 0, wind: clamp(best.wsd / 3.5, .3, 3) });
    wxLine = `${rainy ? "비" : snowy ? "눈" : best.sky >= 4 ? "흐림" : best.sky === 3 ? "구름 많음" : "맑음"} ${Math.round(best.t)}°`; stat();
    if (rainy && !st.amb.includes("rain")) hint("비가 와요. 설정에서 빗소리를 켜 볼까요?");
  }
  function setTown(gu, byGu) {
    const cs = byGu[gu] || []; if (!cs.length) { town = null; stat(); return; }
    const ps = cs.map(c => c.p).filter(Boolean).sort((a, b) => a - b), med = ps.length ? ps[ps.length >> 1] : 0, trades = cs.reduce((s, c) => s + (c.tc || 0), 0);
    const ll = cs.filter(c => c.la && c.ln), la = ll.reduce((s, c) => s + c.la, 0) / (ll.length || 1), ln = ll.reduce((s, c) => s + c.ln, 0) / (ll.length || 1);
    town = { gu, la: la || 36.35, ln: ln || 127.38, line: `${gu} · 단지 ${cs.length.toLocaleString()}곳${med ? " · 84㎡ 중간 " + eok(med) : ""}${trades ? " · 거래 " + trades.toLocaleString() + "건" : ""}` };
    st.town = gu; saveSt(); stat();
    if (api) { api.setPlace(town.la, town.ln); loadWeather(); }
  }
  let byGuAll = null;
  DJ.data().then(d => {
    const byGu = byGuAll = {}; (d.complexes || []).forEach(c => { if (c.gu) (byGu[c.gu] = byGu[c.gu] || []).push(c); });
    const gus = Object.keys(byGu).sort((a, b) => byGu[b].length - byGu[a].length);
    sel.replaceChildren(...gus.map(g => { const o = document.createElement("option"); o.value = g; o.textContent = g; return o; }));
    const rec = (DJ.recent && DJ.recent()[0]) || {}, first = [st.town, rec.gu].find(g => g && byGu[g]) || gus[0];
    if (first) { sel.value = first; pendingTown = () => setTown(first, byGu); if (api) pendingTown(); }
    sel.addEventListener("change", () => setTown(sel.value, byGu));
  }).catch(() => { /* 동네 없이도 옥상은 열려요 */ });
  let pendingTown = null;

  // ---------- 사진 ----------
  $("[data-roof-photo]").addEventListener("click", async () => {
    if (!api) return;
    const src = api.snapshot(), w = 1080, h = 1350, o = document.createElement("canvas"); o.width = w; o.height = h;
    const g = o.getContext("2d"), s = Math.max(w / src.width, (h - 150) / src.height), dw = src.width * s, dh = src.height * s;
    g.fillStyle = "#0a1224"; g.fillRect(0, 0, w, h); g.drawImage(src, (w - dw) / 2, Math.min(0, (h - 150 - dh) / 2), dw, dh);
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

  // ---------- 함께 있기 (같은 동네 방, 이모지 인사만) ----------
  const SB = window.DJ_SB, canNet = !!(SB && SB.url && SB.key && window.RoofNet);
  const REGION = (location.pathname.match(/\/(sejong|seoul|cheongju)(\/|$)/) || [0, "daejeon"])[1];
  const h36 = t => { let h = 2166136261; for (const c of String(t)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  let net = null, names = [], roomLabel = "", roomMode = "", autoK = 1, friendCode = "";
  const roomBtn = $("[data-roof-roombtn]"), emoBar = $("[data-roof-emobar]"), roomStat = $("[data-roof-roomstat]");
  function paintNet(msg) {
    const n = names.length + 1, on = !!net;
    $("[data-roof-pc]").textContent = on ? n + "명" : "함께";
    emoBar.hidden = !on;
    roomStat.textContent = msg || (on ? `${roomLabel} · ${n}명이 함께 있어요` : "혼자 있어요.");
    $("[data-roof-members]").replaceChildren(...[st.nick + " (나)", ...names.map(x => x.n)].map(t => { const li = document.createElement("li"); li.innerHTML = "<span>•</span><b></b><i></i>"; li.querySelector("b").textContent = t; return li; }));
    $$("[data-roof-join=off]").forEach(b => { b.hidden = !on; });
  }
  function leaveRoom() { if (net) { net.leave(); net = null; } if (api) names.forEach(x => api.removePeer(x.id)); names = []; }
  function joinRoom(mode, code) {
    if (!canNet || !api) return;
    leaveRoom(); roomMode = mode;
    const gu = (town && town.gu) || "all", id = mode === "friend" ? "f-" + code : `${REGION}-${h36(gu)}-${autoK}`;
    roomLabel = mode === "friend" ? "친구 방" : `${gu} 옥상${autoK > 1 ? " " + autoK + "번" : ""}`;
    net = RoofNet.connect({ url: SB.url, key: SB.key, topic: "roof:" + id, me: { id: st.id, n: st.nick } }, {
      status: t => paintNet(t === "연결됨" ? null : t),
      fail: () => { leaveRoom(); paintNet("지금은 함께 있기를 열 수 없어요. 잠시 뒤 다시 해 주세요."); },
      peers: list => {
        names.filter(x => !list.some(y => y.id === x.id)).forEach(x => api.removePeer(x.id)); names = list; paintNet();
        if (mode === "auto" && list.length >= 8 && autoK < 12) { autoK++; joinRoom("auto"); }   // 한 방은 8명까지, 가득 차면 다음 번호 방
      },
      leave: id => { api.removePeer(id); },
      event: (ev, b, id) => { if (ev === "pos") api.setPeer(id, b); else if (ev === "emo") api.peerEmote(id, b.e); else if (ev === "fw") api.remoteShell(b); },
    });
    st.net = mode === "auto"; saveSt(); paintNet("연결하는 중…");
  }
  $$("[data-roof-join]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofJoin;
    if (k === "off") { leaveRoom(); st.net = false; saveSt(); paintNet(); return; }
    if (k === "auto") { autoK = 1; joinRoom("auto"); return; }
    friendCode = friendCode || Math.random().toString(36).slice(2, 8); joinRoom("friend", friendCode);
    const link = location.origin + location.pathname.replace(/[^/]*$/, "") + "rooftop?room=" + friendCode;
    if (navigator.share) navigator.share({ title: "집감 옥상에서 만나요", text: "같이 불꽃놀이 봐요 🎆", url: link }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => say("초대 링크를 복사했어요", "친구에게 보내 주세요"));
  }));
  $$("[data-roof-emo]").forEach(b => b.addEventListener("click", () => { if (net && net.isOpen()) net.send("emo", { e: b.dataset.roofEmo }); if (api) api.emote(b.dataset.roofEmo); }));
  window.addEventListener("pagehide", () => { if (net) net.leave(); });
  if (canNet) roomBtn.hidden = false;
  paintNet();

  // ---------- 3D 장면 시작 ----------
  const hasGL = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } })();
  const cb = {
    burst: SND.burst, launch: SND.launch, sizzle: SND.sizzle, eat: (kind, name) => { SND.eat(); bump("bbq"); say("맛있게 먹었어요", name + " 😋"); },
    cat: () => { SND.meow(); }, say, hint, fire: () => bump("fw"),
    neighbor: () => { hint("이웃도 손을 흔들어 줘요 👋"); },
    starCounted: (n, idx) => {
      st.stars = { d: today, idx }; st.starTotal += 1; saveSt(); bump("star"); SND.star(n); paintCount();
      if (n % 10 === 0) say(`별 ${n}개째`, "별자리가 이어졌어요 ✨");
      if (n === 10) hint("별을 열 개 세었어요. 이제 소원을 빌어 볼까요?");
    },
    moved: s => { if (net) net.sendPos(s); }, fwOut: p => { if (net) net.send("fw", p); }, peerCount: () => paintNet(),
    layout: l => { st.layout = l; saveSt(); }, lie: () => { hint("누워서 밤하늘을 보세요. 별 세기도 해 볼까요?"); }, view: () => { },
    showStart: () => { /* 쇼 시작 */ }, showEnd: () => { hint("멋진 불꽃이었어요. 오늘도 수고했어요."); },
    sky: () => { }, quality: q => { hint("화면이 무거워 보여서 화질을 조금 낮췄어요"); },
  };
  async function boot() {
    if (!hasGL) { $("[data-roof-nogl]").hidden = false; return; }
    try {
      const m = await import("./rooftop3d.js?v=" + (document.querySelector("script[src*='rooftop.js']").src.split("v=")[1] || "1"));
      api = m.start(box, cb, { reduced: calmMQ.matches, nick: st.nick, stars: st.stars.idx, layout: st.layout, quality: st.q === "auto" ? undefined : st.q });
      api.setSky(st.sky);
      if (pendingTown) pendingTown();
      const inv = new URLSearchParams(location.search).get("room");
      if (canNet && inv && /^[a-z0-9]{4,12}$/.test(inv)) { friendCode = inv; setTimeout(() => { joinRoom("friend", inv); say("친구 방에 들어왔어요", "이모지로 인사해 보세요 👋"); }, 1500); }
      else if (canNet && st.net) setTimeout(() => joinRoom("auto"), 2500);
      new ResizeObserver(() => api.resize()).observe(box);
    } catch (e) { console.error(e); $("[data-roof-nogl]").hidden = false; return; }
    setTimeout(() => hint("바닥을 누르면 걸어가고, 하늘을 누르면 불꽃이 터져요. 화면을 끌면 둘러볼 수 있어요."), 1800);
  }
  // 정각 불꽃놀이: 열어 둔 동안 정각이 되면 한바탕
  let lastHour = "";
  setInterval(() => { const d = new Date(), k = ymd(d) + d.getHours(); if (d.getMinutes() === 0 && st.hour && api && lastHour !== k && !document.hidden) { lastHour = k; say("정각 불꽃놀이", "고개를 들어 보세요 🎆"); api.show(+(ymd(d).replace(/-/g, "") + String(d.getHours()).padStart(2, "0"))); } }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (api) api.pause(); if (A.c && !st.bg) A.c.suspend(); }
    else { if (api) api.resume(); if (A.c && st.sound) A.c.resume(); }
  });
  if (st.sound) {   // 이전에 소리를 켜 뒀어도, 브라우저 규칙상 처음 누를 때부터 시작
    const once = () => { setSound(true); box.removeEventListener("pointerdown", once, true); };
    box.addEventListener("pointerdown", once, true);
  }
  paintMissions(); paintSettings(); paintCount(); paintWish();
  boot();
  box.dataset.ready = "1";
})();
