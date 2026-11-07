// 집감 미리보기 시제품: 하루 직사광 시간대 계산 (순수 계산, 서버·라이브러리 없음).
// 해 위치·앞 동 가림 판정은 기존 static/shadow.js 를 그대로 쓰고, 이 파일은 그 위에서
//  - 분석용 JSON(data/<단지>.json) -> 계산용 건물 목록 (소속 불명·높이 없음은 제외)
//  - 선택한 동·층·날짜의 15분 간격 하루 계산 + '어느 동이 가리는지'
//  - 입력 오차(높이 ±5%, 층고 ±0.3 m, 위치 ±5 m)에 따른 흔들림
// 만 맡는다. 점수·확률은 만들지 않는다.
(function (root) {
  const S = (typeof module !== 'undefined' && module.exports) ? require('../../static/shadow.js') : root.DJShadow;

  const START = 5 * 60, END = 20 * 60, STEP = 15;       // 05:00~20:00, 15분 칸 60개
  const SRC_LABEL = { hub: '건축물대장 높이', vworld: '브이월드 높이', est: '층수로 추정', none: '분석 자료 없음' };
  const ST_LABEL = { hub: '건축HUB와 일치', vworld: '브이월드만', unknown: '소속 불명' };
  const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

  const dirName = az => DIR8[Math.round((((az % 360) + 360) % 360) / 45) % 8];
  const dongNo = s => { const m = /^\s*(\d{1,4})\s*동?\s*(\(.*\))?\s*$/.exec(s || ''); return m ? m[1] : null; };

  // 계산에 넣을 수 있는 건물: 소속 불명이 아니고, 높이를 정할 수 있고, 도형이 있다.
  function calcable(b) { return b.st !== 'unknown' && b.src !== 'none' && b.h > 0 && b.p && b.p.length >= 3; }

  // 화면에 쓸 짧은 이름
  function label(b) {
    const no = dongNo(b.dn);
    const nm = (b.nm || '').replace(/도안신도시|아파트|\s+/g, ' ').trim();
    if (b.k === 'own' && no) return no + '동';
    if (no) return (nm ? nm + ' ' : '') + no + '동';
    if (b.dn && b.nm) return nm + ' ' + b.dn;
    return b.nm || b.dn || ('이름 없는 건물(' + (b.f || '?') + '층)');
  }

  function prepare(doc) {
    // poly = 실제 윤곽(앞 동으로서 그림자를 만들 때), rect = 건물에 딱 맞는 기울어진 직사각형(내가 선 동의 '남쪽 면'과 관측점을 정할 때)
    const items = doc.buildings.map(b => ({ id: b.id, poly: b.p, rect: (b.r && b.r.length === 4) ? b.r : b.p, f: b.f, h: b.h || 0, src: b.src, st: b.st, k: b.k,
                                            nm: b.nm, dn: b.dn, p: b.p, label: label(b), raw: b }));
    const calc = items.filter(calcable), excluded = items.filter(b => !calcable(b));
    const byId = {}; for (const b of items) byId[b.id] = b;
    return { doc, lat: doc.meta.complex.lat, lon: doc.meta.complex.lon, floorH: doc.meta.floor_h.value, items, calc, excluded, byId };
  }

  // 관측점의 층고: 동 높이 / 지상 층수 (건축물대장·브이월드 높이가 있을 때). 층수로 추정한 동은 단지 안 실측 중간값.
  function baseFh(ctx, b) { return (b.src === 'est' || !(b.f > 0)) ? ctx.floorH : b.h / b.f; }

  // v: { hScale, floorDelta, dx, dy }  (민감도용 변형. 없으면 원래 값)
  function variant(ctx, tid, v) {
    v = v || {}; const hs = v.hScale || 1, fd = v.floorDelta || 0, dx = v.dx || 0, dy = v.dy || 0;
    const blds = ctx.calc.map(b => {
      let h = b.h;
      if (b.src === 'est') h = b.f * (ctx.floorH + fd) * hs; else h = b.h * hs;
      const o = { id: b.id, f: b.f, h, src: b.src, poly: b.poly };
      if (b.id === tid) {                                   // 선택한 동은 직사각형으로 바꿔 쓴다(위치 오차 시험이면 옮긴다)
        o.poly = b.rect.map(p => [p[0] + dx, p[1] + dy]);
      }
      return o;
    });
    const t = blds.find(b => b.id === tid);
    const fh = baseFh(ctx, ctx.byId[tid]) * hs + fd;
    return { blds, t, fh };
  }

  function minToHM(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function durText(min) { const h = Math.floor(min / 60), m = min % 60; return h ? (m ? h + '시간 ' + m + '분' : h + '시간') : m + '분'; }

  // 칸 가운데 시각의 해로 판정한다. 반환 slots[i] = { m(시작 분), state, by:[가린 동 id], alt, az }
  function run(ctx, tid, fl, date, v) {
    const { blds, t, fh } = variant(ctx, tid, v);
    if (!t) throw new Error('계산 대상이 아닌 건물입니다: ' + tid);
    const slots = [];
    for (let m = START; m < END; m += STEP) {
      const s = S.sun(ctx.lat, ctx.lon, date.month, date.day, (m + STEP / 2) / 60, date.year);
      const r = S.cellBy(blds, t, fl, 0.5, s, fh);
      slots.push({ m, state: r.state, by: r.all.map(o => o.id), alt: s.alt, az: s.az });
    }
    return slots;
  }

  function ranges(slots, pred) {
    const out = []; let cur = null;
    for (const s of slots) {
      if (pred(s)) { if (cur && cur.end === s.m) cur.end = s.m + STEP; else { cur = { start: s.m, end: s.m + STEP }; out.push(cur); } }
    }
    return out;
  }

  function summarize(ctx, slots) {
    const cnt = st => slots.filter(s => s.state === st).length * STEP;
    const per = {};
    for (const s of slots) if (s.state === 'shade') for (const id of s.by) per[id] = (per[id] || 0) + STEP;
    const blockers = Object.keys(per).map(id => ({ id, label: ctx.byId[id].label, min: per[id], src: ctx.byId[id].src, h: ctx.byId[id].h,
      ranges: ranges(slots, s => s.state === 'shade' && s.by.includes(id)) })).sort((a, b) => b.min - a.min);
    return { sunMin: cnt('sun'), shadeMin: cnt('shade'), backMin: cnt('back'), nightMin: cnt('night'),
             sunRanges: ranges(slots, s => s.state === 'sun'), shadeRanges: ranges(slots, s => s.state === 'shade'), blockers };
  }

  function faceInfo(ctx, tid) {
    const f = S.face({ poly: ctx.byId[tid].rect });
    const az = (Math.atan2(f.nx, f.ny) * 180 / Math.PI + 360) % 360;       // 면이 바라보는 방위(북 0, 시계)
    let off = Math.abs(az - 180); if (off > 180) off = 360 - off;
    return { azimuth: az, dir: dirName(az), offSouth: off, len: f.len, cx: f.cx + f.nx * 0.3, cy: f.cy + f.ny * 0.3, a: f.a, ex: f.ex, ey: f.ey, nx: f.nx, ny: f.ny };
  }

  // 입력 오차에 따른 흔들림: 변형마다 직사광 분을 다시 계산한다.
  function sensitivity(ctx, tid, fl, date) {
    const base = summarize(ctx, run(ctx, tid, fl, date)).sunMin;
    const g = (name, list) => {
      const runs = list.map(([lab, v]) => ({ lab, sunMin: summarize(ctx, run(ctx, tid, fl, date, v)).sunMin }));
      const all = runs.map(r => r.sunMin).concat([base]);
      return { name, runs, min: Math.min(...all), max: Math.max(...all) };
    };
    const rows = [
      g('높이 ±5%', [['-5%', { hScale: 0.95 }], ['+5%', { hScale: 1.05 }]]),
      g('층고 ±0.3 m', [['-0.3 m', { floorDelta: -0.3 }], ['+0.3 m', { floorDelta: 0.3 }]]),
      g('위치 ±5 m', [['동 +5', { dx: 5 }], ['서 5', { dx: -5 }], ['북 +5', { dy: 5 }], ['남 5', { dy: -5 }]]),
    ];
    const all = rows.flatMap(r => [r.min, r.max]);
    return { base, rows, min: Math.min(...all), max: Math.max(...all) };
  }

  // 한국 표준시 기준 오늘 날짜
  function kstToday(nowMs) { const d = new Date((nowMs === undefined ? Date.now() : nowMs) + 9 * 3600e3); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }; }

  const api = { START, END, STEP, SRC_LABEL, ST_LABEL, calcable, label, prepare, baseFh, variant, run, summarize, ranges, faceInfo, sensitivity,
                kstToday, minToHM, durText, dirName, dongNo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PVCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
