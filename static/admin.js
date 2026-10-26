// 관리자 화면: 회원과 권한, 사이트 설정(공지 띠·기능 켜고 끄기), 멤버십 등급, 관리 기록.
// 권한 확인은 모두 서버 함수가 합니다 (scripts/supabase_setup.sql 의 admin_*). 이 화면은 결과를 보여 주고,
// 역할에 맞지 않는 단추는 미리 막아 둘 뿐이에요. 역할: 운영자 > 관리자 > 스태프(보기만) > 회원
(function () {
  const box = document.querySelector("[data-ad]");
  if (!box) return;
  const { el } = DJ;
  const wait = document.querySelector("[data-ad-wait]"), deny = document.querySelector("[data-ad-deny]");
  const ROLE = { owner: "운영자", admin: "관리자", staff: "스태프", member: "회원" };
  const RANK = { owner: 3, admin: 2, staff: 1, member: 0 };
  const SETTING = { notice: "공지 띠", features: "기능 켜고 끄기" };
  const FEATURE = { photos: "현장 사진", share: "가족과 함께 보기", membership: "멤버십 안내" };
  let me = null, plans = [], overview = null;
  const loaded = {};

  async function rpc(fn, body) {
    return DJ.sb.call("/rest/v1/rpc/" + fn, { method: "POST", body: body || {} }, await DJ.sb.token());
  }
  // 서버가 돌려준 이유를 알아듣게
  function why(e) {
    const m = String((e && e.message) || "");
    if (/owner only/.test(m)) return "운영자만 할 수 있어요.";
    if (/last owner/.test(m)) return "운영자가 한 명뿐이라 뺄 수 없어요. 다른 운영자를 먼저 정해 주세요.";
    if (/free plan stays/.test(m)) return "기본 등급은 끌 수 없어요.";
    if (/forbidden/.test(m) || (e && e.status === 403)) return "이 일을 할 권한이 없어요.";
    return "잠시 뒤 다시 해 주세요.";
  }
  const pad = n => String(n).padStart(2, "0");
  function day(ts, withYear) {
    if (!ts) return "";
    const d = new Date(ts), y = d.getFullYear() !== new Date().getFullYear() || withYear;
    return (y ? d.getFullYear() + "." : "") + `${d.getMonth() + 1}.${d.getDate()}`;
  }
  function ago(ts) {
    if (!ts) return "";
    const s = (Date.now() - new Date(ts)) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "분 전";
    if (s < 86400) return Math.round(s / 3600) + "시간 전";
    if (s < 86400 * 7) return Math.round(s / 86400) + "일 전";
    return day(ts);
  }
  const planName = id => (plans.find(p => p.id === id) || {}).name || (id === "free" ? "기본" : id);
  const can = r => RANK[me.role] >= RANK[r];
  function btn(cls, text, fn) {
    const b = el("button", cls, text);
    b.type = "button";
    if (fn) b.addEventListener("click", fn);
    return b;
  }
  function busy(b, on) { b.disabled = on; b.classList.toggle("is-busy", on); }

  // ---------- 들어오기: 내 역할 확인 ----------
  async function enter(user) {
    box.hidden = true; deny.hidden = true;
    if (!user) return;
    wait.hidden = false;
    try {
      me = await rpc("my_member");
    } catch (e) {
      me = null;
      wait.hidden = true;
      deny.hidden = false;
      deny.querySelector("[data-ad-uid]").textContent = user.id;
      // 서버에 관리 함수가 아직 없을 때 (db-setup 을 다시 실행하기 전)
      if (e.status === 404) deny.querySelector("p").textContent = "관리 기능이 아직 데이터베이스에 없어요. GitHub Actions 의 db-setup 을 실행해 주세요.";
      return;
    }
    wait.hidden = true;
    if (!(RANK[me.role] >= 1)) {
      deny.hidden = false;
      deny.querySelector("[data-ad-uid]").textContent = me.id || user.id;
      return;
    }
    box.hidden = false;
    box.querySelector("[data-ad-role]").textContent = `${user.name}님 · ${ROLE[me.role]}` +
      (me.role === "staff" ? " (보기만 할 수 있어요)" : me.role === "admin" ? " (관리자를 주고 빼는 건 운영자만)" : "");
    box.querySelectorAll("[data-ad-min]").forEach(t => { t.hidden = !can(t.dataset.adMin); });
    plans = await rpc("admin_plans").catch(() => []);
    const want = location.hash.slice(1);
    go(box.querySelector(`[data-ad-go="${want}"]:not([hidden])`) ? want : "overview", false);
  }
  deny.querySelector("[data-ad-copy]").addEventListener("click", () => {
    DJ.copy(deny.querySelector("[data-ad-uid]").textContent).then(ok => DJ.toast(ok ? "회원 번호를 복사했어요" : "길게 눌러 복사해 주세요", ok ? "운영자에게 보내 주세요." : ""));
  });

  // ---------- 탭 ----------
  const tabs = [...box.querySelectorAll("[data-ad-go]")];
  function go(name, push) {
    tabs.forEach(t => t.setAttribute("aria-selected", String(t.dataset.adGo === name)));
    box.querySelectorAll("[data-ad-pane]").forEach(p => { p.hidden = p.dataset.adPane !== name; });
    if (push !== false) history.replaceState(null, "", "#" + name);
    if (!loaded[name]) { loaded[name] = true; LOAD[name](); }
  }
  tabs.forEach(t => {
    t.addEventListener("click", () => go(t.dataset.adGo));
    t.addEventListener("keydown", e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const vis = tabs.filter(x => !x.hidden), i = vis.indexOf(t);
      const n = vis[(i + (e.key === "ArrowRight" ? 1 : vis.length - 1)) % vis.length];
      n.focus(); go(n.dataset.adGo);
    });
  });
  function failed(where, retry) {
    where.replaceChildren();
    const p = el("p", "ad-empty", "불러오지 못했어요. ");
    p.append(btn("link-btn", "다시 불러오기", retry));
    where.append(p);
  }

  // ---------- 한눈에 ----------
  async function loadOverview() {
    const kp = box.querySelector("[data-ad-kpis]");
    try { overview = await rpc("admin_overview"); } catch (e) { failed(kp, loadOverview); return; }
    const o = overview;
    kp.replaceChildren();
    [["i-users", "회원", o.users, "명"], ["i-user", "이번 주 새 회원", o.new7, "명"],
     ["i-sync", "7일 동안 기록한 회원", o.active7, "명"], ["i-sync", "30일 동안 기록한 회원", o.active30, "명"],
     ["i-share", "함께 보기 링크", o.shares, "개"], ["i-camera", "현장 사진", o.photos, "장"]].forEach(([ic, label, n, unit]) => {
      const li = el("li"), d = el("div"), b = el("b", "", (+n || 0).toLocaleString());
      b.append(el("small", "", unit));
      d.append(icon(ic), el("span", "", label), b);
      li.append(d);
      kp.append(li);
    });
    // 역할·등급: 표에 줄이 없는 회원은 '회원'·'기본'으로 셈
    const staffish = ["owner", "admin", "staff"].reduce((n, r) => n + (+o.roles[r] || 0), 0);
    chips(box.querySelector("[data-ad-roles]"), [...["owner", "admin", "staff"].map(r => [ROLE[r], +o.roles[r] || 0]),
      ["회원", Math.max(0, o.users - staffish)]]);
    const paid = Object.keys(o.plans).filter(p => p !== "free").reduce((n, p) => n + (+o.plans[p] || 0), 0);
    chips(box.querySelector("[data-ad-plans]"), [[planName("free"), Math.max(0, o.users - paid)],
      ...plans.filter(p => p.id !== "free").map(p => [p.name, +o.plans[p.id] || 0])]);
    const rc = box.querySelector("[data-ad-recent]");
    rc.replaceChildren();
    (o.recent || []).forEach(r => {
      const li = el("li");
      li.append(el("span", "ad-ini", (r.name || "?").slice(0, 1)), el("b", "", r.name), el("span", "muted", ago(r.created_at)));
      rc.append(li);
    });
    if (!(o.recent || []).length) rc.append(el("li", "ad-empty", "아직 가입한 회원이 없어요."));
  }
  function chips(where, rows) {
    where.replaceChildren();
    rows.forEach(([k, n]) => {
      const c = el("span", "ad-chip" + (n ? "" : " zero"), k + " ");
      c.append(el("b", "", n.toLocaleString()));
      where.append(c);
    });
  }
  function icon(id) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("class", "ic"); svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#" + id);
    svg.append(use);
    return svg;
  }

  // ---------- 회원·권한 ----------
  const list = box.querySelector("[data-ad-members]"), more = box.querySelector("[data-ad-more]"), q = box.querySelector("[data-ad-q]");
  const PAGE = 30;
  let shown = 0, qNow = "", seq = 0;
  async function loadMembers(reset) {
    if (reset !== false) { shown = 0; list.replaceChildren(); }
    const my = ++seq;
    more.hidden = true;
    let rows;
    try { rows = await rpc("admin_members", { q: qNow, lim: PAGE, off: shown }); }
    catch (e) { if (my === seq) failed(list, () => loadMembers()); return; }
    if (my !== seq) return;   // 더 새 검색이 있음
    rows.forEach(m => list.append(member(m)));
    shown += rows.length;
    more.hidden = rows.length < PAGE;
    if (!shown) list.append(el("li", "ad-empty", qNow ? `'${qNow}'에 맞는 회원이 없어요.` : "아직 가입한 회원이 없어요."));
  }
  let tq = null;
  q.addEventListener("input", () => {
    clearTimeout(tq);
    tq = setTimeout(() => { const v = q.value.trim(); if (v !== qNow) { qNow = v; loadMembers(); } }, 300);
  });
  more.addEventListener("click", () => loadMembers(false));

  function member(m) {
    const li = el("li", "ad-m");
    li.dataset.uid = m.id;
    // 이름 옆에 역할·등급 표, 아래에 가입·최근 기록 (좁은 화면에서도 한 줄 구성 그대로)
    const top = el("div", "ad-m-top"), id = el("div", "ad-m-id"), line = el("div", "ad-m-name");
    line.append(el("b", "", m.name));
    if (m.id === me.id) line.append(el("span", "ad-me", "나"));
    if (m.role !== "member") line.append(el("span", "ad-badge r-" + m.role, ROLE[m.role]));
    const expired = m.plan_until && new Date(m.plan_until) < new Date();
    if (m.plan !== "free") line.append(el("span", "ad-badge p" + (expired ? " off" : ""),
      planName(m.plan) + (m.plan_until ? (expired ? " · 끝남" : ` · ~${day(m.plan_until)}`) : "")));
    const sub = [`가입 ${day(m.created_at)}`];
    if (m.active_at) sub.push(`최근 기록 ${ago(m.active_at)}`);
    if (+m.notes) sub.push(`임장 노트 ${m.notes}곳`);
    id.append(line, el("span", "", sub.join(" · ")));
    top.append(el("span", "ad-ini", (m.name || "?").slice(0, 1)), id);
    li.append(top);
    if (m.note) li.append(el("p", "ad-m-note", m.note));
    if (can("admin")) {
      const ed = btn("btn ghost ad-edit", "바꾸기", () => {
        const open = li.querySelector(".ad-m-edit");
        list.querySelectorAll(".ad-m-edit").forEach(f => f.remove());
        list.querySelectorAll(".ad-edit[aria-expanded=true]").forEach(b => b.setAttribute("aria-expanded", "false"));
        if (open) return;
        ed.setAttribute("aria-expanded", "true");
        li.append(editor(m, li));
        li.querySelector("select").focus();
      });
      ed.setAttribute("aria-expanded", "false");
      top.append(ed);
    }
    return li;
  }

  // 역할·등급·기간·메모 고치기. 관리자는 스태프·회원만 정하고, 운영자·관리자 자리는 운영자만
  function editor(m, li) {
    const f = el("form", "ad-m-edit");
    const lockRole = !can("owner") && RANK[m.role] >= 2;
    const role = el("select"); role.name = "role";
    Object.keys(ROLE).filter(r => can("owner") || RANK[r] < 2 || r === m.role).forEach(r => {
      const o = el("option", "", ROLE[r]); o.value = r; o.selected = r === m.role; role.append(o);
    });
    role.disabled = lockRole;
    const plan = el("select"); plan.name = "plan";
    plans.filter(p => p.active || p.id === m.plan).forEach(p => {
      const o = el("option", "", p.name + (p.active ? "" : " (꺼 둠)")); o.value = p.id; o.selected = p.id === m.plan; plan.append(o);
    });
    // 기간: 계속 / 30일 / 90일 / 1년 / 날짜 지정
    const span = el("select"); span.name = "span";
    [["", "기간 없이 계속"], ["30", "30일"], ["90", "90일"], ["365", "1년"], ["date", "날짜 지정"]].forEach(([v, t]) => {
      const o = el("option", "", t); o.value = v; span.append(o);
    });
    const date = el("input"); date.type = "date"; date.name = "until"; date.hidden = true;
    if (m.plan_until) {
      const d = new Date(m.plan_until);
      span.value = "date"; date.hidden = false;
      date.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    const spanRow = field("기간", span, date);
    const sync = () => { spanRow.hidden = plan.value === "free"; date.hidden = span.value !== "date"; };
    plan.addEventListener("change", sync); span.addEventListener("change", sync);
    const memo = el("input"); memo.type = "text"; memo.name = "memo"; memo.maxLength = 200; memo.value = m.note || "";
    memo.placeholder = "예: 베타 테스터, 지인";
    const save = el("button", "btn primary", "저장"); save.type = "submit";
    const copy = btn("link-btn", "회원 번호 복사", () => DJ.copy(m.id).then(ok => ok && DJ.toast("회원 번호를 복사했어요", m.id)));
    f.append(field("역할", role), field("등급", plan), spanRow, field("메모 (관리자만 봐요)", memo));
    if (lockRole) f.append(el("p", "ad-hint", "운영자·관리자의 역할은 운영자만 바꿀 수 있어요. 등급과 메모는 바꿀 수 있어요."));
    const act = el("div", "ad-m-act");
    act.append(copy, btn("btn ghost", "닫기", () => { f.remove(); li.querySelector(".ad-edit").setAttribute("aria-expanded", "false"); }), save);
    f.append(act);
    sync();
    f.addEventListener("submit", async e => {
      e.preventDefault();
      let until = null;
      if (plan.value !== "free" && span.value) {
        if (span.value === "date") {
          if (!date.value) { DJ.toast("날짜를 골라 주세요", ""); date.focus(); return; }
          until = new Date(date.value + "T23:59:59").toISOString();
        } else until = new Date(Date.now() + span.value * 86400000).toISOString();
      }
      if (m.id === me.id && role.value !== m.role && !confirm(`내 역할을 ${ROLE[role.value]}(으)로 바꿀까요? 이 화면에서 할 수 있는 일이 줄어들 수 있어요.`)) return;
      busy(save, true);
      try {
        await rpc("admin_set_member", { uid: m.id, new_role: role.value, new_plan: plan.value, until, memo: memo.value.trim() || null });
      } catch (err) {
        busy(save, false);
        DJ.toast("저장하지 못했어요", why(err), 6000);
        return;
      }
      DJ.toast("저장했어요", `${m.name}님 · ${ROLE[role.value]} · ${planName(plan.value)}`);
      if (m.id === me.id) { setTimeout(() => location.reload(), 700); return; }
      Object.assign(m, { role: role.value, plan: plan.value, plan_until: until, note: memo.value.trim() || null });
      li.replaceWith(member(m));
      loaded.overview = loaded.logs = false;   // 다음에 열 때 새로
    });
    return f;
  }
  function field(label, ...inputs) {
    const l = el("label", "ad-field");
    l.append(el("span", "", label), ...inputs);
    return l;
  }

  // ---------- 사이트 설정 ----------
  const fNotice = box.querySelector("[data-ad-notice]"), fFeat = box.querySelector("[data-ad-features]");
  async function loadSettings() {
    let rows = [];
    try { rows = await DJ.sb.call("/rest/v1/app_settings?select=key,value", null, await DJ.sb.token()); }
    catch (e) { DJ.toast("설정을 불러오지 못했어요", "잠시 뒤 다시 열어 주세요."); }
    const v = {};
    (rows || []).forEach(r => { v[r.key] = r.value || {}; });
    const n = v.notice || {}, ft = Object.assign({ photos: true, share: true, membership: false }, v.features);
    fNotice.on.checked = !!n.on; fNotice.text.value = n.text || ""; fNotice.link.value = n.link || "";
    Object.keys(FEATURE).forEach(k => { fFeat[k].checked = !!ft[k]; });
    if (!can("admin")) {
      [fNotice, fFeat].forEach(f => {
        f.querySelectorAll("input, button").forEach(x => { x.disabled = true; });
        f.append(el("p", "ad-hint", "스태프는 보기만 할 수 있어요."));
      });
    }
  }
  async function saveSetting(f, k, v, done) {
    const b = f.querySelector("[type=submit]");
    busy(b, true);
    try { await rpc("admin_set_setting", { k, v, pub: true }); }
    catch (e) { busy(b, false); DJ.toast("저장하지 못했어요", why(e), 6000); return; }
    busy(b, false);
    loaded.logs = false;
    if (DJ.applySettings) DJ.applySettings(true);   // 이 화면에도 바로 (다른 방문자는 몇 분 안에)
    DJ.toast("저장했어요", done);
  }
  fNotice.addEventListener("submit", e => {
    e.preventDefault();
    const text = fNotice.text.value.trim(), link = fNotice.link.value.trim();
    if (fNotice.on.checked && !text) { DJ.toast("공지 문구를 적어 주세요", ""); fNotice.text.focus(); return; }
    if (link && !/^https:\/\//.test(link)) { DJ.toast("주소는 https:// 로 시작해야 해요", ""); fNotice.link.focus(); return; }
    saveSetting(fNotice, "notice", { on: fNotice.on.checked, text, link },
      fNotice.on.checked ? "화면 위쪽에 공지가 보여요." : "공지를 감췄어요.");
  });
  fFeat.addEventListener("submit", e => {
    e.preventDefault();
    const v = {};
    Object.keys(FEATURE).forEach(k => { v[k] = fFeat[k].checked; });
    const off = Object.keys(FEATURE).filter(k => k !== "membership" && !v[k]).map(k => FEATURE[k]);
    saveSetting(fFeat, "features", v, off.length ? `감춘 기능: ${off.join(", ")}` : "기능 설정을 바꿨어요.");
  });

  // ---------- 멤버십 등급 ----------
  const planBox = box.querySelector("[data-ad-plan-list]");
  async function loadPlans() {
    try { plans = await rpc("admin_plans"); } catch (e) { failed(planBox, loadPlans); return; }
    if (!overview) overview = await rpc("admin_overview").catch(() => null);
    planBox.replaceChildren();
    plans.forEach(p => planBox.append(planCard(p)));
    if (can("owner")) {
      const add = btn("ad-plan ad-plan-add", "", () => { add.replaceWith(planForm(null)); });
      add.append(el("b", "", "＋ 등급 더하기"), el("span", "", "예: 가족(여럿이 함께), 전문가"));
      planBox.append(add);
    }
  }
  function planCard(p) {
    const d = el("div", "ad-plan" + (p.active ? "" : " off"));
    const head = el("div", "ad-plan-h");
    head.append(el("b", "", p.name), el("span", "ad-plan-id", p.id));
    if (!p.active) head.append(el("span", "ad-badge off", "꺼 둠"));
    const price = el("p", "ad-price");
    if (+p.price) { price.append(el("b", "", (+p.price).toLocaleString() + "원")); price.append(" / 한 달"); }
    else price.append(el("b", "", p.id === "free" ? "무료" : "가격 미정"));
    const ul = el("ul", "ad-feat");
    ul.append(el("li", "", `현장 사진 ${(+(p.features || {}).photos || 300).toLocaleString()}장까지`));
    const o = overview;
    if (o) {
      const paid = Object.keys(o.plans).filter(k => k !== "free").reduce((n, k) => n + (+o.plans[k] || 0), 0);
      const n = p.id === "free" ? Math.max(0, o.users - paid) : +o.plans[p.id] || 0;
      ul.append(el("li", "", `회원 ${n.toLocaleString()}명`));
    }
    d.append(head, price, ul);
    if (can("owner")) d.append(btn("btn ghost ad-plan-ed", "고치기", () => d.replaceWith(planForm(p))));
    return d;
  }
  function planForm(p) {
    const f = el("form", "ad-plan ad-plan-form"), isNew = !p;
    p = p || { id: "", name: "", price: 0, features: { photos: 300 }, active: true, sort: plans.length };
    const inp = (name, type, val, extra) => { const i = el("input"); i.name = name; i.type = type; i.value = val; Object.assign(i, extra || {}); return i; };
    if (isNew) f.append(field("영문 이름 (바꿀 수 없어요)", inp("pid", "text", "", { pattern: "[a-z0-9_]{2,20}", required: true, placeholder: "예: family" })));
    f.append(field("보이는 이름", inp("name", "text", p.name, { required: true, maxLength: 20 })),
      field("한 달 가격 (원, 0이면 무료·미정)", inp("price", "number", p.price, { min: 0, step: 100 })),
      field("현장 사진 한도 (장)", inp("photos", "number", (p.features || {}).photos || 300, { min: 0, step: 50 })));
    const on = el("label", "ad-switch"), cb = inp("active", "checkbox", "");
    cb.checked = p.active !== false;
    cb.disabled = p.id === "free";
    on.append(cb, el("span", "", "회원에게 줄 수 있게 켜 두기"));
    f.append(on);
    const act = el("div", "ad-m-act"), save = el("button", "btn primary", "저장");
    save.type = "submit";
    act.append(btn("btn ghost", "취소", () => loadPlans()), save);
    f.append(act);
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const pid = isNew ? f.pid.value.trim() : p.id;
      if (isNew && plans.some(x => x.id === pid)) { DJ.toast("이미 있는 영문 이름이에요", ""); return; }
      busy(save, true);
      try {
        await rpc("admin_set_plan", { pid, pname: f.name.value.trim(), pprice: Math.max(0, Math.round(+f.price.value || 0)),
          pfeatures: Object.assign({}, p.features, { photos: Math.max(0, Math.round(+f.photos.value || 0)) }),
          pactive: cb.checked || p.id === "free", psort: p.sort || 0 });
      } catch (err) { busy(save, false); DJ.toast("저장하지 못했어요", why(err), 6000); return; }
      DJ.toast("등급을 저장했어요", f.name.value.trim());
      loaded.logs = false;
      loadPlans();
    });
    setTimeout(() => f.querySelector("input").focus(), 0);
    return f;
  }

  // ---------- 관리 기록 ----------
  async function loadLogs() {
    const ul = box.querySelector("[data-ad-logs]");
    let rows;
    try { rows = await rpc("admin_logs", { lim: 50 }); } catch (e) { failed(ul, loadLogs); return; }
    ul.replaceChildren();
    rows.forEach(r => {
      const li = el("li"), d = r.detail || {}, t = el("p");
      t.append(el("b", "", r.actor + "님"), " ");
      if (r.action === "member") {
        t.append(`${r.target_name || "회원"}님 → ${ROLE[d.role] || d.role} · ${planName(d.plan)}`);
        if (d.until) t.append(` (${day(d.until, true)}까지)`);
      } else if (r.action === "setting") {
        t.append(`사이트 설정 · ${SETTING[r.target] || r.target}`);
        if (r.target === "notice") t.append(d.on ? ` · 공지 켬: ${d.text || ""}` : " · 공지 끔");
        if (r.target === "features") {
          const off = Object.keys(FEATURE).filter(k => k === "membership" ? d[k] : d[k] === false).map(k => FEATURE[k] + (k === "membership" ? " 켬" : " 끔"));
          if (off.length) t.append(" · " + off.join(", "));
        }
      } else if (r.action === "plan") {
        t.append(`멤버십 등급 · ${d.name || r.target}`);
      } else t.append(r.action);
      const at = new Date(r.at);
      li.append(t, el("span", "muted", `${day(r.at)} ${at.getHours()}:${pad(at.getMinutes())}`));
      ul.append(li);
    });
    if (!rows.length) ul.append(el("li", "ad-empty", "아직 바꾼 기록이 없어요."));
  }

  const LOAD = { overview: loadOverview, members: () => loadMembers(), settings: loadSettings, plans: loadPlans, logs: loadLogs };
  if (!DJ.sb) { wait.hidden = true; return; }
  let uid;
  document.addEventListener("dj:auth", e => {
    const u = e.detail;
    if ((u && u.id) === uid) return;
    uid = u && u.id;
    enter(u);
  });
  if (DJ.sync && DJ.sync.user) { uid = DJ.sync.user.id; enter(DJ.sync.user); }
})();
