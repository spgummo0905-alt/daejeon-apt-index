(function () {
  const { el } = DJ;
  const MAX = 4;
  const params = new URLSearchParams(location.search);
  let dropped = 0;   // 주소에 같은 단지가 두 번 있거나 없는 단지가 있어 뺀 수
  const rawPicked = (params.get("s") || [params.get("a"), params.get("b")].filter(Boolean).join(",")).split(",").filter(Boolean);
  let picked = rawPicked.filter((s, i) => rawPicked.indexOf(s) === i).slice(0, MAX);
  dropped += rawPicked.length - picked.length;
  const out = document.getElementById("vs-result");
  const shareBtn = document.getElementById("vs-share");

  // 비교 표의 행: 값, 표시, 좋은 쪽(high/low/null)
  const ROWS = [
    ["종합 지수", c => c.i, c => c.i == null ? "-" : c.i + "점", "high"],
    ["84㎡ 기준 가격", c => c.p, c => c.pt || "-", null],   // 싼 게 늘 낫다고 볼 수 없어 표시하지 않음
    ["84㎡ 환산 전세", c => c.j, c => c.jt || "-", null],
    ["전세가율", c => c.jr, c => c.jr == null ? "-" : c.jr + "%", null],
    ["입지", c => c.st[0], c => c.st[0] ?? "-", "high"],
    ["장기 흐름", c => c.st[1], c => c.st[1] ?? "-", "high"],
    ["5년 흐름", c => c.st[2], c => c.st[2] ?? "-", "high"],
    ["입지 대비 가격", c => c.st[3], c => c.st[3] ?? "-", "high"],
    ["거래량", c => c.st[4], c => c.st[4] ?? "-", "high"],
    ["신축도", c => c.st[5], c => c.st[5] ?? "-", "high"],
    ["10년 평균 상승률(해마다)", c => c.c10, c => c.c10 == null ? "-" : (c.c10 > 0 ? "+" : "") + c.c10 + "%", "high"],
    ["5년 평균 상승률(해마다)", c => c.c5, c => c.c5 == null ? "-" : (c.c5 > 0 ? "+" : "") + c.c5 + "%", "high"],
    ["최고가 대비", c => c.dd, c => c.dd == null ? "-" : (c.dd > 0 ? "+" : "") + Math.round(c.dd) + "%" + (c.py ? " (" + c.py + ")" : ""), null],
    ["지하철역", c => c.f.subway, c => c.f.subway == null ? "-" : (c.stn ? c.stn + " " : "") + c.f.subway + "m", "low"],
    ["기차역", c => c.f.rail, c => c.f.rail == null ? "-" : (c.f.rail / 1000).toFixed(1) + "km", "low"],   // 청주: 오송역·청주역 중 가까운 곳
    ["학군 점수", c => c.ed, c => c.ed == null ? "-" : c.ed + "점", "high"],
    ["· 중학교 순전입", c => c.f.school_mid, c => c.f.school_mid == null ? "-" : (c.f.school_mid > 0 ? "+" : "") + c.f.school_mid + "%", "high"],
    ["· 주요 학원가", c => c.hm, c => c.hm == null ? "-" : c.hn + " " + c.hm + "분", "low"],
    ["· 주변 수학 학원", c => c.f.academy_math, c => c.f.academy_math == null ? "-" : c.f.academy_math + "곳", "high"],
    ["초등학교", c => c.f.elementary, c => c.f.elementary == null ? "-" : c.f.elementary + "m", "low"],
    ["준공", c => c.y, c => c.y ? c.y + "년" : "-", null],
    ["세대수", c => c.hh, c => c.hh ? c.hh.toLocaleString() + "세대" : "-", "high"],
    ["세대당 주차", c => c.pk, c => c.pk ? c.pk.toFixed(1) + "대" : "-", "high"],
  ];

  // 비교 다음 단계: 이미 있는 기능(임장 코스 담기, 프로젝트)으로 이어 줍니다. 누르기 전에는 아무것도 바꾸거나 이동하지 않습니다.
  //  · 코스로 보내려면 위치가 있는 단지 2곳 이상 · 코스에 넣은 뒤에는 관심 화면의 코스로 (첫 단지 길찾기가 거기 있음)
  function nextStep(cs) {
    const box = document.getElementById("vs-next");
    if (!box) return;
    box.replaceChildren();
    const withLoc = cs.filter(c => Number.isFinite(c.la) && Number.isFinite(c.ln));
    box.hidden = cs.length < 2;
    document.body.classList.toggle("cmp-ready", cs.length >= 2);   // 모양만 바꿈: 입력 구역을 줄이고 다음 행동을 아래에 고정
    if (cs.length < 2) return;
    box.append(el("p", "next-t", "고른 단지로 이어가기"));
    const row = el("div", "next-row");
    if (withLoc.length >= 2 && DJ.addToCourse) {
      const b = el("button", "btn primary", "이 단지들로 임장 코스 만들기");
      b.type = "button";
      b.addEventListener("click", () => {
        const n = DJ.addToCourse(withLoc.map(c => c.s));
        if (n < 0) { DJ.toast("임장 코스가 꽉 찼어요", "관심 화면의 임장 코스에서 한 곳을 빼고 다시 넣어 주세요"); return; }
        DJ.toast(n ? `임장 코스에 ${n}곳 넣었어요` : "이미 임장 코스에 들어 있어요", "순서와 첫 단지 길찾기는 코스 화면에서 볼 수 있어요", 7000, { label: "임장 코스 보기 →", href: (window.DJ_ROOT || "") + "my.html#course" });
      });
      row.append(b);
    }
    const p = el("a", "btn", "집 찾기 프로젝트에서 이어가기");
    p.href = (window.DJ_ROOT || "") + "projects.html";
    row.append(p);
    box.append(row);
    if (withLoc.length < cs.length) box.append(el("p", "muted small", "위치 정보가 없는 단지는 코스에 넣을 수 없어요."));
  }

  // 내 조건 기준: '조건으로 찾기'에서 고른 조건과 각 단지의 실제 값을 견줘, 맞는 점·벗어난 점·자료 없음으로 나눕니다 (평가·추천 없음)
  const SURVEY_NAME = { gus: "지역", budget: "예산", py: "평형", age: "연식", stn: "역", sch: "초등학교", must: "필수 조건" };
  function myFit(cs) {
    const survey = DJ.load("survey", {}), box = el("section", "cmp-fit");
    box.setAttribute("aria-label", "내 조건 기준");
    if (!window.DJFit || !DJFit.hasConditions(survey)) {
      box.append(el("h3", "", "내 조건 기준"), el("p", "muted", "조건으로 찾기에서 예산·평형·역 거리를 정하면, 여기서 단지마다 맞는 점과 벗어난 점을 나눠 볼 수 있어요."));
      const a = el("a", "btn sm", "조건으로 찾기"); a.href = "finder.html"; box.append(a); return box;
    }
    const year = new Date().getFullYear(), res = cs.map(c => DJFit.evaluate(survey, c, year));
    box.append(el("h3", "", "내 조건 기준"), el("p", "sv-note", "조건으로 찾기에서 고른 조건과 단지의 실제 값을 견줬어요. 어느 집이 낫다는 판단은 하지 않아요."));
    const grid = el("div", "cmp-fit-grid");
    cs.forEach((c, k) => {
      const r = res[k], card = el("div", "cmp-fit-card");
      card.append(el("b", "", c.n), el("span", "cmp-fit-n", `맞음 ${r.ok.length} · 벗어남 ${r.miss.length}${r.unknown.length ? " · 자료 없음 " + r.unknown.length : ""}`));
      [["ok", "맞는 점", "✓"], ["miss", "벗어난 점", "−"], ["unknown", "자료 없음", "?"]].forEach(([key, title, mark]) => {
        if (!r[key].length) return;
        card.append(el("p", "pj-sum-h", title));
        const ul = el("ul", "cmp-fit-" + key);
        r[key].forEach(x => ul.append(el("li", "", `${mark} ${x.label} · ${x.detail}`)));
        card.append(ul);
      });
      grid.append(card);
    });
    box.append(grid);
    const skipped = [...new Set(res.flatMap(r => r.skipped))];
    if (skipped.length) box.append(el("p", "muted small", "학원가·학군·병원 조건은 지역 전체 순위가 필요해서 이 화면에서는 판정하지 않았어요. 조건으로 찾기 결과에서 확인해 주세요."));
    return box;
  }

  DJ.data().then(d => {
    const before = picked.length; picked = picked.filter(s => d.bySlug[s]); dropped += before - picked.length;
    const input = document.getElementById("pick");
    DJ.search(input, c => {
      if (!picked.includes(c.s)) picked = [...picked, c.s].slice(-MAX);
      input.value = "";
      render(d);
    });
    document.getElementById("vs-random").addEventListener("click", () => {
      const pool = d.complexes.filter(c => c.i != null);
      const x = pool[Math.floor(Math.random() * pool.length)];
      const same = pool.filter(c => c.gu === x.gu && c.s !== x.s).sort(() => Math.random() - 0.5);
      picked = [x.s, ...same.slice(0, 2).map(c => c.s)];
      render(d);
    });
    render(d);
  });

  // 2곳 미만: 막다른 화면 대신 '담는 칸 + 진행 표시 + 다음 행동'. 새 저장 없음(관심·최근 본 단지와 주소의 단지 목록만 사용)
  function emptyStart(cs, quick) {
    const root = (window.DJ_ROOT || "");
    const box = el("div", "vs-start");
    const slots = el("ol", "vs-slots");
    for (let i = 0; i < MAX; i++) {
      const li = el("li", "vs-slot" + (cs[i] ? " on" : ""), cs[i] ? cs[i].n : "＋");
      if (!cs[i]) li.setAttribute("aria-label", i < 2 ? "비어 있는 칸(필수)" : "비어 있는 칸(선택)");
      slots.append(li);
    }
    const need = Math.max(0, 2 - cs.length);
    box.append(el("p", "vs-prog", `${cs.length} / 2곳 이상`), slots,
      el("p", "vs-need", need ? `${need}곳 더 담으면 비교할 수 있어요` : ""));
    if (!quick.length && !cs.length) {
      box.append(el("p", "muted center", "담아 둔 단지가 아직 없어요."));
      const a = el("a", "btn primary", "조건으로 단지 찾으러 가기"); a.href = root + "finder.html"; box.append(a);
    } else if (!quick.length) {
      const a = el("a", "btn", "다른 단지 찾으러 가기"); a.href = root + "finder.html"; box.append(a);
    }
    return box;
  }

  // 결과 맨 위: 고른 단지 카드를 나란히(2곳은 두 칸, 3~4곳은 옆으로 넘김). 값은 모두 complexes.json 그대로
  function deckOf(cs) {
    const row = el("div", "cmp-deck n" + cs.length);
    row.setAttribute("aria-label", "비교하는 단지 카드");
    cs.forEach(c => row.append(DJ.hc.col(c)));
    return row;
  }
  // 먼저 볼 차이 1~3개: 가격 → 종합 지수 → 입지 점수 순서로 두 값이 실제로 다른 항목을 앞에 두고(사용자가 가장 먼저 보는 세 가지),
  // 부족하면 역 거리·학군으로 채움. 각 줄은 '얼마나 차이 나는지'를 먼저, 값은 뒤에 적음(우열·추천 문구 없음). 가격은 추정(84㎡ 환산)임을 적고, 값이 없는 단지는 건너뜀
  function diffsOf(cs) {
    const vals = g => cs.map(c => ({ c, v: g(c) })).filter(x => x.v != null);
    const spread = g => { const v = vals(g).map(x => x.v); return v.length >= 2 ? Math.max(...v) - Math.min(...v) : 0; };
    const line = (g, f) => vals(g).map(x => x.c.n + " " + f(x)).join(" · ");
    // 가격 차이는 화면에 보이는 값(0.1억 단위로 반올림, 카드의 가격과 같은 자릿수)끼리 빼서, 보이는 숫자와 어긋나지 않게
    const won = m => m >= 10000 ? (Math.round(m / 1000) / 10).toString().replace(/\.0$/, "") + "억" : Math.round(m).toLocaleString() + "만원";   // p 는 만원 단위
    const pts = n => Math.round(n) + "점";
    const defs = [
      [c => (c.p != null ? Math.round(c.p / 1000) * 1000 : null), "가격", m => "약 " + won(m) + " 차이", x => cs.find(c => c === x.c).pt || "-", " · 84㎡ 추정"],
      [c => c.i, "종합 지수", m => pts(m) + " 차이", x => x.v + "점", ""],
      [c => c.st && c.st[0], "입지 점수", m => pts(m) + " 차이", x => x.v + "점", ""],
      [c => c.f && c.f.subway, "지하철역 거리", m => Math.round(m) + "m 차이", x => x.v + "m", ""],
      [c => c.ed, "학군 점수", m => pts(m) + " 차이", x => x.v + "점", ""],
    ];
    const cand = defs.map(([g, k, head, f, note]) => { const m = spread(g); return { m, k, head: head(m), v: line(g, f) + note }; }).filter(x => x.m > 0);
    const box = el("section", "cmp-diff");
    box.setAttribute("aria-label", "먼저 볼 차이");
    box.append(el("h3", "", "먼저 볼 차이"));
    if (!cand.length) { box.append(el("p", "muted", "고른 단지들의 값이 거의 같아요. 아래 표에서 항목별로 살펴보세요.")); return box; }
    const ul = el("ul", "");
    cand.slice(0, 3).forEach(x => { const li = el("li", ""); li.append(el("b", "", x.k + " " + x.head), el("span", "", x.v)); ul.append(li); });
    box.append(ul, el("p", "muted small", "어느 집이 낫다는 판단은 하지 않아요. 같은 기준의 값만 나란히 보여 드려요."));
    return box;
  }

  // 현장에서 확인할 것: 단지마다 자료로 짚은 현장 체크 항목(DJ.visitItems, 현장 모드와 같은 계산)을 앞의 3개까지 '제안'으로 보여 줌.
  // 읽기만 합니다 — 체크 표시·방문·사진은 만들지 않고, 저장 구조도 바꾸지 않음. 사용자가 직접 현장 모드(#field)에서 확인하고 기록해야 남습니다.
  function fieldOf(cs) {
    const box = el("section", "cmp-field");
    box.setAttribute("aria-label", "현장에서 확인할 것");
    box.append(el("h3", "", "현장에서 확인할 것"));
    const region = document.body.dataset.region || "";
    let any = false;
    cs.forEach(c => {
      const items = DJ.visitItems ? DJ.visitItems(c, region).filter(x => !String(x[0]).startsWith("my:")).slice(0, 3) : [];
      if (!items.length) return;
      any = true;
      const card = el("div", "cmp-field-c");
      card.append(el("b", "", c.n));
      const ul = el("ul", "");
      items.forEach(x => { const li = el("li", ""); li.append(el("span", "", x[1]), el("small", "", x[2])); ul.append(li); });
      card.append(ul);
      if (Number.isFinite(c.la) && Number.isFinite(c.ln)) { const a = el("a", "btn", c.n + " 현장 모드 열기"); a.href = DJ.href(c) + "#field"; card.append(a); }
      box.append(card);
    });
    if (!any) { box.append(el("p", "muted", "이 단지들은 숫자로 짚이는 약점이 크지 않아요. 단지 화면의 현장 모드에서 기본 항목을 확인해 보세요.")); }
    box.append(el("p", "muted small", "자료로 짚은 제안이에요. 확인한 결과는 현장 모드에서 직접 체크해야 기록으로 남아요."));
    return box;
  }

  function render(d) {
    if (picked.length >= 2 && DJ.act) DJ.act("cmp");   // 임장 배지 '나란히 비교'
    const box = document.getElementById("picked");
    box.replaceChildren();
    picked.forEach(s => {
      const c = d.bySlug[s];
      const chip = el("button", "chip active", c.n + " ×");
      chip.type = "button";
      chip.title = "비교에서 빼기";
      chip.addEventListener("click", () => { picked = picked.filter(x => x !== s); render(d); });
      box.append(chip);
    });
    // 관심 단지·최근 본 단지는 한 번 눌러 바로 추가
    const quick = [...new Set([...DJ.favs(), ...DJ.recent().map(r => r.s)])]
      .filter(s => d.bySlug[s] && !picked.includes(s)).slice(0, 8);
    const qbox = document.getElementById("quick-chips");
    qbox.replaceChildren();
    // 관심 단지 한 번에 (앞 4곳): 임장 후보끼리 바로 견주게. 이미 그대로 골랐으면 안 보임
    const mine = DJ.favs().filter(s => d.bySlug[s]).slice(0, MAX);
    const fill = mine.length >= 2 && !(mine.length === picked.length && mine.every(s => picked.includes(s)));
    if (fill) {
      const b = el("button", "chip qa-fill");
      b.type = "button";
      b.append(DJ.icon("star"), document.createTextNode(`관심 단지 ${mine.length}곳 한 번에`));
      b.addEventListener("click", () => { picked = mine.slice(); render(d); });
      qbox.append(b);
    }
    document.getElementById("quick-add").hidden = !fill && (!quick.length || picked.length >= MAX);
    if (picked.length < MAX) quick.forEach(s => {
      const c = d.bySlug[s];
      const b = el("button", "chip", "+ " + c.n);
      b.type = "button";
      if (DJ.isFav(s)) b.append(el("span", "qa-star", "★"));
      b.addEventListener("click", () => { picked = [...picked, s].slice(-MAX); render(d); });
      qbox.append(b);
    });
    params.delete("a"); params.delete("b");
    if (picked.length) params.set("s", picked.join(",")); else params.delete("s");
    history.replaceState(null, "", location.pathname + (params.size ? "?" + params : ""));
    const cs = picked.map(s => d.bySlug[s]);
    out.replaceChildren();
    shareBtn.hidden = cs.length < 2;
    nextStep(cs);
    if (cs.length < 2) { out.append(emptyStart(cs, quick)); return; }

    // 항목별 1위 횟수
    const wins = cs.map(() => 0);
    const table = el("table", "cmp-table");
    const thead = el("thead"), hr = el("tr");
    hr.append(el("th", "", ""));
    cs.forEach(c => { const th = el("th"); th.scope = "col"; const a = el("a", "", c.n); a.href = DJ.href(c);
      th.append(el("span", "grade g-" + c.g, c.g), document.createTextNode(" "), a); hr.append(th); });
    thead.append(hr); table.append(thead);
    const tb = el("tbody");
    // 항목별 1위 세기: 가격·종합 지수, 좋고 나쁨이 없는 줄, 학군 세부(·로 시작)는 빼고 셉니다
    const counted = (name, better) => better && name !== "84㎡ 기준 가격" && name !== "종합 지수" && !name.startsWith("· ");
    const rows = ROWS.filter(([, get]) => !cs.every(c => get(c) == null));  // 모두 값이 없는 줄(아직 자료 없는 항목)은 빼기
    const KEY = new Set(["종합 지수", "84㎡ 기준 가격", "입지", "지하철역", "학군 점수", "준공"]);   // 처음엔 이 줄만 보이고 나머지는 '더 보기'
    const nCounted = rows.filter(([n, , , b]) => counted(n, b)).length;
    rows.forEach(([name, get, show, better]) => {
      const tr = el("tr");
      if (!KEY.has(name)) tr.className = "more-row";
      { const rh = el("th", name.startsWith("· ") ? "sub" : "", name.replace(/^· /, "")); rh.scope = "row"; tr.append(rh); }
      const vals = cs.map(get);
      const valid = vals.filter(v => v != null);
      const best = better && valid.length > 1 ? (better === "high" ? Math.max(...valid) : Math.min(...valid)) : null;
      const unique = best != null && vals.filter(v => v === best).length === 1;
      cs.forEach((c, k) => {
        const td = el("td", "", String(show(c)));
        if (unique && vals[k] === best) { td.classList.add("best"); if (counted(name, better)) wins[k]++; }
        tr.append(td);
      });
      tb.append(tr);
    });
    table.append(tb);
    const top = wins.indexOf(Math.max(...wins));
    const verdict = el("p", "verdict", cs.length === 2
      ? (wins[0] === wins[1] ? "우세한 항목 수가 같습니다. 예산과 생활 조건도 함께 비교하세요"
         : DJ.josa(cs[top].n, "이/가") + " 비교 항목 " + nCounted + "개 중 " + wins[top] + "개에서 앞섭니다")
      : "항목별 우위: " + cs.map((c, k) => c.n + " " + wins[k] + "개").join(", "));
    const wrap = el("div", "table-wrap cmp-wrap collapsed"); wrap.append(table);
    wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "단지 비교 표. 옆으로 밀어 모든 단지를 볼 수 있어요");   // 키보드로도 옆으로 밀 수 있게
    const scrollHint = el("div", "cmp-scroll");
    if (cs.length >= 3) {
      scrollHint.append(el("p", "cmp-scroll-t", `← 옆으로 밀어 ${cs.length}곳 모두 보기`));
      const jumps = el("div", "cmp-jumps");
      cs.forEach((c, k) => {
        const b = el("button", "chip cmp-jump", c.n); b.type = "button"; b.setAttribute("aria-label", c.n + " 열로 이동");
        b.addEventListener("click", () => { const th = table.querySelectorAll("thead th")[k + 1]; if (th) wrap.scrollTo({ left: Math.max(0, th.offsetLeft - table.querySelector("tbody th").offsetWidth), behavior: DJ.calm ? "auto" : "smooth" }); });
        jumps.append(b);
      });
      scrollHint.append(jumps);
    }
    const nMore = rows.filter(([n]) => !KEY.has(n)).length;
    const moreBtn = el("button", "btn cmp-more", `나머지 ${nMore}개 항목 더 보기`);
    moreBtn.type = "button"; moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.addEventListener("click", () => {
      const open = wrap.classList.toggle("collapsed") === false;
      moreBtn.setAttribute("aria-expanded", String(open));
      moreBtn.textContent = open ? "핵심 항목만 보기" : `나머지 ${nMore}개 항목 더 보기`;
    });
    if (!nMore) moreBtn.hidden = true;
    const cardGrid = el("div", "card-grid");
    cs.forEach(c => cardGrid.append(DJ.card(c, d.stats, { others: cs.filter(o => o !== c) })));
    const cards = el("details", "cmp-cards");   // 표와 같은 정보라서 처음엔 접어 둠 (화면이 1,700px 길어지는 것을 막음). 열면 기존 카드 그대로
    cards.append(el("summary", "", `단지별 점수 카드 ${cs.length}장 보기`), cardGrid);
    if (dropped) out.append(el("p", "muted small cmp-dropped", `주소의 단지 중 ${dropped}곳은 겹치거나 없거나 4곳을 넘어서 뺐어요.`));
    verdict.hidden = true;   // 화면에는 우열 문장을 보이지 않음(우열·추천 표현 금지). 공유 문구 계산에만 그대로 사용
    out.append(deckOf(cs), diffsOf(cs), fieldOf(cs), verdict, myFit(cs), scrollHint, wrap, moreBtn, el("p", "muted center small", "강조한 칸은 해당 항목에서 상대적으로 유리한 값입니다. 점수·세대수는 높을수록, 거리는 가까울수록 표시하며 가격에는 우열 표시를 붙이지 않습니다. 내 예산과 생활 조건을 함께 살펴보세요."), cards);
    out.classList.remove("pop"); void out.offsetWidth; out.classList.add("pop");
    // 공유: 같은 비교를 여는 링크와 등급 카드를 나란히 그린 그림 카드 (공유 시트, sharekit.js)
    shareBtn.onclick = () => {
      const base = location.origin + location.pathname.replace(/[^/]*$/, "");
      const url = base + "compare.html?s=" + cs.map(c => encodeURIComponent(c.s)).join(",") + "&from=share";
      const vs = cs.map(c => c.n).join(" vs ");
      const short = verdict.textContent.replace(/앞섭니다$/, "앞서요").replace(/비슷합니다$/, "비슷해요");
      const o = {
        scope: "고른 단지 이름과 값 · 내 메모·사진·방문 기록은 보내지 않아요",
        head: "단지 비교 공유", button: "비교 보기", url, file: "apt-compare.png", og: base + "static/og/compare.jpg",
        title: vs, desc: short + " · 입지·수익률·전세가율·학군까지 나란히",
        copy: `${vs}\n${short}`, glyphs: vs + short + cs.map(c => (c.pt || "") + DJ.place(c)).join(""),
        art: () => DJ.shareArt.compare({ cs, wins, verdict: short }),
      };
      if (DJ.shareSheet) DJ.shareSheet(o);
      else DJ.share(o.title, o.copy, url);
    };
  }
})();
