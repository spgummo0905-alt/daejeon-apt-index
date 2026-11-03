// 비교 화면: 내가 '조건으로 찾기'에서 고른 조건(survey)과 단지의 실제 값을 견줘 '맞는 점 · 벗어난 점'을 사실로만 나눕니다.
// 좋다·나쁘다 평가나 추천은 하지 않습니다. 값이 없으면 맞다고도 아니라고도 하지 않고 '자료 없음'으로 둡니다.
// 분위 기준값이 필요한 조건(학원가·학군·병원)은 이 화면에서 판정하지 못해 skipped 로 알려 줍니다. UI 와 분리해 검증합니다.
(function () {
  const PY = { u20: ["20평 미만", p => p < 20], 20: ["20평대", p => p >= 20 && p < 30], 30: ["30평대", p => p >= 30 && p < 40], 40: ["40평대", p => p >= 40 && p < 50], 50: ["50평 이상", p => p >= 50] };
  const AGE = { new: ["신축", 5], semi: ["준신축까지", 15] };
  // 고정 기준으로 판정되는 필수 조건 (finder.js 의 MUST 와 같은 기준)
  const MUST = {
    mart: ["대형마트 1km 안", c => c.f?.mart, v => v <= 1000, v => v + "m"],
    top: ["종합 지수 65점 이상", c => c.i, v => v >= 65, v => v + "점"],
    rising: ["5년 흐름 상위", c => c.st?.[2], v => v >= 60, v => v + "점"],
    dip: ["최고가보다 10% 이상 낮음", c => c.dd, v => v <= -10, v => Math.round(v) + "%"],
    high: ["최근 90일 신고가", c => (c.h === undefined ? null : c.h ? 1 : 0), v => v === 1, v => (v ? "신고가" : "신고가 아님")],
    big: ["1,000세대 이상", c => c.hh, v => v >= 1000, v => v.toLocaleString() + "세대"],
    mid: ["500세대 이상", c => c.hh, v => v >= 500, v => v.toLocaleString() + "세대"],
    park: ["세대당 주차 1.2대 이상", c => c.pk, v => v >= 1.2, v => v + "대"],
    flat: ["평지에 가까운 곳", c => (c.hl && c.hl[0] != null ? c.hl[0] : null), v => v < 22, v => "고저차 약 " + Math.round(v) + "m"],
  };
  const NEED_QUANTILE = new Set(["academy", "edu", "hospital"]);
  const eok = v => (v >= 10000 ? (+(v / 10000).toFixed(v >= 100000 ? 0 : 1)) + "억" : Math.round(v).toLocaleString() + "만");
  const m = v => (v < 1000 ? Math.round(v) + "m" : (v / 1000).toFixed(1) + "km");

  // 조건이 하나라도 있는지 (지역·예산·평형·연식·역·학교·필수 조건)
  function hasConditions(s) {
    return !!(s && ((s.gus && s.gus.length) || s.budget || (s.py && s.py.length) || s.age || s.stn || s.sch || (s.must && s.must.length)));
  }
  // 반환: { ok: [{label, detail}], miss: [...], unknown: [...] } / 판정하지 못한 필수 조건 이름은 skippedIds 로 따로
  function evaluate(s, c, now) {
    const out = { ok: [], miss: [], unknown: [] }, add = (k, label, detail) => out[k].push({ label, detail });
    if (s.gus && s.gus.length) add(s.gus.includes(c.gu) ? "ok" : "miss", "지역 " + s.gus.join("·"), c.gu);
    const types = c.tp && c.tp.length ? c.tp : (c.p ? [[34, c.p, "84"]] : []);
    if (s.py && s.py.length) {
      const names = s.py.map(id => PY[id] && PY[id][0]).filter(Boolean).join("·");
      const ts = types.filter(([py]) => s.py.some(id => PY[id] && PY[id][1](py)));
      if (!types.length) add("unknown", "평형 " + names, "평형별 자료 없음");
      else if (ts.length) add("ok", "평형 " + names, ts.map(t => t[0] + "평").join(", ") + " 있음");
      else add("miss", "평형 " + names, "해당 평형 거래 없음");
    }
    if (s.budget) {
      const limit = s.budget * 10000;
      // 평형 조건이 있으면 그 평형들 안에서, 없으면 전체 평형에서 가장 낮은 가격을 봅니다
      const pool = types.filter(([py]) => !(s.py && s.py.length) || s.py.some(id => PY[id] && PY[id][1](py)));
      if (!pool.length) add("unknown", `예산 ${s.budget}억 이하`, "가격 자료 없음");
      else {
        const low = pool.reduce((a, b) => (b[1] < a[1] ? b : a));
        add(low[1] <= limit ? "ok" : "miss", `예산 ${s.budget}억 이하`, `${low[0]}평 ${eok(low[1])}`);
      }
    }
    if (s.age && AGE[s.age]) {
      const [label, years] = AGE[s.age];
      if (!c.y) add("unknown", label, "준공 연도 자료 없음");
      else add(c.y >= now - years ? "ok" : "miss", label, c.y + "년 준공");
    }
    if (s.stn) {
      const v = c.f && c.f.subway;
      if (v == null) add("unknown", `역 ${m(s.stn)} 안`, "가까운 역 자료 없음");
      else add(v <= s.stn ? "ok" : "miss", `역 ${m(s.stn)} 안`, (c.stn ? c.stn + " " : "") + m(v));
    }
    if (s.sch) {
      const v = c.f && c.f.elementary;
      if (v == null) add("unknown", `초등학교 ${m(s.sch)} 안`, "초등학교 자료 없음");
      else add(v <= s.sch ? "ok" : "miss", `초등학교 ${m(s.sch)} 안`, m(v));
    }
    const skipped = [];
    (s.must || []).forEach(id => {
      if (NEED_QUANTILE.has(id)) { skipped.push(id); return; }
      const r = MUST[id]; if (!r) return;
      const v = r[1](c);
      if (v == null) add("unknown", r[0], "자료 없음");
      else add(r[2](v) ? "ok" : "miss", r[0], r[3](v));
    });
    out.skipped = skipped;
    return out;
  }
  window.DJFit = { hasConditions, evaluate, NEED_QUANTILE: [...NEED_QUANTILE] };
})();
