// 메인: 찜한 단지 줄, 지역 카드를 누르면 목록을 그 구로 거르기, 구별 비교 탭
(function () {
  const { el } = DJ;
  // 관심 단지·최근 본 단지 줄 (이 브라우저에만 남는 목록)
  const strip = (slugs, sec, box) => {
    if (!slugs.length || !document.getElementById(sec)) return;
    DJ.data().then(d => {
      const list = slugs.map(s => d.bySlug[s]).filter(Boolean).slice(0, 8);
      if (!list.length) return;
      const b = document.getElementById(box);
      b.textContent = "";
      // 관심 단지 줄: 지난번 확인한 뒤 새 거래·시세 변화가 있는 단지는 빨간 점, 제목 옆에 '새 소식 N곳'
      const news = sec === "my-strip" ? new Set(DJ.watchSync(d.bySlug).map(x => x.c.s)) : new Set();
      list.forEach(c => {
        const a = el("a", "strip-item" + (news.has(c.s) ? " has-news" : ""));
        a.href = DJ.href(c) + (news.has(c.s) ? "#trades" : "");
        a.append(el("span", "grade g-" + c.g, c.g), el("strong", "", c.n), el("span", "muted", (c.i ?? "-") + "점"));
        if (news.has(c.s)) a.setAttribute("aria-label", c.n + ", 새 소식 있음");
        b.append(a);
      });
      const tag = document.querySelector("[data-strip-news]");
      if (tag && news.size) { tag.textContent = `새 소식 ${news.size}곳`; tag.hidden = false; }
      document.getElementById(sec).hidden = false;
    });
  };
  strip(DJ.favs(), "my-strip", "my-strip-list");
  strip(DJ.recent().map(r => r.s), "recent-strip", "recent-strip-list");
  const clr = document.getElementById("recent-clear");
  if (clr) clr.addEventListener("click", () => { DJ.save("recent", []); document.getElementById("recent-strip").hidden = true; dispatchEvent(new Event("dj:recent")); });
  // 첫 화면 카드 덱: 휴대폰에선 세 장 모두 넘겨 보고 누를 수 있게, 넓은 화면에선 뒤 카드는 장식
  const mq = matchMedia("(max-width: 900px)");
  const deck = () => document.querySelectorAll("[data-deck-back]").forEach(a => {
    if (mq.matches) { a.removeAttribute("aria-hidden"); a.removeAttribute("tabindex"); }
    else { a.setAttribute("aria-hidden", "true"); a.setAttribute("tabindex", "-1"); }
  });
  deck();
  if (mq.addEventListener) mq.addEventListener("change", deck);
  // 주목할 단지 탭 (화살표 키로도)
  const tabs = Array.from(document.querySelectorAll(".top-tabs [role=tab]"));
  const pick = t => tabs.forEach(b => {
    const on = b === t;
    b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
    document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
  });
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => pick(b));
    b.addEventListener("keydown", e => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const n = tabs[(i + step + tabs.length) % tabs.length];
      pick(n); n.focus();
    });
  });
  document.querySelectorAll("[data-gu-jump]").forEach(a => a.addEventListener("click", e => {
    if (!DJ.showArea) return;
    e.preventDefault();
    DJ.showArea(a.dataset.guJump);
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
      document.querySelectorAll("#value-type .chip").forEach(b => { b.classList.toggle("active", b === btn); b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      vtype = btn.dataset.type; vlimit = 10; draw();
    }));
    more.addEventListener("click", () => { vlimit += 10; draw(); });
    draw();
  }
})();
