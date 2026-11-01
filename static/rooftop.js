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
    stars: { d: "", idx: [] }, starTotal: 0, wishes: [], layout: null, net: false, id: "", arrive: true, zen: true };
  let st = Object.assign({}, DEF, DJ.load("roof", {}));
  st.m = Object.assign({}, DEF.m, st.m); st.on = Object.assign({}, DEF.on, st.on); st.vol = Object.assign({}, DEF.vol, st.vol);
  if (!st.nick) st.nick = ADJ[(Math.random() * ADJ.length) | 0] + " " + NOUN[(Math.random() * NOUN.length) | 0];
  if (!st.id) st.id = Math.random().toString(36).slice(2, 10);
  const today = ymd(new Date()), yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (st.last !== today) { st.streak = st.last === ymd(yd) ? st.streak + 1 : 1; st.days += 1; st.last = today; st.m = Object.assign({}, DEF.m); }
  if (st.stars.d !== today) st.stars = { d: today, idx: [] };
  // 가구 배치 버전: 캠핑 옥탑방으로 바뀌기 전에 저장된 옛 배치(돌린 방향이 빠진 것 등)는 한 번만 새 기본 배치로 바꿔요
  const LAYOUT_V = 4;
  if (st.layoutV !== LAYOUT_V) { st.layout = null; st.layoutV = LAYOUT_V; }
  if (st.skyV !== 1) { delete st.glow; st.skyV = 1; }   // 밤하늘이 돋보이게 바꾼 새 기본 빛번짐(20%)으로 한 번 맞춰요
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
  // 환경음: 실제 녹음(위키미디어 커먼즈 자유 이용, static/sounds)을 이음새 없이 반복. 처음 켤 때 받아 와요
  const LVL = { cricket: .8, katydid: .55, frog: .6, cicada: .4, wind: .9, rain: .85, chime: .7, fire: .8, city: .65, water: .75 };
  const BUF = {}, SOUND_DIR = "static/sounds/";
  const loadBuf = f => (BUF[f] || (BUF[f] = fetch(SOUND_DIR + f).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => A.c.decodeAudioData(b)).catch(() => null)));
  let MAN = null; const manifest = () => (MAN || (MAN = fetch(SOUND_DIR + "manifest.json").then(r => r.json()).catch(() => ({ near: [], far: [], oneshots: {} }))));
  function ensureLayer(k) {
    if (A.layers[k] || !LVL[k]) return;
    const L = { on: false, node: null, busy: false,
      set(on) { L.on = on; const t = A.c.currentTime;
        if (on && !L.node && !L.busy) { L.busy = true; loadBuf(k + ".mp3").then(buf => { L.busy = false; if (!buf) return;
          const src = A.c.createBufferSource(); src.buffer = buf; src.loop = true; const g = A.c.createGain(); g.gain.value = 0; src.connect(g).connect(A.buses.amb); if (k === "chime") g.connect(A.send); src.start(0, Math.random() * buf.duration * .5);
          L.node = g; g.gain.setTargetAtTime(L.on ? LVL[k] : 0, A.c.currentTime, 1.6); }); }
        else if (L.node) L.node.gain.setTargetAtTime(on ? LVL[k] : 0, t, on ? 1.6 : 1.1); } };
    A.layers[k] = L;
  }
  const ready = () => A.c && st.sound && A.c.state !== "closed";
  // 불꽃: 쏘는 소리 → (빛이 먼저, 소리는 조금 뒤에) 쾅 하고 터지는 소리와 넓게 퍼지는 울림
  const out = (pan, dest, wet) => { const p = panner(pan), g = A.c.createGain(); g.gain.value = 1; p.connect(dest); g.connect(p); if (wet) { const w = A.c.createGain(); w.gain.value = wet; g.connect(w); w.connect(A.send); } return g; };
  function env(g, t, a, pk, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.exponentialRampToValueAtTime(.0004, t + a + d); }
  function playSample(file, o) {
    loadBuf(file).then(buf => { if (!buf || !ready()) return; const c = A.c, src = c.createBufferSource(), g = c.createGain(), dst = out(o.pan, A.buses[o.bus], o.wet);
      src.buffer = buf; src.playbackRate.value = o.rate || 1; g.gain.value = o.gain; src.connect(g).connect(dst); src.start(Math.max(c.currentTime, o.at || 0)); });
  }
  const SND = {
    launch(i) {
      if (!ready() || !st.on.fw) return;
      const c = A.c, t = c.currentTime, o = out(i.pan, A.buses.fw, .25);
      const n = noiseSrc(A.white, false), bp = c.createBiquadFilter(), e = c.createGain(); bp.type = "bandpass"; bp.Q.value = 1.1; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 1.5);
      env(e, t, .15, .1, 1.5); n.connect(bp).connect(e).connect(o); n.start(t, rnd(0, 1), 1.8);
      const w = c.createOscillator(), we = c.createGain(); w.type = "sine"; w.frequency.setValueAtTime(760, t); w.frequency.exponentialRampToValueAtTime(2300, t + 1.4); env(we, t, .3, .014, 1.2); w.connect(we).connect(o); w.start(t); w.stop(t + 1.8);
    },
    burst(i) {   // 실제 불꽃 녹음에서 한 발씩 골라, 거리만큼 늦게 들리게 하고 넓게 울리게 해요
      if (!ready() || !st.on.fw) return;
      manifest().then(M => {
        const c = A.c, near = i.dist < 520 || i.big, list = (near ? M.near : M.far) && (near ? M.near : M.far).length ? (near ? M.near : M.far) : M.near; if (!list || !list.length) return;
        const f = list[(Math.random() * list.length) | 0], at = c.currentTime + clamp(i.dist / 650, .3, .95), sz = clamp(i.size, .7, 1.8);
        playSample(f, { pan: i.pan, gain: clamp(.5 * sz * (near ? 1 : .8), .25, 1), rate: rnd(.9, 1.08) * (i.big ? .94 : 1), wet: i.big ? 1.1 : .8, bus: "fw", at });
        if (i.kind === "double") playSample(list[(Math.random() * list.length) | 0], { pan: i.pan, gain: .4 * sz, rate: rnd(.95, 1.1), wet: .8, bus: "fw", at: at + .28 });
        const os = c.createOscillator(), e = c.createGain(), o = out(i.pan, A.buses.fw, .6); os.type = "sine"; os.frequency.setValueAtTime(i.big ? 70 : 85, at); os.frequency.exponentialRampToValueAtTime(30, at + .6);   // 가슴을 울리는 낮은 울림만 살짝 더해요
        env(e, at, .01, .16 * sz, .9); os.connect(e).connect(o); os.start(at); os.stop(at + 1.2);
      });
    },
    sizzle(n) { if (!A.sizz) return; A.sizz.gain.setTargetAtTime(Math.min(.07, n * .02), A.c.currentTime, .3); },
    eat() { if (!ready() || !st.on.fx) return; const c = A.c, t = c.currentTime, o = out(0, A.buses.fx, .1); for (let i = 0; i < 3; i++) { const n = noiseSrc(A.white, false), bp = c.createBiquadFilter(), e = c.createGain(); bp.type = "bandpass"; bp.frequency.value = 1700 + i * 300; bp.Q.value = 2; env(e, t + i * .13, .002, .22, .05); n.connect(bp).connect(e).connect(o); n.start(t + i * .13, i * .2, .1); } },
    meow() { if (!ready() || !st.on.fx) return; manifest().then(M => { const names = Object.values(M.oneshots || {}); if (names.length) playSample(names[(Math.random() * names.length) | 0], { pan: .1, gain: .75, rate: rnd(.96, 1.04), wet: .15, bus: "fx" }); });
      loadBuf("purr.mp3").then(buf => { if (!buf || !ready()) return; const c = A.c, t = c.currentTime, s2 = c.createBufferSource(), g = c.createGain(); s2.buffer = buf; s2.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.55, t + .5); g.gain.setTargetAtTime(0, t + 2.6, .6); s2.connect(g).connect(A.buses.fx); s2.start(t); s2.stop(t + 5); }); },
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
    sw($("[data-roof-sound]"), st.sound); sw($("[data-roof-bg]"), st.bg); sw($("[data-roof-wx]"), st.wx); sw($("[data-roof-hour]"), st.hour); sw($("[data-roof-arrset]"), st.arrive); sw($("[data-roof-zenset]"), st.zen);
    $$("[data-roof-bus]").forEach(b => { const on = st.on[b.dataset.roofBus]; b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "켜짐" : "멈춤"; });
    $$("[data-roof-amb]").forEach(b => b.setAttribute("aria-pressed", String(st.amb.includes(b.dataset.roofAmb))));
    $$("[data-roof-sky]").forEach(b => b.setAttribute("aria-pressed", String(st.sky === b.dataset.roofSky)));
    $$("[data-roof-q]").forEach(b => b.setAttribute("aria-pressed", String(st.q === b.dataset.roofQ)));
    $("[data-roof-starsn]").textContent = st.stars.idx.length + "개 · 처음부터 다시 세고 싶을 때";
    { const gl = $("[data-roof-glow]"); gl.value = st.glow ?? 20; $("[data-roof-glowv]").textContent = gl.value + "%"; }
    $$("[data-roof-vol]").forEach(r => { r.value = st.vol[r.dataset.roofVol]; $(`[data-roof-volv="${r.dataset.roofVol}"]`).textContent = st.vol[r.dataset.roofVol] + "%"; });
  }
  $("[data-roof-sound]").addEventListener("click", () => setSound(!st.sound));
  $("[data-roof-bg]").addEventListener("click", () => { st.bg = !st.bg; saveSt(); paintSettings(); });
  $("[data-roof-wx]").addEventListener("click", () => { st.wx = !st.wx; saveSt(); paintSettings(); if (st.wx) loadWeather(); else if (api) { api.setWeather({ cloud: .15, rain: 0, fog: 0, wind: 1 }); stat(); } });
  $("[data-roof-hour]").addEventListener("click", () => { st.hour = !st.hour; saveSt(); paintSettings(); });
  $("[data-roof-arrset]").addEventListener("click", () => { st.arrive = !st.arrive; saveSt(); paintSettings(); });
  $("[data-roof-zenset]").addEventListener("click", () => { st.zen = !st.zen; saveSt(); paintSettings(); });
  $$("[data-roof-bus]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.roofBus; st.on[k] = !st.on[k]; saveSt(); applyGains(); paintSettings(); }));
  $$("[data-roof-amb]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofAmb, i = st.amb.indexOf(k); if (i >= 0) st.amb.splice(i, 1); else st.amb.push(k); saveSt();
    if (st.sound && !st.on.amb) { st.on.amb = true; }
    if (A.c && st.sound) { ensureLayer(k); applyGains(); }
    else if (!st.sound && st.amb.includes(k)) { setSound(true); }
    paintSettings();
  }));
  $("[data-roof-glow]").addEventListener("input", e => { st.glow = +e.target.value; $("[data-roof-glowv]").textContent = e.target.value + "%"; if (api) api.setGlow(st.glow); saveSt(); });
  $$("[data-roof-vol]").forEach(r => r.addEventListener("input", () => { st.vol[r.dataset.roofVol] = +r.value; $(`[data-roof-volv="${r.dataset.roofVol}"]`).textContent = r.value + "%"; applyGains(); }));
  $$("[data-roof-vol]").forEach(r => r.addEventListener("change", saveSt));
  $$("[data-roof-sky]").forEach(b => b.addEventListener("click", () => { st.sky = b.dataset.roofSky; saveSt(); paintSettings(); if (api) api.setSky(st.sky); }));
  $$("[data-roof-q]").forEach(b => b.addEventListener("click", () => { st.q = b.dataset.roofQ; saveSt(); paintSettings(); if (api) api.setQuality(st.q === "auto" ? (matchMedia("(pointer: coarse)").matches ? "mid" : "high") : st.q); }));
  let creditsDone = false;
  function paintCredits() {   // 설정 '정보'에 쓴 녹음의 저작자와 라이선스를 보여 줘요
    if (creditsDone) return; creditsDone = true;
    fetch("static/sounds/credits.json").then(r => r.json()).then(c => {
      const NAMES = { cricket: "귀뚜라미", katydid: "풀벌레", frog: "개구리", cicada: "매미", wind: "바람", rain: "빗소리", chime: "풍경", fire: "숯불", city: "도시", water: "물소리", purr: "고양이 가르릉", meow1: "고양이 울음", meow2: "고양이 울음", silv2: "불꽃", silv3: "불꽃", piece: "불꽃", nijm: "불꽃", far1: "먼 불꽃", far2: "먼 불꽃", far4: "먼 불꽃" };
      $("[data-roof-credits]").replaceChildren(...Object.entries(c).map(([k, v]) => { const li = document.createElement("li"), a = document.createElement("a"); a.href = v.page; a.target = "_blank"; a.rel = "noopener"; a.textContent = (NAMES[k] || k) + " · " + (v.author || "작자 미상") + " · " + v.license; li.append(a); return li; }));
    }).catch(() => { creditsDone = false; });
  }
  const openModal = k => { $$("[data-roof-modal]").forEach(m => { m.hidden = m.dataset.roofModal !== k; }); const m = $(`[data-roof-modal="${k}"]`); if (m) { paintSettings(); if (k === "set") paintCredits(); const f = m.querySelector("textarea, button.rs-sw, button"); setTimeout(() => f && f.focus(), 30); } };
  const closeModal = () => $$("[data-roof-modal]").forEach(m => { m.hidden = true; });
  $$("[data-roof-open]").forEach(b => b.addEventListener("click", () => openModal(b.dataset.roofOpen)));
  $$("[data-roof-mclose]").forEach(b => b.addEventListener("click", closeModal));
  $$("[data-roof-modal]").forEach(m => m.addEventListener("pointerdown", e => { if (e.target === m) closeModal(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // ---------- 아래 버튼 ----------
  let miniN = 0;
  // 누워서 하는 것들: 별똥별 잡기, 숨 고르기(들이쉬고 내쉬는 호흡 안내)
  let breathT = 0, breathN = 0;
  const lieBtns = { meteor: $("[data-roof-meteor]"), breath: $("[data-roof-breath]"), box: $("[data-roof-breathbox]") };
  function stopLie(keepMeteor) { clearTimeout(breathT); lieBtns.box.hidden = true; lieBtns.box.className = "roof-breath"; lieBtns.breath.setAttribute("aria-pressed", "false");
    if (!keepMeteor) { lieBtns.meteor.setAttribute("aria-pressed", "false"); if (api) api.setMeteors(false); } }
  lieBtns.meteor.addEventListener("click", () => { const on = lieBtns.meteor.getAttribute("aria-pressed") !== "true"; lieBtns.meteor.setAttribute("aria-pressed", String(on)); if (api) api.setMeteors(on); if (on) hint("가끔 별똥별이 지나가요. 보이면 눌러서 잡아 보세요."); });
  lieBtns.breath.addEventListener("click", () => {
    const on = lieBtns.breath.getAttribute("aria-pressed") !== "true"; if (!on) { stopLie(true); return; }
    lieBtns.breath.setAttribute("aria-pressed", "true"); lieBtns.box.hidden = false; breathN = 0;
    const cyc = () => { lieBtns.box.className = "roof-breath in"; $("[data-roof-breatht]").textContent = "들이쉬어요"; breathN++; $("[data-roof-breathn]").textContent = breathN + "번째 숨";
      breathT = setTimeout(() => { lieBtns.box.className = "roof-breath out"; $("[data-roof-breatht]").textContent = "내쉬어요"; breathT = setTimeout(cyc, 6000); }, 4000); };
    setTimeout(cyc, 50); });
  $("[data-roof-tosky]").addEventListener("click", () => { if (api) { stopLie(true); api.setFocus("sky"); } });
  const hintEl = $("[data-roof-hint]"); let hintT = 0;
  function hint(t) { if (box.classList.contains("arriving") || box.classList.contains("zen")) return; hintEl.textContent = t; hintEl.classList.add("on"); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove("on"), 5200); }
  const subs = $$("[data-roof-sub]");
  const closeSubs = () => { subs.forEach(s => { s.hidden = true; }); $$("[data-roof-menu]").forEach(x => x.setAttribute("aria-expanded", "false")); };
  // ---------- 방명록: 게스트하우스처럼 다녀간 사람이 한 줄 남겨요 (모두에게 보이고, 내 글은 이 기기에서만 지울 수 있어요) ----------
  const gList = $("[data-roof-glist]"), gText = $("[data-roof-gtext]"), gWho = $("[data-roof-gwho]"), gGo = $("[data-roof-ggo]");
  let gMood = "🌙", gBusy = false;
  if (!st.gbTok) { st.gbTok = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join(""); saveSt(); }
  st.gbMine = st.gbMine || [];
  const gCall = (fn, body) => (DJ.sb && DJ.sb.call ? DJ.sb.call("/rest/v1/rpc/" + fn, { method: "POST", body }) : Promise.reject(new Error("off")));
  const ago = t => { const m = (Date.now() - new Date(t)) / 60000; return m < 1 ? "방금" : m < 60 ? `${m | 0}분 전` : m < 1440 ? `${(m / 60) | 0}시간 전` : m < 43200 ? `${(m / 1440) | 0}일 전` : new Date(t).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }); };
  const paintWho = () => { gWho.textContent = `${st.nick} · ${gText.value.length}/80`; };
  const gEmpty = t => { const li = document.createElement("li"); li.className = "roof-guest-empty"; li.textContent = t; gList.replaceChildren(li); };
  function paintGuest(rows) {
    if (!rows.length) return gEmpty("아직 남긴 글이 없어요. 첫 번째 손님이 되어 주세요 🌙");
    gList.replaceChildren(...rows.map(r => { const li = document.createElement("li"), mine = st.gbMine.includes(+r.id); li.className = mine ? "mine" : "";
      const i = document.createElement("i"); i.setAttribute("aria-hidden", "true"); i.textContent = r.mood || "🌙";
      const d = document.createElement("div"), p_ = document.createElement("p"), sm = document.createElement("small"); p_.textContent = r.msg; sm.textContent = `${r.nick}${mine ? " · 나" : ""} · ${ago(r.at)}`;
      if (mine) { const x = document.createElement("button"); x.type = "button"; x.textContent = "지우기"; x.addEventListener("click", () => gCall("roof_guest_delete", { p_id: +r.id, p_tok: st.gbTok }).then(() => { st.gbMine = st.gbMine.filter(v => v !== +r.id); saveSt(); loadGuest(); }).catch(() => say("지금은 지울 수 없어요", "잠시 뒤 다시 해 주세요"))); sm.append(x); }
      d.append(p_, sm); li.append(i, d); return li; }));
  }
  function loadGuest() { paintWho(); gEmpty("불러오는 중…"); gCall("roof_guest_list", { lim: 40 }).then(r => paintGuest(Array.isArray(r) ? r : [])).catch(() => gEmpty("지금은 방명록을 열 수 없어요. 잠시 뒤 다시 열어 주세요.")); }
  $$("[data-roof-gmood]").forEach(b => b.addEventListener("click", () => { gMood = b.dataset.roofGmood; $$("[data-roof-gmood]").forEach(x => x.setAttribute("aria-checked", String(x === b))); }));
  gText.addEventListener("input", paintWho);
  $("[data-roof-gform]").addEventListener("submit", e => { e.preventDefault(); const m = gText.value.trim(); if (!m || gBusy) return; gBusy = true; gGo.disabled = true;
    const vid = (DJ.online && DJ.online.vid && DJ.online.vid()) || st.id;
    gCall("roof_guest_write", { p_vid: vid, p_tok: st.gbTok, p_nick: st.nick, p_msg: m, p_mood: gMood }).then(v => { v = +v;
      if (v > 0) { st.gbMine = st.gbMine.concat(v).slice(-60); saveSt(); gText.value = ""; say("방명록에 남겼어요", "다음에 또 올라와요 🌙"); if (api) api.emote(gMood); loadGuest(); }
      else say(v === -1 ? "링크나 광고는 남길 수 없어요" : v === -2 ? "조금 있다가 다시 남겨 주세요" : v === -3 ? "오늘은 충분히 남겼어요" : "남길 수 없는 글이에요", v === -3 ? "내일 또 와요 🌙" : ""); })
      .catch(() => say("지금은 남길 수 없어요", "잠시 뒤 다시 해 주세요")).finally(() => { gBusy = false; gGo.disabled = false; }); });
  const openGuest = () => { closeSubs(); openModal("guest"); loadGuest(); setTimeout(() => gText.focus({ preventScroll: true }), 60); };
  $$('[data-roof-open="guest"]').forEach(b => b.addEventListener("click", () => loadGuest()));
  // ---------- 들어올 때 인사: 숨 한 번 고르고, 밤하늘부터 천천히 보며 올라와요 ----------
  const arrEl = $("[data-roof-arrive]"), DAY = "일월화수목금토";
  const clockT = d => { const h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0"); return `${h < 5 ? "새벽" : h < 12 ? "오전" : h < 18 ? "오후" : "밤"} ${h % 12 || 12}:${m}`; };
  let arriving = false, arriveReq = false, arrBreathT = 0;
  function paintArrive() {
    const d = new Date(), h = d.getHours();
    const g = h >= 5 && h < 11 ? ["좋은 아침이에요", "따뜻한 커피 한 잔 들고 올라온 것처럼"] : h >= 11 && h < 17 ? ["잠깐 쉬어 가요", "바람 좀 쐬고 내려가요"]
      : h >= 17 && h < 21 ? ["오늘 하루도 수고했어요", "노을 지는 옥상에서 숨 돌리고 가요"] : ["오늘 밤은 여기서 쉬어요", "별이 잘 보이는 밤이에요"];
    $("[data-roof-arrt]").textContent = `${DAY[d.getDay()]}요일 · ${clockT(d)}`;
    $("[data-roof-arrh]").textContent = g[0];
    $("[data-roof-arrs]").textContent = st.streak > 1 ? `${g[1]} · ${st.streak}일째 올라왔네요` : g[1];
  }
  function showArrive() {
    arriving = true; arrEl.hidden = false; box.classList.add("arriving"); paintArrive();
    const b = $("[data-roof-arrb]"); let inh = true;   // 빛이 커질 때 들이쉬고, 작아질 때 내쉬어요 (8초 한 번)
    arrBreathT = setInterval(() => { inh = !inh; b.style.opacity = 0; setTimeout(() => { b.textContent = inh ? "천천히 들이쉬고" : "길게 내쉬어요"; b.style.opacity = 1; }, 400); }, 4000);
  }
  function goUp(kind) {
    if (!arriving) return; arriving = false; clearInterval(arrBreathT);
    try { sessionStorage.setItem("djdex:roofarr", "1"); } catch (e) { /* 다음에도 보여요 */ }
    if (kind === "sound") { if (!st.amb.length) st.amb = ["cricket", "wind"]; st.on.amb = true; setSound(true); } else if (st.sound) setSound(false);
    arrEl.classList.add("out"); if (api) api.arrive(); else arriveReq = true;
    setTimeout(() => { arrEl.hidden = true; box.classList.remove("arriving"); lastAct = Date.now();
      if (!st.tour && api) startTour(); }, calmMQ.matches ? 900 : 5200);   // 카메라가 거의 내려왔을 때 버튼이 살며시
  }
  $$("[data-roof-arrgo]").forEach(b => b.addEventListener("click", () => goUp(b.dataset.roofArrgo)));
  // ---------- 멍 모드: 잠깐 손을 놓으면 버튼이 사라지고 천천히 둘러봐요 ----------
  let lastAct = Date.now(), zenOn = false, zenSpin = false;
  const zenNote = $("[data-roof-zennote]");
  const zenBlocked = () => !api || arriving || box.classList.contains("arriving") || box.classList.contains("touring") || !!box.dataset.focus
    || $$("[data-roof-modal]").some(m => !m.hidden) || subs.some(x => !x.hidden) || document.hidden;
  function zen(on) {
    if (on === zenOn) return; zenOn = on; box.classList.toggle("zen", on);
    if (on) { $("[data-roof-zent]").textContent = clockT(new Date()); zenSpin = !api.getSpin(); if (zenSpin) api.setSpin(true); }
    else { if (zenSpin && api) api.setSpin(false); zenSpin = false; lastAct = Date.now(); }
  }
  ["pointerdown", "keydown", "wheel"].forEach(ev => window.addEventListener(ev, e => {
    lastAct = Date.now();
    if (zenOn) { zen(false); if (ev === "pointerdown" && box.contains(e.target)) { e.stopPropagation(); } }   // 깨우는 첫 터치는 불꽃·걷기로 이어지지 않게
  }, true));
  setInterval(() => { if (zenOn) { $("[data-roof-zent]").textContent = clockT(new Date()); if (zenBlocked()) zen(false); return; }
    if (st.zen && Date.now() - lastAct > 35000 && !zenBlocked()) zen(true); }, 1000);
  $("[data-roof-zen]").addEventListener("click", () => { closeSubs(); setTimeout(() => zen(true), 80); });
  $$("[data-roof-exit]").forEach(b => b.addEventListener("click", () => { if (api) api.setFocus(null); }));
  $("[data-roof-reset]").addEventListener("click", () => { if (api) { api.resetView(); $("[data-roof-reset]").hidden = true; } });
  $$("[data-roof-menu]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofMenu, el = $(`[data-roof-sub="${k}"]`), open = el.hidden;
    if (k === "grill" && api) { api.setFocus(open ? "grill" : null); return; }
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
    if (deco) hint(deco === "remove" ? "치울 것을 눌러 보세요." : deco === "edit" ? "옮기거나 돌릴 가구를 눌러 보세요. 다시 누르면 끝나요." : "놓고 싶은 자리를 눌러 보세요. 다시 누르면 끝나요."); }));
  // ---------- 처음 방문 안내 (한 번만, 설정에서 다시 볼 수 있어요) ----------
  const touch = matchMedia("(pointer: coarse)").matches;
  const TOUR = [
    { a: "🌙", t: "집감 옥상에 오신 걸 환영해요", d: "도시 야경이 보이는 옥탑방 캠핑 공간이에요. 잠깐 쉬어 가세요." },
    { a: touch ? "🕹" : "⌨️", t: "걷고 둘러보기", d: touch ? "바닥을 누르면 그쪽으로 걸어가요. 왼쪽 아래 패드를 밀어도 걸을 수 있어요. 화면을 끌면 360도로 둘러보고, 두 손가락으로 가까이·멀리 볼 수 있어요." : "바닥을 누르거나 W A S D·방향키로 걸어요. 화면을 끌면 360도로 둘러보고, 휠로 가까이·멀리 볼 수 있어요.", el: null },
    { a: "🎆", t: "불꽃놀이와 고기 굽기", d: "하늘을 누르면 불꽃이 터져요. 🍖 굽기에서는 고기를 뒤집어 가며 노릇하게 구워 먹어요.", el: '[data-roof-menu="fire"]' },
    { a: "⛺", t: "꾸미기와 동물 친구", d: "의자·소파·타프·화로를 놓고, 옮기고, 돌릴 수 있어요. 강아지·고양이·앵무새도 꺼내 보세요. 가구를 누르면 앉기·눕기 같은 동작이 나와요.", el: '[data-roof-menu="deco"]' },
    { a: "✨", t: "쉬기와 함께 있기", d: "🌙 쉬기에서 별 세기·누워서 보기·소원 빌기를 해요. 위쪽 👥 함께를 누르면 다른 사람과 같은 서버 옥상에 있을 수 있어요.", el: '[data-roof-menu="sky"]' },
  ];
  let tourI = 0;
  const tourEl = $("[data-roof-tour]");
  function paintTour() {
    const s_ = TOUR[tourI];
    $("[data-roof-tourart]").textContent = s_.a; $("[data-roof-tourt]").textContent = s_.t; $("[data-roof-tourd]").textContent = s_.d; $("[data-roof-tourstep]").textContent = `${tourI + 1} / ${TOUR.length}`;
    $("[data-roof-tourdots]").replaceChildren(...TOUR.map((_, i) => { const d = document.createElement("i"); if (i === tourI) d.className = "on"; return d; }));
    $("[data-roof-tournext]").textContent = tourI === TOUR.length - 1 ? "시작하기" : "다음";
    $$(".roof-spot").forEach(e => e.classList.remove("roof-spot")); if (s_.el) { const t = $(s_.el); if (t) t.classList.add("roof-spot"); }
  }
  function startTour() { tourI = 0; tourEl.hidden = false; box.classList.add("touring"); paintTour(); $("[data-roof-tournext]").focus(); }
  function endTour() { tourEl.hidden = true; box.classList.remove("touring"); $$(".roof-spot").forEach(e => e.classList.remove("roof-spot")); st.tour = 1; saveSt(); hint("편하게 쉬어 가세요 🌙"); }
  $("[data-roof-tournext]").addEventListener("click", () => { if (tourI < TOUR.length - 1) { tourI++; paintTour(); } else endTour(); });
  $("[data-roof-tourskip]").addEventListener("click", endTour);
  $("[data-roof-tourre]").addEventListener("click", () => { closeModal(); startTour(); });
  document.addEventListener("keydown", e => { if (tourEl.hidden) return; if (e.key === "Escape") endTour(); else if (e.key === "ArrowRight" || e.key === "Enter") $("[data-roof-tournext]").click(); });
  // 꾸미기 탭: 옥탑·캠핑·동물·배치
  $$("[data-roof-tab]").forEach(t => t.addEventListener("click", () => { const k = t.dataset.roofTab;
    $$("[data-roof-tab]").forEach(x => x.setAttribute("aria-selected", String(x === t))); $$("[data-roof-pane]").forEach(p => { p.hidden = p.dataset.roofPane !== k; }); }));
  // 기본 옥탑방으로 되돌리기 (내가 꾸민 배치는 지워져요)
  $("[data-roof-resetlayout]").addEventListener("click", () => { if (!api || !confirm("기본 옥탑방 배치로 되돌릴까요? 지금 꾸민 배치는 사라져요.")) return;
    api.setLayout(null); const l = api.getLayout(); if (cb.layout) cb.layout(l); hint("기본 옥탑방으로 되돌렸어요."); });
  $("[data-roof-lie]").addEventListener("click", () => { if (api) { api.lie(); closeSubs(); } });
  $("[data-roof-stand]").addEventListener("click", () => { if (api) api.stand(); });
  // 화면 조이스틱 (터치 기기): 왼쪽 아래를 누르고 밀면 그 쪽으로 걸어요, 끝까지 밀면 달려요
  { const jz = $("[data-roof-joy]"), knob = jz.querySelector("i"); let jid = null, cx = 0, cy = 0; const R = 44;
    const set = (x, y, on) => { const d = Math.hypot(x, y), k = d > R ? R / d : 1; x *= k; y *= k; knob.style.transform = `translate(${x}px, ${y}px)`; if (api) api.joy(x / R, y / R, on, d > R * 1.15); };
    jz.addEventListener("pointerdown", e => { e.preventDefault(); jid = e.pointerId; jz.setPointerCapture(jid); const r = jz.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; jz.classList.add("on"); set(e.clientX - cx, e.clientY - cy, true); });
    jz.addEventListener("pointermove", e => { if (e.pointerId === jid) set(e.clientX - cx, e.clientY - cy, true); });
    const end = e => { if (e.pointerId !== jid) return; jid = null; jz.classList.remove("on"); set(0, 0, false); };
    jz.addEventListener("pointerup", end); jz.addEventListener("pointercancel", end);
    jz.hidden = !matchMedia("(pointer: coarse)").matches; }
  // 함께하는 동물: 눌러서 꺼내고 넣어요 (저장돼요)
  const PET_NAME = { dog: "강아지", cat: "고양이", cham: "카멜레온", frog: "개구리", parrot: "앵무새" };
  const paintPets = () => { const on = st.pets || ["dog", "cat"]; $$("[data-roof-pet]").forEach(b => b.setAttribute("aria-pressed", String(on.includes(b.dataset.roofPet)))); };
  $$("[data-roof-pet]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofPet, on = new Set(st.pets || ["dog", "cat"]), add = !on.has(k); if (add) on.add(k); else on.delete(k);
    st.pets = [...on]; saveSt(); paintPets(); if (api) api.setPets(st.pets);
    const n = PET_NAME[k], jong = (n.charCodeAt(n.length - 1) - 0xac00) % 28 > 0;   /* 받침 있으면 이/은 */
    hint(add ? `${n}${jong ? "이" : "가"} 나왔어요. 눌러 보세요.` : `${n}${jong ? "은" : "는"} 쉬러 갔어요.`); }));
  paintPets();
  // 천천히 둘러보기: 화면이 360도로 아주 천천히 돌아가요 (물멍·불멍처럼). 화면을 끌면 멈춰요
  const spinBtn = $("[data-roof-spin]");
  spinBtn.addEventListener("click", () => { if (!api) return; const on = api.setSpin(!api.getSpin()); spinBtn.setAttribute("aria-pressed", String(on)); closeSubs(); if (on) hint("천천히 한 바퀴 둘러봐요. 화면을 끌면 멈춰요."); });
  // 옥상은 화면에 꼭 맞게 (머리글 아래부터 화면 끝까지): 아래 버튼이 접혀 보이지 않던 것 고침
  const fitRoof = () => { const top = Math.max(0, box.getBoundingClientRect().top + window.scrollY); box.style.setProperty("--roof-top", top + "px"); };
  fitRoof(); addEventListener("resize", fitRoof); addEventListener("load", fitRoof);
  $("[data-roof-sit]").addEventListener("click", () => { if (api) { api.sitNearest(); closeSubs(); } });
  $("[data-roof-tent]").addEventListener("click", () => { if (api) { api.enterNearest(); closeSubs(); } });
  // 야경 보기: 높은 곳으로 올라가 도시를 내려다봐요
  const viewBtn = $("[data-roof-view]");
  viewBtn.addEventListener("click", () => {
    if (!api) return; const up = api.getView() !== "aerial"; closeSubs(); api.setView(up ? "aerial" : "ground");
    viewBtn.setAttribute("aria-pressed", String(up)); viewBtn.querySelector("i").textContent = up ? "🏠" : "🌃"; $("[data-roof-viewt]").textContent = up ? "내려가기" : "야경"; closeSheet(); box.dataset.view = up ? "aerial" : "ground";
    if (up) hint("높은 곳에서 본 야경이에요. 화면을 끌면 방향이 바뀌고, 눌러서 불꽃도 쏠 수 있어요.");
  });
  const sheet = $("[data-roof-sheet]"), mb = $("[data-roof-mission]");
  function closeSheet() { sheet.hidden = true; mb.setAttribute("aria-expanded", "false"); }
  mb.addEventListener("click", () => { sheet.hidden = !sheet.hidden; mb.setAttribute("aria-expanded", String(!sheet.hidden)); });
  $("[data-roof-close]").addEventListener("click", () => { sheet.hidden = true; mb.setAttribute("aria-expanded", "false"); });
  // 별 세기
  const starBtn = $("[data-roof-stars]"), cntEl = $("[data-roof-count]"); let counting = false;
  const paintCount = () => { const n = st.stars.idx.length; cntEl.hidden = !counting; $("[data-roof-countt]").textContent = `⭐ 오늘 센 별 ${n}개`; $("[data-roof-starreset]").disabled = !n;   /* 좁은 화면에서도 버튼이 보이게 짧게, 버튼은 늘 보여요 */ starBtn.querySelector("span").textContent = counting ? "세는 중" : "별 세기"; starBtn.setAttribute("aria-pressed", String(counting)); };
  const resetStars = () => { st.stars = { d: today, idx: [] }; saveSt(); if (api) api.setStars([]); paintCount(); paintSettings(); hint("센 별을 지우고 처음부터 다시 세어요."); };
  $("[data-roof-starreset]").addEventListener("click", resetStars); $("[data-roof-starreset2]").addEventListener("click", resetStars);
  starBtn.addEventListener("click", () => { counting = !counting; if (api) api.setFocus(counting ? "sky" : null); paintCount(); closeSubs(); if (counting) hint("하늘의 별을 하나씩 눌러 보세요. 센 별은 금빛으로 이어져요."); });
  // 소원
  const wt = $("[data-roof-wishtext]"), wlog = $("[data-roof-wishlog]");
  const paintWish = () => { wlog.textContent = st.wishes.length ? `지금까지 띄운 소원 ${st.wishes.length}개` : ""; };
  $("[data-roof-wishgo]").addEventListener("click", () => {
    const t = wt.value.trim(); if (!t) { wt.focus(); return; }
    st.wishes.push({ t, d: today }); st.wishes = st.wishes.slice(-30); saveSt(); wt.value = ""; closeModal(); paintWish();
    if (api) api.wish(t); SND.wish(); bump("wish"); say("풍등을 띄웠어요 🏮", "소원이 하늘로 올라가요");
  });

  // ---------- 동네·날씨 ----------
  const sel = $("[data-roof-town]");
  let town = null, wxLine = "";
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(1)) + "억" : Math.round(v).toLocaleString() + "만");
  // 위쪽 현황: 지금·오늘 몇 명, 지금 시간대와 날씨, 옥상에 머문 시간 (누구나 한눈에)
  let todayN = 0, lastFw = -1e9; const arrived = Date.now();
  const kstHour = () => new Date(Date.now() + 9 * 3600e3).getUTCHours();
  const when = h => h < 5 ? ["🌌", "새벽"] : h < 8 ? ["🌅", "아침"] : h < 17 ? ["☀️", "낮"] : h < 19 ? ["🌇", "저녁"] : ["🌙", "밤"];
  const stat = () => {
    const now = window.DJ && DJ.online ? Math.max(1, DJ.online.count()) : 1;
    $("[data-roof-now]").textContent = now.toLocaleString(); $("[data-roof-todayw]").hidden = !todayN; $("[data-roof-today]").textContent = Math.max(todayN, now).toLocaleString();
    const [ic, w] = when(kstHour()); $("[data-roof-when]").textContent = `${ic} ${w}${wxLine ? " · " + wxLine : ""}`;
    const f = box.dataset.focus, spin = api && api.getSpin && api.getSpin(), mins = Math.floor((Date.now() - arrived) / 60e3);
    const act = f === "lie" ? "🛌 별멍" : f === "sky" ? "⭐ 별 세기" : f === "tent" ? "⛺ 텐트 속" : f === "table" ? "☕ 차 한 잔" : spin ? "🌀 야경멍" : Date.now() - lastFw < 25e3 ? "🎆 불꽃멍" : "☕ 쉼";
    $("[data-roof-stay]").textContent = mins < 1 ? `${act} · 방금 왔어요` : `${act} ${mins}분째`;
  };
  const loadToday = () => { if (window.DJ && DJ.online && DJ.online.onToday && !loadToday.on) { loadToday.on = true; DJ.online.onToday(v => { todayN = v; stat(); }); } };   // '오늘'은 사이트 전체 기준 (online.js)
  setTimeout(loadToday, 3000); setInterval(loadToday, 5 * 60e3); setInterval(() => { try { stat(); } catch (e) { /* 준비 전 */ } }, 20e3);
  if (window.DJ && DJ.online) DJ.online.onChange(() => { try { stat(); } catch (e) { /* 아직 준비 전 */ } });
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
    town = { gu, la: la || 36.35, ln: ln || 127.38, line: gu };   // 쉬는 곳이라 부동산 숫자는 빼고 동네·날씨·접속만
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

  // ---------- 함께 있기 (번호 서버 하나로: 1서버·2서버…, 이모지 인사만) ----------
  const SB = window.DJ_SB, canNet = !!(SB && SB.url && SB.key && window.RoofNet);
  let net = null, names = [], roomLabel = "", roomMode = "", friendCode = "";
  // 대기실: 옥상에 있는 모두가 '몇 번 서버에 있는지'만 알려 주는 곳 → 서버마다 몇 명인지 보여 줘요
  const SRV_MAX = 20; let lobby = null, curSrv = 0, srvCounts = {};
  function connectLobby() {
    if (!canNet) return; if (lobby) lobby.leave();
    lobby = RoofNet.connect({ url: SB.url, key: SB.key, topic: "roof:lobby", me: { id: st.id, n: st.nick, s: curSrv } }, {
      peers: list => { srvCounts = {}; list.forEach(x => { if (x.s) srvCounts[x.s] = (srvCounts[x.s] || 0) + 1; }); if (curSrv) srvCounts[curSrv] = (srvCounts[curSrv] || 0) + 1; paintServers(); } });
    srvCounts = curSrv ? { [curSrv]: 1 } : {}; paintServers();
  }
  const cnt = k => k === curSrv && net ? names.length + 1 : (srvCounts[k] || 0);
  function paintServers() {
    const top = Math.max(3, ...Object.keys(srvCounts).map(Number).filter(Boolean).map(k => k + 1), curSrv + 1);
    const ul = $("[data-roof-servers]"); if (!ul) return;
    ul.replaceChildren(...Array.from({ length: Math.min(top, 12) }, (_, i) => { const k = i + 1, n = cnt(k), here = k === curSrv && !!net, li = document.createElement("li");
      const lvl = n >= SRV_MAX ? "full" : n >= SRV_MAX * .7 ? "busy" : n ? "on" : "off";
      li.className = "srv srv-" + lvl + (here ? " here" : ""); li.innerHTML = `<span class="srv-dot"></span><span class="srv-t"><b>${k}서버</b><small>${here ? "지금 여기 있어요" : n >= SRV_MAX ? "가득 찼어요" : n ? "함께 있는 사람이 있어요" : "비어 있어요"}</small></span><span class="srv-n"><b>${n}</b>/${SRV_MAX}</span>`;
      const b = document.createElement("button"); b.type = "button"; b.className = "roof-btn srv-go"; b.textContent = here ? "✓" : "입장"; b.disabled = here || n >= SRV_MAX; b.setAttribute("aria-label", `${k}서버 ${here ? "지금 여기" : "들어가기"}`);
      b.addEventListener("click", () => joinRoom("srv", k)); li.append(b); if (here) li.classList.add("ok"); return li; }));
    const pill = $("[data-roof-srv]"); if (pill) { pill.hidden = !(curSrv && net); pill.textContent = `🌐 ${curSrv}서버 · ${cnt(curSrv)}명`; }
  }
  const roomBtn = $("[data-roof-roombtn]"), emoBar = $("[data-roof-emobar]"), roomStat = $("[data-roof-roomstat]");
  function paintNet(msg) {
    const n = names.length + 1, on = !!net;
    $("[data-roof-pc]").textContent = on ? n + "명" : "함께";
    emoBar.hidden = !on;
    roomStat.textContent = msg || (on ? `${roomLabel} · ${n}명이 함께 있어요` : "혼자 있어요. 들어갈 서버를 골라 보세요."); paintServers();
    $("[data-roof-members]").replaceChildren(...[[st.nick, 1], ...names.map(x => [x.n, 0])].map(([t, me_]) => { const li = document.createElement("li"); li.className = me_ ? "me" : ""; li.textContent = t + (me_ ? " · 나" : ""); return li; }));
    $$("[data-roof-join=off]").forEach(b => { b.hidden = !on; });
  }
  // 함께 꾸미기: 같은 방에 있으면 꾸민 옥상이 모두에게 똑같이 보여요. 방을 나오면 내 옥상으로 돌아와요
  let roomDeco = { v: 0, l: null }, helloT = 0;
  const sendDeco = () => { if (net && net.isOpen()) net.send("roomDeco", { v: roomDeco.v, l: roomDeco.l, by: st.nick, lv: LAYOUT_V }); };
  function leaveRoom(stay) { const was = !!net; if (net) { net.leave(); net = null; } if (api) names.forEach(x => api.removePeer(x.id)); names = []; clearTimeout(helloT);
    if (!stay && curSrv) { curSrv = 0; connectLobby(); }
    if (was && roomDeco.v && api) { api.setLayout(st.layout); } roomDeco = { v: 0, l: null }; }
  function joinRoom(mode, code) {
    if (!canNet || !api) return;
    if (mode === "auto") { const ks = Array.from({ length: 12 }, (_, i) => i + 1).filter(k => cnt(k) < SRV_MAX); code = ks.sort((a, b) => cnt(b) - cnt(a) || a - b)[0] || 1; mode = "srv"; }   // 사람이 있는 서버로 (가득 찬 곳은 빼고)
    leaveRoom(true); roomMode = mode;
    const k = mode === "srv" ? Math.max(1, Math.min(12, code | 0)) : 0, id = mode === "friend" ? "f-" + code : `srv-${k}`;
    roomLabel = mode === "friend" ? "친구 방" : `${k}서버`;
    if (curSrv !== k) { curSrv = k; connectLobby(); } st.srv = k || st.srv;
    net = RoofNet.connect({ url: SB.url, key: SB.key, topic: "roof:" + id, me: { id: st.id, n: st.nick } }, {
      status: t => paintNet(t === "연결됨" ? null : t),
      fail: () => { leaveRoom(); paintNet("지금은 함께 있기를 열 수 없어요. 잠시 뒤 다시 해 주세요."); },
      peers: list => {
        names.filter(x => !list.some(y => y.id === x.id)).forEach(x => api.removePeer(x.id)); names = list; paintNet();
        if (mode === "srv" && list.length >= SRV_MAX && k < 12) joinRoom("srv", k + 1);   // 가득 차면 다음 서버로
      },
      leave: id => { api.removePeer(id); },
      event: (ev, b, id) => { if (ev === "pos") api.setPeer(id, b); else if (ev === "emo") api.peerEmote(id, b.e); else if (ev === "fw") api.remoteShell(b);
        else if (ev === "hello") sendDeco();   // 새로 온 사람에게 지금 방의 꾸미기를 알려 줘요
        else if (ev === "roomDeco" && Array.isArray(b.l) && b.lv === LAYOUT_V && +b.v > roomDeco.v) {   /* 옛 버전 화면이 보낸 배치는 받지 않아요 */ const first = !roomDeco.v; roomDeco = { v: +b.v, l: b.l }; api.setLayout(b.l);
          if (!first || b.by) hint(first ? `${String(b.by || "누군가").slice(0, 12)}님의 옥상이에요. 함께 꾸며 보세요.` : `${String(b.by || "누군가").slice(0, 12)}님이 옥상을 꾸몄어요.`); } },
    });
    st.net = mode === "srv"; saveSt(); paintNet("연결하는 중…");
    // 들어가면 '안녕'을 보내 방의 꾸미기를 받아요. 아무도 답이 없으면 내 꾸미기가 이 방의 꾸미기가 돼요
    clearTimeout(helloT); helloT = setTimeout(function hi(k) { if (!net) return; if (!net.isOpen()) { helloT = setTimeout(() => hi(k), 800); return; }
      net.send("hello", {}); helloT = setTimeout(() => { if (net && !roomDeco.v) { roomDeco = { v: 1 + Math.random(), l: api.getLayout() }; sendDeco(); /* 아주 작은 번호: 먼저 있던 방의 꾸미기나 누가 새로 꾸민 게 항상 이겨요 */ } }, 2500); }, 900);
  }
  $$("[data-roof-join]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.roofJoin;
    if (k === "off") { leaveRoom(); st.net = false; saveSt(); paintNet(); return; }
    if (k === "auto") { joinRoom("auto"); return; }
    friendCode = friendCode || Math.random().toString(36).slice(2, 8); joinRoom("friend", friendCode);
    const link = location.origin + location.pathname.replace(/[^/]*$/, "") + "rooftop?room=" + friendCode;
    if (navigator.share) navigator.share({ title: "집감 옥상에서 만나요", text: "같이 불꽃놀이 봐요 🎆", url: link }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => say("초대 링크를 복사했어요", "친구에게 보내 주세요"));
  }));
  $$("[data-roof-emo]").forEach(b => b.addEventListener("click", () => { if (net && net.isOpen()) net.send("emo", { e: b.dataset.roofEmo }); if (api) api.emote(b.dataset.roofEmo); }));
  window.addEventListener("pagehide", () => { if (net) net.leave(); if (lobby) lobby.leave(); });
  if (canNet) { roomBtn.hidden = false; setTimeout(connectLobby, 1500); }
  paintNet();

  // ---------- 3D 장면 시작 ----------
  const hasGL = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } })();
  let actEl = null; const closeAct = () => { if (actEl) { actEl.remove(); actEl = null; } };
  // ---------- 내 영상·음악 (이 기기 안의 파일만, 서버로 올리지 않고 나에게만 재생돼요) ----------
  let myVideo = null, myAudio = null, myURL = [];
  const nowEl = $("[data-roof-nowplay]");
  const paintNow = () => { const v = myVideo && !myVideo.paused, a = myAudio && !myAudio.paused; nowEl.hidden = !(v || a);
    $("[data-roof-nowt]").textContent = v ? "🎬 " + (myVideo.dataset.name || "내 영상") : a ? "🎵 " + (myAudio.dataset.name || "내 음악") : ""; };
  const shortName = f => f.name.replace(/\.[^.]+$/, "").slice(0, 24);
  function stopVideo() { if (myVideo) { myVideo.pause(); myVideo.removeAttribute("src"); myVideo.load(); myVideo = null; } if (api) api.setScreenVideo(null); paintNow(); }
  function stopMusic() { if (myAudio) { myAudio.pause(); myAudio = null; } if (api) api.setMusic(false); paintNow(); }
  $("[data-roof-vidfile]").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (!f || !api) return;
    stopVideo(); const url = URL.createObjectURL(f); myURL.push(url); const v = document.createElement("video"); v.src = url; v.loop = true; v.playsInline = true; v.crossOrigin = "anonymous"; v.dataset.name = shortName(f);
    v.volume = st.sound ? .8 : 0; myVideo = v; v.play().then(() => { api.setScreenVideo(v); paintNow(); say("빔 스크린에 틀었어요", "소파나 빈백에 앉아서 봐요 🍿"); }).catch(() => say("이 영상은 재생할 수 없어요", "mp4 영상으로 해 볼까요?")); });
  $("[data-roof-musfile]").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (!f || !api) return;
    stopMusic(); const url = URL.createObjectURL(f); myURL.push(url); const a = new Audio(url); a.loop = true; a.volume = .7; a.dataset.name = shortName(f); myAudio = a;
    a.play().then(() => { api.setMusic(true); paintNow(); say("스피커로 틀었어요", "🎵 " + a.dataset.name); }).catch(() => say("이 파일은 재생할 수 없어요", "mp3·m4a 음악으로 해 볼까요?")); });
  $("[data-roof-nowstop]").addEventListener("click", () => { stopVideo(); stopMusic(); });
  window.addEventListener("pagehide", () => { stopVideo(); stopMusic(); myURL.forEach(u => URL.revokeObjectURL(u)); });
  const cb = {
    guestbook: () => openGuest(), pickVideo: () => $("[data-roof-vidfile]").click(), pickMusic: () => $("[data-roof-musfile]").click(), stopMusic: () => stopMusic(),
    burst: (...a) => { lastFw = Date.now(); return SND.burst(...a); }, launch: SND.launch, sizzle: SND.sizzle, eat: (kind, name, pts) => { SND.eat(); bump("bbq"); if (box.dataset.focus === "grill") { miniN += pts || 1; $("[data-roof-minin]").textContent = miniN; $("[data-roof-minih]").textContent = pts === 2 ? name + " 완벽하게 구웠어요! ✨ (+2)" : name + " 맛있게 먹었어요 😋 (+1)"; } else say("맛있게 먹었어요", name + " 😋"); },
    cat: () => { SND.meow(); }, say, hint, fire: () => bump("fw"),
    neighbor: () => { hint("이웃도 손을 흔들어 줘요 👋"); },
    starCounted: (n, idx) => {
      st.stars = { d: today, idx }; st.starTotal += 1; saveSt(); bump("star"); SND.star(n); paintCount();
      if (n % 10 === 0) say(`별 ${n}개째`, "별자리가 이어졌어요 ✨");
      if (n === 10) hint("별을 열 개 세었어요. 이제 소원을 빌어 볼까요?");
    },
    moved: s => { if (net) net.sendPos(s); }, fwOut: p => { if (net) net.send("fw", p); }, peerCount: () => paintNet(),
    menu: (pos, acts, pick) => {   // 소품을 누르면 그 옆에 할 수 있는 동작이 떠요
      closeAct(); const el = document.createElement("div"); el.className = "roof-act"; el.setAttribute("role", "menu");
      acts.forEach(x => { const b = document.createElement("button"); b.type = "button"; b.className = "roof-btn"; b.textContent = x.label; b.addEventListener("click", ev => { ev.stopPropagation(); closeAct(); pick(x.id); }); el.append(b); });
      box.append(el); const w = el.offsetWidth, h = el.offsetHeight; el.style.left = clamp(pos.x - w / 2, 8, box.clientWidth - w - 8) + "px"; el.style.top = clamp(pos.y - h - 14, 70, box.clientHeight - h - 130) + "px";
      actEl = el; const away = ev => { if (el.contains(ev.target)) return; document.removeEventListener("pointerdown", away, true); closeAct(); };   // 메뉴 안을 누를 땐 닫지 않아요 (버튼이 눌리기 전에 사라지던 버그)
      setTimeout(() => document.addEventListener("pointerdown", away, true), 0);
    },
    focus: id => {   // 동작을 시작하면 그 동작만 보이게: 아래 버튼은 숨기고 '그만하기'만 남겨요
      const NAMES = { grill: "🍖 고기 굽는 중 · 익으면 눌러서 먹어요", sky: "⭐ 별 세기 · 별을 눌러 보세요", lie: "🛌 누워서 밤하늘 보는 중", tent: "⛺ 텐트 안에서 쉬는 중", table: "☕ 차 마시는 중" };
      if (id === "grill") { miniN = 0; $("[data-roof-minin]").textContent = "0"; $("[data-roof-minih]").textContent = "고기를 올려 보세요"; }
      if (id) box.dataset.focus = id; else delete box.dataset.focus; try { stat(); } catch (e) { /* 준비 전 */ } if (id) closeSheet();   // 빈 값으로 남기면 아래 버튼이 계속 숨어 버려요
      $("[data-roof-lietools]").hidden = !(id === "lie" || id === "tent"); if (id !== "lie" && id !== "tent" && id !== "sky") stopLie(); else if (id === "sky") stopLie(true); $("[data-roof-mini]").hidden = id !== "grill"; $("[data-roof-focus]").hidden = !id || id === "grill"; $("[data-roof-focust]").textContent = NAMES[id] || "";
      if (id === "grill") { closeSubs(); $("[data-roof-sub=grill]").hidden = false; }
      if (!id) { closeSubs(); $$("[data-roof-menu]").forEach(x => x.setAttribute("aria-expanded", "false")); if (counting) { counting = false; paintCount(); } }
    },
    look: dev => { $("[data-roof-reset]").hidden = !dev; if (api) spinBtn.setAttribute("aria-pressed", String(api.getSpin())); },
    seated: on => { $("[data-roof-stand]").hidden = !on; }, meteor: n => { hint("🌠 별똥별을 잡았어요 (" + n + "개) · 소원을 빌어 보세요"); }, layout: l => { if (net && roomDeco.v) { roomDeco = { v: Date.now(), l }; sendDeco(); } else { st.layout = l; saveSt(); } }, /* 방에서는 함께 꾸미기, 혼자일 땐 내 옥상에 저장 */ lie: () => { hint("누워서 밤하늘을 보세요. 별 세기도 해 볼까요?"); }, view: () => { },
    showStart: () => { /* 쇼 시작 */ }, showEnd: () => { hint("멋진 불꽃이었어요. 오늘도 수고했어요."); },
    sky: () => { }, quality: q => { try { if (sessionStorage.getItem("djdex:roofq")) return; sessionStorage.setItem("djdex:roofq", "1"); } catch (e) { /* 그냥 보여 줌 */ } hint("화면이 무거워 보여서 화질을 조금 낮췄어요"); },
  };
  async function boot() {
    if (!hasGL) { $("[data-roof-nogl]").hidden = false; return; }
    try {
      const m = await import("./rooftop3d.js?v=" + (document.querySelector("script[src*='rooftop.js']").src.split("v=")[1] || "1"));
      api = m.start(box, cb, { reduced: calmMQ.matches, nick: st.nick, stars: st.stars.idx, glow: st.glow ?? 20, pets: st.pets || ["dog", "cat"], layout: st.layout, quality: st.q === "auto" ? undefined : st.q });
      api.setSky(st.sky);
      if (pendingTown) pendingTown();
      const inv = new URLSearchParams(location.search).get("room");
      if (canNet && inv && /^[a-z0-9]{4,12}$/.test(inv)) { friendCode = inv; setTimeout(() => { joinRoom("friend", inv); say("친구 방에 들어왔어요", "이모지로 인사해 보세요 👋"); }, 1500); }
      else if (canNet && st.net) setTimeout(() => joinRoom(st.srv ? "srv" : "auto", st.srv), 2500);
      new ResizeObserver(() => api.resize()).observe(box);
    } catch (e) { console.error(e); $("[data-roof-nogl]").hidden = false; return; }
    if (arriveReq) { arriveReq = false; api.arrive(); }
    if (!arriving && arrEl.hidden && !st.tour && !box.classList.contains("touring")) setTimeout(() => startTour(), 1200);   // 인사 중이면 인사가 끝난 뒤에
  }
  // 정각 불꽃놀이: 열어 둔 동안 정각이 되면 한바탕
  let lastHour = "";
  setInterval(() => { const d = new Date(), k = ymd(d) + d.getHours(); if (d.getMinutes() === 0 && st.hour && api && lastHour !== k && !document.hidden) { lastHour = k; say("정각 불꽃놀이", "고개를 들어 보세요 🎆"); api.show(+(ymd(d).replace(/-/g, "") + String(d.getHours()).padStart(2, "0"))); } }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (api) api.pause(); if (A.c && !st.bg) A.c.suspend(); }
    else { if (api) api.resume(); if (A.c && st.sound) A.c.resume(); }
  });
  // 새로 들어올 때마다 (같은 창에서 새로 고친 건 빼고) 인사부터. 친구 초대 링크로 온 사람도 같아요
  let seenArr = false; try { seenArr = !!sessionStorage.getItem("djdex:roofarr"); } catch (e) { /* 보여 줘요 */ }
  if (st.arrive && !seenArr) showArrive();
  if (st.sound && !arriving) {   // 이전에 소리를 켜 뒀어도, 브라우저 규칙상 처음 누를 때부터 시작
    const once = () => { setSound(true); box.removeEventListener("pointerdown", once, true); };
    box.addEventListener("pointerdown", once, true);
  }
  paintMissions(); paintSettings(); paintCount(); paintWish();
  boot();
  box.dataset.ready = "1";
})();
