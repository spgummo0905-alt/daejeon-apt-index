// 찾기에서 고른 조건(저장된 설문 'survey')을 지도·목록에서도 같은 규칙으로 쓰기 위한 읽기 전용 모듈.
// 규칙(평형·연식·필수 조건·거리·예산)은 static/finder.js 와 글자까지 같아야 합니다(tests/test_v48_filter_share.py 가 비교).
// 저장 형식·키는 바꾸지 않고 읽기만 합니다. 여기서 해제한 조건은 이 화면에서만 빠지고 저장된 설문은 그대로입니다.
(function () {
  "use strict";
  const DJ = window.DJ; if (!DJ) return;
  const NOW = new Date().getFullYear();
  let ctx = {};   // 분위 기준값 (DJ.cond 가 자료를 받은 뒤 채움)
  const PY = [
    { id: "u20", label: "20평 미만", sub: "전용 약 46㎡ 미만", test: p => p < 20 },
    { id: "20", label: "20평대", sub: "전용 59㎡ 안팎", test: p => p >= 20 && p < 30 },
    { id: "30", label: "30평대", sub: "전용 84㎡ 안팎", test: p => p >= 30 && p < 40 },
    { id: "40", label: "40평대", sub: "전용 약 100~127㎡", test: p => p >= 40 && p < 50 },
    { id: "50", label: "50평 이상", sub: "전용 약 127㎡ 이상", test: p => p >= 50 },
  ];
  const AGE = [
    { id: "new", label: "신축", sub: `${NOW - 5}년 이후 준공`, years: 5 },
    { id: "semi", label: "준신축까지", sub: `${NOW - 15}년 이후 준공`, years: 15 },
    { id: "", label: "상관없어요" },
  ];
  const MUST = [
    { id: "academy", label: "학원가", sub: "주요 학원가까지 도보·지하철 20분 이내 (추정)", test: c => ctx.hasHub ? c.hm != null && c.hm <= 20 : (c.f.academy_math ?? c.f.academy ?? -1) >= ctx.acadQ },
    { id: "edu", label: "학군 상위", sub: "학군 점수 상위 30%", test: c => c.ed != null && c.ed >= ctx.eduQ },
    { id: "mart", label: "대형마트", sub: "1km 안", test: c => c.f.mart != null && c.f.mart <= 1000 },
    { id: "hospital", label: "병원 많은 곳", sub: "반경 1km 병원 수 상위 30%", test: c => c.f.hospital != null && c.f.hospital >= ctx.hospQ },
    { id: "top", label: "A등급 이상", sub: "종합 지수 65점 이상", test: c => c.i != null && c.i >= 65 },
    { id: "rising", label: "5년 흐름 상위", sub: "최근 5년 해마다 평균 상승률이 상위 40%", test: c => c.st[2] != null && c.st[2] >= 60 },
    { id: "dip", label: "최고가보다 내림", sub: "역대 최고가보다 10% 이상 낮음", test: c => c.dd != null && c.dd <= -10 },
    { id: "high", label: "최근 신고가", sub: "최근 90일 안에 같은 면적대 신고가", test: c => !!c.h },
    { id: "big", label: "대단지", sub: "1,000세대 이상", test: c => c.hh != null && c.hh >= 1000 },
    { id: "mid", label: "500세대 이상", sub: "중간 규모 이상 단지", test: c => c.hh != null && c.hh >= 500 },
    { id: "park", label: "주차 넉넉", sub: "세대당 1.2대 이상", test: c => c.pk != null && c.pk >= 1.2 },
    { id: "flat", label: "평지에 가까운 곳", sub: "주변 고저차 22m 미만 · 역보다 10m 넘게 높지 않음 (위성 지형 어림)",
      test: c => !!c.hl && c.hl[0] != null && c.hl[0] < 22 && !(c.hl[1] != null && c.hl[1] > 10) },
  ];


  function km(a, b, c, d) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const types = c => c.tp && c.tp.length ? c.tp : (c.p ? [[34, c.p, "84"]] : []);
  function fit(c, s) {   // 평형·예산에 맞는 평형들 (가격 낮은 순)
    return types(c).filter(([py, pr]) => (!s.py.length || s.py.some(id => PY.find(p => p.id === id).test(py)))
      && (!s.budget || pr <= s.budget * 10000)).sort((a, b) => a[1] - b[1]);
  }
  function pass(c, s) {
    if (s.gus.length && !s.gus.includes(c.gu)) return false;
    for (const w of works(s)) if (c.la == null || c.ln == null || km(w.lat, w.lng, c.la, c.ln) > w.lim) return false;
    if ((s.py.length || s.budget) && !fit(c, s).length) return false;
    const age = AGE.find(a => a.id === s.age);
    if (age && age.years && !(c.y && c.y >= NOW - age.years)) return false;
    if (s.stn && !(c.f.subway != null && c.f.subway <= s.stn)) return false;
    if (s.sch && !(c.f.elementary != null && c.f.elementary <= s.sch)) return false;
    for (const id of s.must) { const m = MUST.find(x => x.id === id); if (m && !m.test(c)) return false; }
    return true;
  }

  const cfgOf = () => { try { return JSON.parse(document.getElementById("finder-cfg").textContent); } catch (e) { return {}; } };
  const shortName = n => n.split(/[·(]/)[0];

  // all: complexes.json 의 단지들. 반환: {state, works, pass, count, tags, relax}
  // 조건 링크: 조건을 주소(?budget=5&py=20&gu=…)로 만들고 읽습니다. 직장·내 위치는 개인 정보라 링크에 넣지 않습니다.
  // 읽는 규칙·값 범위는 finder.js 의 fromUrl 과 같고, 저장된 설문(survey)은 읽지도 쓰지도 않습니다.
  DJ.condQuery = function (s) {
    s = s || {}; const p = new URLSearchParams();
    if (s.budget > 0) p.set("budget", String(s.budget));
    if (s.py && s.py.length) p.set("py", s.py.join(","));
    if (s.gus && s.gus.length) p.set("gu", s.gus.join(","));
    if (s.age) p.set("age", s.age);
    if (s.stn > 0) p.set("stn", String(s.stn));
    if (s.sch > 0) p.set("sch", String(s.sch));
    if (s.must && s.must.length) p.set("must", s.must.join(","));
    return p.toString().replace(/%2C/g, ",");
  };
  DJ.condFromQuery = function (search) {
    let qs; try { qs = new URLSearchParams(search || ""); } catch (e) { return null; }
    if (!["budget", "py", "gu", "age", "stn", "sch", "must"].some(k => qs.has(k))) return null;
    const list = k => (qs.get(k) || "").split(",").filter(Boolean);
    const s = { gus: [], works: [], two: false, commute: "any", budget: 0, py: [], age: "", stn: 0, sch: 0, must: [], here: null };
    const b = +qs.get("budget"); if (b > 0) s.budget = b;
    s.py = list("py").filter(id => PY.some(p => p.id === id));
    s.gus = list("gu");
    if (AGE.some(a => a.id && a.id === qs.get("age"))) s.age = qs.get("age");
    s.stn = Math.max(0, +qs.get("stn") || 0); s.sch = Math.max(0, +qs.get("sch") || 0);
    s.must = list("must").filter(id => MUST.some(m => m.id === id));
    return s;
  };

  // over: 받은 링크의 조건. 있으면 이 기기에 저장된 설문 대신 이 조건을 씁니다(저장은 하지 않음)
  DJ.cond = function (all, over) {
    const cfg = cfgOf(), saved = over ? {} : (DJ.load("survey", {}) || {});
    const S = Object.assign({ gus: [], works: [], two: false, commute: "", budget: 0, py: [], age: "", stn: 0, sch: 0, must: [], here: null }, saved, over || {});
    if (!over && !("commute" in saved) && window.DJWorkplaces && DJWorkplaces.active(saved, cfg.workplaces || []).length) S.commute = "work";
    const q70 = arr => { const v = arr.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.7)] : Infinity; };
    ctx = { hasHub: all.some(c => c.hm != null), acadQ: q70(all.map(c => c.f.academy_math ?? c.f.academy)),
            eduQ: q70(all.map(c => c.ed)), hospQ: q70(all.map(c => c.f.hospital)) };
    const works = s => (window.DJWorkplaces ? DJWorkplaces.active(s, cfg.workplaces || []) : []);
    // 해제(이 화면에서만): 조건 이름 → 그 조건을 뺀 상태
    const OFF = { gu: s => (s.gus = []), work: s => { s.works = []; s.two = false; s.commute = "any"; }, budget: s => (s.budget = 0), py: s => (s.py = []),
                  age: s => (s.age = ""), near: s => { s.stn = 0; s.sch = 0; }, must: s => (s.must = []) };
    const off = new Set();
    const eff = () => { const s = Object.assign({}, S); off.forEach(k => OFF[k](s)); return s; };
    function pass(c, s) {
      if (s.gus.length && !s.gus.includes(c.gu)) return false;
      for (const w of works(s)) if (c.la == null || c.ln == null || km(w.lat, w.lng, c.la, c.ln) > w.lim) return false;
      if ((s.py.length || s.budget) && !fit(c, s).length) return false;
      const age = AGE.find(a => a.id === s.age);
      if (age && age.years && !(c.y && c.y >= NOW - age.years)) return false;
      if (s.stn && !(c.f.subway != null && c.f.subway <= s.stn)) return false;
      if (s.sch && !(c.f.elementary != null && c.f.elementary <= s.sch)) return false;
      for (const id of s.must) { const m = MUST.find(x => x.id === id); if (m && !m.test(c)) return false; }
      return true;
    }
    // 지금 걸려 있는(해제하지 않은) 조건들: [{k: 이름, t: 글자}]
    function tags(s) {
      const t = [], add = (text, k) => t.push({ k, t: text });
      if (s.gus.length) add(s.gus.length > 2 ? `${s.gus[0]} 외 ${s.gus.length - 1}곳` : s.gus.join("·"), "gu");
      works(s).forEach(w => add(`${shortName(w.name)} ${w.lim}km`, "work"));
      if (s.budget) add(`${s.budget}억 이하`, "budget");
      s.py.forEach(id => { const p = PY.find(x => x.id === id); if (p) add(p.label, "py"); });
      const age = AGE.find(a => a.id === s.age); if (age && age.years) add(age.label, "age");
      if (s.stn) add(`역 ${s.stn}m`, "near");
      if (s.sch) add(`초등학교 ${s.sch}m`, "near");
      s.must.forEach(id => { const m = MUST.find(x => x.id === id); if (m) add(m.label, "must"); });
      return t;
    }
    return {
      saved: S,
      fromLink: !!over,
      tags: () => tags(eff()),
      active: () => tags(eff()).length > 0,
      pass: c => pass(c, eff()),
      // 이 화면에서만 조건 하나(또는 모두) 풀기. 저장된 설문은 건드리지 않음
      drop: k => { if (k === "*") Object.keys(OFF).forEach(x => off.add(x)); else off.add(k); },
      restore: () => off.clear(),
      droppedAny: () => off.size > 0,
      // 이 조건을 풀면 몇 곳이 되는지(0건 회복 제안용): [{k, n}] 많은 순
      relax: (list, okFn) => { const keys = [...new Set(tags(eff()).map(x => x.k))];
        return keys.map(k => { const s = eff(); OFF[k](s); return { k, n: list.reduce((n, c) => n + (pass(c, s) && okFn(c) ? 1 : 0), 0) }; }).filter(x => x.n > 0).sort((a, b) => b.n - a.n); },
    };
  };
})();
