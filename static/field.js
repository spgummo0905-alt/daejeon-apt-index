// 현장 모드: 임장 와서 휴대폰으로 이 단지에서 확인할 것을 한 화면에 (단지 페이지 바로가기 줄의 '현장 모드').
// - 내 위치에서 단지까지 거리와 걸어서 걸리는 시간, 카카오맵 길찾기
// - 이 단지 자료로 짚은 체크리스트(언덕·주차·관리비 …)와 기본 항목
// - 부동산에서 들은 호가를 그 평형 시세와 바로 견주기
// - 메모, '다녀왔어요' (관심 화면의 임장 코스·임장 노트와 같은 기록, 이 기기에만)
(function () {
  const sheet = document.getElementById("field-sheet");
  const opens = document.querySelectorAll("[data-field]");
  if (!sheet || !opens.length) return;
  const { el } = DJ;
  const slug = sheet.dataset.slug, name = sheet.dataset.name, la = +sheet.dataset.la, ln = +sheet.dataset.ln;
  const region = document.body.dataset.region || "";
  const body = sheet.querySelector("[data-fm-body]");
  let v = DJ.visit(slug), built = false, back = null;

  const eok = m => (m >= 10000 ? (+(m / 10000).toFixed(2)) + "억" : Math.round(m).toLocaleString() + "만");
  const dist = m => (m < 1000 ? Math.round(m) + "m" : (m / 1000).toFixed(1) + "km");
  const walk = m => DJ.walkMin(m);   // 직선거리 → 걸어서 몇 분 (app.js 공통 계산)
  const meters = (a1, o1, a2, o2) => {
    const r = x => x * Math.PI / 180, h = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };
  const keep = () => DJ.saveVisit(slug, v);
  // 저장이 실제로 됐을 때만 true. 실패하면 부르는 쪽이 화면과 기록을 원래대로 돌립니다 (실패 알림은 DJ.save 가 띄움).
  // 계정을 연결하는 중에는 DJ.save 가 조용히 false 만 주므로 그때만 여기서 알려요.
  function persist() {
    const ok = keep();
    if (!ok && DJ.sync && DJ.sync.linking) DJ.toast("잠시 뒤 다시 해 주세요", "계정을 연결하는 중이라 지금은 저장할 수 없어요.", 5000);
    return ok;
  }
  // 사진 올리기·지우기가 실패한 이유를 알아듣기 쉽게 (다시 하면 되는지, 로그인이 필요한지)
  const photoWhy = e => e && e.status === 413 ? "사진이 너무 커요. 더 작은 사진으로 해 주세요."
    : e && (e.status === 401 || e.status === 403) ? "로그인이 풀렸을 수 있어요. 다시 로그인해 주세요."
    : (e instanceof TypeError || navigator.onLine === false) ? "인터넷 연결을 확인하고 다시 해 주세요."
    : "잠시 뒤 다시 해 주세요.";

  function open() {
    if (!built) { built = true; DJ.data().then(d => build(d.bySlug[slug], d)).catch(() => build(null)); }
    if (!back) {
      back = el("div", "sheet-back");
      back.hidden = true;
      back.addEventListener("click", close);
      document.body.append(back);
    }
    back.hidden = false; sheet.hidden = false;
    requestAnimationFrame(() => { back.classList.add("on"); sheet.classList.add("on"); });
    document.addEventListener("keydown", esc);
    setTimeout(() => sheet.querySelector("h3").focus(), 60);
  }
  function close() {
    if (window.DJWorkspaceEmbed) { DJWorkspaceEmbed.send("close"); return; }
    if (DJ.hasVisitLogDraft?.() && !confirm("아직 저장하지 않은 방문 기록이 있어요. 현장 체크를 닫을까요?")) return;
    back.classList.remove("on"); sheet.classList.remove("on");
    setTimeout(() => { back.hidden = true; sheet.hidden = true; }, DJ.calm ? 0 : 220);
    document.removeEventListener("keydown", esc);
    if (location.hash === "#field") history.replaceState(null, "", location.pathname + location.search);
  }
  function esc(e) { if (e.key === "Escape") close(); }
  // 기본 기록은 비회원도 기기에 저장. 계정 전환 중인 경우에만 입력을 기다립니다.
  opens.forEach(b => b.addEventListener("click", () => { if (!DJ.askLogin("현장 모드")) open(); }));
  sheet.querySelectorAll("[data-fm-close]").forEach(b => b.addEventListener("click", close));

  function section(title, sub) {
    const s = el("section", "fm-sec");
    const h = el("h4", "", title);
    s.append(h);
    if (sub) s.append(el("p", "fm-sub", sub));
    return s;
  }

  let last = null, journal = null;
  function build(c, d) {
    last = [c, d];
    journal = DJVisitLogUI({ region, slug, names: { [slug]: name }, data: d, defaultProjectId: window.DJWorkspaceEmbed?.projectId });
    DJ.hasVisitLogDraft = journal.dirty;
    body.replaceChildren(...[course(c, d), where(c), checks(c), quotes(c), photos(), memo(), journal.element].filter(Boolean));
    if (DJ.paintSync) DJ.paintSync();
  }

  // 0. 임장 코스: 이 단지가 내 코스의 몇 번째인지, 다음 단지까지 거리·길찾기, 이전·다음 단지 현장 모드로 바로
  //    (하루에 여러 단지를 돌 때 관심 화면으로 돌아가지 않고 현장에서 이어 가게). 코스에 없으면 넣기
  function course(c, d) {
    if (!c || !d || c.la == null) return null;
    const { mode, stops } = DJ.courseStops(d), sp = DJ.SPEED[mode];
    const k = stops.findIndex(x => x.s === slug);
    const hm = m => m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}`;
    const redraw = () => document.dispatchEvent(new CustomEvent("dj:course"));   // 아래 dj:course 에서 다시 그림
    let s;
    if (k < 0 || stops.length < 2) {
      s = section("임장 코스", "여러 단지를 둘러본다면 코스에 넣어 가까운 순서대로 다니세요. 다음 단지까지 거리와 길찾기가 여기에 나와요.");
      s.dataset.course = "";
      const add = el("button", "btn", "이 단지를 임장 코스에 넣기");
      add.type = "button";
      add.addEventListener("click", () => {
        if (DJ.addToCourse([slug]) < 0) { DJ.toast("임장 코스가 꽉 찼어요", "관심 화면의 임장 코스에서 한 곳을 빼고 다시 넣어 주세요"); return; }
        DJ.toast("임장 코스에 넣었어요", "코스의 다른 단지와 가까운 순서로 묶었어요");
        redraw();
      });
      s.append(add);
      return s;
    }
    s = section(`임장 코스 ${k + 1}/${stops.length}`, null);
    s.classList.add("fm-course");
    s.dataset.course = "";
    const nx = stops[k + 1], pv = stops[k - 1];
    if (nx) {
      const km = DJ.km(c, nx), m = km < 1 ? Math.round(km * 1000 / 10) * 10 + "m" : km.toFixed(1) + "km";
      const leg = el("p", "fm-leg", `다음 ${nx.n}까지 ${m} · ${sp.label} 약 ${hm(DJ.moveMin(km, mode))}`);
      const go = el("a", "fm-leg-go", "길찾기 ›");
      go.href = `https://map.kakao.com/link/from/${encodeURIComponent(c.n)},${c.la},${c.ln}/to/${encodeURIComponent(nx.n)},${nx.la},${nx.ln}`;
      go.target = "_blank"; go.rel = "noopener";
      leg.append(" ", go);
      s.append(leg);
    } else {
      s.append(el("p", "fm-leg", "코스의 마지막 단지예요. 오늘 둘러본 기록은 관심 화면의 임장 노트에서 다시 볼 수 있어요."));
    }
    const nav = el("div", "fm-cnav");
    const to = (x, label, cls) => {
      const a = el("a", "fm-cgo " + cls);
      a.href = DJ.href(x) + "#field";
      a.append(el("small", "", label), el("b", "", x.n));
      return a;
    };
    if (pv) nav.append(to(pv, "← 이전 단지", "prev"));
    if (nx) nav.append(to(nx, "다음 단지 →", "next"));
    else {
      const a = el("a", "fm-cgo next");
      a.href = (window.DJ_ROOT || "") + "my.html#notes";
      a.append(el("small", "", "다 둘러봤다면"), el("b", "", "임장 노트 보기"));
      nav.append(a);
    }
    s.append(nav);
    return s;
  }

  // 1. 어디쯤: 역에서 단지까지(자료), 내 위치에서 단지까지(누르면), 길찾기
  function where(c) {
    const s = section("지금 어디쯤", null);
    const box = el("div", "fm-loc");
    if (c && c.f && c.f.subway != null && c.stn)
      box.append(el("p", "", `${c.stn}에서 단지까지 직선 ${dist(c.f.subway)} · 걸어서 약 ${walk(c.f.subway)}분`));
    const me = el("p", "fm-me", "");
    me.hidden = true;
    const row = el("div", "fm-row");
    const b = el("button", "btn", "내 위치에서 거리 보기");
    b.type = "button";
    b.addEventListener("click", () => {
      if (!navigator.geolocation) { me.hidden = false; me.textContent = "이 브라우저는 위치를 알려 주지 않아요."; return; }
      b.disabled = true; b.textContent = "위치 찾는 중…";
      navigator.geolocation.getCurrentPosition(p => {
        const m = meters(p.coords.latitude, p.coords.longitude, la, ln);
        me.hidden = false;
        me.textContent = m < 60 ? "지금 단지 바로 앞이에요." :
          m <= 3000 ? `여기서 단지까지 직선 ${dist(m)} · 걸어서 약 ${walk(m)}분` : `여기서 단지까지 직선 ${dist(m)}`;
        b.disabled = false; b.textContent = "다시 재기";
      }, () => {
        me.hidden = false; me.textContent = "위치를 가져오지 못했어요. 휴대폰 설정에서 위치 권한을 확인해 주세요.";
        b.disabled = false; b.textContent = "내 위치에서 거리 보기";
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
    const go = el("a", "btn", "카카오맵 길찾기 ›");
    go.href = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${la},${ln}`;
    go.target = "_blank"; go.rel = "noopener";
    row.append(b, go);
    box.append(me, row);
    s.append(box);
    if (!(la && ln)) s.hidden = true;
    return s;
  }

  // 2. 체크리스트: 이 단지 자료로 짚은 항목을 먼저, 기본 항목은 접어서
  function checks(c) {
    const items = c ? DJ.visitItems(c, region) : [];
    const s = section("현장 체크리스트", items.length ? "숫자로 본 이 단지의 약점부터 직접 확인해 보세요." : null);
    const cnt = el("span", "fm-cnt");
    s.querySelector("h4").append(cnt);
    const paint = () => { const [n, all] = DJ.visitDone(v, items); cnt.textContent = `${n}/${all}`; cnt.classList.toggle("done", n === all); };
    const row = (txt, why, on, set) => {
      const lab = el("label", "fm-chk" + (why ? " mine" : ""));
      const cb = el("input"); cb.type = "checkbox"; cb.checked = on;
      cb.addEventListener("change", () => {
        const was = !cb.checked;
        set(cb.checked);
        if (!persist()) { set(was); cb.checked = was; }   // 저장하지 못하면 체크도 되돌려 화면과 기록이 같게
        paint();
      });
      const t = el("span", "", txt);
      if (why) t.append(el("small", "", why));
      lab.append(cb, t);
      return lab;
    };
    if (items.length) {
      const mine = el("div", "fm-list");
      items.forEach(([id, txt, why]) => mine.append(row(txt, why, !!v.x[id], on => { v.x[id] = on; })));
      s.append(mine);
    }
    const det = el("details", "fm-basic");
    if (!items.length) det.open = true;
    det.append(el("summary", "", `기본 체크 ${DJ.CHECK.length}가지`));
    const list = el("div", "fm-list");
    DJ.CHECK.forEach((txt, i) => list.append(row(txt, "", !!v.c[i], on => { v.c[i] = on; })));
    det.append(list);
    s.append(det);
    paint();
    return s;
  }

  // 3. 들은 호가 적기: 평형 시세와 견줘 비싼지·싼지 바로
  function quotes(c) {
    const tp = (c && c.tp || []).slice().sort((a, b) => a[0] - b[0]);
    const s = section("들은 호가 적기", tp.length ? "부동산에서 들은 호가를 적으면 그 평형의 추정 시세와 비교합니다." : "부동산에서 들은 호가를 적어 두세요.");
    const form = el("form", "fm-qform");
    const py = el("select");
    py.setAttribute("aria-label", "평형");
    if (tp.length) tp.forEach(([p, price]) => { const o = el("option", "", `${p}평 · 시세 ${eok(price)}`); o.value = p; py.append(o); });
    else { const o = el("option", "", "평형"); o.value = ""; py.append(o); py.hidden = true; }
    const fl = el("input"); fl.type = "number"; fl.inputMode = "numeric"; fl.min = "1"; fl.max = "99"; fl.placeholder = "층"; fl.setAttribute("aria-label", "층");
    const q = el("input"); q.type = "text"; q.inputMode = "decimal"; q.placeholder = "호가 (억, 예: 7.9)"; q.setAttribute("aria-label", "호가 (억 원)");
    const add = el("button", "btn primary", "적기"); add.type = "submit";
    form.append(py, fl, q, add);
    const ul = el("ul", "fm-qlist");
    const price = p => (tp.find(t => String(t[0]) === String(p)) || [])[1];
    const draw = () => {
      ul.replaceChildren();
      v.q.forEach((e, i) => {
        const [p, f, won, day] = e, ref = price(p);
        const li = el("li", "");
        li.append(el("b", "", eok(won)), el("span", "", [p ? p + "평" : "", f ? f + "층" : "", day ? day.slice(5).replace("-", ".") : ""].filter(Boolean).join(" · ")));
        if (ref) {
          const d = won / ref - 1, pct = Math.round(d * 100);
          li.append(el("span", "fm-vs " + (pct > 2 ? "up" : pct < -2 ? "down" : ""), pct === 0 ? "시세와 같아요" : `시세보다 ${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`));
        }
        const del = el("button", "fm-del", "×"); del.type = "button"; del.setAttribute("aria-label", "이 호가 지우기");
        del.addEventListener("click", () => {
          const [gone] = v.q.splice(i, 1);
          if (!persist()) v.q.splice(i, 0, gone);
          draw();
        });
        li.append(del);
        ul.append(li);
      });
      ul.hidden = !v.q.length;
    };
    form.addEventListener("submit", e => {
      e.preventDefault();
      const won = Math.round(parseFloat(String(q.value).replace(",", ".")) * 10000);
      if (!(won > 0)) { q.focus(); return; }
      const prevQ = v.q;
      v.q = [[py.value || "", parseInt(fl.value, 10) || "", won, DJ.today()], ...v.q].slice(0, 20);
      if (!persist()) { v.q = prevQ; q.focus(); return; }   // 저장하지 못하면 적은 값을 그대로 남겨 다시 누를 수 있게
      draw();
      q.value = ""; fl.value = "";
    });
    s.append(form, ul);
    draw();
    return s;
  }

  // 4. 현장 사진: 주차장·동 간격·언덕처럼 말로 남기기 어려운 것을 사진으로 (로그인하면 계정에, 1280px 로 줄이고 위치 정보 없이)
  // v.p = [[경로, 찍은 날]] (12장까지). 저장소가 없는 사이트면 칸을 만들지 않음
  const MAXP = 12;
  async function shrink(file) {
    const src = await createImageBitmap(file).catch(() => null) || await new Promise((ok, no) => {
      const img = new Image(); img.onload = () => ok(img); img.onerror = no; img.src = URL.createObjectURL(file);
    });
    const k = Math.min(1, 1280 / Math.max(src.width, src.height));
    const cv = el("canvas"); cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
    return new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.8));
  }
  function photos() {
    if (!DJ.sb) return null;
    const s = section("현장 사진", null);
    s.dataset.feature = "photos";   // 관리자 화면에서 끄면 감춤
    if (!(DJ.sync && DJ.sync.user)) {
      s.append(el("p", "fm-sub", "카카오로 로그인하면 주차장·동 간격·언덕 같은 현장 사진을 이 단지 노트에 남길 수 있어요."));
      const go = el("button", "btn", "로그인하고 사진 남기기"); go.type = "button";
      go.addEventListener("click", () => { close(); DJ.loginPrompt("현장 사진"); });
      s.append(go);
      return s;
    }
    s.append(el("p", "fm-sub", "말로 남기기 어려운 걸 찍어 두세요. 위치 정보 없이 줄여서 계정에 저장하고, 로그인한 나만 볼 수 있어요. 공유 링크로는 보이지 않아요."));
    const grid = el("div", "fm-photos");
    const pick = el("label", "fm-ph-add");
    const inp = el("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true; inp.hidden = true;
    pick.append(el("span", "", "＋"), el("small", "", "사진"), inp);
    const draw = () => {
      grid.replaceChildren();
      (v.p || []).forEach(([path], i) => {
        const fig = el("figure", "fm-ph");
        const a = el("a"); a.href = DJ.photoUrl(path); a.target = "_blank"; a.rel = "noopener";
        const img = el("img"); DJ.photoSet(img, path); img.alt = `${name} 현장 사진 ${i + 1}`; img.loading = "lazy";
        a.append(img);
        const del = el("button", "fm-ph-del", "×"); del.type = "button"; del.setAttribute("aria-label", "이 사진 지우기");
        del.addEventListener("click", async () => {
          if (del.disabled || !confirm("이 사진을 지울까요?")) return;
          del.disabled = true;
          const at = (v.p || []).findIndex(x => x[0] === path);
          if (at < 0) { draw(); return; }
          const [gone] = v.p.splice(at, 1);
          if (!persist()) { v.p.splice(at, 0, gone); del.disabled = false; return; }   // 기록을 못 바꾸면 파일도 지우지 않음
          draw();
          try { await DJ.photoDel([path]); }
          catch (e) {   // 서버에서 못 지웠으면 사진을 다시 돌려놓고, 왜 안 됐는지와 다시 하는 법을 알림
            v = DJ.visit(slug);
            v.p = v.p || [];
            if (!v.p.some(x => x[0] === path)) { v.p.splice(Math.min(at, v.p.length), 0, gone); persist(); }
            draw();
            DJ.toast("사진을 지우지 못했어요", photoWhy(e), 6000);
          }
        });
        fig.append(a, del);
        grid.append(fig);
      });
      if ((v.p || []).length < MAXP) grid.append(pick);
    };
    inp.addEventListener("change", async () => {
      const files = Array.from(inp.files || []).slice(0, MAXP - (v.p || []).length);
      inp.value = "";
      for (const f of files) {
        const wait = el("figure", "fm-ph wait", "올리는 중…");
        grid.insertBefore(wait, pick);
        try {
          const path = await DJ.photoPut(slug, await shrink(f));
          v = DJ.visit(slug);   // 그사이 바뀐 기록 위에
          const prevP = v.p || [];
          v.p = prevP.concat([[path, DJ.today()]]).slice(0, MAXP);
          if (!persist()) { v.p = prevP; DJ.photoDel([path]).catch(() => {}); }   // 기록에 못 남긴 파일이 서버에 혼자 남지 않게
        } catch (e) {
          DJ.toast("사진을 올리지 못했어요", photoWhy(e), 6000);
        }
        wait.remove();
        draw();
      }
    });
    draw();
    s.append(grid);
    return s;
  }

  // 방문을 마쳤다고 표시한 직후: 다음 단지(코스에 있으면)와 다녀온 뒤 정리로 가는 길을 알림에 붙입니다. 자동으로 이동하지 않아요.
  function nextAfterVisit() {
    const root = window.DJ_ROOT || "";
    DJ.data().then(d => {
      const { stops } = DJ.courseStops(d), k = stops.findIndex(x => x.s === slug), nx = k >= 0 ? stops[k + 1] : null;
      if (nx) DJ.toast("다녀온 것으로 기록했어요", `다음 단지는 ${nx.n}이에요.`, 8000, { label: `${nx.n} 현장 모드 →`, href: DJ.href(nx) + "#field" });
      else DJ.toast("다녀온 것으로 기록했어요", "다녀온 곳을 모아 확인한 것과 못 확인한 것을 볼 수 있어요.", 8000, { label: "다녀온 뒤 정리 보기 →", href: root + "projects.html" });
    }).catch(() => DJ.toast("다녀온 것으로 기록했어요", "관심 화면의 임장 노트에서 다시 볼 수 있어요."));
  }

  // 5. 메모와 '다녀왔어요'
  function memo() {
    const s = section("단지 공통 메모", "여러 번 방문해도 계속 참고할 내용을 적어 두세요. 이번 방문만의 느낌은 아래 날짜별 기록에 따로 남길 수 있어요.");
    const t = el("textarea", "fm-memo");
    t.rows = 3; t.placeholder = "동·층·향, 단지 분위기, 부동산에서 들은 이야기";
    t.setAttribute("aria-label", name + " 메모");
    t.value = v.m || "";
    t.addEventListener("input", () => { v.m = t.value; keep(); });   // 못 남기면 DJ.save 가 알려요. 입력한 글은 칸에 그대로 남아 있어요
    const been = el("button", "btn fm-been", "");
    been.type = "button";
    const paint = () => {
      been.textContent = v.d ? `${v.d.slice(5).replace("-", ".")} 다녀왔어요 ✓` : "오늘 다녀왔어요";
      been.classList.toggle("on", !!v.d);
      been.setAttribute("aria-pressed", v.d ? "true" : "false");
    };
    been.addEventListener("click", () => {
      const was = !!v.d, prev = v.d;
      if (v.d) delete v.d; else v.d = DJ.today();
      if (!persist()) { if (prev) v.d = prev; else delete v.d; paint(); return; }   // 저장하지 못했으면 '다녀왔어요'도 켜지 않고 안내도 하지 않음
      paint();
      if (!was) nextAfterVisit();   // '다녀왔어요'를 켠 순간에만. 끌 때는 아무 안내도 하지 않음
    });
    paint();
    const note = el("p", "fm-note", "기록은 이 기기의 브라우저에만 남아요. 관심 화면의 '임장 노트'와 '임장 코스'에서 다시 볼 수 있어요.");
    note.dataset.syncNote = "";   // 카카오로 로그인했으면 sync.js 가 '계정에 저장돼요'로 바꿈
    const dated = el("button", "btn ghost", "이번 방문 따로 남기기"); dated.type = "button";
    dated.addEventListener("click", () => journal?.element.querySelector("textarea")?.focus());
    s.append(t, been, dated, note);
    return s;
  }

  // 단지 페이지 위쪽 '코스에 넣기'나 여기서 넣고 빼면 코스 칸을 다시 그림
  document.addEventListener("dj:course", () => {
    const old = body.querySelector("[data-course]");
    if (!last || !old) return;
    const n = course(last[0], last[1]);
    if (n) old.replaceWith(n);
  });
  addEventListener("storage", e => {
    if (!e.key?.startsWith(DJ.records.key("visitlog:")) || !journal || journal.dirty()) return;
    journal.refresh();
  });
  addEventListener("dj:workspace-context", e => journal?.connectProject(e.detail));

  if (location.hash === "#field" && !DJ.locked()) open();
})();
