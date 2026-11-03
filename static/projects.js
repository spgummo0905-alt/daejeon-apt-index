(function () {
  const root = document.getElementById("projects");
  if (!root) return;
  const { el } = DJ, P = DJProjects, REGION = root.dataset.region;
  const find = s => root.querySelector(s), form = find("[data-pj-create]"), edit = find("[data-pj-edit]");
  const editor = find("[data-pj-editor]"), status = find("[data-pj-status]");
  const picked = new Set();
  let current = null, D = null, journal = null;
  let searchLimit = 12, lastOpened = null;
  const wsDialog = find("[data-pj-workspace]");
  const workspace = DJProjectWorkspace({ dialog: wsDialog,
    context: () => current && D ? { project: current, data: D, selected: [...picked] } : null,
    onAdd: s => { if (D.bySlug[s]) add(D.bySlug[s]); },
    onLogin: () => DJ.loginPrompt?.("기록 이어 보기") });
  wsDialog.addEventListener("close", () => { if (current && D) summary(); });   // 현장 체크·방문 기록을 닫으면 정리를 새로 모아요
  function error(e) {
    status.textContent = e.message === "conflict" ? "다른 화면에서 프로젝트가 바뀌었어요. 내용을 복사해 두고 새로고침한 뒤 다시 저장해 주세요."
      : e.message === "fields" ? "프로젝트 이름은 1~50자, 중요한 조건은 200자 이내로 적어 주세요."
      : e.message === "limit" ? "진행 중인 프로젝트와 프로젝트별 후보는 각각 100개까지예요. 끝난 프로젝트는 보관해 주세요."
      : "프로젝트를 저장하지 못했어요. 계정 연결 상태와 브라우저 저장 공간을 확인해 주세요.";
    DJ.toast("변경을 저장하지 못했어요", status.textContent);
  }
  function mutate(patch) {
    if (!current) return false;
    if ((patch.name === undefined && metadataDirty() || journal?.dirty()) && !confirm("저장하지 않은 수정·방문 메모가 있어요. 저장하지 않고 진행할까요?")) return false;
    try { current = P.update(current.id, REGION, current.updated, patch); status.textContent = "프로젝트를 저장했어요."; render(); return true; }
    catch (e) { error(e); return false; }
  }
  function add(c) {
    if (!current || current.archived) return;
    if (current.slugs.includes(c.s)) { DJ.toast("이미 담은 후보예요", "이 프로젝트의 후보 목록에서 확인해 주세요."); return; }
    return mutate({ slugs: [...current.slugs, c.s] });
  }
  function metadataDirty() { return current && (edit.elements.name.value !== current.name || edit.elements.goal.value !== current.goal); }
  function dirty() { return metadataDirty() || journal?.dirty() || workspace.dirty(); }
  DJ.hasProjectDraft = () => !!(form.elements.name.value.trim() || form.elements.goal.value.trim() || dirty());
  function updatedElsewhere() {
    if (DJ.hasProjectDraft()) { status.textContent = "다른 화면의 변경이 도착했어요. 작성 중인 내용을 먼저 저장해 주세요."; return; }
    if (current) current = P.read(current.id);
    render(); status.textContent = "다른 화면의 변경을 반영했어요. 검색 조건과 후보 선택은 유지됩니다.";
  }
  addEventListener("dj:projects-updated", updatedElsewhere);
  function choose(p) {
    if (dirty() && !confirm("저장하지 않은 수정·방문 메모가 있어요. 저장하지 않고 다른 프로젝트를 볼까요?")) return;
    workspace.reset(); journal = null;
    current = p; picked.clear(); render();
  }
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (dirty() && !confirm("저장하지 않은 수정이 있어요. 새 프로젝트 만들기로 이동할까요?")) return;
    try { const p = P.create(form.elements.name.value, form.elements.goal.value, REGION); workspace.reset(); journal = null; current = p; picked.clear(); form.reset();
      status.textContent = "프로젝트를 만들었어요. 이제 후보를 담아보세요."; render(); find("[data-pj-new]").open = false; find("#pj-search").focus(); }
    catch (e) { error(e); }
  });
  edit.addEventListener("submit", e => { e.preventDefault(); mutate({ name: edit.elements.name.value, goal: edit.elements.goal.value }); });
  find("[data-pj-toggle]").addEventListener("click", () => { if (current) mutate({ archived: !current.archived }); });
  function projectButton(p) {
    const b = el("button", "pj-item" + (current?.id === p.id ? " on" : "")); b.type = "button";
    b.setAttribute("aria-pressed", current?.id === p.id ? "true" : "false");
    const visits = DJVisitLog.list({ region: REGION, projectId: p.id }).length;
    b.append(el("b", "", p.name), el("span", "", `후보 ${p.slugs.length}곳 · 방문 ${visits}건${p.archived ? " · 보관 중" : ""}`));
    b.addEventListener("click", () => choose(p)); return b;
  }
  function render() {
    const projects = P.list(REGION), active = projects.filter(p => !p.archived), archived = projects.filter(p => p.archived);
    root.classList.toggle("pj-none", !projects.length);
    find("[data-pj-list]").replaceChildren(...active.map(projectButton));
    find("[data-pj-empty]").hidden = !!active.length;
    if (!active.length && archived.length) find("[data-pj-empty]").textContent = "진행 중인 프로젝트가 없어요. 보관함에서 다시 시작할 수 있습니다.";
    find("[data-pj-archive]").hidden = !archived.length;
    find("[data-pj-archive-list]").replaceChildren(...archived.map(projectButton));
    const other = P.list().filter(p => p.region !== REGION).length;
    find("[data-pj-other]").hidden = !other;
    find("[data-pj-other]").textContent = `다른 지역 프로젝트 ${other}개는 위쪽 지역을 바꾸면 이어 볼 수 있어요.`;
    editor.hidden = !current;
    if (!current || !D) { workspace.reset(); return; }
    find("[data-pj-title]").textContent = current.name;
    find("[data-pj-goal]").textContent = current.goal || "후보를 살펴보며 나에게 중요한 조건을 정해보세요.";
    find("[data-pj-state]").textContent = `${REGION} · ${current.archived ? "보관한 프로젝트" : "집 찾는 중"}`;
    find("[data-pj-toggle]").textContent = current.archived ? "다시 시작하기" : "프로젝트 보관하기";
    edit.elements.name.value = current.name; edit.elements.goal.value = current.goal;
    find("[data-pj-settings]").hidden = current.archived;
    find("[data-pj-add]").hidden = current.archived;
    if (lastOpened !== current.id) { lastOpened = current.id; find("[data-pj-add]").open = current.slugs.length < 2; }
    const favs = DJ.favs().map(s => D.bySlug[s]).filter(c => c && !current.slugs.includes(c.s));
    find("[data-pj-favs]").replaceChildren(...favs.map(c => { const b = el("button", "chip", "+ " + c.n); b.type = "button"; b.addEventListener("click", () => add(c)); return b; }));
    const cards = find("[data-pj-candidates]"); cards.replaceChildren();
    if (!current.slugs.length) cards.append(el("p", "pj-empty muted", "아직 담은 후보가 없어요. 눈여겨본 아파트 두 곳부터 시작해 보세요."));
    current.slugs.forEach(s => {
      const c = D.bySlug[s], wrap = el("div", "pj-candidate");
      if (c) {
        const logs = DJVisitLog.list({ region: REGION, slug: s, projectId: current.id });
        const select = el("label", "pj-check"), cb = el("input"); cb.type = "checkbox"; cb.checked = picked.has(s);
        cb.setAttribute("aria-label", c.n + " 비교·코스에 선택");
        cb.addEventListener("change", () => { if (cb.checked) picked.add(s); else picked.delete(s); actions(); });
        select.append(cb);
        const main = el("button", "pj-cand-main"); main.type = "button";
        const info = el("span", "pj-cand-info");
        info.append(el("b", "", c.n), el("span", "muted", `${DJ.place(c)} · 84㎡ ${c.pt || "가격 정보 없음"}`));
        main.append(el("span", "grade g-" + c.g, c.g), info);
        main.addEventListener("click", () => workspace.open("detail", s));
        const state = el("span", "pj-cand-state" + (logs.length ? " done" : ""), logs.length ? `다녀옴 · ${logs[0].date}` : "아직 안 가봄");
        wrap.append(select, main, state);
        const note = DJ.visit(s);
        const field = el("button", "btn ghost sm", "현장 체크"); field.type = "button";
        field.setAttribute("aria-label", c.n + " 현장 체크와 지난 기록");
        field.addEventListener("click", () => workspace.open("field", s)); wrap.append(field);
        if (note.d || note.m) wrap.append(el("p", "pj-note", `${note.d ? note.d + " 방문 · " : ""}${note.m ? note.m.slice(0, 90) : "단지에 현장 기록이 있어요"}`));
      } else wrap.append(el("p", "muted", `현재 자료에 없는 후보 (${s}) · 기록은 유지됩니다.`));
      if (!current.archived) {
        const remove = el("button", "btn ghost sm pj-remove", "빼기"); remove.type = "button";
        remove.setAttribute("aria-label", (c?.n || s) + " 이 프로젝트 후보에서 빼기");
        remove.addEventListener("click", () => { if (mutate({ slugs: current.slugs.filter(x => x !== s) })) { picked.delete(s); actions(); } });
        wrap.append(remove);
      }
      cards.append(wrap);
    });
    dash(); summary();
    journal = DJVisitLogUI({ region: REGION, projectId: current.id, candidates: current.slugs.map(s => D.bySlug[s]).filter(Boolean),
      names: Object.fromEntries(Object.values(D.bySlug).map(c => [c.s, c.n])), archived: current.archived, data: D });
    find("[data-pj-journal]").replaceChildren(journal.element);
    renderSearch(); workspace.refresh();
    actions();
  }
  // 다녀온 뒤 정리: 후보마다 확인한 것·아직 못 확인한 것·남긴 메모 (방문 기록을 모아 보여 줄 뿐, 평가는 하지 않아요)
  function summary() {
    const box = find("[data-pj-summary]"); box.replaceChildren();
    const logs = DJVisitLog.list({ region: REGION, projectId: current.id });
    const names = Object.fromEntries(Object.values(D.bySlug).map(c => [c.s, c.n]));
    // 현장 모드의 단지 공통 기록: 다녀온 날·메모, 체크는 하나라도 눌렀을 때만 (안 눌렀는데 전부 '못 확인'으로 쏟아지지 않게)
    const field = {};
    current.slugs.forEach(s => {
      const c = D.bySlug[s], v = DJ.visit(s); if (!c) return;
      const any = v.c.some(Boolean) || Object.values(v.x).some(Boolean);
      const labels = any ? [...DJ.CHECK.map((label, i) => ({ label, on: !!v.c[i] })), ...DJ.visitItems(c, REGION).map(([k, label]) => ({ label, on: !!v.x[k] }))] : null;
      if (v.d || v.m || labels) field[s] = { d: v.d || "", m: v.m || "", labels };
    });
    const rows = DJVisitSummary.build(current.slugs, logs, names, field).filter(r => r.visited);
    box.hidden = !rows.length; if (!rows.length) return;
    box.append(el("h3", "", "다녀온 뒤 정리"), el("p", "sv-note", "방문 기록과 현장 체크에서 모은 내용이에요. 어느 집이 낫다는 판단은 하지 않아요."));
    rows.forEach(r => {
      const d = el("details", "pj-sum-row"); d.open = rows.length <= 2;
      const when = r.visits ? `방문 ${r.visits}번${r.last ? " · 마지막 " + r.last : ""}` : `현장 기록${r.last ? " · " + r.last : ""}`;
      d.append(el("summary", "", `${r.name} · ${when}${r.total ? ` · 확인 ${r.checked}/${r.total}` : ""}`));
      if (r.done.length) { d.append(el("p", "pj-sum-h", "확인한 것")); const ul = el("ul"); r.done.forEach(t => ul.append(el("li", "", "✓ " + t))); d.append(ul); }
      if (r.todo.length) {   // 길어지지 않게 5개까지만 보이고, 나머지는 펼쳐서
        d.append(el("p", "pj-sum-h", `아직 못 확인한 것 ${r.todo.length}가지`)); const ul = el("ul"); r.todo.slice(0, 5).forEach(t => ul.append(el("li", "", t))); d.append(ul);
        if (r.todo.length > 5) { const more = el("details", "pj-sum-more"); more.append(el("summary", "", `나머지 ${r.todo.length - 5}가지 보기`)); const ul2 = el("ul"); r.todo.slice(5).forEach(t => ul2.append(el("li", "", t))); more.append(ul2); d.append(more); }
      }
      if (!r.total) d.append(el("p", "muted", "체크한 항목이 아직 없어요. 현장 체크에서 확인한 것을 눌러 두면 여기에 모여요."));
      if (r.memos.length) { d.append(el("p", "pj-sum-h", "남긴 메모")); r.memos.forEach(m => d.append(el("p", "pj-sum-memo", `${m.field ? "현장 메모" : m.date + (m.period ? " " + m.period : "")}${m.field && m.date ? " (" + m.date + ")" : ""} · ${m.text}`))); }
      box.append(d);
    });
  }
  // 한눈에 보는 현황: 후보 수·다녀온 단지·방문 기록, 3단계 진행, 지금 할 일 하나
  function openDiscover() {
    const d = find("[data-pj-add]"); d.open = true;
    d.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    find("#pj-search").focus({ preventScroll: true });
  }
  function pickAndOpen(kind) {
    const logs = DJVisitLog.list({ region: REGION, projectId: current.id }), went = new Set(logs.map(v => v.slug));
    let list = current.slugs.filter(s => D.bySlug[s]).sort((a, b) => went.has(b) - went.has(a));
    if (kind === "course") list = list.filter(s => Number.isFinite(D.bySlug[s].la) && Number.isFinite(D.bySlug[s].ln));
    picked.clear(); list.slice(0, kind === "course" ? 8 : 4).forEach(s => picked.add(s));
    render(); workspace.open(kind);
  }
  function dash() {
    const n = current.slugs.length, logs = DJVisitLog.list({ region: REGION, projectId: current.id }), went = new Set(logs.map(v => v.slug)).size;
    find("[data-pj-count]").textContent = n ? `${n}곳` : "";
    const stats = find("[data-pj-stats]"); stats.replaceChildren();
    [["후보", n + "곳"], ["다녀온 단지", went + "곳"], ["방문 기록", logs.length + "건"]].forEach(([k, v]) => {
      const box = el("div", "pj-stat"); box.append(el("dd", "", v), el("dt", "", k)); stats.append(box);
    });
    const steps = [
      { t: "후보 담기", s: n >= 2 ? "done" : "now", d: n ? `${n}곳 담았어요` : "2곳 이상 담아 보세요" },
      { t: "비교하고 순서 정하기", s: n < 2 ? "todo" : logs.length ? "done" : "now", d: "단지 비교 · 임장 코스" },
      { t: "다녀와서 기록하기", s: !logs.length ? "todo" : went >= 2 ? "done" : "now", d: logs.length ? `다녀온 단지 ${went}곳` : "방문 기록 0건" }];
    find("[data-pj-steps]").replaceChildren(...steps.map((x, i) => {
      const li = el("li", "pj-step " + x.s); if (x.s === "now") li.setAttribute("aria-current", "step");
      li.append(el("span", "pj-step-n", x.s === "done" ? "✓" : String(i + 1)), el("b", "", x.t), el("span", "muted", x.d)); return li;
    }));
    const box = find("[data-pj-next]"); box.replaceChildren(); box.hidden = current.archived;
    if (current.archived) return;
    const btns = [], go = (label, fn, primary) => { const b = el("button", "btn sm" + (primary ? " primary" : ""), label); b.type = "button"; b.addEventListener("click", fn); btns.push(b); };
    let msg;
    if (!n) { msg = "먼저 눈여겨본 아파트를 담아 보세요."; go("후보 찾으러 가기", openDiscover, true); }
    else if (n === 1) { msg = "한 곳만 더 담으면 비교할 수 있어요."; go("후보 더 찾기", openDiscover, true); }
    else if (!logs.length) { msg = "후보가 모였어요. 비교하고 가 볼 순서를 정해 보세요."; go("후보 비교하기", () => pickAndOpen("compare"), true); go("임장 코스 만들기", () => pickAndOpen("course")); }
    else if (went < 2) { msg = "다녀온 곳의 느낌을 남겼어요. 다음 후보도 가 보세요."; go("방문 기록 남기기", () => workspace.open("history"), true); go("후보 비교하기", () => pickAndOpen("compare")); }
    else { msg = "두 곳 이상 다녀왔어요. 기록을 보며 다시 비교해 보세요."; go("다시 비교하기", () => pickAndOpen("compare"), true); go("방문 기록 보기", () => workspace.open("history")); }
    box.append(el("p", "pj-next-t", "지금 할 일"), el("p", "pj-next-m", msg), ...btns);
  }
  function actions() {
    if (!current || !D) return;
    const slugs = current.slugs.filter(s => picked.has(s) && D.bySlug[s]);
    for (const s of [...picked]) if (!current.slugs.includes(s) || !D.bySlug[s]) picked.delete(s);
    const state = DJProjectFlow.selection(slugs, D.bySlug), loc = slugs.every(s => Number.isFinite(D.bySlug[s].la) && Number.isFinite(D.bySlug[s].ln)), n = slugs.length;
    find("[data-pj-selection]").textContent = `후보 ${current.slugs.length}곳 중 ${n}곳 선택${!loc ? " · 위치 정보가 없는 후보는 코스에 넣을 수 없어요" : ""}`;
    find("[data-pj-compare]").disabled = !state.compare;
    find("[data-pj-course]").disabled = !state.course;
    find("[data-pj-dock]").hidden = n < 2;
    find("[data-pj-dock-count]").textContent = `${n}곳 선택`;
    find("[data-pj-quick-compare]").disabled = !state.compare;
    find("[data-pj-quick-course]").disabled = !state.course;
    workspace.refresh();
  }
  find("[data-pj-compare]").addEventListener("click", () => workspace.open("compare"));
  find("[data-pj-course]").addEventListener("click", () => workspace.open("course"));
  find("[data-pj-quick-compare]").addEventListener("click", () => workspace.open("compare"));
  find("[data-pj-quick-course]").addEventListener("click", () => workspace.open("course"));
  root.querySelectorAll("[data-pj-history]").forEach(b => b.addEventListener("click", () => workspace.open("history")));
  find("[data-pj-finder]").addEventListener("click", () => workspace.open("finder"));
  function renderSearch() {
    if (!D || !current) return;
    const input = find("#pj-search"), district = find("[data-pj-district]"), budget = find("[data-pj-budget]");
    const result = DJProjectFlow.search(D.complexes, { query: input.value, district: district.value, maxPrice: budget.value });
    find("[data-pj-results-count]").textContent = !budget.validity.valid ? "환산가 상한을 0.1억 이상 숫자로 입력해 주세요."
      : `${result.length}곳 검색 · ${Math.min(searchLimit, result.length)}곳 표시 · 담은 후보는 아래 목록에 유지됩니다.`;
    const box = find("[data-pj-results]"); box.replaceChildren();
    if (!result.length) box.append(el("p", "muted", "맞는 단지가 없어요. 이름·지역·가격 상한 중 하나를 넓혀보세요."));
    result.slice(0, searchLimit).forEach(c => {
      const row = el("article", "pj-result"), title = el("button", "pj-result-name", c.n); title.type = "button";
      title.addEventListener("click", () => workspace.open("detail", c.s));
      const info = el("div"); info.append(title, el("p", "muted small", `${DJ.place(c)} · 84㎡ 기준 ${c.pt || "가격 정보 없음"}`));
      const addButton = el("button", "btn sm", current.slugs.includes(c.s) ? "후보에 담김" : "후보로 담기"); addButton.type = "button";
      addButton.disabled = current.archived || current.slugs.includes(c.s); addButton.setAttribute("aria-label", c.n + " " + addButton.textContent);
      addButton.addEventListener("click", () => add(c)); row.append(info, addButton); box.append(row);
    });
    find("[data-pj-more]").hidden = result.length <= searchLimit;
  }
  [find("#pj-search"), find("[data-pj-district]"), find("[data-pj-budget]")].forEach(input => input.addEventListener("input", () => { searchLimit = 12; renderSearch(); }));
  find("[data-pj-more]").addEventListener("click", () => { searchLimit += 12; renderSearch(); });
  find("[data-pj-all]").addEventListener("click", () => {
    if (!current) return;
    current.slugs.filter(s => D.bySlug[s]).forEach(s => picked.add(s));
    find("[data-pj-candidates]").querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; }); actions();
  });
  find("[data-pj-none]").addEventListener("click", () => { picked.clear(); find("[data-pj-candidates]").querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; }); actions(); });
  DJ.data().then(d => {
    D = d; current = P.list(REGION).find(p => !p.archived) || P.list(REGION)[0] || null;
    find("[data-pj-new]").open = !P.list(REGION).length;
    const district = find("[data-pj-district]");
    [...new Set(D.complexes.map(c => c.gu))].sort().forEach(gu => { const o = el("option", "", gu); o.value = gu; district.append(o); });
    render();
  }).catch(() => { status.textContent = "단지 자료를 불러오지 못했어요. 새로고침해 주세요. 프로젝트 기록은 그대로 보관됩니다."; });
  addEventListener("storage", e => {
    if (!e.key?.startsWith(DJ.records.key("project:")) && !e.key?.startsWith(DJ.records.key("visitlog:"))) return;
    updatedElsewhere();
  });
})();
