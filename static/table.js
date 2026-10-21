// 단지 목록 표: 구(동) 거르기, 검색, 열 정렬, 30개씩 더 보기
(function () {
  const table = document.getElementById("complex-table");
  if (!table) return;
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  const PAGE = 30;
  const pager = document.getElementById("table-pager");
  const count = document.getElementById("table-count");
  const more = document.getElementById("table-more");
  let gu = "", q = "", type = "apt", limit = PAGE;

  function apply() {
    let n = 0;
    rows.forEach(r => {
      const ok = (!gu || r.dataset.gu === gu) && (!q || r.dataset.q.toLowerCase().includes(q))
        && (!type || (type === "villa") === !!r.dataset.small);
      if (ok) n++;
      r.hidden = !ok || n > limit;
    });
    const shown = Math.min(n, limit);
    if (pager) {
      pager.hidden = n === 0;
      count.textContent = `${n.toLocaleString()}개 중 ${shown.toLocaleString()}개`;
      more.hidden = shown >= n;
      more.textContent = `${Math.min(PAGE, n - shown)}개 더 보기`;
    }
  }
  function reset() { limit = PAGE; apply(); }
  if (more) more.addEventListener("click", () => { limit += PAGE; apply(); });

  // 구(또는 동) 거르기: 구가 몇 개뿐이면 칩, 동이 많은 지역(세종)은 묶음 고르기 상자
  const chips = Array.from(document.querySelectorAll("#gu-filter .chip"));
  const select = document.getElementById("gu-select");
  function setArea(v) {
    gu = v || "";
    chips.forEach(b => b.classList.toggle("active", b.dataset.gu === gu));
    if (select) select.value = gu;
    reset();
  }
  chips.forEach(btn => btn.addEventListener("click", () => setArea(btn.dataset.gu)));
  if (select) select.addEventListener("change", () => setArea(select.value));
  const search = document.getElementById("search");
  // 다른 곳(지역 카드, 동네 온도 지도)에서 '이 지역 단지 보기'를 누르면 목록을 그 지역으로 거르고 내려갑니다.
  DJ.showArea = function (area, dong) {
    setArea(area);
    if (search) { search.value = dong && dong !== area ? dong : ""; search.dispatchEvent(new Event("input")); }
    document.getElementById("list").scrollIntoView({ behavior: DJ.calm ? "auto" : "smooth" });
  };
  document.querySelectorAll("#table-type .chip").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("#table-type .chip").forEach(b => b.classList.toggle("active", b === btn));
    type = btn.dataset.type;
    reset();
  }));
  search.addEventListener("input", e => {
    q = e.target.value.trim().toLowerCase();
    reset();
  });

  table.querySelectorAll("th[data-sort]").forEach((th, col) => {
    th.addEventListener("click", () => {
      const numeric = th.dataset.sort === "num";
      const desc = !th.classList.contains("sorted-desc");
      table.querySelectorAll("th").forEach(h => h.classList.remove("sorted-asc", "sorted-desc"));
      th.classList.add(desc ? "sorted-desc" : "sorted-asc");
      const key = r => {
        const cell = r.cells[col];
        if (!numeric) return cell.textContent.trim();
        const v = cell.dataset.v;
        return v === undefined || v === "" ? null : parseFloat(v);
      };
      rows.sort((a, b) => {
        const ka = key(a), kb = key(b);
        if (ka === null) return 1;   // 값 없는 단지는 항상 아래로
        if (kb === null) return -1;
        const c = numeric ? ka - kb : ka.localeCompare(kb, "ko");
        return desc ? -c : c;
      });
      rows.forEach(r => tbody.appendChild(r));
      reset();
    });
  });
  apply();
})();
