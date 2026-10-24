// 설문으로 찾기: 상황 → 지역 → 직장 → 예산 → 평형 → 연식 → 역·학교 → 필수 조건.
// 고를 때마다 남는 단지 수와 늘고 준 수를 보여주고, 왼쪽 그림도 고른 조건대로 바뀝니다.
// 가격은 평형별 추정 시세(complexes.json 의 tp), 거리는 직선거리입니다. 문구는 textContent 로만 넣습니다.
(function () {
  const { el } = DJ;
  const box = document.getElementById("survey");
  if (!box) return;
  const cfg = (() => { try { return JSON.parse(document.getElementById("finder-cfg").textContent); } catch (e) { return {}; } })();
  const STOP = box.dataset.stop || "지하철역", REGION = box.dataset.region || "", UNIT = box.dataset.unit || "구";
  const DSR = cfg.dsr || 0.4;
  const LTV = Object.assign({ first: 0.8, none: cfg.ltv || 0.7, switch: cfg.ltv || 0.7, multi: 0.6 }, cfg.ltv_by || {});
  const NOW = new Date().getFullYear();
  const NS = "http://www.w3.org/2000/svg";

  const STATUS = [
    { id: "first", label: "생애최초", sub: "세대원 모두 집을 가져 본 적 없음" },
    { id: "none", label: "무주택", sub: "집을 가졌던 적은 있는 무주택" },
    { id: "switch", label: "1주택 갈아타기", sub: "지금 집을 팔고 이사" },
    { id: "multi", label: "2주택 이상", sub: "지금 집도 계속 보유" },
  ];
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
  const BUDGETS = [2, 3, 4, 5, 7, 10, 15, 20];
  const LIMITS = [3, 5, 8, 12];
  let ctx = {};   // 분위 기준값 (자료를 받은 뒤 채움)
  const MUST = [
    { id: "academy", label: "학원가", sub: "주요 학원가까지 20분 안 (걸어서·지하철)", test: c => ctx.hasHub ? c.hm != null && c.hm <= 20 : (c.f.academy_math ?? c.f.academy ?? -1) >= ctx.acadQ },
    { id: "edu", label: "학군 상위", sub: "학군 점수 상위 30%", test: c => c.ed != null && c.ed >= ctx.eduQ },
    { id: "mart", label: "대형마트", sub: "1km 안", test: c => c.f.mart != null && c.f.mart <= 1000 },
    { id: "hospital", label: "병원 많은 곳", sub: "반경 1km 병원 수 상위 30%", test: c => c.f.hospital != null && c.f.hospital >= ctx.hospQ },
    { id: "top", label: "A등급 이상", sub: "종합 지수 65점 이상", test: c => c.i != null && c.i >= 65 },
    { id: "rising", label: "상승세", sub: "최근 5년 상승세 상위 40%", test: c => c.st[2] != null && c.st[2] >= 60 },
    { id: "dip", label: "고점 대비 하락", sub: "전고점보다 10% 이상 낮음", test: c => c.dd != null && c.dd <= -10 },
    { id: "high", label: "최근 신고가", sub: "최근 90일 안 신고가 거래", test: c => !!c.h },
    { id: "big", label: "대단지", sub: "1,000세대 이상", test: c => c.hh != null && c.hh >= 1000 },
    { id: "mid", label: "500세대 이상", sub: "중간 규모 이상 단지", test: c => c.hh != null && c.hh >= 500 },
    { id: "park", label: "주차 넉넉", sub: "세대당 1.2대 이상", test: c => c.pk != null && c.pk >= 1.2 },
  ];

  // 규제지역 집값 구간별 주택담보대출 최대 한도 [[집값 상한, 최대 대출], ...] (만원). 없으면 LTV·DSR 만.
  const CAPS = Array.isArray(cfg.loan_caps) && cfg.loan_caps.length ? cfg.loan_caps : null;
  // 살 수 있는 최대 가격 P: P − 자기자본 ≤ min(LTV × P, DSR 로 빌릴 수 있는 돈, 그 집값 구간의 한도)
  // 반환 {p: 가격, why: 무엇이 한도를 정했는지(ltv·dsr·cap·edge), 그 구간의 hi·cap·next(다음 구간 한도)}
  function maxPrice(equity, loanDsr, ltv) {
    const byLtv = ltv < 1 ? equity / (1 - ltv) : Infinity;
    if (!CAPS) return equity + loanDsr < byLtv ? { p: equity + loanDsr, why: "dsr" } : { p: byLtv, why: "ltv" };
    let best = { p: equity, why: "none" }, lo = 0;
    CAPS.forEach(([hi, cap], k) => {
      const [p, why] = [[byLtv, "ltv"], [equity + loanDsr, "dsr"], [equity + cap, "cap"], [hi, "edge"]].reduce((a, b) => b[0] < a[0] ? b : a);
      if (p >= lo && p > best.p) best = { p, why, hi, cap, next: (CAPS[k + 1] || [])[1] };
      lo = hi;
    });
    return best;
  }

  const blank = () => ({ step: 0, status: "", gus: [], works: [{ w: "", lim: 0 }, { w: "", lim: 0 }], two: false,
    budget: 0, bmode: "price", af: { income: "", equity: "", rate: cfg.default_rate || 4, years: cfg.default_years || 30, debt: 0 },
    py: [], age: "", stn: 0, sch: 0, must: [], sort: "i", here: null });
  const S = Object.assign(blank(), DJ.load("survey", {}));
  const save = () => DJ.save("survey", S);
  const eok = v => v >= 10000 ? (+(v / 10000).toFixed(v >= 100000 ? 0 : 1)) + "억" : Math.round(v).toLocaleString() + "만";

  function km(a, b, c, d) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const places = () => (cfg.workplaces || []).concat(S.here ? [{ name: "내 위치", lat: S.here[0], lng: S.here[1], here: true }] : []);
  function works(s) {
    const ps = places();
    return s.works.slice(0, s.two ? 2 : 1).map(w => {
      const p = w.w === "here" ? ps.find(x => x.here) : ps[+w.w];
      return w.w !== "" && p && w.lim ? { name: p.name, lat: p.lat, lng: p.lng, lim: w.lim } : null;
    }).filter(Boolean);
  }
  const shortName = n => n.split(/[·(]/)[0];

  // ---------- 거르기 ----------
  const types = c => c.tp && c.tp.length ? c.tp : (c.p ? [[34, c.p, "84"]] : []);
  function fit(c, s) {   // 평형·예산에 맞는 평형들 (가격 낮은 순)
    return types(c).filter(([py, pr]) => (!s.py.length || s.py.some(id => PY.find(p => p.id === id).test(py)))
      && (!s.budget || pr <= s.budget * 10000)).sort((a, b) => a[1] - b[1]);
  }
  function pass(c, s) {
    if (s.gus.length && !s.gus.includes(c.gu)) return false;
    for (const w of works(s)) if (c.la == null || km(w.lat, w.lng, c.la, c.ln) > w.lim) return false;
    if ((s.py.length || s.budget) && !fit(c, s).length) return false;
    const age = AGE.find(a => a.id === s.age);
    if (age && age.years && !(c.y && c.y >= NOW - age.years)) return false;
    if (s.stn && !(c.f.subway != null && c.f.subway <= s.stn)) return false;
    if (s.sch && !(c.f.elementary != null && c.f.elementary <= s.sch)) return false;
    for (const id of s.must) { const m = MUST.find(x => x.id === id); if (m && !m.test(c)) return false; }
    return true;
  }
  let ALL = [];
  const count = s => ALL.reduce((n, c) => n + (pass(c, s) ? 1 : 0), 0);
  const countWith = patch => count(Object.assign({}, S, patch));

  // ---------- 질문 ----------
  const STEPS = [
    { id: "status", name: "상황", q: "지금 어떤 상황인가요?", sub: "예산 단계에서 대출 한도를 계산할 때만 써요. 남는 단지 수는 그대로예요.",
      on: () => !!S.status, clear: () => { S.status = ""; }, draw: drawStatus },
    { id: "gu", name: "지역", q: "어느 지역을 찾으세요?", sub: `여러 곳 골라도 돼요. 건너뛰면 ${REGION} 전체를 봐요.`,
      on: () => S.gus.length > 0, clear: () => { S.gus = []; }, draw: drawGu },
    { id: "work", name: "직장", q: "직장은 어디인가요?", sub: "직장에서 몇 km 안까지 볼지 골라 주세요. 재택이면 건너뛰어도 돼요.",
      on: () => works(S).length > 0, clear: () => { S.works = blank().works; S.two = false; }, draw: drawWork },
    { id: "budget", name: "예산", q: "예산은 얼마인가요?", sub: "가격대로 고르거나, 연소득과 자기자본으로 대출 한도를 계산해 보세요.",
      on: () => !!S.budget, clear: () => { S.budget = 0; }, draw: drawBudget },
    { id: "py", name: "평형", q: "몇 평이 필요하세요?", sub: "공급면적 기준이에요. 여러 개 골라도 돼요.",
      on: () => S.py.length > 0, clear: () => { S.py = []; }, draw: drawPy },
    { id: "age", name: "연식", q: "원하는 연식이 있나요?", sub: "준공 연도로 골라요.",
      on: () => !!S.age, clear: () => { S.age = ""; }, draw: drawAge },
    { id: "near", name: "역·학교", q: `${DJ.josa(STOP, "과/와")} 학교는 얼마나 가까워야 하나요?`, sub: "단지에서 가장 가까운 곳까지 잰 직선거리예요.",
      on: () => !!(S.stn || S.sch), clear: () => { S.stn = 0; S.sch = 0; }, draw: drawNear },
    { id: "must", name: "필수 조건", q: "꼭 필요한 조건을 골라 주세요", sub: "고른 조건을 모두 갖춘 단지만 남겨요.",
      on: () => S.must.length > 0, clear: () => { S.must = []; }, draw: drawMust },
  ];

  const q = box.querySelector("[data-sv-q]");
  function option(label, sub, n, on, onClick, cls) {
    const b = el("button", "sv-opt" + (on ? " on" : "") + (cls ? " " + cls : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.append(el("b", "", label));
    if (sub) b.append(el("span", "", sub));
    if (n != null) b.append(el("em", "", n.toLocaleString() + "곳"));
    if (n === 0 && !on) b.classList.add("zero");
    b.addEventListener("click", () => { onClick(); changed(); if (DJ.act) DJ.act("find"); });   // 임장 배지 '내 조건 정리'
    return b;
  }
  const grid = (cls, ...kids) => { const g = el("div", "sv-opts " + (cls || "")); g.append(...kids); return g; };
  const label = text => el("p", "sv-label", text);

  function drawStatus() {
    q.append(grid("c4", ...STATUS.map(st => option(st.label, st.sub, null, S.status === st.id,
      () => { S.status = S.status === st.id ? "" : st.id; }))));
    if (S.status) q.append(el("p", "sv-note", `대출 한도는 LTV ${Math.round(LTV[S.status] * 100)}%로 계산해요. 실제 한도는 은행 심사와 정책에 따라 달라질 수 있어요.`));
  }
  function drawGu() {
    const n = {};
    ALL.forEach(c => { n[c.gu] = (n[c.gu] || 0) + 1; });
    const gus = Object.keys(n).sort((a, b) => n[b] - n[a]);
    const many = gus.length > 10;
    const shown = many && !S.allGu ? gus.slice(0, 9).concat(gus.slice(9).filter(g => S.gus.includes(g))) : gus;
    const opts = shown.map(g => option(g, null, countWith({ gus: [g] }), S.gus.includes(g),
      () => { S.gus = S.gus.includes(g) ? S.gus.filter(x => x !== g) : [...S.gus, g]; }, "sm"));
    const g = grid("c5", ...opts);
    if (many && !S.allGu) {
      const more = el("button", "sv-opt sm more", `+${gus.length - shown.length}곳 더 보기`);
      more.type = "button";
      more.addEventListener("click", () => { S.allGu = true; render(); });
      g.append(more);
    }
    q.append(g);
  }
  function drawWork() {
    const ps = places();
    const slot = k => {
      const w = S.works[k];
      const wrap = el("div", "sv-work");
      wrap.append(label(k ? "두 번째 직장" : "첫 번째 직장"));
      const sel = el("select", "pc-sel");
      sel.append(new Option("직장 고르기", ""));
      ps.forEach((p, i) => sel.append(new Option(p.name, p.here ? "here" : String(i))));
      sel.value = w.w;
      sel.addEventListener("change", () => { w.w = sel.value; if (w.w && !w.lim) w.lim = 8; changed(); });
      const row = el("div", "sv-work-row");
      row.append(sel);
      if (!k) {
        const here = el("button", "btn", "내 위치");
        here.type = "button";
        here.addEventListener("click", () => {
          if (!navigator.geolocation) return DJ.toast("위치를 쓸 수 없어요", "이 브라우저는 위치 기능을 지원하지 않아요");
          navigator.geolocation.getCurrentPosition(pos => {
            S.here = [pos.coords.latitude, pos.coords.longitude]; w.w = "here"; if (!w.lim) w.lim = 8; changed();
          }, () => DJ.toast("위치를 가져오지 못했어요", "브라우저에서 위치 권한을 확인해 주세요"), { timeout: 8000 });
        });
        row.append(here);
      }
      wrap.append(row);
      if (w.w) {
        wrap.append(label("직장에서 직선거리"));
        wrap.append(grid("c4", ...LIMITS.map(lim => {
          const works2 = S.works.map((x, j) => j === k ? Object.assign({}, x, { lim }) : x);
          return option(lim + "km 이내", null, countWith({ works: works2 }), w.lim === lim, () => { w.lim = lim; }, "sm");
        })));
      }
      return wrap;
    };
    q.append(slot(0));
    const two = el("label", "sv-check");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = S.two;
    cb.addEventListener("change", () => { S.two = cb.checked; changed(); });
    two.append(cb, document.createTextNode(" 맞벌이라 직장이 두 곳이에요"));
    q.append(two);
    if (S.two) q.append(slot(1));
  }
  function drawBudget() {
    const seg = el("div", "seg sv-seg");
    [["price", "가격대로"], ["calc", "대출 한도 계산하기"]].forEach(([id, t]) => {
      const b = el("button", "seg-btn" + (S.bmode === id ? " active" : ""), t);
      b.type = "button"; b.setAttribute("aria-pressed", S.bmode === id);
      b.addEventListener("click", () => { S.bmode = id; render(); });
      seg.append(b);
    });
    q.append(seg);
    if (S.bmode === "price") {
      const top = Math.max(...ALL.map(c => Math.max(0, ...types(c).map(t => t[1])))) / 10000;
      const list = BUDGETS.filter((b, i) => i === 0 || BUDGETS[i - 1] < top);
      q.append(grid("c4", ...list.map(b => option(b + "억 이하", null, countWith({ budget: b }), S.budget === b,
        () => { S.budget = S.budget === b ? 0 : b; }, "sm"))));
      const own = el("label", "sv-own");
      const inp = el("input"); inp.type = "number"; inp.min = "0.5"; inp.step = "0.5"; inp.inputMode = "decimal";
      inp.placeholder = "예: 6.5"; if (S.budget && !list.includes(S.budget)) inp.value = S.budget;
      inp.addEventListener("change", () => { S.budget = Math.max(0, +inp.value || 0); changed(); });
      own.append(el("span", "", "직접 입력"), inp, el("span", "", "억 이하"));
      q.append(own);
      return;
    }
    const fields = [["income", "연소득 (세전, 만원)", "예: 6000"], ["equity", "자기자본 (만원)", "예: 20000"],
      ["rate", "대출 금리 (%)", ""], ["years", "대출 기간 (년)", ""], ["debt", "기존 대출 연간 상환액 (만원)", ""]];
    const g = el("div", "sv-calc");
    const out = el("div", "sv-calc-out");
    fields.forEach(([k, t, ph]) => {
      const f = el("label", "field");
      const inp = el("input"); inp.type = "number"; inp.inputMode = "decimal"; inp.min = "0"; inp.placeholder = ph; inp.value = S.af[k];
      inp.addEventListener("input", () => { S.af[k] = inp.value; calc(); save(); });
      f.append(el("span", "", t), inp);
      g.append(f);
    });
    q.append(g, out);
    function calc() {
      out.replaceChildren();
      const income = +S.af.income, equity = +S.af.equity, rate = +S.af.rate, years = +S.af.years, debt = +S.af.debt || 0;
      if (!income || !equity || !years) { out.append(el("p", "muted", "연소득과 자기자본을 넣으면 바로 계산돼요.")); return; }
      const ltv = LTV[S.status || "none"];
      const r = rate / 100 / 12, n = years * 12;
      const monthly = Math.max(0, income * DSR - debt) / 12;
      const loanDsr = r > 0 ? monthly * (1 - Math.pow(1 + r, -n)) / r : monthly * n;
      const lim = maxPrice(equity, loanDsr, ltv), max = lim.p, loan = Math.max(0, max - equity);
      const why = lim.why === "cap" ? `집값 ${eok(lim.hi)} 이하 대출 한도(${eok(lim.cap)}) 기준으로 정해져요`
        : lim.why === "edge" ? `${DJ.josa(eok(lim.hi), "을/를")} 넘으면 대출 한도가 ${eok(lim.next)}으로 줄어서 여기까지예요`
        : lim.why === "dsr" ? `소득(DSR ${Math.round(DSR * 100)}%) 기준으로 한도가 정해져요`
        : lim.why === "ltv" ? `LTV ${Math.round(ltv * 100)}% 기준으로 한도가 정해져요` : "대출 없이 자기자본만으로 계산했어요";
      const pay = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
      const big = el("div", "af-big");
      big.append(el("span", "label", "최대로 살 수 있는 가격 (대략)"), el("strong", "", eok(max)));
      out.append(big, el("p", "muted", `대출 ${eok(loan)} · 매달 갚는 돈 약 ${Math.round(pay).toLocaleString()}만원 · ` +
        why));
      const b = Math.max(0.5, Math.floor(max / 5000) / 2);
      const apply = el("button", "btn primary", `${b}억을 예산으로 정하기 (${countWith({ budget: b }).toLocaleString()}곳)`);
      apply.type = "button";
      apply.addEventListener("click", () => { S.budget = b; changed(); });
      out.append(apply);
    }
    calc();
  }
  function drawPy() {
    q.append(grid("c5", ...PY.map(p => option(p.label, p.sub, countWith({ py: [p.id] }), S.py.includes(p.id),
      () => { S.py = S.py.includes(p.id) ? S.py.filter(x => x !== p.id) : [...S.py, p.id]; }))));
  }
  function drawAge() {
    q.append(grid("c3", ...AGE.map(a => option(a.label, a.sub, countWith({ age: a.id }), S.age === a.id, () => { S.age = a.id; }))));
  }
  function drawNear() {
    q.append(label(STOP));
    q.append(grid("c4", ...[300, 500, 800, 0].map(m => option(m ? `${m}m 안` : "상관없어요", null, countWith({ stn: m }), S.stn === m, () => { S.stn = m; }, "sm"))));
    q.append(label("초등학교"));
    q.append(grid("c4", ...[300, 500, 0].map(m => option(m ? `${m}m 안` : "상관없어요", m === 300 ? "초품아 수준" : null, countWith({ sch: m }), S.sch === m, () => { S.sch = m; }, "sm"))));
  }
  function drawMust() {
    q.append(grid("c3", ...MUST.map(m => option(m.label, m.sub, countWith({ must: S.must.includes(m.id) ? S.must : [...S.must, m.id] }),
      S.must.includes(m.id), () => { S.must = S.must.includes(m.id) ? S.must.filter(x => x !== m.id) : [...S.must, m.id]; }))));
  }

  // ---------- 그리기: 단계, 질문, 개수, 그림 ----------
  const stepsBox = box.querySelector("[data-sv-steps]");
  let lastN = null;
  function render() {
    const st = STEPS[S.step];
    stepsBox.replaceChildren(...STEPS.map((x, i) => {
      const li = el("li");
      const b = el("button", "sv-step" + (i === S.step ? " cur" : "") + (x.on() ? " done" : ""));
      b.type = "button";
      b.append(el("i", "", x.on() && i !== S.step ? "✓" : String(i + 1)), el("span", "", x.name));
      if (i === S.step) b.setAttribute("aria-current", "step");
      b.addEventListener("click", () => { S.step = i; render(); });
      li.append(b);
      return li;
    }));
    const cur = stepsBox.querySelector(".cur");   // 좁은 화면: 지금 단계가 보이게 가로로 밀기
    if (cur && stepsBox.scrollWidth > stepsBox.clientWidth) stepsBox.scrollLeft = cur.offsetLeft - stepsBox.clientWidth / 2 + cur.offsetWidth / 2;
    q.replaceChildren(el("p", "sv-qn", `질문 ${S.step + 1} / ${STEPS.length}`), el("h3", "sv-qt", st.q), el("p", "sv-qs", st.sub));
    st.draw();
    box.querySelector("[data-sv-prev]").disabled = S.step === 0;
    box.querySelector("[data-sv-skip]").hidden = !st.on();
    box.querySelector("[data-sv-next]").textContent = S.step === STEPS.length - 1 ? "결과 보기" : "다음";
    art();
    save();
  }
  function changed() {
    const n = count(S);
    const d = box.querySelector("[data-sv-delta]");
    if (lastN != null) {
      d.textContent = n === lastN ? `그대로 ${n.toLocaleString()}곳` : `${Math.abs(n - lastN).toLocaleString()}곳 ${n < lastN ? "줄었어요" : "늘었어요"}`;
      d.className = "sv-delta " + (n < lastN ? "down" : n > lastN ? "up" : "");
    }
    if (n === 0) d.textContent += " · 조건을 하나 풀어 보세요";
    lastN = n;
    box.querySelector("[data-sv-n]").textContent = n.toLocaleString();
    render();
    results();
  }
  box.querySelector("[data-sv-prev]").addEventListener("click", () => { if (S.step > 0) { S.step--; render(); } });
  box.querySelector("[data-sv-next]").addEventListener("click", () => {
    if (S.step < STEPS.length - 1) { S.step++; render(); box.scrollIntoView({ behavior: DJ.calm ? "auto" : "smooth", block: "start" }); }
    else document.getElementById("results").scrollIntoView({ behavior: DJ.calm ? "auto" : "smooth" });
  });
  box.querySelector("[data-sv-skip]").addEventListener("click", () => { STEPS[S.step].clear(); changed(); });
  function reset() {
    const sort = S.sort, here = S.here;
    Object.assign(S, blank(), { sort, here });
    lastN = null;
    changed();
    box.scrollIntoView({ behavior: DJ.calm ? "auto" : "smooth", block: "start" });
  }
  box.querySelector("[data-sv-reset]").addEventListener("click", reset);

  // ---------- 고른 조건 꼬리표 ----------
  function tags() {
    const t = [];
    const st = STATUS.find(x => x.id === S.status); if (st) t.push(st.label);
    if (S.gus.length) t.push(S.gus.length > 2 ? `${S.gus[0]} 외 ${S.gus.length - 1}곳` : S.gus.join("·"));
    works(S).forEach(w => t.push(`${shortName(w.name)} ${w.lim}km`));
    if (S.budget) t.push(`${S.budget}억 이하`);
    S.py.forEach(id => t.push(PY.find(p => p.id === id).label));
    const age = AGE.find(a => a.id === S.age); if (age && age.years) t.push(age.label);
    if (S.stn) t.push(`${box.dataset.stopShort || "역"} ${S.stn}m`);
    if (S.sch) t.push(`초등학교 ${S.sch}m`);
    S.must.forEach(id => t.push(MUST.find(m => m.id === id).label));
    return t;
  }

  // ---------- 그림: 고른 조건이 올라가는 작은 동네 ----------
  const art = (() => {
    const holder = box.querySelector("[data-sv-art]");
    const W = 560, H = 400, U = 22, CX = W / 2, CY = 92;
    const iso = (x, y, z = 0) => [CX + (x - y) * U * 0.866, CY + (x + y) * U * 0.5 - z * U];
    const pts = a => a.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const city = [];
    for (let gx = 0; gx < 6; gx++) for (let gy = 0; gy < 6; gy++) {
      if ((gx === 2 || gx === 3) && (gy === 2 || gy === 3)) continue;   // 가운데 = 우리 단지
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) city.push({ x: gx * 2 + 0.2 + rnd() * 0.9, y: gy * 2 + 0.2 + rnd() * 0.9, w: 0.5 + rnd() * 0.5, d: 0.5 + rnd() * 0.5, h: 0.3 + rnd() * 1.4 });
    }
    function cube(g, b, cls) {
      const { x, y, w, d, h } = b;
      const top = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
      const left = [iso(x, y + d), iso(x + w, y + d), iso(x + w, y + d, h), iso(x, y + d, h)];
      const right = [iso(x + w, y), iso(x + w, y + d), iso(x + w, y + d, h), iso(x + w, y, h)];
      [["l", left], ["r", right], ["t", top]].forEach(([f, p]) => {
        const e = document.createElementNS(NS, "polygon");
        e.setAttribute("points", pts(p)); e.setAttribute("class", `${cls} ${f}`);
        g.appendChild(e);
      });
    }
    function s(tag, attrs, parent, text) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      parent.appendChild(e);
      return e;
    }
    function bubble(g, x, y, text, cls) {
      const t = s("text", { x, y, "text-anchor": "middle", class: "art-bt " + (cls || "") }, g, text);
      const w = Math.max(40, text.length * 13 + 20);
      const r = s("rect", { x: x - w / 2, y: y - 19, width: w, height: 28, rx: 14, class: "art-b " + (cls || "") }, g);
      g.insertBefore(r, t);
    }
    return function draw() {
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `20 46 ${W - 40} ${H - 70}`); svg.setAttribute("class", "sv-svg");
      svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "고른 조건 그림");
      s("polygon", { points: pts([iso(-0.5, -0.5), iso(12, -0.5), iso(12, 12), iso(-0.5, 12)]), class: "art-ground" }, svg);
      for (let k = 0; k <= 6; k++) {   // 길
        s("line", { x1: iso(k * 2 - 0.25, -0.5)[0], y1: iso(k * 2 - 0.25, -0.5)[1], x2: iso(k * 2 - 0.25, 12)[0], y2: iso(k * 2 - 0.25, 12)[1], class: "art-road" }, svg);
        s("line", { x1: iso(-0.5, k * 2 - 0.25)[0], y1: iso(-0.5, k * 2 - 0.25)[1], x2: iso(12, k * 2 - 0.25)[0], y2: iso(12, k * 2 - 0.25)[1], class: "art-road" }, svg);
      }
      // 단지 땅
      s("polygon", { points: pts([iso(4, 4), iso(8, 4), iso(8, 8), iso(4, 8)]), class: "art-lot" + (S.budget || S.py.length ? " on" : "") }, svg);
      const ws = works(S);
      const g = s("g", {}, svg);
      const blocks = city.map(b => Object.assign({}, b, { cls: "art-bld" }));
      // 직장 탑 (오른쪽 위·왼쪽 위)
      const towers = [{ x: 10.2, y: 0.4 }, { x: 0.4, y: 10.2 }];
      ws.forEach((w, k) => blocks.push({ x: towers[k].x, y: towers[k].y, w: 1.1, d: 1.1, h: 4.2, cls: "art-tower" }));
      // 학교·역·마트
      if (S.sch) blocks.push({ x: 4.3, y: 8.6, w: 1.5, d: 0.8, h: 0.6, cls: "art-school" });
      if (S.must.includes("mart")) blocks.push({ x: 8.6, y: 6.2, w: 1.2, d: 1.2, h: 0.5, cls: "art-mart" });
      // 우리 단지: 평형을 고르면 동이 늘고, 신축이면 더 높게
      const tall = S.age === "new" ? 3.4 : S.age === "semi" ? 2.8 : 2.2;
      const homes = S.py.length || S.budget ? [{ x: 4.5, y: 4.5 }, { x: 6.3, y: 4.6 }, { x: 4.6, y: 6.3 }, { x: 6.2, y: 6.3 }] : [{ x: 5.3, y: 5.3 }];
      homes.forEach(h => blocks.push({ x: h.x, y: h.y, w: 1.2, d: 1.2, h: tall, cls: "art-home" }));
      blocks.sort((a, b) => (a.x + a.y) - (b.x + b.y)).forEach(b => cube(g, b, b.cls));
      // 학원가: 분홍 안개
      if (S.must.includes("academy") || S.must.includes("edu")) {
        const [ax, ay] = iso(9, 9);
        s("ellipse", { cx: ax, cy: ay, rx: 70, ry: 36, class: "art-haze" }, svg);
        bubble(svg, ax, ay + 6, "학원가", "soft");
      }
      // 역: 단지에서 점선으로
      if (S.stn) {
        const [sx, sy] = iso(8.4, 2.6), [hx, hy] = iso(6.4, 4.4);
        s("path", { d: `M${hx},${hy} L${sx},${sy}`, class: "art-walk" }, svg);
        s("circle", { cx: sx, cy: sy, r: 9, class: "art-stn" }, svg);
        bubble(svg, sx + 34, sy + 30, `${box.dataset.stopShort || "역"} ${S.stn}m`, "stn");
      }
      if (S.sch) { const [cx2, cy2] = iso(5, 9.2, 0.6); bubble(svg, cx2, cy2 + 34, `초등학교 ${S.sch}m`, "soft"); }
      // 직장 이름표
      ws.forEach((w, k) => {
        const [tx, ty] = iso(towers[k].x + 0.55, towers[k].y + 0.55, 4.2);
        bubble(svg, tx, ty - 12, `${shortName(w.name)} ${w.lim}km`, "work");
        const [hx, hy] = iso(6, 6, 1);
        s("path", { d: `M${hx},${hy} L${tx},${ty + 30}`, class: "art-link" }, svg);
      });
      // 예산 말풍선
      const [bx, by] = iso(5.6, 5.6, tall + 0.4);
      if (S.budget) bubble(svg, bx, by - 6, `~${S.budget}억${S.py.length ? " · " + S.py.map(id => PY.find(p => p.id === id).label).join("·") : ""}`, "main");
      const frame = el("div", "sv-art-in");
      const where = el("span", "sv-where", S.gus.length ? (S.gus.length > 2 ? `${S.gus[0]} 외 ${S.gus.length - 1}곳` : S.gus.join(" · ")) : REGION);
      const tagBox = el("div", "sv-art-tags");
      tags().forEach(t => tagBox.append(el("span", "", "#" + t.replace(/\s/g, ""))));
      frame.append(where, svg, tagBox);
      holder.replaceChildren(frame);
    };
  })();

  // ---------- 결과 ----------
  const PAGE = 24;
  let list = [], shown = 0;
  const gridBox = document.getElementById("finder-results"), more = document.getElementById("finder-more");
  function results() {
    list = ALL.filter(c => pass(c, S)).map(c => ({ c, f: fit(c, S) }));
    const priceOf = x => (x.f[0] || [0, x.c.p || Infinity])[1];
    list.sort((a, b) => S.sort === "p" ? priceOf(a) - priceOf(b) : (b.c.i || 0) - (a.c.i || 0));
    document.querySelector("[data-sv-res-n]").textContent = list.length.toLocaleString() + "곳";
    const tg = document.querySelector("[data-sv-tags]");
    tg.replaceChildren(...tags().map(t => el("span", "chip sm", t)));
    gridBox.replaceChildren();
    shown = 0;
    page();
    if (!list.length) gridBox.append(relax());
  }
  // 결과가 없을 때: 어떤 조건을 빼면 몇 곳이 되는지 보여주고 바로 뺄 수 있게
  function relax() {
    const wrap = el("div", "sv-empty");
    wrap.append(el("p", "", "조건에 맞는 단지가 없어요. 조건을 하나 빼 볼까요?"));
    const opts = STEPS.map((st, i) => {
      if (!st.on()) return null;
      const keep = Object.assign({}, S);   // clear() 는 값을 새로 넣기만 해서 얕은 복사로 되돌릴 수 있음
      st.clear(); const n = count(S); Object.assign(S, keep);
      return { i, st, n };
    }).filter(x => x && x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4);
    const row = el("div", "sv-relax");
    opts.forEach(({ i, st, n }) => {
      const b = el("button", "btn", `${st.name} 빼면 ${n.toLocaleString()}곳`);
      b.type = "button";
      b.addEventListener("click", () => { STEPS[i].clear(); changed(); });
      row.append(b);
    });
    if (!opts.length) {
      const b = el("button", "btn", "조건 모두 지우고 처음부터");
      b.type = "button";
      b.addEventListener("click", reset);
      row.append(b);
    }
    wrap.append(row);
    return wrap;
  }
  function page() {
    const ws = works(S);
    list.slice(shown, shown + PAGE).forEach(({ c, f }) => {
      const card = DJ.card(c, STATS);
      const bits = [];
      if (f.length) bits.push(`${f[0][0]}평 ${eok(f[0][1])}` + (f.length > 1 ? ` 외 ${f.length - 1}개 평형` : ""));
      ws.forEach(w => bits.push(`${shortName(w.name)} ${km(w.lat, w.lng, c.la, c.ln).toFixed(1)}km`));
      if (S.stn && c.f.subway != null) bits.push(`${box.dataset.stopShort || "역"} ${Math.round(c.f.subway)}m`);
      if (bits.length) card.prepend(el("div", "match full", bits.join(" · ")));
      gridBox.append(card);
    });
    shown = Math.min(list.length, shown + PAGE);
    more.hidden = shown >= list.length;
    more.textContent = Math.min(PAGE, list.length - shown) + "곳 더 보기";
  }
  more.addEventListener("click", page);
  document.querySelectorAll("[data-sort]").forEach(b => b.addEventListener("click", () => {
    S.sort = b.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", x === b); });
    results(); save();
  }));

  let STATS = [];
  DJ.data().then(d => {
    ALL = d.complexes;
    STATS = d.stats;
    const q70 = arr => { const v = arr.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.7)] : Infinity; };
    ctx = { hasHub: ALL.some(c => c.hm != null), acadQ: q70(ALL.map(c => c.f.academy_math ?? c.f.academy)),
            eduQ: q70(ALL.map(c => c.ed)), hospQ: q70(ALL.map(c => c.f.hospital)) };
    if (!ALL.some(c => c.f.mart !== undefined)) MUST.splice(MUST.findIndex(m => m.id === "mart"), 1);
    // 단지 정보(세대수·주차)가 없으면 그 조건은 빼요
    if (!ALL.some(c => c.hh)) for (const id of ["big", "mid", "park"]) MUST.splice(MUST.findIndex(m => m.id === id), 1);
    document.querySelectorAll("[data-sort]").forEach(x => { x.classList.toggle("active", x.dataset.sort === S.sort); x.setAttribute("aria-pressed", x.dataset.sort === S.sort); });
    const fromSearch = fromUrl();
    changed();
    if (fromSearch) document.getElementById("results").scrollIntoView();
  });
  // 검색창에서 '7억 이하 30평대'처럼 조건을 넣고 오면 (finder.html?budget=7&py=30#results) 그 조건으로 새로 시작합니다.
  // 상황·대출 계산 값과 정렬은 그대로 두고, 주소의 조건은 한 번 읽은 뒤 지웁니다 (새로고침해도 고친 조건 유지).
  function fromUrl() {
    const qs = new URLSearchParams(location.search);
    const list = k => (qs.get(k) || "").split(",").filter(Boolean);
    if (!["budget", "py", "gu", "age", "stn", "sch", "must"].some(k => qs.has(k))) return false;
    Object.assign(S, blank(), { sort: S.sort, here: S.here, status: S.status, af: S.af });
    const at = [];
    const b = +qs.get("budget");
    if (b > 0) { S.budget = b; at.push("budget"); }
    S.py = list("py").filter(id => PY.some(p => p.id === id)); if (S.py.length) at.push("py");
    const gus = new Set(ALL.map(c => c.gu));
    S.gus = list("gu").filter(g => gus.has(g)); if (S.gus.length) at.push("gu");
    if (AGE.some(a => a.id && a.id === qs.get("age"))) { S.age = qs.get("age"); at.push("age"); }
    S.stn = Math.max(0, +qs.get("stn") || 0); S.sch = Math.max(0, +qs.get("sch") || 0); if (S.stn || S.sch) at.push("near");
    S.must = list("must").filter(id => MUST.some(m => m.id === id)); if (S.must.length) at.push("must");
    S.step = Math.max(0, ...at.map(id => STEPS.findIndex(x => x.id === id)));
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* 그대로 */ }
    return true;
  }
})();
