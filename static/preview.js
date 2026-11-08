(function () {
'use strict';
const S = window.DJShadow, C = window.PVCalc, ISO = window.PVIso;
let META = null;      // 이 단지 정보 (loadComplex 가 채움)
let LIST = null;      // 미리보기가 열린 단지 목록
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = C.kstToday();
const DATES = [
  { key: 'dec', name: '동지', date: { year: today.year, month: 12, day: 21 } },
  { key: 'jun', name: '하지', date: { year: today.year, month: 6, day: 21 } },
  { key: 'today', name: '오늘', date: today },
];
const dtxt = d => d.month + '월 ' + d.day + '일';
const NO_LABEL = { sun: '직사광이 닿을 가능성이 있음', shade: '앞 동에 가려짐', back: '해가 이 면의 반대쪽에 있어 닿지 않음', night: '해가 지평선 근처이거나 아래에 있음' };
const DJ_calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIEWS = [['iso', '입체'], ['plan', '평면'], ['floor', '층별']];

const st = { cid: null, tid: null, fl: 1, dk: 'dec', t: 750, wide: false, view: 'iso' };
const cache = {};          // 단지 자료
const memo = {};           // 계산 결과(조건마다 한 번만): 날짜를 바꾸거나 시각을 옮길 때 다시 계산하지 않는다
let ctx = null, view = null;

// ---------- 자료 읽기 ----------
function loadComplex(id) {
  if (cache[id]) return Promise.resolve(cache[id]);
  return fetch('preview/' + encodeURIComponent(id) + '.json').then(r => { if (!r.ok) throw new Error('자료 파일'); return r.json(); })
    .then(doc => { const c = C.prepare(C.fromDoc(doc)); c.m = doc.m; return (cache[id] = c); });
}
function loadList() {
  return LIST ? Promise.resolve(LIST) : fetch('preview/list.json').then(r => r.json()).then(l => (LIST = l));
}

// ---------- 계산 (기존 계산 그대로, 필요한 날짜만 한 번씩) ----------
function curDate() { return DATES.find(d => d.key === st.dk).date; }
function mk(tid, fl, dk) { return st.cid + '|' + tid + '|' + fl + '|' + dk; }
function getSlots(dk, tid, fl) {
  tid = tid || st.tid; fl = fl || st.fl; const k = mk(tid, fl, dk);
  return memo[k] || (memo[k] = (() => { const s = C.run(ctx, tid, fl, DATES.find(d => d.key === dk).date); return { slots: s, sum: C.summarize(ctx, s) }; })());
}
const getSum = (dk, tid, fl) => getSlots(dk, tid, fl).sum;
const slotNow = () => getSlots(st.dk).slots[Math.round((st.t - C.START) / C.STEP)];
function tgt() { return ctx.byId[st.tid]; }
function ownDongs() { return ctx.items.filter(b => b.k === 'own' && C.calcable(b)).sort((a, b) => (+C.dongNo(a.dn)) - (+C.dongNo(b.dn))); }

function pickDefault() {
  const own = ownDongs(); let best = null;
  for (const b of own) {
    const fl = Math.max(1, Math.round(b.f / 3));
    const sm = C.summarize(ctx, C.run(ctx, b.id, fl, DATES[0].date));
    if (sm.shadeMin > 0 && (!best || sm.shadeMin > best.s)) best = { b, fl, s: sm.shadeMin };
  }
  return best ? { tid: best.b.id, fl: best.fl } : { tid: own[0].id, fl: Math.max(1, Math.round(own[0].f / 3)) };
}

// ---------- 조건(단지·동·층·날짜) ----------
function chipHTML(label, pressed, extra, data) {
  return '<button type="button" class="chip" aria-pressed="' + pressed + '" ' + data + '>' + esc(label) + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</button>';
}
function segHTML(items, cur, attr) {
  return items.map(i => '<button type="button" aria-pressed="' + (i.key === cur) + '" ' + attr + '="' + i.key + '">' + esc(i.name) + (i.sub ? '<small>' + esc(i.sub) + '</small>' : '') + '</button>').join('');
}
function drawControls() {
  const m = ctx.m;
  $('cx').innerHTML = '<b class="cxn">' + esc(m.name || '이 단지') + '</b><span class="cxs">동 ' + m.n_own + '개</span>' +
    '<button type="button" class="cxl cxsave" id="saveFav" aria-pressed="false"></button><button type="button" class="cxl" data-pick>바꾸기</button>';
  const box = $('dong'), keep = box.scrollLeft;
  box.innerHTML = ownDongs().map(b => chipHTML(C.dongNo(b.dn) + '동', b.id === st.tid, '', 'data-dong="' + b.id + '" aria-label="' + C.dongNo(b.dn) + '동, ' + b.f + '층 건물"')).join('');
  const on = box.querySelector('[aria-pressed="true"]');
  if (on) {                                   // 고른 동이 칩 줄 가운데 오게 (페이지는 움직이지 않음)
    const want = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
    box.scrollLeft = (box.dataset.ready ? Math.abs(want - keep) < 4 : false) ? keep : Math.max(0, want);
  }
  box.dataset.ready = '1';
  if (on && !box.dataset.centered) { box.dataset.centered = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { const w2 = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2; if (box.clientWidth) box.scrollLeft = Math.max(0, w2); })); }   // 처음 그릴 때는 칸 너비가 0일 수 있어 한 번 더
  $('date').innerHTML = segHTML(DATES.map(d => ({ key: d.key, name: d.name })), st.dk, 'data-date');
  $('seg-view').innerHTML = segHTML(VIEWS.map(v => ({ key: v[0], name: v[1] })), st.view, 'data-view');
  drawFloor();
  drawSave();
}
function drawFloor() {
  const b = tgt(), el = $('floor');
  el.max = b.f; el.min = 1; el.value = st.fl;
  const fh = C.baseFh(ctx, b), z = (st.fl - 0.5) * fh;
  $('floorBtn').innerHTML = '<b>' + st.fl + '층</b><small>/ ' + b.f + '층</small>';
  $('floorBtn').setAttribute('aria-label', st.fl + '층, 전체 ' + b.f + '층. 눌러서 층 목록 열기');
  el.setAttribute('aria-valuetext', st.fl + '층, 지상 약 ' + z.toFixed(0) + '미터');
  $('fup').disabled = st.fl >= b.f; $('fdn').disabled = st.fl <= 1;
}
function onFloor() {                           // 층만 바뀔 때: 동·날짜 칩은 다시 그리지 않음
  drawFloor(); drawResult(); drawBar(); drawView(); drawFold(); scheduleCompare(); drawSave();
}
function openFloorSheet() {
  const d = $('floorSheet'), b = tgt(); let g = '';
  for (let f = b.f; f >= 1; f--) g += '<button type="button" class="fcell" data-fl="' + f + '" aria-pressed="' + (f === st.fl) + '">' + f + '</button>';
  $('floorGrid').innerHTML = g;
  $('fs-t').textContent = C.label(b) + ' · 몇 층 창으로 볼까요? (1~' + b.f + '층)';
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  const on = $('floorGrid').querySelector('[aria-pressed="true"]'); if (on) { on.scrollIntoView({ block: 'center' }); on.focus({ preventScroll: true }); }
}

