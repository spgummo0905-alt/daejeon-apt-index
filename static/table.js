// 단지 목록 표: 구 필터, 검색, 열 정렬
(function () {
  const table = document.getElementById("complex-table");
  if (!table) return;
  const tbody = table.tBodies[0];
  const rows = Array.from(tbody.rows);
  let gu = "", q = "";

  function apply() {
    rows.forEach(r => {
      const okGu = !gu || r.dataset.gu === gu;
      const okQ = !q || r.dataset.q.toLowerCase().includes(q);
      r.hidden = !(okGu && okQ);
    });
  }

  document.querySelectorAll("#gu-filter .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#gu-filter .chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      gu = btn.dataset.gu;
      apply();
    });
  });
  const small = document.getElementById("show-small");
  if (small) small.addEventListener("change", () => table.classList.toggle("show-small", small.checked));
  document.getElementById("search").addEventListener("input", e => {
    q = e.target.value.trim().toLowerCase();
    apply();
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
    });
  });
})();
