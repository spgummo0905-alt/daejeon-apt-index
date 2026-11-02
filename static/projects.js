(function () {
  const root = document.getElementById("projects");
  if (!root) return;
  const { el } = DJ, P = DJProjects, REGION = root.dataset.region;
  const find = s => root.querySelector(s), form = find("[data-pj-create]"), edit = find("[data-pj-edit]");
  const editor = find("[data-pj-editor]"), status = find("[data-pj-status]");
  const picked = new Set();
  let current = null, D = null, journal = null;
  let searchLimit = 12;
  const workspace = DJProjectWorkspace({ dialog: find("[data-pj-workspace]"),
    context: () => current && D ? { project: current, data: D, selected: [...picked] } : null,
    onAdd: s => { if (D.bySlug[s]) add(D.bySlug[s]); },
    onLogin: () => DJ.loginPrompt?.("기록 이어 보기") });
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
    b.append(el("b", "", p.name), el("span", "", `${p.slugs.length}곳${p.archived ? " · 보관 중" : " · 찾는 중"}`));
    b.addEventListener("click", () => choose(p)); return b;
  }
  function render() {
    const projects = P.list(REGION), active = projects.filter(p => !p.archived), archived = projects.filter(p => p.archived);
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
    const favs = DJ.favs().map(s => D.bySlug[s]).filter(c => c && !current.slugs.includes(c.s));
    find("[data-pj-favs]").replaceChildren(...favs.map(c => { const b = el("button", "chip", "+ " + c.n); b.type = "button"; b.addEventListener("click", () => add(c)); return b; }));
    const cards = find("[data-pj-candidates]"); cards.replaceChildren();
    if (!current.slugs.length) cards.append(el("p", "pj-empty muted", "아직 담은 후보가 없어요. 눈여겨본 아파트 두 곳부터 시작해 보세요."));
    current.slugs.forEach(s => {
      const c = D.bySlug[s], wrap = el("div", "pj-candidate");
      if (c) {
        const select = el("label", "pj-check"), cb = el("input"); cb.type = "checkbox"; cb.checked = picked.has(s);
        cb.setAttribute("aria-label", c.n + " 비교·코스에 선택");
        cb.addEventListener("change", () => { if (cb.checked) picked.add(s); else picked.delete(s); actions(); });
        select.append(cb, document.createTextNode(" 비교·코스에 선택")); wrap.append(select, DJ.card(c, D.stats));
        const note = DJ.visit(s);
        if (note.d || note.m) wrap.append(el("p", "pj-note", `${note.d ? note.d + " 방문 · " : ""}${note.m ? note.m.slice(0, 90) : "단지에 현장 기록이 있어요"}`));
        const detail = el("button", "btn ghost sm", "상세 정보"); detail.type = "button";
        detail.addEventListener("click", () => workspace.open("detail", s));
        const field = el("button", "btn ghost sm", "현장 체크·지난 기록"); field.type = "button";
        field.addEventListener("click", () => workspace.open("field", s)); wrap.append(detail, field);
        wrap.querySelectorAll('a[href]').forEach(a => a.addEventListener("click", e => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault(); workspace.open("detail", s);
        }));
      } else wrap.append(el("p", "muted", `현재 자료에 없는 후보 (${s}) · 기록은 유지됩니다.`));
      if (!current.archived) {
        const remove = el("button", "btn ghost sm", "후보에서 빼기"); remove.type = "button";
        remove.setAttribute("aria-label", (c?.n || s) + " 이 프로젝트 후보에서 빼기");
        remove.addEventListener("click", () => { if (mutate({ slugs: current.slugs.filter(x => x !== s) })) { picked.delete(s); actions(); } });
        wrap.append(remove);
      }
      cards.append(wrap);
    });
    journal = DJVisitLogUI({ region: REGION, projectId: current.id, candidates: current.slugs.map(s => D.bySlug[s]).filter(Boolean),
      names: Object.fromEntries(Object.values(D.bySlug).map(c => [c.s, c.n])), archived: current.archived, data: D });
    find("[data-pj-journal]").replaceChildren(journal.element);
    renderSearch(); workspace.refresh();
    actions();
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
