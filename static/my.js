(function () {
  // 세 칸 탭: 저장 자료는 건드리지 않고 칸마다 보이기/가리기만 한다. 스크립트가 없으면 전부 보임.
  const seg = document.querySelector("[data-my-seg]");
  if (!seg) return;
  const KEY = "my-seg", GROUPS = ["favs", "visit", "more"];
  const secs = Array.from(document.querySelectorAll("[data-mg]"));
  const groupOf = id => { const e = id && document.getElementById(id); const s = e && e.closest("[data-mg]"); return s ? s.dataset.mg : null; };
  function show(g) {
    if (!GROUPS.includes(g)) g = "favs";
    secs.forEach(e => e.classList.toggle("mg-off", e.dataset.mg !== g));
    seg.querySelectorAll("[data-mg-btn]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mgBtn === g)));
    try { sessionStorage.setItem(KEY, g); } catch (e) {}
  }
  DJ.myShow = show;
  function fromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const g = groupOf(id);
    if (!g) return false;
    show(g);
    const e = document.getElementById(id); if (e && e.tagName === "DETAILS") e.open = true;
    if (e) e.scrollIntoView({ block: "start" });
    return true;
  }
  seg.addEventListener("click", ev => { const b = ev.target.closest("[data-mg-btn]"); if (b) { show(b.dataset.mgBtn); scrollTo(0, 0); } });
  addEventListener("hashchange", fromHash);
  let saved = null; try { saved = sessionStorage.getItem(KEY); } catch (e) {}
  if (!fromHash()) show(saved);
})();
(function () {
  const { el } = DJ;
  DJ.data().then(d => {
    // 카드첩으로 가는 카드: 모은 카드·받은 배지 수
    const sum = document.querySelector("[data-cards-sum]");
    if (sum) {
      const all = d.complexes.filter(c => c.g && c.g !== "-");
      sum.textContent = `카드 ${DJ.albumCount(all).toLocaleString()}장 · 임장 배지 ${Object.keys(DJ.earned()).length}/${DJ.BADGES.length}개`;
    }
    const favs = DJ.favs().map(s => d.bySlug[s]).filter(Boolean);
    const recent = DJ.recent().map(r => d.bySlug[r.s]).filter(Boolean);
    const journal = document.querySelector("[data-visit-history]");
    if (journal) {
      const logs = DJVisitLog.list({ region: document.body.dataset.region }), groups = new Map();
      logs.forEach(v => { if (!groups.has(v.slug)) groups.set(v.slug, []); groups.get(v.slug).push(v); });
      const ul = journal.querySelector("[data-visit-history-list]");
      groups.forEach((visits, slug) => {
        const c = d.bySlug[slug], li = el("li"), v = visits[0];
        const a = el(c ? "a" : "div", "nt-item"); if (c) a.href = DJ.href(c) + "#field";
        a.append(el("b", "", c?.n || slug), el("span", "nt-when", `${visits.length}회 · 최근 ${v.date}`));
        if (v.memo) a.append(el("span", "nt-memo", v.memo.slice(0, 90)));
        li.append(a); ul.append(li);
      });
      journal.hidden = !groups.size;
      const jump = document.querySelector("[data-mj-history]"); if (jump) jump.hidden = !groups.size;
    }

    // 새 소식: 지난번 확인한 뒤 새 거래·시세 변화. 누르면 그 단지 거래 목록으로, '확인'하면 지금 상태를 기준으로
    const news = DJ.watchSync(d.bySlug), nbox = document.querySelector("[data-news]");
    if (nbox && news.length) {
      const list = nbox.querySelector("[data-news-list]"), cnt = nbox.querySelector("[data-news-n]");
      const left = () => {
        const k = list.children.length;
        cnt.textContent = k;
        DJ.save("watchN", k);
        DJ.paintFavCount();
        nbox.hidden = !k;
      };
      news.forEach(({ c, n }) => {
        const li = el("li", "wn-item");
        const a = el("a", "wn-link");
        a.href = DJ.href(c) + "#trades";
        const tags = el("span", "wn-tags");
        DJ.newsText(n).forEach(t => tags.append(el("span", "wn-tag", t)));
        if (n.high) tags.append(el("span", "wn-tag hot", "신고가"));
        a.append(el("span", "grade g-" + c.g, c.g),
          el("span", "wn-name", c.n), el("span", "wn-where muted", DJ.place(c) + " · " + n.since.slice(5).replace("-", ".") + " 확인 뒤"), tags);
        const ok = el("button", "wn-ok", "확인");
        ok.type = "button";
        ok.setAttribute("aria-label", c.n + " 소식 확인");
        ok.addEventListener("click", () => { DJ.watchSeen(c); li.remove(); left(); });
        li.append(a, ok);
        list.append(li);
      });
      nbox.querySelector("[data-news-done]").addEventListener("click", () => {
        news.forEach(({ c }) => DJ.watchSeen(c));
        list.replaceChildren();
        left();
      });
      left();
    }

    // 임장 노트: 현장 모드·임장 코스에서 남긴 기록이 있는 단지 (다녀온 날 최근 순)
    const nbx = document.querySelector("[data-notes]");
    if (nbx) {
      const eok = m => (m >= 10000 ? (+(m / 10000).toFixed(2)) + "억" : Math.round(m).toLocaleString() + "만");
      let keys = [];
      keys = DJ.records.keys().filter(k => k.startsWith("visit:"));
      const notes = keys.map(k => ({ c: d.bySlug[k.slice(6)], v: DJ.visit(k.slice(6)) }))
        .filter(({ c, v }) => c && (v.d || v.m || v.q.length || (v.p || []).length || v.c.some(Boolean) || Object.values(v.x).some(Boolean)))
        .sort((a, b) => (b.v.d || "").localeCompare(a.v.d || "") || a.c.n.localeCompare(b.c.n));
      const ul = nbx.querySelector("[data-notes-list]");
      notes.forEach(({ c, v }) => {
        const items = DJ.visitItems(c, document.body.dataset.region), [n, all] = DJ.visitDone(v, items);
        const a = el("a", "nt-item");
        a.href = DJ.href(c) + "#field";
        const top = el("span", "nt-top");
        const visitCount = DJVisitLog.list({ region: document.body.dataset.region, slug: c.s }).length;
        top.append(el("span", "grade g-" + c.g, c.g), el("b", "nt-name", c.n), el("span", "nt-when" + (v.d ? " been" : ""), v.d ? v.d.slice(5).replace("-", ".") + " 다녀옴" : visitCount ? `방문 기록 ${visitCount}회` : "방문 전"));
        const meta = el("span", "nt-meta");
        meta.append(el("span", "", `체크 ${n}/${all}`));
        if (v.q.length) {
          const [p, , won] = v.q[0], ref = ((c.tp || []).find(t => String(t[0]) === String(p)) || [])[1];
          const pct = ref ? Math.round((won / ref - 1) * 100) : null;
          meta.append(el("span", "", `들은 호가 ${p ? p + "평 " : ""}${eok(won)}${pct == null ? "" : ` (시세 ${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}%)`}${v.q.length > 1 ? ` 외 ${v.q.length - 1}건` : ""}`));
        }
        if ((v.p || []).length) meta.append(el("span", "", `사진 ${v.p.length}장`));
        a.append(top, meta);
        if (v.m) a.append(el("span", "nt-memo", v.m.length > 70 ? v.m.slice(0, 70) + "…" : v.m));
        if ((v.p || []).length && DJ.photoUrl) {   // 현장 사진 앞 3장
          const strip = el("span", "nt-photos");
          v.p.slice(0, 3).forEach(([path]) => { const img = el("img"); DJ.photoSet(img, path); img.alt = ""; img.loading = "lazy"; strip.append(img); });
          a.append(strip);
        }
        const li = el("li", "");
        li.append(a);
        ul.append(li);
      });
      nbx.hidden = !notes.length;
      visitCompare(notes, eok);
    }

    const favBox = document.getElementById("favs");
    if (!favs.length) {
      const empty = el("div", "empty-start");
      empty.append(el("b", "", "먼저, 눈여겨본 단지 두 곳을 담아 보세요"), el("p", "muted", "단지 화면의 ‘관심’을 누르면 여기에 모입니다. 후보를 비교하고 임장 코스까지 한 번에 준비할 수 있어요."));
      const start = el("a", "btn primary", "아파트 찾아보기"); start.href = "index.html?stay=1";
      empty.append(start); favBox.append(empty);
    }
    // 관심 단지: 집감 카드(미니) 한 장씩 + 다녀온 단지는 도장. 값은 같은 complexes.json (예전 게임 카드는 housecard.js 가 없을 때만)
    favs.forEach(c => favBox.append(DJ.hc && DJ.hc.mini ? DJ.hc.mini(c, { been: true, idx: true }) : DJ.card(c, d.stats)));
    if (DJ.hc && favs.length) favBox.classList.add("hc-flist");
    if (favs.length >= 2) {  // 비교는 네 곳까지
      const b = document.getElementById("fav-battle");
      b.hidden = false;
      b.href = "compare.html?s=" + favs.slice(0, 4).map(c => encodeURIComponent(c.s)).join(",");
      b.querySelector("span").textContent = favs.length > 4 ? "관심 단지 앞 4곳 비교" : "관심 단지끼리 비교";
    }

    // 최근 본 단지: 등급·이름·위치·지수, 관심 단지는 별 표시
    const rec = document.getElementById("recent"), clear = document.getElementById("recent-clear");
    const draw = list => {
      rec.replaceChildren();
      if (!list.length) { rec.append(el("li", "muted", "아직 살펴본 단지가 없습니다. 검색이나 지도에서 아파트를 열어 보세요.")); clear.hidden = true; return; }
      clear.hidden = false;
      list.forEach(c => {
        const a = el("a", "recent-item"); a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("span", "ri-name", c.n), el("span", "ri-where muted", DJ.place(c)),
                 el("span", "ri-score", c.i == null ? "-" : c.i + "점"));
        if (DJ.isFav(c.s)) a.append(el("span", "ri-star", "★"));
        const li = el("li"); li.append(a); rec.append(li);
      });
    };
    draw(recent);
    clear.addEventListener("click", () => { DJ.save("recent", []); draw([]); mj("recent", 0); });

    // 바로가기 수 (관심 단지·코스·노트·최근 본)
    const mj = (k, n) => { const b = document.querySelector(`[data-mj="${k}"]`); if (b) b.textContent = n ? " " + n : ""; };
    mj("favs", favs.length);
    mj("course", DJ.courseStops(d).stops.length);
    mj("recent", recent.length);
    const nt = document.querySelector("[data-notes]"), na = document.querySelector("[data-mj-notes]");
    if (nt && na) { na.hidden = nt.hidden; mj("notes", nt.querySelectorAll("[data-notes-list] > li").length); }
    if (favs.length > 1) favBox.classList.add("fav-rail");   // 휴대폰은 옆으로 넘기기
    // 숫자 세 칸 + 다음 행동 한 줄: 저장된 관심·프로젝트·코스·방문 기록을 세기만 함(새 저장·판정값 없음)
    const region = document.body.dataset.region;
    const projects = window.DJProjects ? DJProjects.list(region).filter(p => !p.archived) : [];
    const visits = window.DJVisitLog ? DJVisitLog.list({ region }) : [];
    const ms = k => document.querySelector(`[data-ms="${k}"]`);
    // 임장 코스: 직접 짠 코스만 셈(관심 단지에서 저절로 생긴 코스는 '관심 단지'와 겹치므로 0). 아래 안내 문구의 '임장 코스 N곳'과 같은 기준
    const cs0 = DJ.load("course", {}), stops0 = DJ.courseStops(d).stops.length, courseN = (cs0 && !cs0.auto && Array.isArray(cs0.list) && cs0.list.length && stops0) ? stops0 : 0;
    if (ms("favs")) { ms("favs").textContent = favs.length; ms("course").textContent = courseN; ms("visits").textContent = visits.length; }
    const nx = document.querySelector("[data-my-next]");
    if (nx) {
      const stops = DJ.courseStops(d).stops.length, cs = DJ.load("course", {}), own = !!(cs && !cs.auto && Array.isArray(cs.list) && cs.list.length && stops);   // 직접 짠 코스만 '코스 있음'(관심 단지에서 저절로 생긴 코스는 아님)
      const go = href => () => { location.href = href; };
      const tab = g => () => { DJ.myShow && DJ.myShow(g); scrollTo(0, 0); };
      let msg, label, act;
      // 실제 저장 상태 순서: 다녀옴 → 직접 짠 코스 → 후보 2곳 이상 → 후보 1곳 → 아무것도 없음
      if (visits.length) { msg = `방문 기록 ${visits.length}건이 있어요`; label = "기록 정리하기"; act = tab("visit"); }
      else if (own) { msg = `임장 코스 ${stops}곳이 있어요`; label = "코스 보기"; act = tab("visit"); }
      else if (favs.length > 1) { msg = `관심 단지 ${favs.length}곳`; label = "비교해 보기"; act = go("compare.html?s=" + favs.slice(0, 4).map(c => encodeURIComponent(c.s)).join(",")); }
      else if (favs.length) { msg = "관심 단지 1곳"; label = "임장 코스 만들기"; act = tab("visit"); }
      else { nx.hidden = true; return; }   // 후보가 없으면 아래 빈 상태 카드가 '단지 찾기'를 안내
      const b = el("button", "btn primary", label); b.type = "button"; b.addEventListener("click", act);
      nx.replaceChildren(el("span", "my-next-t", msg), b); nx.hidden = false;
    }
  });

  // 다녀온 단지 나란히 비교: 임장 노트를 단지끼리 한 표로 (체크·확인 못 한 것·들은 호가와 시세 차이·메모·사진).
  // 숫자 자료 비교는 단지 비교(compare.html)에, 여기는 현장에서 직접 본 것 위주로
  function visitCompare(notes, eok) {
    const box = document.querySelector("[data-visit-cmp]");
    if (!box) return;
    const mjv = document.querySelector("[data-mj-vc]");
    box.hidden = notes.length < 2;
    if (mjv) mjv.hidden = box.hidden;
    if (box.hidden) return;
    const MAX = 4, region = document.body.dataset.region;
    // 처음엔 다녀온 곳부터 최근 4곳
    let picked = notes.filter(x => x.v.d).concat(notes.filter(x => !x.v.d)).slice(0, MAX).map(x => x.c.s);
    const pickBox = box.querySelector("[data-vc-pick]"), table = box.querySelector("[data-vc-table]");
    const short = (t, n) => (t.length > n ? t.slice(0, n) + "…" : t);
    const quote = (c, q) => {
      const [p, f, won] = q, ref = ((c.tp || []).find(t => String(t[0]) === String(p)) || [])[1];
      const pct = ref ? Math.round((won / ref - 1) * 100) : null;
      return `${p ? p + "평 " : ""}${f ? f + "층 " : ""}${eok(won)}` + (pct == null ? "" : ` (시세 ${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}%)`);
    };
    const ROWS = [
      ["등급·지수", ({ c }) => (c.g && c.g !== "-" ? c.g + "등급 · " : "") + (c.i == null ? "-" : c.i + "점")],
      ["84㎡ 기준 가격", ({ c }) => c.pt || "-"],
      ["공통 기록 방문일", ({ c, v }) => (v.d ? v.d.replace(/-/g, ".") : DJVisitLog.list({ region, slug: c.s }).length ? "날짜별 방문 기록 참고" : "방문 전")],
      ["현장 체크", ({ c, v }) => { const [n, all] = DJ.visitDone(v, DJ.visitItems(c, region)); return `${n} / ${all}`; }],
      ["확인 못 한 것", ({ c, v }) => {
        const left = DJ.visitItems(c, region).filter(([id]) => !v.x[id]).map(t => t[1]).concat(DJ.CHECK.filter((_, i) => !v.c[i]));
        return left.length ? left.slice(0, 2).map(t => short(t.replace(/ \(.*\)$/, ""), 18)).join(" · ") + (left.length > 2 ? ` 외 ${left.length - 2}개` : "") : "모두 확인";
      }],
      ["들은 호가", ({ c, v }) => (v.q.length ? v.q.slice(0, 2).map(q => quote(c, q)).join("\n") + (v.q.length > 2 ? `\n외 ${v.q.length - 2}건` : "") : "-")],
      ["메모", ({ v }) => (v.m ? short(v.m, 80) : "-")],
      ["현장 사진", ({ v }) => ((v.p || []).length ? v.p.length + "장" : "-")],
      ["역까지", ({ c }) => (c.f && c.f.subway != null ? (c.stn ? c.stn + " " : "") + c.f.subway + "m" : "-")],
      ["학군 점수", ({ c }) => (c.ed == null ? "-" : c.ed + "점")],
    ];
    function draw() {
      pickBox.replaceChildren();
      notes.forEach(({ c }) => {
        const on = picked.includes(c.s);
        const b = el("button", "chip" + (on ? " active" : ""), c.n);
        b.type = "button"; b.setAttribute("aria-pressed", String(on));
        b.disabled = !on && picked.length >= MAX;
        b.addEventListener("click", () => {
          picked = on ? picked.filter(s => s !== c.s) : picked.concat(c.s);
          draw();
        });
        pickBox.append(b);
      });
      const cols = picked.map(s => notes.find(x => x.c.s === s)).filter(Boolean);
      table.replaceChildren();
      if (cols.length < 2) {
        table.append(el("caption", "muted", "비교할 단지를 2곳 이상 선택해 주세요."));
      } else {
        const thead = el("thead"), hr = el("tr");
        hr.append(el("th", "", ""));
        cols.forEach(({ c }) => { const th = el("th"); const a = el("a", "", c.n); a.href = DJ.href(c) + "#field"; th.append(a); hr.append(th); });
        thead.append(hr);
        const tb = el("tbody");
        ROWS.forEach(([name, get]) => {
          const tr = el("tr");
          tr.append(el("th", "", name));
          cols.forEach(x => { const td = el("td", "", String(get(x))); tr.append(td); });
          tb.append(tr);
        });
        table.append(thead, tb);
      }
      const link = box.querySelector("[data-vc-data]");
      link.hidden = cols.length < 2;
      link.href = "compare.html?s=" + cols.map(x => encodeURIComponent(x.c.s)).join(",");
    }
    draw();
  }
})();
