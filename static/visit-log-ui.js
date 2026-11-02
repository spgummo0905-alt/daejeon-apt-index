(function () {
  const { el } = DJ;
  addEventListener("beforeunload", e => {
    if (DJ.hasVisitLogDraft?.() || DJ.hasProjectDraft?.()) { e.preventDefault(); e.returnValue = ""; }
  });
  window.DJVisitLogUI = function ({ region, slug, projectId = "", candidates = [], names = {}, archived = false, data, defaultProjectId = "" }) {
    const s = el("section", "vl-section"), title = el("h4", "", "날짜별 방문 기록");
    const status = el("p", "sv-note"); status.setAttribute("role", "status");
    s.append(title, el("p", "sv-note", "낮에 본 집과 밤에 본 집, 느낌이 달랐나요? 방문할 때마다 따로 남겨 비교해 보세요."));
    const form = el("form", "vl-form"), row = el("div", "vl-row");
    const label = (text, input) => { const l = el("label", "", text); l.append(input); return l; };
    const apt = el("select"); apt.required = true;
    candidates.forEach(c => { const o = el("option", "", c.n); o.value = c.s; apt.append(o); });
    if (!slug) form.append(label("방문한 단지", apt));
    const date = el("input"); date.type = "date"; date.required = true; date.max = DJ.today(); date.value = DJ.today();
    const period = el("select"); DJVisitLog.periods.forEach(p => { const o = el("option", "", p || "시간대 선택 · 선택사항"); o.value = p; period.append(o); });
    row.append(label("방문 날짜", date), label("시간대", period)); form.append(row);
    const project = el("select");
    let projectTouched = false;
    project.addEventListener("change", () => { projectTouched = true; });
    if (slug && !projectId) {
      const o = el("option", "", "프로젝트 없이 기록"); o.value = ""; project.append(o);
      DJProjects.list(region).filter(p => !p.archived && p.slugs.includes(slug)).forEach(p => {
        const o = el("option", "", p.name); o.value = p.id; project.append(o);
      });
      form.append(label("연결할 프로젝트 · 선택사항", project));
      if ([...project.options].some(o => o.value === defaultProjectId)) project.value = defaultProjectId;
    }
    const memo = el("textarea"); memo.rows = 3; memo.maxLength = 2000;
    memo.placeholder = "예: 저녁 7시 주차 여유가 적었음. 다음에는 출근 시간 소음 확인하기.";
    form.append(label("이번 방문에서 확인한 점", memo));
    const copy = el("button", "btn ghost sm", "단지 공통 메모 가져오기"); copy.type = "button";
    copy.addEventListener("click", () => {
      const v = DJ.visit(slug || apt.value);
      if (!v.m) { status.textContent = "이 단지에 저장된 공통 메모가 없어요."; return; }
      if (memo.value && !confirm("작성 중인 방문 메모를 단지 공통 메모로 바꿀까요?")) return;
      memo.value = v.m.slice(0, 2000); memo.focus();
    });
    const snapshot = el("input"); snapshot.type = "checkbox";
    const checkLabel = label("현재 단지 체크 상태도 함께 보관", snapshot); checkLabel.className = "vl-check";
    const save = el("button", "btn primary", "방문 기록 남기기"); save.type = "submit";
    form.append(copy, checkLabel, el("p", "sv-note", "기존 단지 메모·사진은 바뀌지 않아요. 날짜별 기록은 공유 링크에 포함하지 않습니다."), save);
    const history = el("div", "vl-history");
    let submitted = false;
    const dirty = () => !submitted && !!(memo.value || snapshot.checked || period.value || date.value !== DJ.today());
    function draw() {
      const visits = DJVisitLog.list({ region, slug, projectId });
      history.replaceChildren();
      if (!visits.length) history.append(el("p", "muted", "아직 방문 기록이 없어요. 첫 방문의 느낌부터 남겨보세요."));
      visits.forEach(v => {
        const d = el("details", "vl-entry"), summary = el("summary", "", `${v.date}${v.period ? " · " + v.period : ""} · ${names[v.slug] || v.slug}`);
        d.append(summary);
        if (v.projectId) d.append(el("p", "sv-note", "프로젝트 · " + (window.DJProjects?.read(v.projectId)?.name || "연결한 프로젝트")));
        if (v.memo) d.append(el("p", "vl-memo", v.memo));
        if (v.checks) {
          const checked = [...(v.checks.c || []), ...Object.values(v.checks.x || {})].filter(Boolean).length;
          const state = el("details", "vl-checks"); state.append(el("summary", "", `저장 당시 체크 ${checked}개 확인`));
          const ul = el("ul");
          (v.checks.labels || []).forEach(item => ul.append(el("li", "", `${item.on ? "✓" : "−"} ${item.label}`)));
          state.append(ul); d.append(state);
        }
        const del = el("button", "btn ghost sm", "이 방문 기록 삭제"); del.type = "button";
        del.addEventListener("click", () => {
          if (!confirm(`${v.date} 방문 기록을 삭제할까요? 기존 단지 메모와 다른 방문 기록은 남습니다.`)) return;
          try { DJVisitLog.remove(v.id, v.created); draw(); status.textContent = "선택한 방문 기록을 삭제했어요."; }
          catch (_) { status.textContent = "삭제하지 못했어요. 연결 상태와 저장 공간을 확인해 주세요."; }
        });
        d.append(del); history.append(d);
      });
    }
    form.addEventListener("submit", e => {
      e.preventDefault(); save.disabled = true;
      try {
        const selected = slug || apt.value, v = DJ.visit(selected), c = data?.bySlug[selected];
        const labels = DJ.CHECK.map((label, i) => ({ label, on: !!v.c[i] }));
        if (c) DJ.visitItems(c, region).forEach(([key, label]) => labels.push({ label, on: !!v.x[key] }));
        DJVisitLog.create({ region, slug: slug || apt.value, projectId: projectId || project.value, date: date.value,
          period: period.value, memo: memo.value, snapshot: snapshot.checked ? { ...v, labels } : null });
        submitted = true; memo.value = ""; snapshot.checked = false; period.value = ""; date.value = DJ.today();
        status.textContent = "이번 방문을 별도 기록으로 남겼어요. 기존 기록은 그대로예요."; draw();
      } catch (e) {
        status.textContent = e.message === "empty" ? "이번 방문 메모를 적거나 체크 상태 보관을 선택해 주세요."
          : e.message === "project" ? "프로젝트의 후보·보관 상태가 바뀌었어요. 작성한 내용을 복사해 두고 새로고침해 주세요."
          : e.message === "fields" ? "방문 날짜와 메모를 확인해 주세요. 미래 날짜는 기록할 수 없어요."
          : "방문 기록을 저장하지 못했어요. 작성한 내용은 남겨두었으니 연결 상태와 저장 공간을 확인해 주세요.";
      } finally { save.disabled = false; submitted = false; }
    });
    if (!archived && (slug || candidates.length)) s.append(form);
    else s.append(el("p", "sv-note", archived ? "보관한 프로젝트의 방문 기록이에요. 새로 기록하려면 프로젝트를 다시 시작하세요." : "프로젝트에 후보를 추가하면 방문 기록을 남길 수 있어요."));
    s.append(status, history); draw();
    return { element: s, dirty, refresh: draw, connectProject(id) {
      if (!slug || projectId || !id) return;
      const p = DJProjects.read(id);
      if (!p || p.region !== region || p.archived || !p.slugs.includes(slug)) return;
      if (![...project.options].some(o => o.value === id)) { const o = el("option", "", p.name); o.value = id; project.append(o); }
      if (!projectTouched && !project.value) project.value = id;
    } };
  };
})();
