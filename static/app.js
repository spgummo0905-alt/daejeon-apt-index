// 사이트 공통: 단지 데이터, 검색 자동완성, 찜/최근 본 단지, 공유, 업적 배지, 알림.
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

  // ---------- 업적 ----------
  const ACH = [
    { id: "first_view", icon: "🏠", name: "첫 임장", desc: "단지 페이지를 처음 열었어요" },
    { id: "explorer", icon: "🗺", name: "대전 일주", desc: "5개 구의 단지를 모두 둘러봤어요" },
    { id: "s_hunter", icon: "💎", name: "S등급 헌터", desc: "S등급 단지를 3곳 둘러봤어요" },
    { id: "first_battle", icon: "⚔", name: "첫 대결", desc: "단지 대결을 처음 해봤어요" },
    { id: "quiz_any", icon: "💰", name: "가격 감각", desc: "가격 맞히기를 끝까지 풀었어요" },
    { id: "quiz_master", icon: "🏆", name: "가격 감별사", desc: "가격 맞히기 5문제를 모두 맞혔어요" },
    { id: "collector", icon: "★", name: "컬렉터", desc: "단지를 5곳 찜했어요" },
    { id: "finder", icon: "🎯", name: "조건 탐색가", desc: "맞춤 찾기로 단지를 골라봤어요" },
  ];
  DJ.achievements = ACH;
  DJ.unlocked = () => load("ach", {});
  DJ.unlock = function (id) {
    const got = load("ach", {});
    if (got[id]) return;
    got[id] = new Date().toISOString().slice(0, 10);
    save("ach", got);
    const a = ACH.find(x => x.id === id);
    if (a) DJ.toast(a.icon + " 업적 달성: " + a.name, a.desc);
  };

  // ---------- 찜 / 최근 본 ----------
  DJ.favs = () => load("favs", []);
  DJ.isFav = s => DJ.favs().includes(s);
  DJ.toggleFav = function (s) {
    let f = DJ.favs();
    const on = !f.includes(s);
    f = on ? [s, ...f] : f.filter(x => x !== s);
    save("favs", f.slice(0, 100));
    if (f.length >= 5) DJ.unlock("collector");
    return on;
  };
  DJ.recent = () => load("recent", []);
  DJ.addRecent = function (c) {
    const r = DJ.recent().filter(x => x.s !== c.s);
    r.unshift({ s: c.s, gu: c.gu, g: c.g });
    save("recent", r.slice(0, 30));
    DJ.unlock("first_view");
    if (new Set(r.map(x => x.gu)).size >= 5) DJ.unlock("explorer");
    if (r.filter(x => x.g === "S").length >= 3) DJ.unlock("s_hunter");
  };

  // ---------- 공유 ----------
  DJ.share = async function (title, text, url) {
    url = url || location.href;
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); DJ.toast("링크를 복사했어요", "카톡이나 메신저에 붙여 넣어 보내세요"); }
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
        if (!items.length) list.append(el("li", "ac-empty", "찾는 단지가 없어요. 동 이름으로도 검색해 보세요."));
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
  // 단지 하나를 수집 카드처럼 그립니다. opts.compare: 상대 단지(능력치 승패 표시)
  DJ.card = function (c, stats, opts) {
    opts = opts || {};
    const card = el("article", "gcard g-" + c.g);
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
      if (opts.compare) {
        const o = opts.compare.st[k];
        if (v != null && (o == null || v > o)) row.classList.add("win");
        else if (o != null && (v == null || v < o)) row.classList.add("lose");
      }
      rows.append(row);
    });
    card.append(rows);
    const foot = el("div", "gcard-foot");
    foot.append(el("span", "", c.pt ? "84㎡ " + c.pt : "가격 정보 없음"));
    if (c.h) foot.append(el("span", "badge-high", "신고가"));
    card.append(foot);
    return card;
  };

  // ---------- 페이지 공통 동작 ----------
  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    document.querySelectorAll(".tabbar a").forEach(a => {
      if (a.dataset.tab === page) a.classList.add("on");
    });
    // 단지 페이지: 최근 본 단지 기록, 찜·공유·대결 버튼
    const apt = document.querySelector("[data-apt]");
    if (apt) {
      const c = { s: apt.dataset.apt, gu: apt.dataset.gu, g: apt.dataset.grade };
      DJ.addRecent(c);
      const fav = document.querySelector("[data-fav]");
      if (fav) {
        const paint = on => { fav.classList.toggle("on", on); fav.textContent = on ? "★ 찜함" : "☆ 찜하기"; };
        paint(DJ.isFav(c.s));
        fav.addEventListener("click", () => {
          const on = DJ.toggleFav(c.s);
          paint(on);
          if (on) DJ.toast("찜했어요", "'내 단지'에서 모아 볼 수 있어요");
        });
      }
    }
    document.querySelectorAll("[data-share]").forEach(b => b.addEventListener("click", () =>
      DJ.share(document.title, b.dataset.share || "", b.dataset.url || location.href)));
    // 검색창: 고르면 단지 페이지로 이동
    document.querySelectorAll("[data-search-go]").forEach(inp => DJ.search(inp, c => { location.href = DJ.href(c); }));
  });
})();
