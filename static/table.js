// 단지 목록 표: 구 필터, 검색, 열 정렬, 30개씩 더 보기
(function () {
  const table = document.getElementById("complex-table");
  if (!table) return;
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  const PAGE = 30;
  const pager = document.getElementById("table-pager");
  const count = document.getElementById("table-count");
  const more = document.getElementById("table-more");
  let gu = "", q = "", showSmall = false, limit = PAGE;

  function apply() {
    let n = 0;
    rows.forEach(r => {
      const ok = (!gu || r.dataset.gu === gu) && (!q || r.dataset.q.toLowerCase().includes(q))
        && (showSmall || !r.dataset.small);
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

  document.querySelectorAll("#gu-filter .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#gu-filter .chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      gu = btn.dataset.gu;
      reset();
    });
  });
  const small = document.getElementById("show-small");
  if (small) small.addEventListener("change", () => { showSmall = small.checked; reset(); });
  document.getElementById("search").addEventListener("input", e => {
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
