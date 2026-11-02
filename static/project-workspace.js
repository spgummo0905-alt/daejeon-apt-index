// 기존 분석 화면은 같은 출처의 작업 패널 안에서 재사용합니다. 부모 화면은 이동·초기화하지 않습니다.
(function () {
  window.DJProjectWorkspace = function ({ dialog, context, onAdd, onOpen, onLogin }) {
    const frames = new Map(), tabs = [...dialog.querySelectorAll("[data-pw-tab]")];
    const host = dialog.querySelector("[data-pw-frames]"), history = dialog.querySelector("[data-pj-journal]");
    const status = dialog.querySelector("[data-pw-status]"), select = dialog.querySelector("[data-pw-apt]");
    const labels = { detail: "단지 상세", field: "현장 체크", compare: "후보 비교", course: "임장 코스", finder: "조건으로 찾기", history: "방문 기록" };
    let active = "", lastFocus = null, activeSlug = "";
    const frameDirty = frame => {
      try { const d = frame.contentWindow.DJ; return !!(d?.hasVisitLogDraft?.() || d?.hasProjectDraft?.()); }
      catch (_) { return false; }
    };
    const dirty = () => [...frames.values()].some(frameDirty);
    function send(frame) {
      const ctx = context(); if (!ctx) return;
      frame.contentWindow?.postMessage({ type: "jipgam-workspace-context", projectId: ctx.project.id,
        slugs: ctx.project.slugs, archived: ctx.project.archived }, location.origin);
    }
    function refresh() {
      const ctx = context(); if (!ctx) return;
      const state = DJProjectFlow.selection(ctx.selected, ctx.data.bySlug);
      const choices = [...new Set([activeSlug, ...ctx.project.slugs])].filter(s => Object.hasOwn(ctx.data.bySlug, s)).map(s => ctx.data.bySlug[s]);
      select.replaceChildren(...choices.map(c => { const o = DJ.el("option", "", c.n); o.value = c.s; return o; }));
      if (activeSlug) select.value = activeSlug;
      select.hidden = !["detail", "field"].includes(active);
      tabs.forEach(b => {
        b.disabled = b.dataset.pwTab === "compare" ? !state.compare : b.dataset.pwTab === "course" ? !state.course
          : ["detail", "field"].includes(b.dataset.pwTab) && !choices.length;
      });
      const add = dialog.querySelector("[data-pw-add]");
      add.hidden = !["detail", "field"].includes(active) || !activeSlug;
      add.disabled = ctx.project.archived || ctx.project.slugs.includes(activeSlug);
      add.textContent = ctx.project.slugs.includes(activeSlug) ? "후보에 담김" : "이 프로젝트 후보로 담기";
      frames.forEach(send);
    }
    function close() {
      dialog.close(); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    }
    function open(kind, slug) {
      const ctx = context(); if (!ctx) return false;
      const state = DJProjectFlow.selection(ctx.selected, ctx.data.bySlug);
      if (kind === "compare" && !state.compare || kind === "course" && !state.course) return false;
      if (!DJProjectFlow.kinds.includes(kind)) return false;
      const targetSlug = slug || activeSlug || ctx.project.slugs[0];
      if (["detail", "field"].includes(kind) && !Object.hasOwn(ctx.data.bySlug, targetSlug)) return false;
      const url = DJProjectFlow.url(kind, { slug: targetSlug, slugs: state.list, projectId: ctx.project.id });
      let frame = frames.get(kind);
      if (frame && frame.dataset.url !== url && frameDirty(frame)
        && !confirm("이 단지에 아직 저장하지 않은 방문 기록이 있어요. 내용을 저장하지 않고 다른 단지를 열까요?")) return false;
      if (kind !== "history" && !frame) {
        frame = DJ.el("iframe", "pw-frame"); frame.title = labels[kind]; frame.dataset.pwEmbed = "";
        frame.addEventListener("load", () => { status.textContent = ""; send(frame); });
        host.append(frame); frames.set(kind, frame);
      }
      if (!dialog.open) { lastFocus = document.activeElement; dialog.showModal(); }
      if (frame && frame.dataset.url !== url) {
        status.textContent = "불러오는 중… 연결이 느리면 잠시 기다리거나 닫고 다시 열어 주세요.";
        frame.dataset.url = url; frame.src = url;
      }
      active = kind;
      if (["detail", "field"].includes(kind)) activeSlug = targetSlug;
      frames.forEach((f, k) => { f.hidden = kind !== k; });
      host.hidden = kind === "history";
      history.hidden = kind !== "history";
      dialog.querySelector("[data-pw-title]").textContent = ctx.project.name + " · " + labels[kind];
      tabs.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pwTab === kind)));
      refresh(); onOpen?.(kind);
      return true;
    }
    dialog.querySelector("[data-pw-close]").addEventListener("click", close);
    dialog.addEventListener("cancel", e => { e.preventDefault(); close(); });
    dialog.addEventListener("click", e => { if (e.target === dialog) close(); });
    tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.pwTab)));
    select.addEventListener("change", () => { if (!open(active, select.value)) select.value = activeSlug; });
    dialog.querySelector("[data-pw-add]").addEventListener("click", () => { onAdd(activeSlug); refresh(); });
    addEventListener("message", e => {
      if (e.origin !== location.origin || ![...frames.values()].some(f => f.contentWindow === e.source)
        || e.data?.type !== "jipgam-workspace") return;
      const { action, slug, kind } = e.data, ctx = context(); if (!ctx) return;
      if (action === "ready") { frames.forEach(send); return; }
      if (action === "close") { close(); return; }
      if (action === "login") { close(); onLogin?.(); return; }
      if (typeof slug !== "string" || !Object.hasOwn(ctx.data.bySlug, slug)) return;
      if (action === "add") { onAdd(slug); refresh(); }
      if (action === "open" && ["detail", "field"].includes(kind)) open(kind, slug);
    });
    return { open, dirty, refresh, reset() {
      if (dialog.open) close(); frames.forEach(f => f.remove()); frames.clear(); active = activeSlug = "";
    } };
  };
})();
