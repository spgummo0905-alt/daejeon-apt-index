// 차트 툴팁: data-tip 이 있는 요소에 마우스를 올리거나 키보드로 포커스하면 보여줍니다.
// 문구는 textContent 로만 넣어 단지 이름에 섞인 HTML이 실행되지 않게 합니다.
(function () {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);

  function show(el, x, y) {
    const lines = (el.getAttribute("data-tip") || "").split("\n");
    tip.replaceChildren();
    lines.forEach((line, i) => {
      const d = document.createElement("div");
      d.textContent = line;
      if (i === 0) d.className = "tip-head";
      tip.appendChild(d);
    });
    tip.hidden = false;
    const pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + pad, top = y + pad;
    if (left + w > window.innerWidth - 8) left = x - w - pad;
    if (top + h > window.innerHeight - 8) top = y - h - pad;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function hide() { tip.hidden = true; }

  document.addEventListener("pointermove", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) show(el, e.clientX, e.clientY); else hide();
  });
  document.addEventListener("focusin", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    show(el, r.right, r.top);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", hide, { passive: true });
})();