// ---------- 핵심 요약 ----------
function rangeTxt(r) { return C.minToHM(r.start) + ' ~ ' + C.minToHM(r.end); }
function drawResult() {
  const g = getSlots(st.dk), sm = g.sum, d = DATES.find(x => x.key === st.dk), b = tgt();
  const head = C.label(b) + ' ' + st.fl + '층 · ' + d.name + ' (' + dtxt(d.date) + ')';
  const top = sm.blockers[0];
  let h = '<h2 id="h-res" class="sr-only">' + esc(head) + '</h2>';
  h += '<div class="st-row"><p class="big">약 ' + C.durText(sm.sunMin) + '</p><div class="st-id"><b>' + esc(C.label(b)) + ' ' + st.fl + '층</b><span>' + d.name + ' ' + d.date.month + '/' + d.date.day + ' · 직사광 · 추정</span></div></div>';
  h += '<div class="st-side"><p class="when">' + (sm.sunRanges.length ? sm.sunRanges.map(r => '<span class="nowrap">' + rangeTxt(r) + '</span>').join(', ') : '닿는 시간대 없음') + '</p>';
  h += '<p class="st-blk">' + (top ? '가장 크게 가리는 동 <b>' + esc(top.label) + '</b>' : '앞 동에 가리는 시간 없음') + '</p></div>';
  $('result').innerHTML = h;
  let m = '<dl class="facts">';
  m += '<div><dt>앞 동에 가려지는 시간</dt><dd>' + (sm.shadeMin ? '약 ' + C.durText(sm.shadeMin) + (sm.shadeRanges.length ? '<small>' + sm.shadeRanges.map(rangeTxt).join(', ') + '</small>' : '') : '계산되지 않았어요') + '</dd></div>';
  if (sm.blockers.length) m += '<div><dt>가장 크게 가리는 동</dt><dd>' + esc(top.label) + ' <small>약 ' + C.durText(top.min) + ' · ' + C.SRC_LABEL[top.src] + '</small></dd></div>';
  if (sm.backMin) m += '<div><dt>해가 벽 반대편이라 닿지 않는 시간</dt><dd>약 ' + C.durText(sm.backMin) + '</dd></div>';
  m += '</dl>';
  if (sm.blockers.length > 1) m += '<ul class="plain">' + sm.blockers.map(x => '<li><strong>' + esc(x.label) + '</strong> 약 ' + C.durText(x.min) + ' (' + x.ranges.map(rangeTxt).join(', ') + ') · 높이 ' + x.h.toFixed(1) + ' m (' + C.SRC_LABEL[x.src] + ')</li>').join('') + '</ul>';
  m += '<p><a href="apt/' + encodeURIComponent(st.cid) + '.html">이 단지 상세 보기</a></p>';
  $('resultMore').innerHTML = m;
}
function drawCompare() {
  const rows = DATES.map(x => {
    const s = getSum(x.key);
    return '<tr' + (x.key === st.dk ? ' class="cur" aria-current="true"' : '') + '><td>' + x.name + '<br><small>' + dtxt(x.date) + '</small></td><td>약 ' + C.durText(s.sunMin) + '</td><td>' +
      (s.blockers.length ? s.blockers.slice(0, 3).map(y => esc(y.label)).join(', ') + (s.blockers.length > 3 ? ' 외 ' + (s.blockers.length - 3) + '동' : '') : '없음') + '</td></tr>';
  }).join('');
  $('cmp').innerHTML = '<h2 id="h-cmp">날짜별로 견주기</h2><table><thead><tr><th scope="col">날짜</th><th scope="col">직사광 가능 시간(추정)</th><th scope="col">가리는 동</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="hint">같은 동·같은 층으로 계산한 값이에요. 15분 칸으로 세어서 15분 단위로만 나와요.</p>';
}
let cmpTimer = 0;
function scheduleCompare() {              // 첫 화면을 먼저 그리고, 나머지 두 날짜 계산은 한숨 돌린 뒤에 한다(자리는 미리 잡아 둠)
  clearTimeout(cmpTimer);
  const run = () => { if (ctx) drawCompare(); };
  cmpTimer = setTimeout(() => { (window.requestIdleCallback || (f => f()))(run, { timeout: 600 }); }, 60);
}


// ---------- 시간대 막대 ----------
function drawBar() {
  const g = getSlots(st.dk), sl = g.slots, sm = g.sum;
  $('cells').innerHTML = sl.map(s => '<span class="cell ' + s.state + '"></span>').join('');
  $('ticks').innerHTML = [6, 9, 12, 15, 18].map(h => '<span style="left:' + ((h * 60 - C.START) / (C.END - C.START) * 100) + '%">' + h + '시</span>').join('');
  $('legend1').innerHTML = '<li><span class="sw sun"></span>직사광 가능</li><li><span class="sw shade"></span>앞 동에 가림</li><li><span class="sw back"></span>해가 벽 반대편</li><li><span class="sw night"></span>해가 없음</li>';
  const parts = ['시간대 막대 ' + C.minToHM(C.START) + '부터 ' + C.minToHM(C.END) + '까지, 15분 간격.'];
  parts.push('직사광 가능 ' + (sm.sunRanges.length ? sm.sunRanges.map(rangeTxt).join(', ') : '없음') + '.');
  parts.push('앞 동에 가림 ' + (sm.shadeRanges.length ? sm.shadeRanges.map(rangeTxt).join(', ') : '없음') + '.');
  $('cells').setAttribute('role', 'img'); $('cells').setAttribute('aria-label', parts.join(' '));
  drawMarker();
}
function drawMarker() { /* 시각 표시는 슬라이더 손잡이가 맡음 */ }

