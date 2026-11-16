// 홈(폰): '전체 단지' 구역을 접어 두고 버튼으로 펼침. #list 주소로 오거나 '전체 목록' 바로가기를 눌러도 펼침.
(function () {
  "use strict";
  const sec = document.getElementById("list"), btn = sec && sec.querySelector("[data-hm-list]");
  if (!sec || !btn) return;
  const txt = btn.querySelector("[data-hm-list-t]"), closed = txt.textContent;
  function set(on, scroll) {
    sec.classList.toggle("hm-open", on);
    btn.setAttribute("aria-expanded", String(on));
    txt.textContent = on ? "접기" : closed;
    if (on) { if (DJ.openList) DJ.openList(); if (scroll) sec.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }
    else if (scroll) sec.scrollIntoView({ block: "start" });
  }
  btn.addEventListener("click", () => set(!sec.classList.contains("hm-open"), true));
  const fromHash = () => { if (location.hash === "#list") set(true, true); };
  fromHash(); addEventListener("hashchange", fromHash);
  document.addEventListener("click", e => { const a = e.target.closest && e.target.closest('a[href="#list"]'); if (a) set(true, false); });
})();
