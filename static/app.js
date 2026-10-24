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
    r.unshift(c);   // {s, gu, g} + 단지 페이지에서는 이름·지수·가격·지역·주소까지 (떠 있는 '최근 본' 목록용)
    save("recent", r.slice(0, 30));
  };

  // ---------- 카드첩: 열어 본 단지 카드를 모읍니다 (이 브라우저에만) ----------
  // {단지: 처음 모은 날}. 지역은 단지 코드 앞 두 자리(시도: 30 대전, 36 세종, 11 서울)로 나눠 셉니다.
  // 카드첩을 처음 여는 기기는 그동안 본 단지(최근 본·관심 단지)로 채워 둡니다.
  DJ.today = function () {
    const t = new Date();
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  };
  DJ.sido = s => String(s).slice(0, 2);
  DJ.album = function () {
    let a = load("album", null);
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      a = {};
      DJ.recent().forEach(r => { if (r && r.s) a[r.s] = DJ.today(); });
      DJ.favs().forEach(s => { if (!a[s]) a[s] = DJ.today(); });
      save("album", a);
    }
    return a;
  };
  // 새로 모은 카드면 그 지역에서 몇 장째인지, 이미 있던 카드면 0
  DJ.collect = function (s) {
    const a = DJ.album();
    if (a[s]) return 0;
    a[s] = DJ.today();
    save("album", a);
    return Object.keys(a).filter(k => DJ.sido(k) === DJ.sido(s)).length;
  };
  // 이 지역 단지 목록 중 모은 카드 수
  DJ.albumCount = function (complexes) {
    const a = DJ.album();
    return complexes.reduce((n, c) => n + (a[c.s] ? 1 : 0), 0);
  };

  // ---------- 복사·공유 ----------
  // 누른 그 순간(동기)에 숨긴 글상자로 복사합니다. 앱 안 브라우저·아이폰에서도 되는 방법이라 먼저 쓰고,
  // 안 되면 클립보드 API. 둘 다 안 되면 false
  function copyNow(text) {
    const active = document.activeElement;
    const ta = el("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
    document.body.append(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    if (window.getSelection) window.getSelection().removeAllRanges();
    if (active && active.focus) active.focus({ preventScroll: true });
    return ok;
  }
  DJ.copy = function (text) {
    if (copyNow(text)) return Promise.resolve(true);
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(false);
  };
  // 면적 단위 (㎡ / 평): <html class="u-py"> 로 고르고 기기에 기억합니다. 바꾸면 'dj:unit' 이벤트
  const PY = 3.3058;
  DJ.unit = () => document.documentElement.classList.contains("u-py") ? "py" : "m2";
  const syncUnit = () => document.querySelectorAll("[data-area-unit]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.areaUnit === DJ.unit())));
  DJ.setUnit = function (u) {
    document.documentElement.classList.toggle("u-py", u === "py");
    try { localStorage.setItem("dj-unit", u); } catch (e) { /* 저장 못 해도 이번 화면은 바뀜 */ }
    syncUnit();
    document.dispatchEvent(new CustomEvent("dj:unit", { detail: u }));
  };
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-area-unit]");
    if (b) DJ.setUnit(b.dataset.areaUnit);
  });
  syncUnit();
  // 글자로 쓰는 면적 (select 처럼 태그를 못 넣는 곳): '97㎡(전용 77)' · '29평(전용 23)', 공급면적을 모르면 '전용 77㎡'
  DJ.area = function (ex, su, dec) {
    if (ex == null) return "";
    const py = DJ.unit() === "py";
    const exs = py ? Math.round(ex / PY) : (dec ? (+ex).toFixed(dec) : Math.floor(ex));
    if (su) return py ? `${Math.round(su / PY)}평(전용 ${exs})` : `${Math.round(su)}㎡(전용 ${exs})`;
    return `전용 ${exs}${py ? "평" : "㎡"}`;
  };
  // 복사가 막힌 브라우저: 페이지 안 작은 창에 링크를 골라 둔 채로 띄움 (시스템 입력창 대신)
  DJ.copyBox = function (text) {
    const back = el("div", "copybox-back"), box = el("div", "copybox");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "링크 복사");
    const inp = el("input"); inp.readOnly = true; inp.value = text;
    const close = () => { back.remove(); box.remove(); };
    const ok = el("button", "btn primary", "닫기"); ok.type = "button"; ok.onclick = close; back.onclick = close;
    box.append(el("strong", "", "링크를 길게 눌러 복사해 주세요"), inp, ok);
    document.body.append(back, box);
    inp.focus(); inp.select(); inp.setSelectionRange(0, text.length);
  };
  DJ.copyLink = async function (url, sub) {
    if (await DJ.copy(url)) { DJ.toast("링크를 복사했어요", sub || "카카오톡이나 메신저에 붙여 넣어 보내세요"); return true; }
    DJ.copyBox(url);   // 복사가 완전히 막힌 브라우저에서만
    return false;
  };
  DJ.share = async function (title, text, url) {
    url = url || location.href;
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    await DJ.copyLink(url);
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

  // 선 아이콘 (base.html 의 symbol)
  DJ.icon = function (id) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"), use = document.createElementNS(NS, "use");
    svg.setAttribute("class", "ic"); svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#i-" + id);
    svg.append(use);
    return svg;
  };
  // 임장 메모: 현장에 가기 전 이 단지에서 확인할 것. 카드 뒷면에 세 줄까지 (역 → 시세 흐름 → 전세가율 → 학원가 → 주차 → 연식 순)
  DJ.memo = function (c) {
    const out = [], f = c.f || {};
    if (c.stn && f.subway != null) out.push(["역", `${c.stn} 직선 ${f.subway < 1000 ? Math.round(f.subway) + "m" : (f.subway / 1000).toFixed(1) + "km"}`]);
    if (c.h) out.push(["시세", `최근 신고가${c.lp ? " " + c.lp : ""}`]);
    else if (c.dd != null && c.dd <= -5) out.push(["시세", `고점 대비 ${Math.round(c.dd)}%`]);
    if (c.jr) out.push(["전세가율", c.jr + "%"]);
    if (c.hn && c.hm != null) out.push(["학원가", `${c.hn} ${c.hm}분`]);
    if (c.pk) out.push(["주차", `세대당 ${c.pk}대`]);
    const age = c.y ? new Date().getFullYear() - c.y : null;
    if (age != null && age >= 30) out.push(["연식", `${age}년 차 · 재건축 연한`]);
    return out.slice(0, 3);
  };
  // 작은 카드 (오늘의 카드·카드첩): 앞면은 등급과 지수, 이름, 위치, 84㎡ 가격 (누르면 단지 페이지).
  // 오른쪽 아래 버튼으로 뒤집으면 '임장 메모'. S·A 는 금박·백금박 카드
  DJ.miniCard = function (c) {
    const wrap = el("div", "mcw g-" + c.g);
    const a = el("a", "mcard g-" + c.g);
    a.href = DJ.href(c);
    const top = el("span", "mcard-top");
    top.append(el("span", "grade g-" + c.g, c.g), el("span", "mcard-score", c.i == null ? "-" : String(c.i)));
    const foot = el("span", "mcard-foot", c.pt ? "84㎡ " + c.pt : "가격 정보 없음");
    const facts = [c.y ? c.y + "년" : "", c.hh ? c.hh.toLocaleString() + "세대" : ""].filter(Boolean).join(" · ");
    a.append(top);
    if (facts) a.append(el("span", "mcard-facts", facts));
    a.append(el("strong", "mcard-name", c.n), el("span", "mcard-where", DJ.place(c)), foot);
    if (c.h) a.append(el("span", "mcard-high", "신고가"));
    a.setAttribute("aria-label", `${c.n}, ${DJ.place(c)}, ${c.g}등급 ${c.i == null ? "" : c.i + "점"}`);
    wrap.append(a);
    wrap.link = a;
    const lines = DJ.memo(c);
    if (!lines.length) return wrap;
    const memo = el("div", "mcard mcard-memo g-" + c.g);
    memo.hidden = true;
    memo.append(el("b", "mm-title", "임장 메모"), el("span", "mm-name", c.n));
    const dl = el("dl", "mm-list");
    lines.forEach(([k, v]) => dl.append(el("dt", "", k), el("dd", "", v)));
    const go = el("a", "mm-go", "단지 자세히 →");
    go.href = DJ.href(c);
    memo.append(dl, go);
    const turn = el("button", "mcard-turn");
    turn.type = "button";
    turn.append(DJ.icon("book"));
    const label = on => { turn.setAttribute("aria-pressed", on ? "true" : "false"); turn.setAttribute("aria-label", on ? `${c.n} 카드 앞면 보기` : `${c.n} 임장 메모 보기`); turn.title = on ? "카드 앞면" : "임장 메모"; };
    label(false);
    turn.addEventListener("click", () => {
      const toMemo = memo.hidden;
      const swap = () => { memo.hidden = !toMemo; a.hidden = toMemo; label(toMemo); };
      if (DJ.calm) { swap(); return; }
      wrap.classList.add("turning");   // 90도까지 돌아가면 면을 바꾸고 마저 돌아옴
      setTimeout(() => { swap(); wrap.classList.remove("turning"); wrap.classList.add("turned"); setTimeout(() => wrap.classList.remove("turned"), 220); }, 150);
    });
    wrap.append(memo, turn);
    return wrap;
  };

  // ---------- 임장 배지 ----------
  // 모으는 재미가 있되, 배지마다 '임장에 왜 필요한지'가 있습니다. 배지를 모으다 보면 임장 체크리스트를 한 번씩 해 보게 됩니다.
  // seen: 단지 페이지에서 본 단지 {단지: [등급, 구, 동, 신고가 1/0]}, acts: 해 본 일 {이름: 횟수}, days: 오늘의 카드를 연 날, badges: 받은 배지 {id: 날}
  DJ.seen = function () {
    let m = load("seen", null);
    if (!m || typeof m !== "object") {   // 처음: 그동안 본 단지(최근 본)로 채움
      m = {};
      DJ.recent().forEach(r => { if (r && r.s) m[r.s] = [r.g || "", r.gu || "", "", 0]; });
      save("seen", m);
    }
    return m;
  };
  DJ.note = function (s, g, gu, dong, high) {
    const m = DJ.seen();
    if (!m[s] || !m[s][2]) { m[s] = [g || "", gu || "", dong || "", high ? 1 : 0]; save("seen", m); }
  };
  DJ.act = function (name) {
    const a = load("acts", {});
    a[name] = (a[name] || 0) + 1;
    save("acts", a);
    DJ.checkBadges();
  };
  DJ.markDay = function () {
    const days = load("days", []);
    if (!days.includes(DJ.today())) { days.push(DJ.today()); save("days", days.slice(-60)); }
  };
  const seenList = st => Object.entries(st.seen);
  const most = arr => { const m = {}; arr.forEach(k => { m[k] = (m[k] || 0) + 1; }); return Math.max(0, ...Object.values(m)); };
  DJ.BADGES = [
    { id: "first", group: "둘러보기", icon: "home", name: "첫 단지", goal: 1, n: st => seenList(st).length,
      how: "단지 페이지를 하나 열어 봐요.", why: "한 곳을 숫자와 지도로 제대로 보고 나면, 현장에서 무엇을 확인할지가 정해져요.",
      tip: "현장에서 볼 것이 정해져요", go: ["랭킹에서 고르기", "rank.html"] },
    { id: "dong", group: "둘러보기", icon: "map", name: "동네 한 바퀴", goal: 3,
      n: st => most(seenList(st).filter(([, v]) => v[2]).map(([s, v]) => DJ.sido(s) + v[1] + v[2])),
      how: "같은 동의 단지 세 곳을 열어 봐요.", why: "임장은 한 단지가 아니라 동네 안에서 견줘 보는 일이에요. 옆 단지와 값 차이가 보여야 적정가가 보여요.",
      tip: "옆 단지와 견줘야 적정가가 보여요", go: ["지도에서 고르기", "index.html#map"] },
    { id: "ten", group: "둘러보기", icon: "walk", name: "발품 10곳", goal: 10, n: st => seenList(st).length,
      how: "단지 열 곳을 열어 봐요.", why: "많이 볼수록 '이 동네에서 이 값이면 싸다·비싸다'를 가늠하는 눈이 생겨요.",
      tip: "많이 볼수록 시세 감이 생겨요", go: ["랭킹에서 고르기", "rank.html"] },
    { id: "gus", group: "둘러보기", icon: "pin", name: "세 동네 시세", goal: 3,
      n: st => new Set(seenList(st).filter(([, v]) => v[1]).map(([s, v]) => DJ.sido(s) + v[1])).size,
      how: "서로 다른 구(세종은 동) 세 곳의 단지를 열어 봐요.", why: "다른 지역 시세를 알아야 내 후보 지역이 어디쯤인지, 같은 돈으로 어디까지 갈 수 있는지 보여요.",
      tip: "내 후보 지역의 위치가 보여요", go: ["지역별 요약 보기", "index.html#world"] },
    { id: "top", group: "둘러보기", icon: "rank", name: "상급지 기준", goal: 3, n: st => seenList(st).filter(([, v]) => v[0] === "S").length,
      how: "S등급 단지 세 곳을 열어 봐요.", why: "지역 최상위 단지를 알아야 다른 단지가 그보다 무엇이 모자라고 얼마나 싼지 가늠할 기준이 생겨요.",
      tip: "다른 단지를 잴 기준이 생겨요", go: ["랭킹 보기", "rank.html"] },
    { id: "trade", group: "따져보기", icon: "receipt", name: "실거래 확인", goal: 1, n: st => st.acts.trade || 0,
      how: "단지 페이지에서 실거래 표나 가격 그래프의 기간·보기 방식을 바꿔 봐요.", why: "호가가 아니라 실제로 계약된 값이 판단의 출발점이에요. 언제, 몇 층이, 얼마에 팔렸는지가 협상 근거가 돼요.",
      tip: "실제 계약된 값이 협상 근거예요" },
    { id: "jeonse", group: "따져보기", icon: "coin", name: "전세가율 체크", goal: 1, n: st => st.acts.jeonse || 0,
      how: "실거래 표의 전세 탭이나 그래프의 '전세·갭'을 열어 봐요.", why: "전세가율은 매매가를 받쳐 주는 힘이에요. 너무 낮으면 하락에 약하고, 높으면 필요한 자기 돈(갭)이 작아요.",
      tip: "매매가를 받쳐 주는 힘을 봐요" },
    { id: "loc", group: "따져보기", icon: "train", name: "입지 동선", goal: 1, n: st => st.acts.loc || 0,
      how: "단지 페이지의 '입지는 어떤가' 지도를 마지막 단계까지 넘겨 봐요.", why: "역까지 걸어 보고, 학교 가는 길과 마트·병원을 확인하는 게 현장 임장의 기본 동선이에요. 지도로 먼저 동선을 짜 두면 하루에 더 많이 봐요.",
      tip: "현장 동선을 미리 짤 수 있어요" },
    { id: "cmp", group: "따져보기", icon: "compare", name: "나란히 비교", goal: 1, n: st => st.acts.cmp || 0,
      how: "단지 비교에서 두 곳 이상을 견줘 봐요.", why: "후보를 나란히 놓아야 값 차이의 이유(연식·입지·세대수)가 보여요.",
      tip: "값 차이의 이유가 보여요", go: ["단지 비교", "compare.html"] },
    { id: "hot", group: "따져보기", icon: "fire", name: "시장 흐름", goal: 3, n: st => seenList(st).filter(([, v]) => v[3]).length,
      how: "최근 신고가가 난 단지 세 곳을 열어 봐요.", why: "신고가가 나오는 곳은 지금 수요가 몰리는 곳이에요. 현장 분위기와 매물 상황을 먼저 확인할 곳이에요.",
      tip: "수요가 몰리는 곳을 먼저 봐요", go: ["동네 온도 보기", "index.html#heat"] },
    { id: "find", group: "정리하기", icon: "filter", name: "내 조건 정리", goal: 1, n: st => st.acts.find || 0,
      how: "조건으로 찾기에서 예산이나 생활 조건을 골라 봐요.", why: "예산과 출퇴근·학군 조건을 먼저 정해야 임장 갈 지역이 좁혀져요.",
      tip: "임장 갈 지역이 좁혀져요", go: ["조건으로 찾기", "finder.html"] },
    { id: "fav", group: "정리하기", icon: "star", name: "임장 후보 3곳", goal: 3, n: st => st.favs.length,
      how: "관심 단지를 세 곳 저장해 봐요.", why: "후보를 추려 두면 가까운 단지끼리 묶어 하루 동선으로 돌 수 있어요.",
      tip: "하루 동선으로 묶어 돌 수 있어요" },
    { id: "days", group: "정리하기", icon: "calendar", name: "꾸준한 시세 확인", goal: 5, n: st => st.days.length,
      how: "서로 다른 날 다섯 번, 카드첩의 오늘의 임장 후보를 열어 봐요.", why: "시세는 한 번이 아니라 꾸준히 봐야 흐름이 보여요. 자주 볼수록 급매도 알아봐요.",
      tip: "꾸준히 봐야 흐름이 보여요", go: ["오늘의 임장 후보", "cards.html#today"] },
    { id: "dongall", group: "정리하기", icon: "flag", name: "동네 완주", goal: 1,
      n: st => {   // 세 곳 이상인 동의 단지 카드를 모두 모음 (단지 자료가 있을 때만 셈)
        if (!st.data) return null;
        const g = {};
        st.data.complexes.forEach(c => { const k = c.gu + "|" + c.d; (g[k] || (g[k] = [])).push(c.s); });
        return Object.values(g).filter(v => v.length >= 3 && v.every(s => st.album[s])).length;
      },
      how: "단지가 세 곳 이상인 동 하나의 카드를 모두 모아 봐요.", why: "한 동네를 빠짐없이 보면 그 동네 시세표가 머릿속에 그려지고, 매물이 나왔을 때 바로 싼지 비싼지 알아봐요.",
      tip: "동네 시세표가 머릿속에 그려져요", go: ["카드첩 보기", "cards.html#album"] },
  ];
  DJ.badgeState = data => ({ seen: DJ.seen(), favs: DJ.favs(), acts: load("acts", {}), days: load("days", []), album: DJ.album(), data });
  DJ.earned = () => load("badges", {});
  // 새로 받은 배지가 있으면 저장하고 알림. 여러 개면 한 번에 묶어서
  DJ.checkBadges = function (data) {
    const st = DJ.badgeState(data), got = DJ.earned(), fresh = [];
    DJ.BADGES.forEach(b => {
      if (got[b.id]) return;
      const n = b.n(st);
      if (n != null && n >= b.goal) { got[b.id] = DJ.today(); fresh.push(b); }
    });
    if (!fresh.length) return fresh;
    save("badges", got);
    if (fresh.length === 1) DJ.toast(`‘${fresh[0].name}’ 배지를 받았어요`, fresh[0].tip + " · 카드첩에서 볼 수 있어요");
    else DJ.toast(`임장 배지 ${fresh.length}개를 받았어요`, fresh.map(b => b.name).join(", "));
    document.dispatchEvent(new Event("dj:badges"));
    return fresh;
  };

  // 카드첩 알림은 이만큼 모였을 때만 (단지를 열 때마다 뜨면 번거로워서)
  const ALBUM_MARKS = [1, 10, 30, 50, 100, 200, 300, 500, 1000, 2000];

  // ---------- 페이지 공통 동작 ----------
  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    document.querySelectorAll(".tabbar a").forEach(a => {
      if (a.dataset.tab === page || (page === "cards" && a.dataset.tab === "my") ||
          (page === "index" && a.dataset.tab === "map" && location.hash === "#map")) a.classList.add("on");
    });
    // 단지 페이지: 최근 본 단지 기록, 관심 단지·공유·비교 버튼
    const apt = document.querySelector("[data-apt]");
    if (apt) {
      const c = { s: apt.dataset.apt, gu: apt.dataset.gu, g: apt.dataset.grade, n: apt.dataset.name, i: apt.dataset.score,
        p: apt.dataset.price, r: apt.dataset.region, u: location.pathname };
      // 카드첩에 모으기 (최근 본 목록에 넣기 전에: 처음 쓰는 기기에서 이 단지가 '첫 카드'로 세어지게)
      const got = DJ.collect(c.s);
      DJ.addRecent(c);
      DJ.note(c.s, c.g, c.gu, apt.dataset.dong, apt.dataset.high === "1");
      // 배지 알림이 뜨면 카드 알림은 생략 (두 개가 한꺼번에 뜨지 않게)
      if (!DJ.checkBadges().length && got && ALBUM_MARKS.includes(got))
        DJ.toast(got === 1 ? "첫 카드를 카드첩에 모았어요" : `카드첩에 ${got}번째 카드를 모았어요`, "메뉴의 ‘카드첩’(휴대폰은 관심 탭 위)에서 모아 볼 수 있어요");
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
          if (on) { DJ.toast("관심 단지에 저장했습니다", "아래 '관심' 메뉴에서 모아 볼 수 있습니다"); DJ.checkBadges(); }
        });
      }
    }
    // 임장 배지: 실거래 표·가격 그래프를 넘겨 보면 '실거래 확인', 전세 쪽을 열면 '전세가율 체크'
    document.addEventListener("click", e => {
      const t = e.target.closest && e.target.closest("[data-pc-mode], [data-pc-years], [data-trade-kind]");
      if (!t) return;
      DJ.act("trade");
      if (t.dataset.pcMode === "gap" || t.dataset.tradeKind === "j") DJ.act("jeonse");
    });
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
  // 단지 페이지 거래 표: 매매·전세·월세를 고르고 면적으로 거르며, 처음엔 몇 줄만 보여주다 '더 보기'
  function tradeTable(table) {
    const sec = table.closest("section"), page = +table.dataset.page || 15;
    const more = sec.querySelector("[data-trades-more]");
    const chips = Array.from(sec.querySelectorAll(".trade-area .chip"));
    const kinds = Array.from(sec.querySelectorAll("[data-trade-kind]"));
    const head = table.querySelector("[data-price-h]");
    const KIND = { s: [0, "거래가"], j: [1, "보증금"], w: [2, "보증금/월세"] };
    let area = "", limit = page, kind = "s";
    const apply = () => {
      let n = 0;
      Array.from(table.tBodies).forEach(tb => {
        tb.hidden = tb.dataset.k !== kind;
        if (tb.hidden) return;
        Array.from(tb.rows).forEach(r => { const ok = !area || r.dataset.a === area; if (ok) n++; r.hidden = !ok || n > limit; });
      });
      if (more) { more.hidden = n <= limit; more.textContent = Math.min(page * 2, n - limit) + "건 더 보기"; }
    };
    const setKind = k => {
      kind = k; limit = page;
      kinds.forEach(b => { b.classList.toggle("active", b.dataset.tradeKind === k); b.setAttribute("aria-pressed", b.dataset.tradeKind === k ? "true" : "false"); });
      if (head) head.textContent = KIND[k][1];
      const note = sec.querySelector("[data-rent-note]");
      if (note) note.hidden = k === "s";
      // 면적 칩: 고른 종류의 건수로 바꾸고, 그 종류에 없는 면적은 숨김 (고른 면적이 없으면 전체로)
      chips.forEach(b => {
        const cnt = +(b.dataset.n || "").split(",")[KIND[k][0]] || 0;
        b.querySelector(".cnt").textContent = cnt;
        b.hidden = !!b.dataset.area && !cnt;
        if (b.hidden && b.dataset.area === area) area = "";
      });
      chips.forEach(b => b.classList.toggle("active", b.dataset.area === area));
      apply();
    };
    kinds.forEach(b => b.addEventListener("click", () => setKind(b.dataset.tradeKind)));
    chips.forEach(b => b.addEventListener("click", () => {
      area = b.dataset.area; limit = page;
      chips.forEach(x => x.classList.toggle("active", x === b));
      apply();
    }));
    if (more) more.addEventListener("click", () => { limit += page * 2; apply(); });
    // '평형별 시세'의 '전세·월세 계약 보기': 그 탭을 열고 내려감
    document.querySelectorAll("[data-trade-jump]").forEach(a => a.addEventListener("click", () => {
      if (kinds.some(b => b.dataset.tradeKind === a.dataset.tradeJump)) setKind(a.dataset.tradeJump);
    }));
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
  // 지역 고르기: 위쪽 지역 버튼(또는 첫 화면 제목의 지역 이름)을 누르면 권역별 지역 카드가 열립니다.
  // 휴대폰은 아래에서 올라오는 시트, 넓은 화면은 버튼 아래 작은 창. 지역이 많으면 검색칸으로 거릅니다.
  function regionPicker() {
    const pop = document.getElementById("rg-pop");
    if (!pop) return;
    const openers = document.querySelectorAll("[data-rg-open]");
    const head = document.querySelector(".rg-btn");
    const narrow = matchMedia("(max-width: 719px)");
    let back = null, from = null;
    const open = btn => {
      from = btn;
      pop.hidden = false;
      openers.forEach(b => b.setAttribute("aria-expanded", "true"));
      // 첫 화면 제목에서 열면 넓은 화면에서도 가운데 시트처럼 (위쪽 버튼에 붙이면 멀리 떨어져 보여서)
      pop.classList.toggle("float", btn !== head && !narrow.matches);
      if (narrow.matches || btn !== head) {
        back = el("div", "sheet-back");
        back.addEventListener("click", close);
        document.body.append(back);
      }
      requestAnimationFrame(() => { pop.classList.add("on"); if (back) back.classList.add("on"); });
      (pop.querySelector("[data-rg-q]") || pop.querySelector(".rg-item.on") || pop.querySelector(".rg-item")).focus({ preventScroll: true });
    };
    function close() {
      if (pop.hidden) return;
      pop.classList.remove("on");
      openers.forEach(b => b.setAttribute("aria-expanded", "false"));
      if (back) { back.remove(); back = null; }
      setTimeout(() => { if (!pop.classList.contains("on")) pop.hidden = true; }, 220);
      if (from) from.focus({ preventScroll: true });
    }
    openers.forEach(b => b.addEventListener("click", e => { e.stopPropagation(); pop.hidden || !pop.classList.contains("on") ? open(b) : close(); }));
    document.addEventListener("click", e => { if (!pop.hidden && !pop.contains(e.target)) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    const q = pop.querySelector("[data-rg-q]");
    if (q) q.addEventListener("input", () => {
      const v = q.value.trim();
      pop.querySelectorAll(".rg-item").forEach(a => { a.hidden = !!v && !a.dataset.rgName.includes(v); });
      pop.querySelectorAll("[data-rg-grp]").forEach(g => {
        g.hidden = ![...g.nextElementSibling.children].some(a => !a.hidden);
        g.nextElementSibling.hidden = g.hidden;
      });
    });
  }
  // 최근 본 단지: 오른쪽 아래 작은 버튼 → 누르면 목록(휴대폰은 아래 시트). 다른 지역에서 본 단지도 함께.
  // 내려 읽을 때는 비켜 주고, 올리거나 멈추면 다시 나타납니다. 인트로·지금 보는 단지만 있으면 숨김.
  function recentDock() {
    const dock = document.querySelector("[data-rcd]");
    if (!dock || document.body.dataset.page === "intro") return;
    const pop = document.getElementById("rcd-pop"), btn = dock.querySelector("[data-rcd-open]");
    const base = new URL(ROOT || "./", location.href).pathname;
    const narrow = matchMedia("(max-width: 720px)");
    let back = null;
    const items = () => DJ.recent().filter(r => r.n && r.u && r.u !== location.pathname).slice(0, 8);
    function paint() {
      const list = items();
      dock.hidden = !list.length;
      dock.querySelector("[data-rcd-n]").textContent = list.length;
      btn.setAttribute("aria-label", "최근 본 단지 " + list.length + "곳");
      const box = dock.querySelector("[data-rcd-list]");
      box.replaceChildren(...list.map(r => {
        const a = el("a", "rcd-item"); a.href = r.u;
        a.append(el("span", "grade g-" + (r.g || "-"), r.g || "-"));
        const t = el("span", "rcd-t"); t.append(el("b", "", r.n), el("small", "", [r.r, r.i && r.i !== "-" ? "지수 " + r.i : ""].filter(Boolean).join(" · ")));
        a.append(t, el("span", "rcd-p", r.p || ""));
        const li = el("li"); li.append(a); return li;
      }));
      // 같은 지역 단지가 둘 이상이면 (지금 보는 단지 포함) 바로 비교
      const here = document.querySelector("[data-apt]");
      const same = [...(here ? [here.dataset.apt] : []), ...list.filter(r => r.u === base + "apt/" + r.s + ".html").map(r => r.s)];
      const cmp = dock.querySelector("[data-rcd-cmp]");
      cmp.hidden = same.length < 2;
      cmp.href = ROOT + "compare.html?s=" + same.slice(0, 4).map(encodeURIComponent).join(",");
    }
    const open = () => {
      paint();
      pop.hidden = false;
      dock.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      if (narrow.matches) { back = el("div", "sheet-back"); back.addEventListener("click", close); document.body.append(back); }
      requestAnimationFrame(() => { pop.classList.add("on"); if (back) back.classList.add("on"); });
      const first = pop.querySelector(".rcd-item"); if (first) first.focus({ preventScroll: true });
    };
    function close() {
      if (pop.hidden) return;
      pop.classList.remove("on");
      btn.setAttribute("aria-expanded", "false");
      if (back) { back.remove(); back = null; }
      setTimeout(() => { if (!pop.classList.contains("on")) { pop.hidden = true; dock.classList.remove("open"); } }, 220);
    }
    btn.addEventListener("click", e => { e.stopPropagation(); pop.classList.contains("on") ? close() : open(); });
    document.addEventListener("click", e => { if (!pop.hidden && !dock.contains(e.target)) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { close(); btn.focus(); } });
    dock.querySelector("[data-rcd-clear]").addEventListener("click", () => { save("recent", []); close(); paint(); });
    let lastY = scrollY;
    addEventListener("scroll", () => {
      const y = scrollY;
      if (pop.hidden) dock.classList.toggle("tuck", y > lastY + 4 && y > 240);
      if (Math.abs(y - lastY) > 4) lastY = y;
    }, { passive: true });
    addEventListener("storage", e => { if (e.key === "djdex:recent") paint(); });   // 다른 탭에서 본 단지도 바로
    addEventListener("dj:recent", paint);
    // 메인의 '최근 본 단지' 줄이 화면에 보이는 동안은 같은 내용이니 비켜 둡니다
    const strip = document.getElementById("recent-strip");
    if (strip && "IntersectionObserver" in window)
      new IntersectionObserver(es => es.forEach(e => dock.classList.toggle("shy", e.isIntersecting && !strip.hidden))).observe(strip);
    paint();
  }
  // 인트로 '요즘 뜨거운 동네': 온도 상위 동네를 몇 초마다 넘깁니다. 동 이름은 위로 굴러 바뀌고 숫자는 새 값까지 굴러갑니다.
  // 화면에 보일 때만 넘기고, 마우스·초점이 올라가 있으면 잠깐 멈춤. 순위를 누르거나 '멈춤'을 누르면 자동 넘김을 끕니다.
  // 움직임 줄이기 설정이면 처음부터 자동 넘김 없이 (버튼으로 켤 수 있음).
  function hotRoll(sec) {
    let data;
    try { data = JSON.parse(sec.querySelector("[data-hot-json]").textContent); } catch (e) { return; }
    if (!data || !data.length) return;
    const $ = k => sec.querySelector("[data-hot-" + k + "]");
    const btns = [...sec.querySelectorAll("[data-hot-i]")], auto = $("auto"), roll = $("name").parentElement;
    const DWELL = 4200;
    let i = 0, timer = null, seen = false, hover = false, paused = DJ.calm;
    const pct = v => v == null ? "-" : (v > 0.05 ? "+" : "") + v.toFixed(1) + "%";
    const won = v => Math.round(v).toLocaleString("ko-KR");
    // 숫자 굴리기: 지금 값에서 새 값까지 (도중에 또 바뀌면 새 값으로 이어서)
    function tween(node, to, fmt) {
      const from = node._v == null ? to : node._v;
      node._v = to;
      if (to == null || DJ.calm || from === to) { node.textContent = fmt(to); return; }
      const t0 = performance.now(), dur = 650;
      const step = now => {
        if (node._v !== to) return;
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        node.textContent = fmt(k < 1 ? from + (to - from) * e : to);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    function swapName(t) {
      const put = () => { $("name").textContent = t.d; $("j").textContent = t.j; };
      if (DJ.calm) { put(); return; }
      roll.classList.add("out");
      setTimeout(() => {
        put();
        roll.classList.remove("out"); roll.classList.add("in");
        requestAnimationFrame(() => requestAnimationFrame(() => roll.classList.remove("in")));
      }, 200);
    }
    const running = () => !paused && !hover && seen && data.length > 1;
    function arm() {
      clearTimeout(timer);
      sec.classList.remove("run"); void sec.offsetWidth;   // 진행 막대를 처음부터
      if (running()) { sec.classList.add("run"); timer = setTimeout(() => show((i + 1) % data.length), DWELL); }
    }
    function paintAuto() {
      if (!auto) return;
      auto.textContent = paused ? "▶ 자동으로 넘기기" : "❚❚ 멈춤";
      auto.setAttribute("aria-pressed", paused ? "false" : "true");
    }
    function show(k) {
      i = k;
      const t = data[k];
      btns.forEach((b, n) => b.setAttribute("aria-pressed", n === k ? "true" : "false"));
      swapName(t);
      $("rank").textContent = "온도 " + (k + 1) + "위";
      $("gu").textContent = t.gu || "";
      tween($("t"), t.t, v => Math.round(v));
      $("bar").style.width = t.t + "%";
      const c = $("c");
      tween(c, t.c, pct);
      c.classList.toggle("pos", t.c > 0); c.classList.toggle("neg", t.c < 0);
      tween($("h"), t.h, v => won(v) + "곳");
      tween($("n3"), t.n3, v => won(v) + "건");
      $("v").textContent = t.v ? "평소의 " + t.v : "최근 3개월";
      const best = $("best");
      best.hidden = !t.b;
      if (t.b) {
        best.href = ROOT + "apt/" + t.b.s + ".html";
        const g = $("bg"); g.className = "grade g-" + t.b.g; g.textContent = t.b.g;
        $("bn").textContent = t.b.n;
        tween($("bi"), t.b.i, v => Math.round(v) + "점");
      }
      arm();
    }
    // 처음 값 기억 (첫 동네는 서버에서 그려 둠)
    const t0 = data[0];
    $("t")._v = t0.t; $("c")._v = t0.c; $("h")._v = t0.h; $("n3")._v = t0.n3;
    if (t0.b) $("bi")._v = t0.b.i;
    if ((t0.c || 0) > 0) $("c").classList.add("pos"); else if ((t0.c || 0) < 0) $("c").classList.add("neg");
    btns.forEach((b, n) => b.addEventListener("click", () => { paused = true; paintAuto(); show(n); }));
    if (auto && data.length > 1) {
      auto.hidden = false; paintAuto();
      auto.addEventListener("click", () => { paused = !paused; paintAuto(); if (!paused) show((i + 1) % data.length); else arm(); });
    }
    const grid = sec.querySelector(".it-live-grid");
    const hold = on => { hover = on; sec.classList.toggle("hold", on); if (!on) arm(); else clearTimeout(timer); };
    grid.addEventListener("mouseenter", () => hold(true));
    grid.addEventListener("mouseleave", () => hold(false));
    grid.addEventListener("focusin", () => hold(true));
    grid.addEventListener("focusout", e => { if (!grid.contains(e.relatedTarget)) hold(false); });
    if ("IntersectionObserver" in window)
      new IntersectionObserver(es => es.forEach(e => { seen = e.isIntersecting; arm(); }), { threshold: 0.35 }).observe(sec);
  }
  document.addEventListener("DOMContentLoaded", () => {
    regionPicker();
    recentDock();
    document.querySelectorAll("[data-hot]").forEach(hotRoll);
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
