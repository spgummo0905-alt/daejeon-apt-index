(function () {
  const { el } = DJ;
  const MAX = 4;
  const params = new URLSearchParams(location.search);
  let picked = (params.get("s") || [params.get("a"), params.get("b")].filter(Boolean).join(",")).split(",").filter(Boolean).slice(0, MAX);
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
    picked = picked.filter(s => d.bySlug[s]);
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
      const li = el("li", "vs-slot" + (cs[i] ? " on" : ""), cs[i] ? cs[i].n : (i < 2 ? "비어 있음" : "선택"));
      slots.append(li);
    }
    const need = Math.max(0, 2 - cs.length);
    box.append(el("p", "vs-prog", `${cs.length} / 2곳 이상`), slots,
      el("p", "vs-need", need ? `${need}곳 더 담으면 비교할 수 있어요` : ""));
    if (!quick.length && !cs.length) {
      box.append(el("p", "muted center", "아직 관심·최근 본 단지가 없어요."));
      const a = el("a", "btn primary", "조건으로 단지 찾으러 가기"); a.href = root + "finder.html"; box.append(a);
    } else if (!quick.length) {
      const a = el("a", "btn", "다른 단지 찾으러 가기"); a.href = root + "finder.html"; box.append(a);
    }
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
    cs.forEach(c => { const th = el("th"); const a = el("a", "", c.n); a.href = DJ.href(c);
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
      tr.append(el("th", name.startsWith("· ") ? "sub" : "", name.replace(/^· /, "")));
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
    const nMore = rows.filter(([n]) => !KEY.has(n)).length;
    const moreBtn = el("button", "btn cmp-more", `나머지 ${nMore}개 항목 더 보기`);
    moreBtn.type = "button"; moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.addEventListener("click", () => {
      const open = wrap.classList.toggle("collapsed") === false;
      moreBtn.setAttribute("aria-expanded", String(open));
      moreBtn.textContent = open ? "핵심 항목만 보기" : `나머지 ${nMore}개 항목 더 보기`;
    });
    if (!nMore) moreBtn.hidden = true;
    const cards = el("div", "card-grid");
    cs.forEach(c => cards.append(DJ.card(c, d.stats, { others: cs.filter(o => o !== c) })));
    out.append(verdict, myFit(cs), wrap, moreBtn, el("p", "muted center small", "강조한 칸은 해당 항목에서 상대적으로 유리한 값입니다. 점수·세대수는 높을수록, 거리는 가까울수록 표시하며 가격에는 우열 표시를 붙이지 않습니다. 내 예산과 생활 조건을 함께 살펴보세요."), cards);
    out.classList.remove("pop"); void out.offsetWidth; out.classList.add("pop");
    // 공유: 같은 비교를 여는 링크와 등급 카드를 나란히 그린 그림 카드 (공유 시트, sharekit.js)
    shareBtn.onclick = () => {
      const base = location.origin + location.pathname.replace(/[^/]*$/, "");
      const url = base + "compare.html?s=" + cs.map(c => encodeURIComponent(c.s)).join(",") + "&from=share";
      const vs = cs.map(c => c.n).join(" vs ");
      const short = verdict.textContent.replace(/앞섭니다$/, "앞서요").replace(/비슷합니다$/, "비슷해요");
      const o = {
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
