// 사이트 공통: 단지 데이터, 검색 자동완성, 관심 단지/최근 본 단지, 공유, 알림.
// 저장은 이 브라우저(localStorage)에만 남고, 막혀 있어도 사이트는 그대로 동작합니다.
(function () {
  const ROOT = window.DJ_ROOT || "";
  const DJ = (window.DJ = {});

  // ---------- 저장소 ----------
  function load(key, fallback) {
    try { const v = localStorage.getItem("djdex:" + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem("djdex:" + key, JSON.stringify(value)); } catch (e) { /* 저장 불가: 무시 */ }
  }
  DJ.load = load; DJ.save = save;

  // ---------- 데이터 ----------
  let dataPromise = null;
  DJ.data = function () {
    if (!dataPromise) {
      dataPromise = fetch(ROOT + "complexes.json").then(r => r.json()).then(d => {
        d.bySlug = {};
        d.complexes.forEach(c => { d.bySlug[c.s] = c; });
        return d;
      });
    }
    return dataPromise;
  };
  DJ.href = c => ROOT + "apt/" + c.s + ".html";

  // ---------- DOM 도우미 (문자열은 textContent 로만 넣습니다) ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  DJ.el = el;

  // ---------- 알림 ----------
  DJ.toast = function (title, body) {
    const zone = document.getElementById("toast-zone");
    if (!zone) return;
    const t = el("div", "toast");
    t.append(el("strong", "", title));
    if (body) t.append(el("span", "", body));
    zone.append(t);
    setTimeout(() => t.classList.add("out"), 3200);
    setTimeout(() => t.remove(), 3800);
  };

  DJ.unlock = function () {}; // 예전 페이지 호환용 (업적 기능은 없앴습니다)

  // ---------- 찜 / 최근 본 ----------
  DJ.favs = () => load("favs", []);
  DJ.isFav = s => DJ.favs().includes(s);
  DJ.toggleFav = function (s) {
    let f = DJ.favs();
    const on = !f.includes(s);
    f = on ? [s, ...f] : f.filter(x => x !== s);
    save("favs", f.slice(0, 100));
    return on;
  };
  DJ.recent = () => load("recent", []);
  DJ.addRecent = function (c) {
    const r = DJ.recent().filter(x => x.s !== c.s);
    r.unshift({ s: c.s, gu: c.gu, g: c.g });
    save("recent", r.slice(0, 30));
  };

  // ---------- 공유 ----------
  DJ.share = async function (title, text, url) {
    url = url || location.href;
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); DJ.toast("링크를 복사했습니다", "카카오톡이나 메신저에 붙여 넣어 보내세요"); }
    catch (e) { prompt("이 링크를 복사하세요", url); }
  };

  // ---------- 검색 자동완성 ----------
  // input 옆에 결과 목록을 띄우고, 고르면 onPick(단지) 를 부릅니다.
  DJ.search = function (input, onPick) {
    const list = el("ul", "ac-list");
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.setAttribute("autocomplete", "off");
    input.parentElement.classList.add("ac-wrap");
    input.after(list);
    let items = [], active = -1;

    function render(q) {
      DJ.data().then(d => {
        q = q.trim().replace(/\s/g, "");
        list.replaceChildren();
        if (!q) { list.hidden = true; return; }
        const norm = s => s.replace(/\s/g, "");
        items = d.complexes.filter(c => norm(c.n).includes(q) || norm(c.d).includes(q) || norm(c.gu).includes(q))
          .sort((a, b) => (norm(b.n).startsWith(q) - norm(a.n).startsWith(q)) || ((b.i || 0) - (a.i || 0)))
          .slice(0, 8);
        active = -1;
        items.forEach((c, k) => {
          const li = el("li", "ac-item");
          li.setAttribute("role", "option");
          li.append(el("span", "grade g-" + c.g, c.g), el("span", "ac-name", c.n),
                    el("span", "ac-sub", c.gu + " " + c.d + (c.i != null ? " · " + c.i + "점" : "")));
          li.addEventListener("mousedown", e => { e.preventDefault(); pick(k); });
          list.append(li);
        });
        if (!items.length) list.append(el("li", "ac-empty", "찾는 단지가 없습니다. 동 이름으로도 검색해 보세요."));
        list.hidden = false;
      });
    }
    function pick(k) {
      const c = items[k];
      if (!c) return;
      list.hidden = true;
      input.value = c.n;
      onPick(c);
    }
    input.addEventListener("input", () => render(input.value));
    input.addEventListener("focus", () => input.value && render(input.value));
    input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));
    input.addEventListener("keydown", e => {
      const lis = list.querySelectorAll(".ac-item");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + lis.length) % Math.max(1, lis.length);
        lis.forEach((li, k) => li.classList.toggle("active", k === active));
      } else if (e.key === "Enter") {
        e.preventDefault();
        pick(active >= 0 ? active : 0);
      } else if (e.key === "Escape") { list.hidden = true; }
    });
  };

  // ---------- 게임 카드 ----------
  // 단지 하나를 카드로 그립니다. opts.compare: 상대 단지(항목별로 앞선 쪽 표시)
  DJ.card = function (c, stats, opts) {
    opts = opts || {};
    const card = el("article", "gcard g-" + c.g);
    card.setAttribute("data-holo", "");
    const head = el("div", "gcard-head");
    head.append(el("span", "grade big g-" + c.g, c.g));
    const t = el("div", "gcard-title");
    const a = el("a", "", c.n); a.href = DJ.href(c);
    t.append(a, el("span", "muted", c.gu + " " + c.d + (c.y ? " · " + c.y + "년" : "")));
    head.append(t, el("span", "gcard-score", c.i == null ? "-" : String(c.i)));
    card.append(head);
    const rows = el("div", "gstats");
    stats.forEach((st, k) => {
      const v = c.st[k];
      const row = el("div", "gstat");
      row.append(el("span", "gstat-name", st.n));
      const bar = el("span", "gbar");
      const fill = el("span", "");
      fill.style.width = (v == null ? 0 : Math.max(2, v)) + "%";
      bar.append(fill);
      row.append(bar, el("span", "gstat-val", v == null ? "-" : String(v)));
      const others = opts.others || (opts.compare ? [opts.compare] : null);
      if (others) {
        const ov = others.map(o => o.st[k]).filter(x => x != null);
        if (v != null && ov.every(o => v > o)) { row.classList.add("win"); row.querySelector(".gstat-name").append(el("span", "lead-mark", " ▲")); }
        else if (v == null || ov.some(o => o > v)) row.classList.add("lose");
      }
      rows.append(row);
    });
    card.append(rows);
    const foot = el("div", "gcard-foot");
    foot.append(el("span", "", c.pt ? "84㎡ " + c.pt : "가격 정보 없음"));
    if (c.dd != null && c.dd <= -5) foot.append(el("span", "", "고점 대비 " + Math.round(c.dd) + "%"));
    if (c.h) foot.append(el("span", "badge-high", "신고가"));
    card.append(foot);
    return card;
  };

  // ---------- 페이지 공통 동작 ----------
  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    document.querySelectorAll(".tabbar a").forEach(a => {
      if (a.dataset.tab === page || (page === "index" && a.dataset.tab === "map" && location.hash === "#map")) a.classList.add("on");
    });
    // 단지 페이지: 최근 본 단지 기록, 관심 단지·공유·비교 버튼
    const apt = document.querySelector("[data-apt]");
    if (apt) {
      const c = { s: apt.dataset.apt, gu: apt.dataset.gu, g: apt.dataset.grade };
      DJ.addRecent(c);
      const fav = document.querySelector("[data-fav]");
      if (fav) {
        const label = fav.querySelector("span") || fav;
        const paint = on => { fav.classList.toggle("on", on); label.textContent = on ? "관심 단지에 저장됨" : "관심 단지 저장"; };
        paint(DJ.isFav(c.s));
        fav.addEventListener("click", () => {
          const on = DJ.toggleFav(c.s);
          paint(on);
          if (on) DJ.toast("관심 단지에 저장했습니다", "아래 '관심' 메뉴에서 모아 볼 수 있습니다");
        });
      }
    }
    document.querySelectorAll("[data-share]").forEach(b => b.addEventListener("click", () =>
      DJ.share(document.title, b.dataset.share || "", b.dataset.url || location.href)));
    // 검색창: 고르면 단지 페이지로 이동
    document.querySelectorAll("[data-search-go]").forEach(inp => DJ.search(inp, c => { location.href = DJ.href(c); }));
  });

  // ---------- 모션: 화면에 들어올 때 펼치기, 숫자 올라가기 ----------
  // 모든 효과는 '움직임 줄이기' 설정이면 끄고 결과만 바로 보여줍니다.
  DJ.calm = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  DJ.onView = function (els, fn, opts) {
    const list = Array.from(els);
    if (DJ.calm || !("IntersectionObserver" in window)) { list.forEach(fn); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); }
    }), Object.assign({ threshold: 0.2 }, opts || {}));
    list.forEach(e => io.observe(e));
  };
  // "+12.3%", "12.7억", "24건" 처럼 숫자 하나가 든 글자를 0부터 그 값까지 올립니다.
  DJ.countUp = function (node, ms) {
    const text = node.textContent;
    const m = text.match(/-?[0-9][0-9,]*\.?[0-9]*/);
    if (!m || DJ.calm) return;
    const target = parseFloat(m[0].replace(/,/g, ""));
    const dec = (m[0].split(".")[1] || "").length;
    const head = text.slice(0, m.index), tail = text.slice(m.index + m[0].length);
    const dur = ms || 700, t0 = performance.now();
    const fmt = v => v.toLocaleString("ko-KR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = head + fmt(target * e) + tail;
      if (k < 1) requestAnimationFrame(step); else node.textContent = text;
    };
    requestAnimationFrame(step);
  };
  document.addEventListener("DOMContentLoaded", () => {
    DJ.onView(document.querySelectorAll("[data-reveal]"), e => e.classList.add("in"));
    DJ.onView(document.querySelectorAll("[data-count]"), e => DJ.countUp(e));
  });
})();
