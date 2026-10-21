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
  // 입지 대비 가격이 좋은 단지: 전체/아파트/빌라 필터, 10개씩 더 보기
  const vlist = document.getElementById("value-list");
  if (vlist) {
    const items = Array.from(vlist.children);
    const more = document.getElementById("value-more");
    let vtype = "apt", vlimit = 10;
    const draw = () => {
      let n = 0;
      items.forEach(li => {
        const ok = !vtype || li.dataset.type === vtype;
        if (ok) n++;
        li.hidden = !ok || n > vlimit;
        const rank = li.querySelector(".vl-rank");
        if (ok) { rank.textContent = n; rank.classList.toggle("top", n <= 3); }
      });
      more.hidden = n <= vlimit;
      document.getElementById("value-empty").hidden = n > 0;
      more.textContent = `${Math.min(10, n - vlimit)}곳 더 보기`;
    };
    document.querySelectorAll("#value-type .chip").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#value-type .chip").forEach(b => b.classList.toggle("active", b === btn));
      vtype = btn.dataset.type; vlimit = 10; draw();
    }));
    more.addEventListener("click", () => { vlimit += 10; draw(); });
    draw();
  }
})();
