// 랭킹: 탭을 바꾸면 밑줄이 미끄러지고, 시상대가 아래에서 올라오며 숫자가 올라갑니다.
(function () {
  const tabs = Array.from(document.querySelectorAll(".rank-tab"));
  if (!tabs.length) return;
  const ink = document.querySelector(".rank-ink");
  const panels = Array.from(document.querySelectorAll(".rank-panel"));

  function moveInk(t) {
    ink.style.width = t.offsetWidth + "px";
    ink.style.transform = "translateX(" + t.offsetLeft + "px)";
  }
  function play(p) {
    p.classList.remove("play");
    void p.offsetWidth; // 애니메이션 다시 시작
    p.classList.add("play");
    p.querySelectorAll(".pd-val, .rl-val").forEach((n, i) => setTimeout(() => DJ.countUp(n, 650), DJ.calm ? 0 : 180 + i * 40));
  }
  function open(t, push) {
    tabs.forEach(o => { o.classList.toggle("active", o === t); o.setAttribute("aria-selected", o === t ? "true" : "false"); });
    panels.forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; if (!p.hidden) play(p); });
    moveInk(t);
    t.scrollIntoView({ block: "nearest", inline: "center", behavior: DJ.calm ? "auto" : "smooth" });
    if (push) history.replaceState(null, "", "#" + t.dataset.tab);
  }
  tabs.forEach(t => t.addEventListener("click", () => open(t, true)));
  addEventListener("resize", () => moveInk(tabs.find(t => t.classList.contains("active"))));
  const first = tabs.find(t => "#" + t.dataset.tab === location.hash) || tabs[0];
  requestAnimationFrame(() => open(first, false));
})();