// ---------- 입체(2.5D) ----------
function isoOpts() {
  const sm = getSum(st.dk), slot = slotNow(), b = tgt(), fh = C.baseFh(ctx, b), z = (st.fl - 0.5) * fh;
  const sun = { alt: slot.alt, az: slot.az, up: slot.alt > 1 };
  const blds = (ctx._v && ctx._v[st.tid]) || ((ctx._v = ctx._v || {})[st.tid] = C.variant(ctx, st.tid).blds);
  const fi = C.faceInfo(ctx, st.tid);
  const nowIds = new Set(slot.state === 'shade' ? slot.by : []), blockIds = new Set(sm.blockers.map(x => x.id));
  const ray = ISO.ray(fi, z, slot, blds, st.tid);
  return { items: ctx.calc, tid: st.tid, fl: st.fl, fh, sun, state: slot.state, blockIds, nowIds, fitIds: sm.blockers.slice(0, 3).map(x => x.id), fi, ray, wide: st.wide,
           label: C.label, num: bb => (C.dongNo(bb.dn) ? C.dongNo(bb.dn) + '동' : ''), SRC: bb => C.SRC_LABEL[bb.src], calcable: C.calcable };
}
let vbNow = null, vbRaf = 0;
function setVB(svg, v) {                      // 이전 시점에서 새 시점으로 240ms 동안 이동(보이는 부분만 바뀌고 계산은 그대로)
  cancelAnimationFrame(vbRaf);
  const fmt = a => a.map(n => n.toFixed(2)).join(' '), to = [v.x, v.y, v.w, v.h], from = vbNow;
  vbNow = to;
  if (!st.cam || !from || DJ_calm() || Math.abs(from[2] - to[2]) + Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) < 1) { svg.setAttribute('viewBox', fmt(to)); st.cam = false; return; }
  st.cam = false; const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / 240), e = 1 - Math.pow(1 - k, 3); svg.setAttribute('viewBox', fmt(from.map((f, i) => f + (to[i] - f) * e))); if (k < 1) vbRaf = requestAnimationFrame(step); };
  vbRaf = requestAnimationFrame(step);
}
function drawIso() {
  const svg = $('iso'), o = isoOpts(), rw = svg.clientWidth || 358, rh = svg.clientHeight || 358;
  const v = ISO.bounds(o, rw / rh);
  const nNA = ctx.excluded.length;
  setVB(svg, v);
  svg.innerHTML = '<title id="isoTitle">' + esc(C.label(tgt())) + ' ' + st.fl + '층에서 본 입체 그림</title>' +
    '<desc id="isoDesc">남쪽 위에서 바라본 고정 시점의 입체 그림입니다. 파란 건물이 선택한 동이고 노란 띠가 고른 층이며, 주황 건물은 하루 중 햇빛을 가리는 앞 동입니다. 고른 층의 창에서 해 쪽으로 그은 선이 앞 동에 닿아 엑스 표시가 되면 그 시각에는 가려진다는 뜻입니다. 높이 자료가 없는 건물 ' + nNA + '개는 그리지 않았습니다. 실제 건물 모양이나 실내로 드는 햇빛이 아닙니다.</desc>' + ISO.render(o, v, rw);
  wireBuildings(svg);
}
// 건물 고르기: 터치와 키보드가 같은 길을 쓴다. 고를 수 없는 건물은 이유를 알려 준다(조용히 무시하지 않음).
function whyNot(g) {
  if (g.classList.contains('iso-oth')) return '다른 단지·다른 건물이에요. 이 단지의 동만 고를 수 있어요.';
  if (g.classList.contains('iso-blk')) return '내 동 앞에서 그림자를 만드는 건물이에요. 동은 위쪽 동 번호에서 고를 수 있어요.';
  return '높이 자료가 없어 이 건물은 계산하지 않았어요.';
}
function wireBuildings(svg) {
  svg.querySelectorAll('g.iso-b').forEach(g => {
    const id = g.getAttribute('data-b'), bb = id && ctx.byId[id];
    if (bb) {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.setAttribute('aria-label', C.label(bb) + ' ' + bb.f + '층 건물' + (id === st.tid ? ', 지금 고른 동' : '. 누르면 이 동으로 바꿔요'));
      const pick = () => { if (id !== st.tid) { select(id); const n = $('iso').querySelector('[data-b="' + id + '"]'); if (n) n.focus({ preventScroll: true }); } };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    } else {
      g.addEventListener('click', () => { if (window.DJ && DJ.toast) DJ.toast('이 건물은 고를 수 없어요', whyNot(g), 2600); });
    }
  });
}

function drawState() {
  const slot = slotNow(), d = curDate();
  const names = slot.state === 'shade' ? slot.by.map(id => ctx.byId[id].label) : [];
  const el = $('state'); el.className = 'state ' + slot.state;
  el.textContent = C.minToHM(st.t) + ' · ' + (slot.state === 'shade' ? names.join(', ') + '에 가려짐' : NO_LABEL[slot.state]) + (slot.alt > 0 ? ' · ' + C.dirName(slot.az) + '쪽 해 ' + Math.round(slot.alt) + '°' : '');
  $('timeVal').textContent = ': ' + C.minToHM(st.t) + ' (' + dtxt(d) + ')';
  $('time').setAttribute('aria-valuetext', C.minToHM(st.t) + ', ' + (slot.state === 'shade' ? '앞 동에 가려짐' : NO_LABEL[slot.state]));
}
const CAP = {
  iso: '남쪽 위에서 본 고정 시점의 입체 그림이에요. 고른 층의 창에서 해 쪽으로 그은 선이 앞 동에 닿아 ✕ 가 되면 그 시각엔 가려진 거예요. 높이가 있는 건물 모양만 단순하게 그렸고 실제 건물 모양은 아니에요.',
  plan: '위에서 내려다본 평면도예요(북쪽이 위). 줄무늬는 가리는 동이 선택한 시각에 만드는 그림자예요.',
  floor: '같은 동을 층마다 계산해 색으로 나타냈어요. 층을 누르면 위 결과가 그 층으로 바뀌어요.',
};
function drawView() {
  const v = st.view;
  ['iso', 'plan', 'floor'].forEach(k => { $('vp-' + k).hidden = k !== v; });
  $('vtime').hidden = v === 'floor';
  $('zoom').hidden = v === 'floor';
  $('vcap').textContent = CAP[v];
  $('seg-view').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  if (v === 'floor') { drawTower(); return; }
  drawState();
  if (v === 'iso') drawIso(); else drawPlan();
  $('legend2').innerHTML = v === 'iso'
    ? '<li><span class="sw me"></span>내 동</li><li><span class="sw band"></span>고른 층</li><li><span class="sw front"></span>하루 중 가리는 앞 동</li><li><span class="sw oth"></span>다른 건물</li><li><span class="sw cross"></span>가려지는 지점</li>'
    : '<li><span class="sw me"></span>내 동</li><li><span class="sw front"></span>하루 중 가리는 앞 동</li><li><span class="sw sh"></span>선택한 시각의 그림자</li><li><span class="sw na"></span>분석 자료 없음</li>';
}

