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
  const hintEl = $("[data-roof-hint]"); let hintT = 0;
  function hint(t) { hintEl.textContent = t; hintEl.classList.add("on"); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove("on"), 5200); }
  const subs = $$("[data-roof-sub]");
  const closeSubs = () => { subs.forEach(s => { s.hidden = true; }); $$("[data-roof-menu]").forEach(x => x.setAttribute("aria-expanded", "false")); };
  $("[data-roof-exit]").addEventListener("click", () => { if (api) api.setFocus(null); });
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
  let actEl = null; const closeAct = () => { if (actEl) { actEl.remove(); actEl = null; } };
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
    menu: (pos, acts, pick) => {   // 소품을 누르면 그 옆에 할 수 있는 동작이 떠요
      closeAct(); const el = document.createElement("div"); el.className = "roof-act"; el.setAttribute("role", "menu");
      acts.forEach(x => { const b = document.createElement("button"); b.type = "button"; b.className = "roof-btn"; b.textContent = x.label; b.addEventListener("click", ev => { ev.stopPropagation(); closeAct(); pick(x.id); }); el.append(b); });
      box.append(el); const w = el.offsetWidth, h = el.offsetHeight; el.style.left = clamp(pos.x - w / 2, 8, box.clientWidth - w - 8) + "px"; el.style.top = clamp(pos.y - h - 14, 70, box.clientHeight - h - 130) + "px";
      actEl = el; setTimeout(() => document.addEventListener("pointerdown", closeAct, { once: true }), 0);
    },
    focus: id => {   // 동작을 시작하면 그 동작만 보이게: 아래 버튼은 숨기고 '그만하기'만 남겨요
      const NAMES = { grill: "🍖 고기 굽는 중 · 익으면 눌러서 먹어요", sky: "⭐ 별 세기 · 별을 눌러 보세요", lie: "🛌 누워서 밤하늘 보는 중", tent: "⛺ 텐트 안에서 쉬는 중", table: "☕ 차 마시는 중" };
      box.dataset.focus = id || ""; $("[data-roof-focus]").hidden = !id; $("[data-roof-focust]").textContent = NAMES[id] || "";
      if (id === "grill") { closeSubs(); $("[data-roof-sub=grill]").hidden = false; }
      if (!id) { closeSubs(); $$("[data-roof-menu]").forEach(x => x.setAttribute("aria-expanded", "false")); if (counting) { counting = false; paintCount(); } }
    },
    look: dev => { $("[data-roof-reset]").hidden = !dev; },
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
