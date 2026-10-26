// 임장 코스: 관심 단지(와 더한 단지)를 가장 짧은 순서로 묶어 하루 동선을 짭니다.
// 구간마다 거리·걸리는 시간과 카카오맵 길찾기, 단지마다 현장 체크리스트와 메모 (모두 이 기기의 브라우저에만).
(function () {
  const sec = document.getElementById("course");
  if (!sec) return;
  const { el } = DJ;
  const MAX = 8;          // 한 코스에 넣는 단지 수 (8곳까지는 모든 순서를 다 견줘 가장 짧은 길을 고름)
  const VISIT = 30;       // 단지 하나 둘러보는 데 드는 분
  const SPEED = { walk: { kmh: 4.5, detour: 1.3, label: "걸어서" }, car: { kmh: 25, detour: 1.4, label: "차로" } };
  // 현장 체크리스트: 지도·숫자로는 알 수 없고 가 봐야 아는 것
  let D = null;
  let state = Object.assign({ mode: "walk", list: null }, DJ.load("course", {}));
  // 받은 코스 (my.html?course=a,b,c&m=walk): 내 코스를 덮지 않고 보여 주다가 '내 코스로 저장'을 누르면 저장
  const q = new URLSearchParams(location.search);
  let got = q.get("course") ? { list: q.get("course").split(",").slice(0, MAX), mode: q.get("m") === "car" ? "car" : "walk" } : null;
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");

  DJ.data().then(d => {
    D = d;
    // 직접 고치기 전까지는 관심 단지를 따라감 (관심 화면을 먼저 열어 빈 코스가 저장돼도, 나중에 저장한 관심 단지가 들어오게)
    if (!Array.isArray(state.list) || !state.list.length || state.auto) { state.list = DJ.favs().slice(0, MAX); state.auto = true; }
    state.list = state.list.filter(s => d.bySlug[s] && d.bySlug[s].la != null);
    if (got) {
      got.list = got.list.filter(s => d.bySlug[s] && d.bySlug[s].la != null);
      if (got.list.length < 2) { DJ.toast("받은 코스를 열 수 없어요", "다른 지역의 코스이거나 링크가 잘렸어요. 보낸 분께 다시 받아 주세요.", 7000); clearGot(); }
    }
    DJ.search(sec.querySelector("[data-cs-add]"), c => {
      const inp = sec.querySelector("[data-cs-add]");
      inp.value = "";
      if (c.la == null) { DJ.toast("위치 정보가 없는 단지예요", "지도에 위치가 없는 단지는 코스에 넣을 수 없어요"); return; }
      const st = cur();
      if (st.list.includes(c.s)) return;
      if (st.list.length >= MAX) { DJ.toast(`코스에는 ${MAX}곳까지 넣을 수 있어요`, "하루에 둘러보기 알맞은 수예요"); return; }
      st.list.push(c.s);
      st.auto = false;
      draw();
    });
    draw();
    if (got) requestAnimationFrame(() => sec.scrollIntoView({ block: "start" }));
  });
  const cur = () => got || state;   // 지금 보여 주는 코스
  function clearGot() {
    got = null;
    q.delete("course"); q.delete("m");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  }
  sec.querySelectorAll("[data-cs-mode]").forEach(b => b.addEventListener("click", () => { cur().mode = b.dataset.csMode; draw(); }));
  // 내 설정에서 이동 방법을 바꾸면 코스에도 (prefs.js)
  document.addEventListener("dj:mode", e => { state.mode = e.detail; if (D) draw(); });
  // 인쇄·PDF: 화면 그대로가 아니라 들고 나갈 종이로 (요약·지도, 단지마다 체크리스트와 손으로 적을 메모 칸)
  sec.querySelector("[data-cs-print]").addEventListener("click", () => { if (D && cur().list.length >= 2) DJ.printSheet(sheet()); });
  // 공유: 받는 사람이 같은 코스(순서·지도·길찾기)를 그대로 여는 링크와, 단지 순서를 글로
  sec.querySelector("[data-cs-share]").addEventListener("click", () => {
    if (!D || cur().list.length < 2) return;
    const { stops, legs, move } = plan();
    const url = `${base}my.html?course=${stops.map(c => encodeURIComponent(c.s)).join(",")}&m=${cur().mode}#course`;
    const text = `임장 코스 ${stops.length}곳 · ${SPEED[cur().mode].label} 약 ${hm(move)}\n` +
      stops.map((c, k) => `${k + 1}. ${c.n} (${DJ.place(c)})${k < legs.length ? ` → ${dist(legs[k])}` : ""}`).join("\n");
    if (navigator.share && !DJ.inApp()) {
      navigator.share({ title: "임장 코스", text, url }).catch(e => { if (!e || e.name !== "AbortError") copyCourse(text, url); });
      return;
    }
    copyCourse(text, url);
  });
  function copyCourse(text, url) {
    DJ.copy(text + "\n\n코스 지도·길찾기: " + url).then(ok => {
      if (ok) DJ.toast("코스를 복사했어요", "카카오톡에 붙여 넣으면 단지 순서와 코스 링크가 함께 가요");
      else DJ.copyBox(url);
    });
  }

  const km = (a, b) => {   // 두 단지 사이 직선거리 (km)
    const R = 6371, r = Math.PI / 180;
    const dLa = (b.la - a.la) * r, dLn = (b.ln - a.ln) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dLn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const mins = d => Math.max(1, Math.round(d * SPEED[cur().mode].detour / SPEED[cur().mode].kmh * 60));
  const hm = m => m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}`;
  const dist = d => d < 1 ? Math.round(d * 1000 / 10) * 10 + "m" : d.toFixed(1) + "km";

  // 가장 짧은 방문 순서 (시작·끝 자유): 8곳까지라 모든 순서를 다 견줍니다
  function order() {
    const pts = cur().list.map(s => D.bySlug[s]);
    const n = pts.length;
    if (n <= 2) return pts.map((_, i) => i);
    const M = pts.map(a => pts.map(b => km(a, b)));
    let best = null, bestLen = Infinity;
    const used = new Array(n).fill(false), path = [];
    (function walk(len) {
      if (len >= bestLen) return;
      if (path.length === n) { bestLen = len; best = path.slice(); return; }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        // 거꾸로 된 같은 길은 한 번만 (첫 단지 번호가 마지막보다 작을 때만)
        if (path.length === n - 1 && path[0] > i) continue;
        used[i] = true; path.push(i);
        walk(len + (path.length > 1 ? M[path[path.length - 2]][i] : 0));
        path.pop(); used[i] = false;
      }
    })(0);
    return best;
  }

  // 순서대로 단지·구간 거리·합계
  function plan() {
    const stops = order().map(i => D.bySlug[cur().list[i]]);
    const legs = stops.slice(1).map((c, k) => km(stops[k], c));
    return { stops, legs, total: legs.reduce((a, b) => a + b, 0), move: legs.reduce((a, d) => a + mins(d), 0) };
  }
  function banner() {
    let bar = sec.querySelector(".cs-got");
    if (!got) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = el("div", "cs-got");
      const keep = el("button", "btn primary sm", "내 코스로 저장"), mine = el("button", "btn ghost sm", "내 코스 보기");
      keep.type = mine.type = "button";
      keep.addEventListener("click", () => {
        state = Object.assign(state, { list: got.list.slice(), mode: got.mode, auto: false });
        clearGot(); draw();
        DJ.toast("내 코스로 저장했어요", "체크리스트와 메모도 단지마다 남길 수 있어요");
      });
      mine.addEventListener("click", () => { clearGot(); draw(); });
      const acts = el("div", "cs-got-acts");
      acts.append(keep, mine);
      bar.append(el("p", "", "받은 임장 코스예요. 저장하기 전엔 내 코스는 그대로예요."), acts);
      sec.querySelector(".panel-head").after(bar);
    }
  }

  function draw() {
    if (!got) DJ.save("course", state);   // 받은 코스는 저장하기 전까지 내 코스에 쓰지 않음
    banner();
    const st = cur();
    sec.querySelectorAll("[data-cs-mode]").forEach(b => { const on = b.dataset.csMode === st.mode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); });
    const body = sec.querySelector("[data-cs-body]"), empty = sec.querySelector("[data-cs-empty]");
    const enough = st.list.length >= 2;
    body.hidden = !enough;
    empty.hidden = enough;
    if (!enough) return;
    const { stops, legs, total, move } = plan();
    const sum = sec.querySelector("[data-cs-sum]");
    sum.replaceChildren();
    [["단지", stops.length + "곳"], ["총 거리", dist(total)], [SPEED[st.mode].label, "약 " + hm(move)], ["둘러보기 포함", "약 " + hm(move + VISIT * stops.length)]]
      .forEach(([k, v]) => { const d = el("div", "cs-kv"); d.append(el("span", "", k), el("b", "", v)); sum.append(d); });
    map(stops);
    const list = sec.querySelector("[data-cs-list]");
    list.replaceChildren();
    stops.forEach((c, k) => {
      const li = el("li", "cs-stop");
      const head = el("div", "cs-head");
      const no = el("span", "cs-no", String(k + 1));
      const t = el("div", "cs-t");
      const a = el("a", "", c.n); a.href = DJ.href(c);
      t.append(a, el("span", "muted", [DJ.place(c), c.pt ? "84㎡ " + c.pt : "", c.g && c.g !== "-" ? c.g + "등급" : ""].filter(Boolean).join(" · ")));
      const del = el("button", "cs-del", "×");
      del.type = "button";
      del.setAttribute("aria-label", c.n + " 코스에서 빼기");
      del.addEventListener("click", () => { const st = cur(); st.list = st.list.filter(s => s !== c.s); st.auto = false; draw(); });
      head.append(no, t, del);
      li.append(head, checklist(c));
      if (k === 0) li.append(link("이 단지까지 길찾기", `https://map.kakao.com/link/to/${encodeURIComponent(c.n)},${c.la},${c.ln}`, "cs-first"));
      if (k < stops.length - 1) {
        const nx = stops[k + 1], d = legs[k];
        li.append(link(`다음 단지까지 ${dist(d)} · ${SPEED[st.mode].label} 약 ${hm(mins(d))} · 카카오맵 길찾기`,
          `https://map.kakao.com/link/from/${encodeURIComponent(c.n)},${c.la},${c.ln}/to/${encodeURIComponent(nx.n)},${nx.la},${nx.ln}`, "cs-leg"));
      }
      list.append(li);
    });
  }
  // 인쇄할 종이: 맨 위에 요약·지도·순서, 그 아래 단지마다 체크리스트(이미 한 것 ☑)·들은 호가·메모, 메모가 없으면 손으로 적을 칸
  function sheet() {
    const st = cur(), { stops, legs, total, move } = plan(), region = document.body.dataset.region || "";
    const eok = m => (m >= 10000 ? (+(m / 10000).toFixed(2)) + "억" : Math.round(m).toLocaleString() + "만");
    const out = el("section", "cs-print");
    out.append(el("h2", "", "임장 코스"),
      el("p", "cs-p-sub", `${region} 아파트 지수 · ${DJ.today().replace(/-/g, ".")} · ${SPEED[st.mode].label} · ${stops.length}곳 · 총 ${dist(total)} · ` +
        `이동 약 ${hm(move)} (둘러보기 포함 약 ${hm(move + VISIT * stops.length)})`));
    const top = el("div", "cs-p-top"), svg = sec.querySelector("[data-cs-map] svg");
    if (svg) top.append(svg.cloneNode(true));
    const ol = el("ol", "cs-p-order");
    stops.forEach((c, k) => {
      const li = el("li");
      li.append(el("i", "", String(k + 1)), el("b", "", c.n),
        el("small", "", DJ.place(c) + (k < legs.length ? ` · 다음까지 ${dist(legs[k])}, ${SPEED[st.mode].label} 약 ${hm(mins(legs[k]))}` : " · 마지막")));
      ol.append(li);
    });
    top.append(ol);
    out.append(top);
    stops.forEach((c, k) => {
      const v = DJ.visit(c.s), items = DJ.visitItems(c, region), [n, all] = DJ.visitDone(v, items);
      const art = el("article", "cs-p");
      art.append(el("h3", "", `${k + 1}. ${c.n}`),
        el("p", "cs-p-meta", [DJ.place(c), c.pt ? "84㎡ " + c.pt : "", c.g && c.g !== "-" ? c.g + "등급" : "", v.d ? v.d.replace(/-/g, ".") + " 다녀옴" : "", `체크 ${n}/${all}`].filter(Boolean).join(" · ")));
      const ul = el("ul", "cs-p-checks");
      items.forEach(([id, t, why]) => { const li = el("li", "", (v.x[id] ? "☑ " : "☐ ") + t + " "); if (why) li.append(el("small", "", why)); ul.append(li); });
      DJ.CHECK.forEach((t, i) => ul.append(el("li", "", (v.c[i] ? "☑ " : "☐ ") + t)));
      art.append(ul);
      if (v.q.length) art.append(el("p", "", "들은 호가: " + v.q.map(([p, f, won]) => [p ? p + "평" : "", f ? f + "층" : "", eok(won)].filter(Boolean).join(" ")).join(", ")));
      if (v.m) art.append(el("p", "cs-p-memo", "메모: " + v.m));
      const lines = el("div", "cs-p-lines");
      lines.append(el("span", "", v.m ? "더 적을 것" : "메모 (호가·동·층·분위기)"));
      art.append(lines);
      if (k < legs.length) art.append(el("p", "cs-p-leg", `→ 다음 ${stops[k + 1].n}까지 ${dist(legs[k])} · ${SPEED[st.mode].label} 약 ${hm(mins(legs[k]))}`));
      out.append(art);
    });
    return out;
  }
  function link(text, href, cls) {
    const a = el("a", cls, text + " ›");
    a.href = href; a.target = "_blank"; a.rel = "noopener";
    return a;
  }
  // 현장 체크리스트와 메모: 단지마다 저장 (현장 모드·다른 코스에서도 같은 단지면 이어서).
  // 이 단지 자료로 짚은 항목(언덕·주차·관리비 …)을 먼저, 그다음 기본 항목
  function checklist(c) {
    const v = DJ.visit(c.s), items = DJ.visitItems(c, document.body.dataset.region);
    const det = el("details", "cs-check");
    const sum = el("summary", "");
    const cnt = el("span", "cs-cnt");
    const paint = () => { const [n, all] = DJ.visitDone(v, items); cnt.textContent = `${n}/${all}`; cnt.classList.toggle("done", n === all); };
    sum.append(document.createTextNode("현장 체크리스트 "), cnt);
    if (v.d) sum.append(el("span", "cs-been", v.d.slice(5).replace("-", ".") + " 다녀옴"));
    const ul = el("ul", "");
    const row = (txt, why, on, set) => {
      const lab = el("label", why ? "cs-mine" : "");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = on;
      cb.addEventListener("change", () => { set(cb.checked); DJ.saveVisit(c.s, v); paint(); });
      const t = el("span", "", txt);
      if (why) t.append(el("small", "", why));
      lab.append(cb, t);
      const li = el("li", ""); li.append(lab); ul.append(li);
    };
    items.forEach(([id, txt, why]) => row(txt, why, !!v.x[id], on => { v.x[id] = on; }));
    DJ.CHECK.forEach((txt, i) => row(txt, "", !!v.c[i], on => { v.c[i] = on; }));
    const memo = el("textarea", "cs-memo");
    memo.rows = 2;
    memo.placeholder = "메모 (매물 호가, 동·층, 분위기 등)";
    memo.setAttribute("aria-label", c.n + " 메모");
    memo.value = v.m || "";
    memo.addEventListener("input", () => { v.m = memo.value; DJ.saveVisit(c.s, v); });
    det.append(sum, ul, memo);
    paint();
    return det;
  }
  // 코스 지도: 단지 위치를 비율 그대로 찍고 방문 순서대로 잇습니다 (카카오맵 없이도 보임)
  function map(stops) {
    const box = sec.querySelector("[data-cs-map]");
    const NS = "http://www.w3.org/2000/svg";
    const s = (tag, at, parent) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.append(e); return e; };
    const W = 320, H = 260, P = 34;
    const cos = Math.cos(stops[0].la * Math.PI / 180);
    const xs = stops.map(c => c.ln * cos), ys = stops.map(c => c.la);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 2 * P) / Math.max(x1 - x0, 1e-6), (H - 2 * P) / Math.max(y1 - y0, 1e-6));
    const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const pt = c => [ox + (c.ln * cos - x0) * k, H - (oy + (c.la - y0) * k)];
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "cs-svg", role: "img", "aria-label": "방문 순서 지도: " + stops.map((c, i) => `${i + 1} ${c.n}`).join(", ") });
    s("polyline", { points: stops.map(c => pt(c).join(",")).join(" "), class: "cs-route" }, svg);
    stops.forEach((c, i) => {
      const [x, y] = pt(c);
      s("circle", { cx: x, cy: y, r: 11, class: "cs-dot" }, svg);
      const t = s("text", { x, y: y + 4, class: "cs-dot-no", "text-anchor": "middle" }, svg);
      t.textContent = i + 1;
      // 가장자리 단지는 이름이 지도 밖으로 잘리지 않게 안쪽으로 붙이고, 맨 위 단지는 점 아래에
      const anchor = x > W - 72 ? "end" : x < 72 ? "start" : "middle";
      const nm = s("text", { x: anchor === "end" ? x + 12 : anchor === "start" ? x - 12 : x, y: y < 30 ? y + 28 : y - 16,
        class: "cs-dot-nm", "text-anchor": anchor }, svg);
      nm.textContent = c.n.length > 9 ? c.n.slice(0, 8) + "…" : c.n;
    });
    box.replaceChildren(svg);
  }
})();