// ---------- 층별 햇빛 (층별 시세 건물 그림과 같은 모양) ----------
const TW_TONES = [['1시간 미만', m => m < 60], ['1~2시간', m => m < 120], ['2~3시간', m => m < 180], ['3~4시간', m => m < 240], ['4시간 넘게', () => true]];
const twTone = m => TW_TONES.findIndex(t => t[1](m));
const twCache = {};
function twFloors() {
  const b = tgt(), key = st.cid + '|' + st.tid + '|' + st.dk;
  if (twCache[key]) return twCache[key];
  const d = curDate(), out = [];
  for (let f = 1; f <= b.f; f++) out.push({ f, min: C.summarize(ctx, C.run(ctx, st.tid, f, d)).sunMin });
  return (twCache[key] = out);
}
function drawTower() {
  const b = tgt(), box = $('tower'), dn = DATES.find(x => x.key === st.dk);
  const fl = twFloors(), top = b.f;
  const hh = Math.max(6, Math.min(16, Math.floor(320 / top))), W = 112, Dx = 34, Dy = 17, L = 34, R = 56;
  const H = top * hh, y0 = Dy + 6, base = y0 + H, NSV = 'http://www.w3.org/2000/svg';
  let g = '', lastY = -1e9;
  fl.forEach(x => {
    const y = base - x.f * hh, t = twTone(x.min), sel = x.f === st.fl;
    g += '<g class="tw-row' + (sel ? ' tw-sel' : '') + '" data-tw="' + x.f + '" role="button" tabindex="0" aria-label="' + x.f + '층, ' + dn.name + ' 직사광 약 ' + C.durText(x.min) + (sel ? ', 지금 고른 층' : '') + '"><title>' + x.f + '층 · ' + dn.name + ' 약 ' + C.durText(x.min) + '</title>' +
      '<rect class="tw-front tw-t' + t + '" x="' + L + '" y="' + y + '" width="' + W + '" height="' + hh + '"/>' +
      '<polygon class="tw-side tw-t' + t + '" points="' + (L + W) + ',' + y + ' ' + (L + W + Dx) + ',' + (y - Dy) + ' ' + (L + W + Dx) + ',' + (y - Dy + hh) + ' ' + (L + W) + ',' + (y + hh) + '"/></g>';
    if (x.f === 1 || x.f === top || x.f % 5 === 0 || sel) g += '<text class="tw-lab" x="' + (L - 6) + '" y="' + (y + hh / 2 + 4) + '" text-anchor="end">' + x.f + '층</text>';
    const vy = y - Dy / 2 + hh / 2 + 4;
    if ((sel || x.f === 1 || x.f === top || x.f % 5 === 0) && hh >= 9 && Math.abs(vy - lastY) >= 13) { g += '<text class="tw-val" x="' + (L + W + Dx + 6) + '" y="' + vy + '">' + C.durText(x.min) + '</text>'; lastY = vy; }
  });
  const svg = '<svg class="tw-svg" viewBox="0 0 ' + (L + W + Dx + R) + ' ' + (base + 18) + '" role="group" aria-label="' + esc(C.label(b)) + ' ' + top + '층 건물의 층별 직사광 시간(' + dn.name + ' 기준, 추정). 밝은 노랑일수록 오래 닿고 어두운 남색일수록 짧게 닿아요.">' +
    '<ellipse cx="' + (L + (W + Dx) / 2) + '" cy="' + (base + 6) + '" rx="' + ((W + Dx) / 1.6) + '" ry="8" class="tw-shadow"/>' + g +
    '<polygon class="tw-roof" points="' + L + ',' + y0 + ' ' + (L + W) + ',' + y0 + ' ' + (L + W + Dx) + ',' + (y0 - Dy) + ' ' + (L + Dx) + ',' + (y0 - Dy) + '"/></svg>';
  const best = fl.reduce((a, x) => (x.min > a.min ? x : a), fl[0]), worst = fl.reduce((a, x) => (x.min < a.min ? x : a), fl[0]);
  const spread = best.min - worst.min;
  let side = '<p class="tw-sum">' + (spread >= 15 ? '층에 따라 최대 약 ' + C.durText(spread) + ' 차이' : '층에 따른 차이가 거의 없어요') + ' <span style="font-size:16px;font-weight:600">(추정)</span></p>';
  side += '<p class="hint" style="margin:0 0 6px">' + dn.name + '(' + dtxt(dn.date) + ') 기준 직사광이 닿을 가능성이 있는 시간이에요. 층을 누르면 위 결과가 그 층으로 바뀌어요.</p>';
  side += '<div>' + TW_TONES.map((t, i) => '<span class="tw-key"><i class="tw-sw tw-t' + i + '"></i>' + t[0] + '</span>').join('') + '</div>';
  side += '<ul class="tw-list"><li><span>가장 많이 드는 층</span><b>' + best.f + '층 · 약 ' + C.durText(best.min) + '</b></li><li><span>가장 적게 드는 층</span><b>' + worst.f + '층 · 약 ' + C.durText(worst.min) + '</b></li><li><span>지금 고른 층</span><b>' + st.fl + '층 · 약 ' + C.durText(fl[st.fl - 1].min) + '</b></li></ul>';
  box.innerHTML = '<div class="twbox"><figure style="margin:0">' + svg + '</figure><div>' + side + '</div></div>' +
    '<p class="hint">' + esc(C.label(b)) + ' 한 동만 같은 방식으로 층마다 계산했어요. 앞 동과 건물 높이 자료가 달라지면 색도 달라져요. 실내 채광이나 법적 일조권이 아니에요.</p>';
  box.querySelectorAll('[data-tw]').forEach(el => {
    const pick = () => { st.fl = +el.getAttribute('data-tw'); fullRender(); writeHash(); const n = $('tower').querySelector('[data-tw="' + st.fl + '"]'); if (n) n.focus({ preventScroll: true }); };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}


// ---------- 평면도 ----------
const NS = 'http://www.w3.org/2000/svg';
function polyPts(p) { return p.map(q => q[0].toFixed(1) + ',' + (-q[1]).toFixed(1)).join(' '); }
function centroid(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
function computeView(svg) {
  const sm = getSum(st.dk); let pts = [];
  const add = b => { for (const q of b.rect === b.poly ? b.poly : b.poly) pts.push(q); };
  if (st.wide) { const R = 255; pts = [[-R, -R], [R, R]]; }
  else {
    for (const q of tgt().rect) pts.push(q);
    for (const bl of sm.blockers.slice(0, 3)) add(ctx.byId[bl.id]);
    if (pts.length < 6) pts.push([-40, -40], [40, 40]);
  }
  let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const pad = st.wide ? 0 : 38; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const rw = svg.clientWidth || 358, rh = svg.clientHeight || 358, asp = rw / rh;
  let w = x1 - x0, h = y1 - y0; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const minW = 150; if (w < minW) w = minW; if (h < minW / asp) h = minW / asp;
  if (w / h < asp) w = h * asp; else h = w / asp;
  return { x: cx - w / 2, y: -(cy + h / 2), w, h, k: w / rw };   // y: SVG 좌표(북이 위 = -y)
}
function drawPlan() {
  const svg = $('plan'), sm = getSum(st.dk), slot = slotNow(), d = curDate();
  view = computeView(svg);
  const k = view.k, fs = 14 * k;
  const sun = { alt: slot.alt, az: slot.az, up: slot.alt > 1 };
  const blockIds = new Set(sm.blockers.map(b => b.id)), nowIds = new Set(slot.state === 'shade' ? slot.by : []);
  let s = '<title id="planTitle">' + esc(C.label(tgt())) + ' ' + st.fl + '층 주변의 위에서 본 평면도</title>';
  s += '<desc id="planDesc">북쪽이 위쪽입니다. 파란 건물이 선택한 동이고, 주황 테두리 건물이 하루 중 햇빛을 가리는 앞 동입니다. 줄무늬 영역은 가리는 동이 선택한 시각에 만드는 그림자이고, 점선 회색 건물은 분석 자료가 없는 건물입니다.</desc>';
  s += '<defs>' +
    '<pattern id="pShadow" patternUnits="userSpaceOnUse" width="' + 7 * k + '" height="' + 7 * k + '" patternTransform="rotate(45)"><rect width="' + 7 * k + '" height="' + 7 * k + '" fill="rgba(68,86,106,.16)"/><rect width="' + 2.2 * k + '" height="' + 7 * k + '" fill="rgba(68,86,106,.62)"/></pattern>' +
    '<pattern id="pNA" patternUnits="userSpaceOnUse" width="' + 6 * k + '" height="' + 6 * k + '"><rect width="' + 6 * k + '" height="' + 6 * k + '" fill="#e6e8eb"/><circle cx="' + 3 * k + '" cy="' + 3 * k + '" r="' + 0.9 * k + '" fill="#8b95a1"/></pattern>' +
    '<pattern id="pFront" patternUnits="userSpaceOnUse" width="' + 8 * k + '" height="' + 8 * k + '" patternTransform="rotate(-45)"><rect width="' + 8 * k + '" height="' + 8 * k + '" fill="#fbdcb8"/><rect width="' + 2.4 * k + '" height="' + 8 * k + '" fill="#f1b172"/></pattern>' +
    '</defs>';
  // 그림자 (선택한 시각)
  if (sun.up && sun.alt >= 1) {
    for (const b of ctx.calc) {
      if (!blockIds.has(b.id)) continue;                       // 가리는 동의 그림자만 그린다(그림이 너무 빽빽해지는 것을 막음)
      const sp = S.shadowPoly({ poly: b.poly, h: b.h, f: b.f }, sun);
      if (sp) s += '<polygon points="' + polyPts(sp) + '" fill="url(#pShadow)" opacity="' + (nowIds.has(b.id) ? 1 : .45) + '" stroke="none"/>';
    }
  }
  // 건물: 자료 없음 -> 일반 -> 앞 동 -> 내 동 순서로 위에 쌓는다
  const na = ctx.excluded, norm = ctx.calc.filter(b => b.id !== st.tid && !blockIds.has(b.id)), fronts = ctx.calc.filter(b => blockIds.has(b.id) && b.id !== st.tid);
  for (const b of na) s += '<polygon points="' + polyPts(b.poly) + '" fill="url(#pNA)" stroke="#6d7783" stroke-width="' + 1.4 * k + '" stroke-dasharray="' + 4 * k + ' ' + 3 * k + '"><title>' + esc(C.label(b)) + ': 분석 자료 없음' + (b.st === 'unknown' ? ' (소속 불명)' : '') + '</title></polygon>';
  for (const b of norm) s += '<polygon points="' + polyPts(b.poly) + '" fill="' + (b.k === 'own' ? '#c4d4e6' : '#dde3e9') + '" stroke="#6d7783" stroke-width="' + 1.1 * k + '" data-b="' + b.id + '"' + (b.k === 'own' ? ' style="cursor:pointer"' : '') + '><title>' + esc(C.label(b)) + ' ' + b.f + '층 · ' + (b.h ? b.h.toFixed(1) + ' m' : '') + ' · ' + C.SRC_LABEL[b.src] + '</title></polygon>';
  for (const b of fronts) s += '<polygon points="' + polyPts(b.poly) + '" fill="url(#pFront)" stroke="#b45309" stroke-width="' + (nowIds.has(b.id) ? 4.2 : 2.2) * k + '" ' + (nowIds.has(b.id) ? '' : 'stroke-dasharray="' + 6 * k + ' ' + 3 * k + '"') + ' data-b="' + b.id + '"><title>' + esc(C.label(b)) + ': 하루 중 가리는 동 (' + b.f + '층, ' + b.h.toFixed(1) + ' m, ' + C.SRC_LABEL[b.src] + ')</title></polygon>';
  const t = tgt();
  s += '<polygon points="' + polyPts(t.poly) + '" fill="#17508f" stroke="#0a2f57" stroke-width="' + 2.5 * k + '"><title>선택한 동 ' + esc(C.label(t)) + '</title></polygon>';
  // 관측점과 해 쪽 선
  const fi = C.faceInfo(ctx, st.tid), px = fi.cx, py = fi.cy;
  const ux = Math.sin(slot.az * Math.PI / 180), uy = Math.cos(slot.az * Math.PI / 180);
  // 남쪽 면 표시(굵은 노랑 선) + 관측점
  const f0 = fi.a, len = fi.len, f1 = [f0[0] + fi.ex * len, f0[1] + fi.ey * len];
  s += '<line x1="' + (f0[0] + fi.nx * 0.3) + '" y1="' + -(f0[1] + fi.ny * 0.3) + '" x2="' + (f1[0] + fi.nx * 0.3) + '" y2="' + -(f1[1] + fi.ny * 0.3) + '" stroke="#f5b21a" stroke-width="' + 4 * k + '" stroke-linecap="butt"/>';
  s += '<circle cx="' + px + '" cy="' + -py + '" r="' + 5 * k + '" fill="#fff" stroke="#15212c" stroke-width="' + 2 * k + '"/>';
  if (sun.up) {
    const L = 60 * k; s += '<line x1="' + px + '" y1="' + -py + '" x2="' + (px + ux * L) + '" y2="' + -(py + uy * L) + '" stroke="#c1121f" stroke-width="' + 2.4 * k + '" stroke-dasharray="' + 5 * k + ' ' + 3 * k + '"/>';
    const ex = px + ux * L, ey = -(py + uy * L), a = Math.atan2(-uy, ux), ah = 9 * k;
    s += '<polygon points="' + ex + ',' + ey + ' ' + (ex - ah * Math.cos(a - .45)) + ',' + (ey - ah * Math.sin(a - .45)) + ' ' + (ex - ah * Math.cos(a + .45)) + ',' + (ey - ah * Math.sin(a + .45)) + '" fill="#c1121f"/>';
    s += '<text class="" x="' + (ex + ux * 6 * k) + '" y="' + (ey - uy * 6 * k) + '" font-size="' + fs + '" font-weight="800" fill="#c1121f" text-anchor="middle" dominant-baseline="middle">해</text>';
  }
  // 이름표: 동 번호만(단지 이름은 위 칩에 있음). 글씨에 흰 테두리를 둘러 도형·무늬 위에서도 읽힌다.
  const inView = c => c[0] > view.x + 8 * k && c[0] < view.x + view.w - 8 * k && -c[1] > view.y + 8 * k && -c[1] < view.y + view.h - 8 * k;
  const txt = (c, t, size, fill, dy, w) => '<text x="' + c[0].toFixed(1) + '" y="' + (-c[1] + dy).toFixed(1) + '" font-size="' + size + '" font-weight="' + (w || 800) + '" text-anchor="middle" dominant-baseline="middle" fill="' + fill + '">' + esc(t) + '</text>';
  const num = b => (C.dongNo(b.dn) ? C.dongNo(b.dn) + '동' : '');
  const placed = [];                                                    // 이미 쓴 이름표 자리(겹치면 건너뜀)
  const free = (c, t) => { const w = t.length * 0.62 * fs + 4, h = fs + 2; for (const q of placed) if (Math.abs(q.x - c[0]) < (q.w + w) / 2 && Math.abs(q.y - -c[1]) < (q.h + h) / 2) return false; placed.push({ x: c[0], y: -c[1], w, h }); return true; };
  placed.push({ x: view.x + view.w - 26 * k, y: view.y + 22 * k, w: 40 * k, h: 56 * k }, { x: view.x + 14 * k + 40 * k, y: view.y + view.h - 24 * k, w: 100 * k, h: 40 * k });
  const ct = centroid(t.rect);
  { const ys = t.rect.map(q => q[1]); free([ct[0], Math.max(...ys) + 12 * k], '내 동 000동'); }
  for (const b of fronts) { const c = centroid(b.rect); if (inView(c) && num(b) && free(c, num(b) + '앞')) { s += txt(c, num(b), fs, '#6b2c00', -fs * 0.1) + txt(c, '앞 동', fs * 0.82, '#8a3d00', fs * 0.95, 700); } }
  for (const b of norm.filter(b => (b.k === 'own' || b.k === 'near') && num(b))) { const c = centroid(b.rect); if (inView(c) && free(c, num(b))) s += txt(c, num(b), fs * 0.9, '#15212c', 0, 700); }
  for (const b of na.filter(b => b.k !== 'other')) { const c = centroid(b.poly); if (inView(c) && free(c, '자료 없음')) s += txt(c, '자료 없음', fs * 0.82, '#46535f', 0, 700); }
  { const ys = t.rect.map(q => q[1]); s += '<text x="' + ct[0].toFixed(1) + '" y="' + (-Math.max(...ys) - 9 * k).toFixed(1) + '" font-size="' + fs * 1.15 + '" font-weight="900" text-anchor="middle" fill="#0a2f57">내 동 ' + esc(num(t)) + '</text>'; }
  // 북쪽 표시와 축척
  const nx = view.x + view.w - 26 * k, ny = view.y + 34 * k;
  s += '<rect x="' + (nx - 18 * k) + '" y="' + (ny - 26 * k) + '" width="' + 36 * k + '" height="' + 50 * k + '" rx="' + 6 * k + '" fill="#fff" fill-opacity=".92" stroke="#c9d2db" stroke-width="' + k + '"/>';
  s += '<g><polygon points="' + nx + ',' + (ny - 20 * k) + ' ' + (nx - 8 * k) + ',' + ny + ' ' + (nx + 8 * k) + ',' + ny + '" fill="#15212c"/><text x="' + nx + '" y="' + (ny + 16 * k) + '" font-size="' + fs + '" font-weight="800" text-anchor="middle" fill="#15212c">북</text></g>';
  const cand = [10, 20, 25, 50, 100], bar = cand.find(v => v / k >= 70) || 100;
  const bx = view.x + 14 * k, by = view.y + view.h - 16 * k;
  s += '<rect x="' + (bx - 8 * k) + '" y="' + (by - 26 * k) + '" width="' + (bar + 16 * k) + '" height="' + 38 * k + '" rx="' + 6 * k + '" fill="#fff" fill-opacity=".92" stroke="#c9d2db" stroke-width="' + k + '"/>';
  s += '<g><line x1="' + bx + '" y1="' + by + '" x2="' + (bx + bar) + '" y2="' + by + '" stroke="#15212c" stroke-width="' + 3 * k + '"/><text x="' + (bx + bar / 2) + '" y="' + (by - 7 * k) + '" font-size="' + fs + '" font-weight="700" text-anchor="middle" fill="#15212c">' + bar + ' m</text></g>';
  svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].map(v => v.toFixed(2)).join(' '));
  svg.innerHTML = s;
  svg.querySelectorAll('[data-b]').forEach(el => { el.addEventListener('click', () => { const b = ctx.byId[el.getAttribute('data-b')]; if (b && b.k === 'own' && C.calcable(b)) select(b.id); }); });

}


// ---------- 근거, 한계, 현장 확인 ----------
function drawEvidence() {
  const b = tgt(), sm = getSum(st.dk), m = ctx.m, fi = C.faceInfo(ctx, st.tid);
  const fh = C.baseFh(ctx, b), z = (st.fl - 0.5) * fh;
  const srcTag = x => '<span class="tag ' + x + '">' + C.SRC_LABEL[x] + '</span>';
  let h = '<ul class="plain notes">';
  h += '<li><strong>내 동 높이</strong>: ' + esc(C.label(b)) + ' ' + b.f + '층, ' + b.h.toFixed(1) + ' m ' + srcTag(b.src) +
       (b.src === 'est' ? ' 층수 x ' + ctx.floorH + ' m로 어림한 값이라 실제와 다를 수 있어요.' : '') + '</li>';
  h += '<li><strong>창 높이</strong>: ' + st.fl + '층 = 지상 약 ' + z.toFixed(1) + ' m ((층 - 0.5) x ' + fh.toFixed(2) + ' m). 한 층 높이는 ' + (b.src === 'est' ? '이 단지 실측 중간값' : '이 동 높이 / 층수') + '로 정했어요.</li>';
  if (sm.blockers.length) h += '<li><strong>가리는 동 높이</strong>: ' + sm.blockers.map(x => esc(x.label) + ' ' + x.h.toFixed(1) + ' m ' + srcTag(x.src)).join(' · ') + '</li>';
  h += '<li><strong>창 방향은 가정</strong>: 도형에서 남쪽을 가장 많이 보는 긴 면(' + fi.dir + '쪽 면' + (fi.offSouth > 5 ? ', 정남에서 ' + Math.round(fi.offSouth) + '도 틀어짐' : '') + ')의 가운데에 창이 있다고 봤어요. 실제 창 방향은 자료에 없어요.</li>';
  h += '<li><strong>지형 미반영</strong>: 모든 건물이 같은 평지 위에 있다고 봤어요. 언덕이나 단 차이는 계산에 없어요.</li>';
  h += '<li><strong>반영하지 않은 것</strong>: 나무, 담장, 건물 옥상 구조물, 구름과 미세먼지. 건물 높이는 꼭대기 하나뿐이고 층별 높이는 몰라요.</li>';
  h += '<li><strong>조망</strong>: 수면 자료가 부족해 아직 계산하지 않음.</li>';
  h += '<li><strong>법적 일조권 아님</strong>: 실내 채광이나 법적 일조권 판단 자료가 아니에요.</li>';
  // 민감도
  const sen = C.sensitivity(ctx, st.tid, st.fl, curDate());
  const rg = r => r.min === r.max ? '변화 없음' : C.durText(r.min) + ' ~ ' + C.durText(r.max);
  h += '<li><strong>입력이 조금 달라지면</strong> (' + DATES.find(x => x.key === st.dk).name + ' 기준 ' + C.durText(sen.base) + '): ' + sen.rows.map(r => r.name + ' ' + rg(r)).join(' · ') + '. 모두 합치면 ' + C.durText(sen.min) + ' ~ ' + C.durText(sen.max) + '.</li>';
  h += '</ul>';
  const hs = {}; for (const x of ctx.calc) hs[x.src] = (hs[x.src] || 0) + 1;
  h += '<h2 style="margin-top:16px">자료 현황</h2><ul class="plain notes">';
  h += '<li>건축물대장(건축HUB)에 이 단지 아파트 동이 ' + m.n_apt + '개 있고, 그중 ' + m.n_own + '개를 브이월드 건물 윤곽과 이었어요(자료 등급 ' + m.g + (m.g === 'B' ? ': 이어지지 않은 동은 계산에서 빠져요' : '') + ').</li>';
  h += '<li>평면도에 담은 건물 ' + ctx.items.length + '개 중 ' + ctx.calc.length + '개를 계산에 썼어요. 높이 출처: 건축물대장 ' + (hs.hub || 0) + '개, 브이월드 ' + (hs.vworld || 0) + '개, 층수로 추정 ' + (hs.est || 0) + '개.</li>';
  h += '<li>내 동에서 약 200 m 안의 3층(9 m) 이상 건물만 담았어요. 더 낮거나 먼 건물은 그림자가 닿기 어렵다고 보고 뺐어요.</li>';
  h += '<li>자료 출처: 브이월드(국토교통부) 건물 윤곽, 국토교통부 건축HUB 건축물대장 표제부.</li>';
  h += '</ul>';
  $('evBody').innerHTML = h;

  // 현장 확인
  const dec = getSum('dec'), tm = ctx.byId[st.tid];
  const bl = (dec.blockers[0] ? dec.blockers[0].label : null);
  let f = '<ul class="plain notes">';
  f += '<li><strong>앞 동 그림자 위치</strong>: ' + (bl ? '겨울(동지 무렵) 한낮에 ' + esc(bl) + ' 쪽 그림자가 ' + esc(C.label(tm)) + ' 벽에 닿는지, 몇 층 높이까지 닿는지 직접 보세요.' : '겨울 한낮에 앞 동 그림자가 ' + esc(C.label(tm)) + ' 벽에 닿는지 직접 보세요.') + '</li>';
  const sr = getSum(st.dk).sunRanges[0];
  f += '<li><strong>해 드는 시간대</strong>: ' + (sr ? '이 계산은 ' + rangeTxt(sr) + ' 무렵에 직사광이 닿을 수 있다고 봤어요. 그 시각에 방문해 거실과 방에 해가 드는지 확인하세요.' : '방문한 시각에 거실과 방에 해가 드는지 확인하세요.') + '</li>';
  f += '<li><strong>창 방향</strong>: 이 계산은 ' + fi.dir + '쪽 면에 창이 있다고 가정했어요. 휴대폰 나침반으로 거실 창이 실제로 어느 쪽을 보는지 재 보세요.</li>';
  f += '<li><strong>나무와 가림막</strong>: 계산에 없는 나무, 담장, 옆 건물이 창 앞에 있는지 보세요.</li>';
  f += '</ul>';
  $('fieldBody').innerHTML = f;
}


// ---------- 담기 (기존 관심 단지 저장 그대로, 새 저장 칸 없음) ----------
function drawSave() {
  const b = $('saveFav'); if (!b) return;
  const on = !!(window.DJ && DJ.isFav && DJ.isFav(st.cid));
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? '♥ 담음' : '♡ 담기';
  b.setAttribute('aria-label', on ? '관심 단지에 담았어요. 누르면 뺍니다' : '이 단지를 관심 단지에 담기');
}
function toggleSave() {
  if (!(window.DJ && DJ.toggleFav)) return;
  const on = DJ.toggleFav(st.cid);
  drawSave();
  if (DJ.toast) DJ.toast(on ? '관심 단지에 담았어요' : '관심 단지에서 뺐어요', on ? '나의 집감에서 볼 수 있어요.' : '', 2500);
}

// ---------- 한 화면 맞추기 (휴대폰) ----------
// 장면 높이 = 하단 탭 위까지 남는 높이에서 장면 말고 다른 칸들의 높이를 뺀 값. 계산은 화면 크기가 바뀔 때만 한다(그리는 값은 그대로).
function fitStage() {
  const stage = document.querySelector('.stage'); if (!stage || !ctx) return;
  if (innerWidth >= 980) { stage.style.removeProperty('--stage-h'); return; }
  const kids = [...stage.children].filter(e => e.offsetParent !== null && !e.classList.contains('st-main'));
  const gap = 6, others = kids.reduce((a, e) => a + e.getBoundingClientRect().height, 0) + gap * kids.length;
  const note = document.querySelector('.pvnote'), noteH = note ? note.getBoundingClientRect().height + 6 : 0;
  const tab = document.querySelector('.tabbar'), tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().height : 0;
  const vh = (window.visualViewport && visualViewport.height) || innerHeight;
  const avail = vh - tabH - noteH - others - 10;
  stage.style.setProperty('--stage-h', Math.max(160, Math.min(520, Math.round(avail))) + 'px');
  stage.classList.toggle('st-short', avail < 250);   // 아주 짧은 화면: 층 슬라이더 대신 + / - 와 층 목록만
}
function settleScroll() {                     // 단지를 처음 열었을 때만: 사이트 머리글이 위로 넘어가 작업 무대가 화면 맨 위에 오도록
  if (innerWidth >= 700 || scrollY > 4 || st._settled) return;
  st._settled = true;
  const note = document.querySelector('.pvnote'); if (!note) return;
  const y = Math.round(note.getBoundingClientRect().top + scrollY - 4);
  if (y > 40) scrollTo(0, y);
}

// ---------- 갱신 ----------
function fullRender() {
  drawControls(); drawResult(); drawBar(); fitStage(); drawView(); drawFold(); scheduleCompare();
}
function drawFold() { if ($('evidence').open || $('field').open) drawEvidence(); }
function select(tid) {
  st.tid = tid; const b = tgt(); st.fl = Math.min(Math.max(1, st.fl), b.f); st.cam = true; fullRender(); writeHash();
  if (st.fl !== st._askFl) st._askFl = st.fl;
}
async function chooseComplex(id) {
  try { ctx = await loadComplex(id); } catch (e) { ctx = null; $('pv-load').textContent = '이 단지는 일조 미리보기가 열려 있지 않거나 자료를 불러오지 못했어요. 아래 단지 고르기에서 다른 단지를 골라 보세요.'; $('pv-load').style.minHeight = '0'; return; }
  st.cid = id;
  const own = ownDongs();
  if (st._dong) {                                   // 주소에 동·층이 있으면 기본값보다 먼저 적용한다(그래야 주소가 기본값으로 덮어써지지 않음)
    const hb = own.find(x => C.dongNo(x.dn) === st._dong);
    if (hb) { st.tid = hb.id; if (st._fl) st.fl = st._fl; }
    st._dong = null; st._fl = 0;
  }
  if (!st.tid || !ctx.byId[st.tid] || !own.some(x => x.id === st.tid)) { const d = pickDefault(); st.tid = d.tid; st.fl = d.fl; }
  st.fl = Math.min(Math.max(1, st.fl), tgt().f);
  fullRender(); writeHash();
}
function writeHash() {
  const b = tgt(); try { history.replaceState(null, '', '#c=' + st.cid + '&d=' + C.dongNo(b.dn) + '&f=' + st.fl + '&date=' + st.dk + '&t=' + st.t + (st.wide ? '&wide=1' : '') + (st.view !== 'iso' ? '&v=' + st.view : '')); } catch (e) { /* file:// 일부 */ }
}
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('c')) st.cid = p.get('c');
  if (DATES.some(d => d.key === p.get('date'))) st.dk = p.get('date');
  if (VIEWS.some(v => v[0] === p.get('v'))) st.view = p.get('v');
  const t = +p.get('t'); if (t >= 300 && t <= 1185) st.t = Math.round(t / 15) * 15;
  st.wide = p.get('wide') === '1';
  st._dong = p.get('d'); st._fl = +p.get('f') || 0;
}

