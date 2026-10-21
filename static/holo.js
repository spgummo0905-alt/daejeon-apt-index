// 상위 등급(S·A) 카드의 빛 반사 효과.
// 마우스나 손가락 위치를 따라 카드가 살짝 기울고, 금박·은박 위로 빛이 지나갑니다.
// '동작 줄이기' 설정을 켠 기기에서는 움직이지 않습니다.
(function () {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const MAX = 7; // 최대 기울기(도)
  let active = null;

  function premium(card) { return card && /\bg-(S|A)\b/.test(card.className); }

  function move(card, x, y) {
    const r = card.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
    card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    card.style.setProperty("--rx", ((0.5 - py) * MAX).toFixed(2) + "deg");
    card.style.setProperty("--ry", ((px - 0.5) * MAX).toFixed(2) + "deg");
    card.classList.add("holo-on");
  }
  function reset(card) {
    if (!card) return;
    card.classList.remove("holo-on");
    card.style.removeProperty("--rx");
    card.style.removeProperty("--ry");
  }

  document.addEventListener("pointermove", e => {
    const card = e.target.closest && e.target.closest("[data-holo]");
    if (card !== active) { reset(active); active = premium(card) ? card : null; }
    if (active) move(active, e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { reset(active); active = null; });
  document.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") { reset(active); active = null; } });
})();
