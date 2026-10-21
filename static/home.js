// 메인: 찜한 단지 줄, 지역 카드를 누르면 목록을 그 구로 거르기, 구별 비교 탭
(function () {
  const { el } = DJ;
  const favs = DJ.favs();
  if (favs.length) {
    DJ.data().then(d => {
      const list = favs.map(s => d.bySlug[s]).filter(Boolean).slice(0, 8);
      if (!list.length) return;
      const box = document.getElementById("my-strip-list");
      list.forEach(c => {
        const a = el("a", "strip-item");
        a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("strong", "", c.n), el("span", "muted", (c.i ?? "-") + "점"));
        box.append(a);
      });
      document.getElementById("my-strip").hidden = false;
    });
  }
  document.querySelectorAll("[data-gu-jump]").forEach(a => a.addEventListener("click", () => {
    const chip = document.querySelector('#gu-filter .chip[data-gu="' + a.dataset.guJump + '"]');
    if (chip) chip.click();
  }));
  document.querySelectorAll(".gu-tabs .chip").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".gu-tabs .chip").forEach(b => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    document.querySelectorAll(".gu-board").forEach(bd => { bd.hidden = bd.dataset.board !== btn.dataset.board; });
  }));
})();