document.addEventListener('click', ev => {
  const bt = ev.target.closest('button'); if (!bt || !ctx) return;
  if (bt.dataset.cx) { if (bt.dataset.cx !== st.cid) { st.tid = null; chooseComplex(bt.dataset.cx); } }
  else if (bt.dataset.dong) select(bt.dataset.dong);
  else if (bt.dataset.date) { st.dk = bt.dataset.date; fullRender(); writeHash(); }
  else if (bt.dataset.view) { st.view = bt.dataset.view; drawView(); writeHash(); }
  else if (bt.id === 'fdn' || bt.id === 'fup') { st.fl = Math.min(tgt().f, Math.max(1, st.fl + (bt.id === 'fup' ? 1 : -1))); onFloor(); writeHash(); }
  else if (bt.id === 'floorBtn') openFloorSheet();
  else if (bt.dataset.fl) { st.fl = +bt.dataset.fl; closeFloorSheet(); onFloor(); writeHash(); }
  else if (bt.id === 'floorSheetX') closeFloorSheet();
  else if (bt.id === 'tdn' || bt.id === 'tup') { st.t = Math.min(1185, Math.max(300, st.t + (bt.id === 'tup' ? 15 : -15))); $('time').value = st.t; tick(); }
  else if (bt.id === 'zoom') { st.wide = !st.wide; bt.setAttribute('aria-pressed', st.wide); bt.textContent = st.wide ? '가까이 보기' : '전체 보기'; st.cam = true; drawView(); writeHash(); }
  else if (bt.id === 'saveFav') toggleSave();
  else if (bt.hasAttribute('data-pick-x')) $('pv-pick').open = false;
});
function closeFloorSheet() { const d = $('floorSheet'); if (d.close) d.close(); else d.removeAttribute('open'); }
$('floorSheet').addEventListener('click', e => { if (e.target === $('floorSheet')) closeFloorSheet(); });   // 바깥(어두운 곳)을 누르면 닫힘
$('floor').addEventListener('input', e => { st.fl = +e.target.value; onFloor(); writeHash(); });
$('time').addEventListener('input', e => { st.t = +e.target.value; tick(); });
let tickRaf = 0;
function tick() {   // 시간 바를 끄는 동안 입력이 프레임보다 자주 와도 그림은 프레임마다 한 번만 다시 그림 (계산·값은 그대로)
  if (tickRaf) return;
  tickRaf = requestAnimationFrame(() => { tickRaf = 0; drawMarker(); if (st.view !== 'floor') drawView(); writeHash(); });
}
$('evidence').addEventListener('toggle', () => { if ($('evidence').open && ctx) drawEvidence(); });
$('field').addEventListener('toggle', () => { if ($('field').open && ctx) drawEvidence(); });
let rz = 0; const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (ctx) { fitStage(); if (st.view !== 'floor') drawView(); } }); };
window.addEventListener('resize', onResize); if (window.visualViewport) visualViewport.addEventListener('resize', onResize);

