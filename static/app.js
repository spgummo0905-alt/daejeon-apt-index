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
  // '서구 둔산동'. 구가 없는 지역(세종)은 구 자리에 동이 들어 있어 한 번만.
  DJ.place = c => (c.gu === c.d ? c.d : c.gu + " " + c.d);
  // 받침에 맞춘 조사: DJ.josa("래미안", "이/가") → "래미안이", DJ.josa("자이(아)", "을/를") → "자이(아)를"
  // 괄호 속 말이나 끝 기호는 건너뛰고 마지막 글자로 봅니다. 숫자·영문은 읽는 소리 기준.
  DJ.josa = function (word, pair) {
    const [withB, without] = pair.split("/");
    const w = String(word).replace(/\([^)]*\)\s*$/, "").replace(/[^0-9A-Za-z가-힣]+$/, "");
    const ch = w.slice(-1);
    let batchim = false, rieul = false;
    if (/[가-힣]/.test(ch)) {
      const k = (ch.charCodeAt(0) - 0xac00) % 28;
      batchim = k !== 0; rieul = k === 8;
    } else if (/[0-9]/.test(ch)) {
      batchim = "013678".includes(ch); rieul = "178".includes(ch); // 영 일 삼 육 칠 팔 / 일 칠 팔(ㄹ)
    } else if (/[A-Za-z]/.test(ch)) {
      batchim = /[lmnr]/i.test(ch); rieul = /[lr]/i.test(ch);
    }
    if (withB === "으로") return word + (batchim && !rieul ? "으로" : "로");
    return word + (batchim ? withB : without);
  };

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
    DJ.paintFavCount();
    return on;
  };
  // 메뉴의 '관심 단지' 옆 숫자
  DJ.paintFavCount = function () {
    const n = DJ.favs().length;
    document.querySelectorAll("[data-fav-count]").forEach(b => { b.hidden = !n; b.textContent = n > 99 ? "99+" : n; });
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
                    el("span", "ac-sub", DJ.place(c) + (c.i != null ? " · " + c.i + "점" : "")));
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
    t.append(a, el("span", "muted", DJ.place(c) + (c.y ? " · " + c.y + "년" : "") + (c.hh ? " · " + c.hh.toLocaleString() + "세대" : "")));
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
        const label = fav.querySelector("span"); // 아이콘만 있는 버튼이면 글자 대신 aria-label 로 상태를 알립니다
        const paint = on => {
          fav.classList.toggle("on", on);
          fav.setAttribute("aria-pressed", on ? "true" : "false");
          const text = on ? "관심 단지에서 빼기" : "관심 단지 저장";
          fav.setAttribute("aria-label", text); fav.title = text;
          if (label) label.textContent = on ? "관심 단지에 저장됨" : "관심 단지 저장";
        };
        paint(DJ.isFav(c.s));
        fav.addEventListener("click", () => {
          const on = DJ.toggleFav(c.s);
          paint(on);
          if (on && !DJ.calm) { fav.classList.remove("pop"); void fav.offsetWidth; fav.classList.add("pop"); }
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
  // 옆으로 넘기는 카드 줄: 화살표로 한 화면씩, 아래 막대는 지금 어디쯤인지
  function rail(wrap) {
    const track = wrap.querySelector(".rail");
    const prev = wrap.querySelector("[data-rail-prev]"), next = wrap.querySelector("[data-rail-next]");
    const bar = wrap.querySelector(".rail-dots i");
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const at = track.scrollLeft;
      prev.disabled = at <= 2;
      next.disabled = at >= max - 2;
      wrap.classList.toggle("at-start", at <= 2);
      wrap.classList.toggle("at-end", at >= max - 2);
      if (bar) {
        bar.style.width = Math.max(8, track.clientWidth / track.scrollWidth * 100) + "%";
        bar.style.transform = "translateX(" + (max ? at / max * (100 / (track.clientWidth / track.scrollWidth) - 100) : 0) + "%)";
      }
    };
    const go = dir => track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: DJ.calm ? "auto" : "smooth" });
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    window.addEventListener("resize", update);
    update();
  }
  // 긴 목록은 앞 몇 줄만 보여주고 '더 보기'로 펼치기
  function clamp(list) {
    const n = +list.dataset.clamp, items = Array.from(list.children);
    const extra = items.slice(n);
    if (!extra.length) return;
    extra.forEach(li => { li.hidden = true; });
    const btn = el("button", "more-btn", extra.length + "곳 더 보기");
    btn.type = "button";
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      extra.forEach(li => { li.hidden = !open; });
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "접기" : extra.length + "곳 더 보기";
    });
    list.after(btn);
  }
  // 단지 페이지 거래 표: 전용면적으로 거르고, 처음엔 몇 줄만 보여주다 '더 보기'
  function tradeTable(table) {
    const rows = Array.from(table.tBodies[0].rows), page = +table.dataset.page || 15;
    const more = table.closest("section").querySelector("[data-trades-more]");
    const chips = Array.from(table.closest("section").querySelectorAll(".trade-area .chip"));
    let area = "", limit = page;
    const apply = () => {
      let n = 0;
      rows.forEach(r => { const ok = !area || r.dataset.a === area; if (ok) n++; r.hidden = !ok || n > limit; });
      if (more) { more.hidden = n <= limit; more.textContent = Math.min(page * 2, n - limit) + "건 더 보기"; }
    };
    chips.forEach(b => b.addEventListener("click", () => {
      area = b.dataset.area; limit = page;
      chips.forEach(x => x.classList.toggle("active", x === b));
      apply();
    }));
    if (more) more.addEventListener("click", () => { limit += page * 2; apply(); });
    apply();
  }
  // 테마 모음: 구(동)로 거르고, 테마마다 12곳씩 보여주다 '더 보기'
  function themeLists() {
    const lists = Array.from(document.querySelectorAll("[data-theme-list]"));
    if (!lists.length) return;
    const PAGE = 12;
    let area = "";
    const state = new Map(lists.map(l => [l, PAGE]));
    const render = list => {
      const sec = list.closest("section"), items = Array.from(list.children), limit = state.get(list);
      const ok = items.filter(li => !area || li.dataset.gu === area);
      items.forEach(li => { li.hidden = true; });
      ok.forEach((li, i) => {
        li.hidden = i >= limit;
        li.querySelector(".th-rank").textContent = i + 1;
        if (!li.hidden) li.classList.add("in");  // 거른 뒤 새로 보이는 줄도 바로 보이게
      });
      const more = sec.querySelector("[data-theme-more]");
      more.hidden = ok.length <= limit;
      more.textContent = Math.min(PAGE, ok.length - limit) + "곳 더 보기";
      sec.querySelector(".th-empty").hidden = ok.length > 0;
      const counts = JSON.parse(list.dataset.counts || "{}");
      sec.querySelector("[data-th-count]").textContent =
        area ? `${area} ${counts[area] || 0}곳` : `전체 ${list.dataset.total}곳`;
    };
    lists.forEach(list => {
      list.closest("section").querySelector("[data-theme-more]").addEventListener("click", () => {
        state.set(list, state.get(list) + PAGE); render(list);
      });
      render(list);
    });
    const ctl = document.querySelector("[data-area-filter]");
    const set = v => { area = v || ""; lists.forEach(l => { state.set(l, PAGE); render(l); }); };
    if (ctl && ctl.tagName === "SELECT") ctl.addEventListener("change", () => set(ctl.value));
    else if (ctl) ctl.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
      ctl.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x === b));
      set(b.dataset.gu);
    }));
  }
  // 역세권: 지수 높은 순 ↔ 역에서 가까운 순
  function stationSort() {
    const btns = Array.from(document.querySelectorAll("[data-st-sort]"));
    btns.forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.stSort;
      btns.forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      document.querySelectorAll(".st-items").forEach(ol => {
        Array.from(ol.children).sort((a, c) => +a.dataset[k] - +c.dataset[k]).forEach(li => ol.appendChild(li));
      });
    }));
  }
  // 붙어 다니는 바로가기: 지금 보고 있는 칸을 표시하고, 휴대폰에선 그 버튼이 보이게 옆으로 밀어 줌
  function scrollSpy(nav) {
    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const pairs = links.map(a => [a, document.getElementById(a.getAttribute("href").slice(1))]).filter(p => p[1]);
    if (!pairs.length || !("IntersectionObserver" in window)) return;
    const mark = a => {
      links.forEach(x => x.classList.toggle("on", x === a));
      if (a && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - 16, behavior: DJ.calm ? "auto" : "smooth" });
    };
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) mark(pairs.find(p => p[1] === e.target)[0]);
    }), { rootMargin: "-40% 0px -55% 0px" });
    pairs.forEach(p => io.observe(p[1]));
  }
  document.addEventListener("DOMContentLoaded", () => {
    DJ.paintFavCount();
    document.querySelectorAll("nav[data-spy]").forEach(scrollSpy);
    themeLists();
    stationSort();
    document.querySelectorAll("table[data-trades]").forEach(tradeTable);
    DJ.onView(document.querySelectorAll("[data-reveal]"), e => e.classList.add("in"));
    DJ.onView(document.querySelectorAll("[data-count]"), e => DJ.countUp(e));
    document.querySelectorAll("[data-rail]").forEach(rail);
    document.querySelectorAll("[data-clamp]").forEach(clamp);
  });
})();
