// 단지 목록 표: 구(동) 거르기, 검색, 열 정렬, 30개씩 더 보기
(function () {
  const table = document.getElementById("complex-table");
  if (!table) return;
  const tbody = table.tBodies[0];
  let rows = Array.from(tbody.rows);
  // 전체 단지 줄: HTML엔 상위 30곳만 있고 나머지는 단지 자료로 그림 (서울처럼 단지가 많아도 첫 화면이 가볍게)
  const years = (table.dataset.years || "").split(",").filter(Boolean);
  const pct = v => v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  const sc = v => v == null ? "-" : String(Math.round(v));
  function row(c) {
    const tr = document.createElement("tr");
    tr.dataset.gu = c.gu; tr.dataset.q = c.n + " " + c.d;
    if (c.sm) tr.dataset.small = "1";
    const td = (v, cls, html) => { const x = document.createElement("td"); if (v !== undefined) x.dataset.v = v == null ? "" : v; if (cls) x.className = cls; x.innerHTML = html; tr.appendChild(x); return x; };
    const esc = t => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    const place = esc(DJ.place(c));
    td(c.rk, "", c.rk || "-");
    td(undefined, "col-name", `<a href="${DJ.href(c)}">${esc(c.n)}</a>${c.h ? '<span class="badge-high">신고가</span>' : ""}${c.sm ? `<span class="badge-small">${esc(c.sr || "소규모")}</span>` : ""}<span class="t-place">${place}</span>`);
    td(c.i, "idx-cell", `<span class="idx-bar"><span style="width: ${c.i == null ? 0 : c.i}%"></span></span><span class="grade g-${esc(c.g)}">${esc(c.g)}</span> ${sc(c.i)}`);
    td(undefined, "col-place", place);
    td(c.y, "col-year", c.y || "-");
    td(c.p, "", c.pt || "-");
    years.forEach(n => { const v = c["c" + n]; td(v, v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "", pct(v)); });
    td(c.st[0], "", sc(c.st[0]));
    return tr;
  }

  function start() {
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
    // 검색에서 동·구를 고르고 오면 (index.html?area=서구&dong=둔산동#list) 그 동네로 걸러서 보여줍니다
    const qs = new URLSearchParams(location.search);
    if (qs.get("area") || qs.get("dong")) {
      const v = qs.get("dong") || "";
      setArea(qs.get("area") || "");
      if (search && v) { search.value = v; q = v.toLowerCase(); reset(); }
      requestAnimationFrame(() => document.getElementById("list").scrollIntoView());
    }
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
        // 숫자는 큰 값부터, 글자(단지·위치)는 가나다순부터. 한 번 더 누르면 반대로
        const desc = numeric ? !th.classList.contains("sorted-desc") : th.classList.contains("sorted-asc");
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
  }
  if (table.hasAttribute("data-lazy")) {
    const small = fetch((window.DJ_ROOT || "") + "small.json").then(r => r.ok ? r.json() : { complexes: [] }).catch(() => ({ complexes: [] }));
    Promise.all([DJ.data(), small]).then(([d, s]) => {
      // 순위 순 (지수 없는 단지는 맨 아래), 소규모·원룸형은 그 뒤 (지수 높은 순)
      const all = d.complexes.slice().sort((a, b) => (a.rk || 1e9) - (b.rk || 1e9));
      const sm = s.complexes.slice().sort((a, b) => (b.i ?? -1) - (a.i ?? -1));
      tbody.replaceChildren(...all.map(row), ...sm.map(row));
      rows = Array.from(tbody.rows);
      start();
    }).catch(start);
  } else start();
})();