function pickList(q) {
  const box = $('pickList'); if (!LIST) return;
  box.classList.remove('wait');
  const qq = (q || '').replace(/\s+/g, '').toLowerCase();
  const hit = LIST.filter(x => !qq || (x.n + x.gu + x.d).replace(/\s+/g, '').toLowerCase().includes(qq)).slice(0, 40);
  box.innerHTML = hit.length ? hit.map(x => '<li><a href="#c=' + encodeURIComponent(x.s) + '" data-go="' + esc(x.s) + '"><b>' + esc(x.n) + '</b><span>' + esc([x.gu, x.d].filter(Boolean).join(' ')) + '</span></a></li>').join('') : '<li class="none">맞는 단지가 없어요. 일조 미리보기는 건물 자료가 갖춰진 단지에만 열려 있어요.</li>';
  $('pickCount').textContent = LIST.length.toLocaleString() + '개 단지에서 열려 있어요' + (qq ? ' · ' + hit.length + '개 보임' : '');
}
document.addEventListener('click', ev => {
  const a = ev.target.closest('a[data-go]'); if (!a) return;
  ev.preventDefault(); st.tid = null; const id = a.getAttribute('data-go'); history.replaceState(null, '', '#c=' + encodeURIComponent(id)); enter(id);
});
document.addEventListener('click', ev => { if (ev.target.closest('[data-pick]')) { ev.preventDefault(); const d = $('pv-pick'); d.open = true; d.scrollIntoView({ block: 'start', behavior: DJ_calm() ? 'auto' : 'smooth' }); const i = $('pickQ'); if (i) i.focus({ preventScroll: true }); } });
$('pickQ').addEventListener('input', e => pickList(e.target.value));

async function enter(id) {
  document.body.classList.toggle('pv-has', !!id);
  if (!id) { $('pv-tool').hidden = true; $('pv-load').hidden = true; return; }
  $('pv-tool').hidden = true; $('pv-load').hidden = false;
  await chooseComplex(id);
  if (ctx) { $('pv-load').hidden = true; $('pv-tool').hidden = false; $('pv-pick').open = false; document.querySelector('.pv').classList.add('pv-on'); fitStage(); drawView(); settleScroll(); }
  else { $('pv-tool').hidden = true; $('pv-load').hidden = false; $('pv-pick').open = true; }   // 불러오지 못했으면 안내 문구를 남기고 다른 단지를 고르게 한다
}
readHash();
$('zoom').setAttribute('aria-pressed', st.wide); $('zoom').textContent = st.wide ? '가까이 보기' : '전체 보기';
$('time').value = st.t;
loadList().then(() => { pickList(''); }).catch(() => { $('pickCount').textContent = '목록을 불러오지 못했어요. 새로고침해 보세요.'; });
enter(st.cid);
})();
