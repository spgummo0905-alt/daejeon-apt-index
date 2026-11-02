// 프로젝트가 만든 같은 출처 패널에서만 활성화합니다. 직접 연 일반 페이지는 그대로입니다.
(function () {
  const q = new URLSearchParams(location.search);
  try {
    if (window === parent || q.get("workspace") !== "1" || parent.location.origin !== location.origin
      || !window.frameElement?.hasAttribute("data-pw-embed")) return;
  } catch (_) { return; }
  const send = (action, extra = {}) => parent.postMessage({ type: "jipgam-workspace", action, ...extra }, location.origin);
  const field = q.get("view") === "field";
  window.DJWorkspaceEmbed = { send, projectId: q.get("project") || "" };
  document.documentElement.classList.add("pj-embed");
  if (field) document.documentElement.classList.add("pj-embed-field");
  const slugFrom = url => {
    if (url.origin !== location.origin) return null;
    const match = url.pathname.match(/\/apt\/([\w.-]+?)(?:\.html)?$/);
    return match ? match[1] : null;
  };
  document.addEventListener("click", e => {
    if (e.target.closest("[data-field]")) {
      const slug = document.getElementById("field-sheet")?.dataset.slug;
      if (slug) { e.preventDefault(); e.stopImmediatePropagation(); send("open", { kind: "field", slug }); return; }
    }
    const a = e.target.closest("a[href]"); if (!a || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href), slug = slugFrom(url);
    if (slug) { e.preventDefault(); e.stopImmediatePropagation(); send("open", { kind: url.hash === "#field" ? "field" : "detail", slug }); }
    else if (url.pathname !== location.pathname || url.origin !== location.origin) {
      // 길찾기·출처 등 외부 자료는 새 창으로. 작업 중인 검색·기록 화면을 대체하지 않습니다.
      a.target = "_blank"; a.rel = "noopener";
    }
  }, true);
  addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); send("close"); }
  }, true);
  let context = { slugs: [], archived: false };
  function candidateActions() {
    if (document.body.dataset.page !== "finder") return;
    document.querySelectorAll(".gcard").forEach(card => {
      const a = card.querySelector("a[href]"), slug = a && slugFrom(new URL(a.href, location.href));
      if (!slug) return;
      let b = card.querySelector("[data-pw-candidate]");
      if (!b) {
        b = DJ.el("button", "btn sm pw-candidate"); b.type = "button"; b.dataset.pwCandidate = slug;
        b.setAttribute("aria-label", a.textContent + " 프로젝트 후보로 담기");
        b.addEventListener("click", () => send("add", { slug })); card.append(b);
      }
      const included = context.slugs.includes(slug), text = included ? "프로젝트 후보에 담김" : "프로젝트 후보로 담기";
      if (b.textContent !== text) b.textContent = text;
      if (b.disabled !== (included || context.archived)) b.disabled = included || context.archived;
    });
  }
  addEventListener("message", e => {
    if (e.origin !== location.origin || e.source !== parent || e.data?.type !== "jipgam-workspace-context") return;
    if (!Array.isArray(e.data.slugs) || !e.data.slugs.every(s => typeof s === "string")) return;
    context = { slugs: e.data.slugs, archived: !!e.data.archived }; candidateActions();
    window.dispatchEvent(new CustomEvent("dj:workspace-context", { detail: e.data.projectId }));
  });
  function ready() {
    const sheet = document.getElementById("field-sheet"); if (field && sheet) sheet.removeAttribute("aria-modal");
    queueMicrotask(() => { DJ.loginPrompt = () => send("login"); DJ.login = () => send("login"); });
    candidateActions();
    if (document.body.dataset.page === "finder") new MutationObserver(candidateActions).observe(document.querySelector("main"), { childList: true, subtree: true });
    send("ready");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
