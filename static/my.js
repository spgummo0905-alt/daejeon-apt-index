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
      try { keys = Object.keys(localStorage).filter(k => k.startsWith("djdex:visit:")); } catch (e) { /* 저장소를 못 쓰는 브라우저 */ }
      const notes = keys.map(k => ({ c: d.bySlug[k.slice(12)], v: DJ.visit(k.slice(12)) }))
        .filter(({ c, v }) => c && (v.d || v.m || v.q.length || (v.p || []).length || v.c.some(Boolean) || Object.values(v.x).some(Boolean)))
        .sort((a, b) => (b.v.d || "").localeCompare(a.v.d || "") || a.c.n.localeCompare(b.c.n));
      const ul = nbx.querySelector("[data-notes-list]");
      notes.forEach(({ c, v }) => {
        const items = DJ.visitItems(c, document.body.dataset.region), [n, all] = DJ.visitDone(v, items);
        const a = el("a", "nt-item");
        a.href = DJ.href(c) + "#field";
        const top = el("span", "nt-top");
        top.append(el("span", "grade g-" + c.g, c.g), el("b", "nt-name", c.n), el("span", "nt-when" + (v.d ? " been" : ""), v.d ? v.d.slice(5).replace("-", ".") + " 다녀옴" : "방문 전"));
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
          v.p.slice(0, 3).forEach(([path]) => { const img = el("img"); img.src = DJ.photoUrl(path); img.alt = ""; img.loading = "lazy"; strip.append(img); });
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
    if (!favs.length) favBox.append(el("p", "muted", "아직 저장한 아파트가 없습니다. 단지 페이지 위쪽의 ☆를 눌러 관심 단지를 추가해 보세요."));
    favs.forEach(c => favBox.append(DJ.card(c, d.stats)));
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
      ["84㎡ 환산가", ({ c }) => c.pt || "-"],
      ["다녀온 날", ({ v }) => (v.d ? v.d.replace(/-/g, ".") : "방문 전")],
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
