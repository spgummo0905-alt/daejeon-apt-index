// '내 설정'(로그인을 켠 사이트는 내 정보 화면, 아니면 관심 화면)과 임장 노트 내보내기.
// - 내 설정: 처음 볼 지역, 면적 단위, 임장 코스 이동, 관심 단지 시세 알림 기준, 내 현장 체크 항목 (app.js 의 DJ.prefs).
//   로그인하면 sync.js 가 다른 기기와 같이 맞춥니다.
// - 내 기록 내려받기·되살리기: 관심 단지·임장 노트·코스·설정을 JSON 파일 하나로 (로그인 없이 기기를 옮길 때도)
// - 임장 노트 엑셀(CSV)·인쇄: 부동산 상담이나 가족과 의논할 때 들고 가는 자료로
(function () {
  const { el } = DJ;
  const box = document.getElementById("prefs");
  const pad = n => String(n).padStart(2, "0");
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
  // 파일 이름은 영문으로 (한글 이름은 일부 브라우저가 'download' 로 바꿔 버림)
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el("a");
    a.href = url; a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- 내 설정 ----------
  if (box) {
    const P = () => DJ.prefs();
    const course = () => DJ.load("course", {});
    const now = { region: () => P().region, mode: () => course().mode || "walk", dp: () => String(P().dp) };
    const paintSegs = () => box.querySelectorAll("[data-pf]").forEach(g => {
      const v = now[g.dataset.pf]();
      g.querySelectorAll("[data-v]").forEach(b => {
        const on = b.dataset.v === v;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    });
    box.querySelectorAll("[data-pf]").forEach(g => g.addEventListener("click", e => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      const k = g.dataset.pf, v = b.dataset.v;
      if (k === "region") DJ.setPref("region", v);
      if (k === "dp") DJ.setPref("dp", +v);
      if (k === "mode") {   // 임장 코스의 이동 방법과 같은 값 (코스 화면도 바로 바뀜)
        DJ.save("course", Object.assign(course(), { mode: v }));
        document.dispatchEvent(new CustomEvent("dj:mode", { detail: v }));
      }
      paintSegs();
      DJ.toast("설정을 바꿨어요", DJ.sync && DJ.sync.user ? "다른 기기에서도 같은 설정으로 보여요." : "이 기기에 저장했어요.");
    }));

    // 내 현장 체크 항목
    const ul = box.querySelector("[data-pf-checks]"), form = box.querySelector("[data-pf-add]");
    const drawChecks = () => {
      const list = P().checks;
      ul.replaceChildren();
      list.forEach((t, i) => {
        const li = el("li", "");
        const del = el("button", "pf-del", "×");
        del.type = "button";
        del.setAttribute("aria-label", t + " 지우기");
        del.addEventListener("click", () => { const c = P().checks.slice(); c.splice(i, 1); DJ.setPref("checks", c); drawChecks(); });
        li.append(el("span", "", t), del);
        ul.append(li);
      });
      ul.hidden = !list.length;
      form.hidden = list.length >= 10;
    };
    form.addEventListener("submit", e => {
      e.preventDefault();
      const inp = form.querySelector("input"), t = inp.value.replace(/\s+/g, " ").trim().slice(0, 40);
      if (!t) { inp.focus(); return; }
      const c = P().checks;
      if (!c.includes(t)) DJ.setPref("checks", c.concat(t).slice(0, 10));
      inp.value = "";
      drawChecks();
    });

    // 내 기록 내려받기·되살리기 (로그인 정보는 넣지 않음)
    const backup = document.querySelector("[data-pf-backup]"), restore = document.querySelector("[data-pf-restore]");
    if (backup) backup.addEventListener("click", () => {
      const data = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("djdex:")) data[k.slice(6)] = JSON.parse(localStorage.getItem(k));
        }
      } catch (e) { /* 저장소를 못 쓰는 브라우저 */ }
      download(`aptindex-records-${stamp()}.json`, JSON.stringify({ app: "djdex", v: 1, at: new Date().toISOString(), data }, null, 1), "application/json");
    });
    if (restore) restore.addEventListener("change", e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      f.text().then(txt => {
        const j = JSON.parse(txt);
        if (!j || j.app !== "djdex" || typeof j.data !== "object") throw new Error("bad");
        const keys = Object.keys(j.data).filter(k => /^[\w:.-]{1,80}$/.test(k));
        if (!confirm(`이 파일의 기록 ${keys.length}가지로 이 기기 기록을 바꿀까요?\n같은 종류의 기록은 파일 것으로 바뀌어요.`)) return;
        keys.forEach(k => DJ.save(k, j.data[k]));   // 로그인했으면 계정에도 저장됨
        DJ.toast("기록을 되살렸어요", "화면을 새로 열어요.");
        setTimeout(() => location.reload(), 900);
      }).catch(() => DJ.toast("되살리지 못했어요", "아파트 지수에서 내려받은 기록 파일인지 확인해 주세요."));
    });

    document.addEventListener("dj:prefs", paintSegs);
    box.addEventListener("toggle", () => { if (box.open) { paintSegs(); drawChecks(); } });
    paintSegs();
    drawChecks();
    if (location.hash === "#prefs") box.open = true;
  }

  // ---------- 임장 노트 내보내기 ----------
  const notes = document.querySelector("[data-notes]");
  if (!notes) return;
  const eok = m => (m >= 10000 ? (+(m / 10000).toFixed(2)) + "억" : Math.round(m).toLocaleString() + "만");
  const day = d => (d ? d.replace(/-/g, ".") : "");
  // 기록이 있는 단지 [{c, v, items}] (다녀온 날 최근 순)
  function rows(d) {
    let keys = [];
    try { keys = Object.keys(localStorage).filter(k => k.startsWith("djdex:visit:")); } catch (e) { /* 저장소를 못 쓰는 브라우저 */ }
    return keys.map(k => ({ c: d.bySlug[k.slice(12)], v: DJ.visit(k.slice(12)) }))
      .filter(({ c, v }) => c && (v.d || v.m || v.q.length || (v.p || []).length || v.c.some(Boolean) || Object.values(v.x).some(Boolean)))
      .sort((a, b) => (b.v.d || "").localeCompare(a.v.d || "") || a.c.n.localeCompare(b.c.n))
      .map(r => Object.assign(r, { items: DJ.visitItems(r.c, document.body.dataset.region) }));
  }
  const quoteText = q => [q[0] ? q[0] + "평" : "", q[1] ? q[1] + "층" : "", eok(q[2]), q[3] ? "(" + day(q[3]).slice(5) + ")" : ""].filter(Boolean).join(" ");
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");

  notes.querySelector("[data-nt-csv]").addEventListener("click", () => DJ.data().then(d => {
    const esc = x => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
    const head = ["단지", "지역", "다녀온 날", "체크", "확인한 항목", "들은 호가", "메모", "사진", "단지 페이지"];
    const lines = rows(d).map(({ c, v, items }) => {
      const [n, all] = DJ.visitDone(v, items);
      const done = items.filter(([id]) => v.x[id]).map(([, t]) => t).concat(DJ.CHECK.filter((_, i) => v.c[i]));
      return [c.n, DJ.place(c), day(v.d), `${n}/${all}`, done.join(" / "), v.q.map(quoteText).join(" / "), v.m || "",
        (v.p || []).length ? `${v.p.length}장` : "", base + "apt/" + c.s + ".html"].map(esc).join(",");
    });
    // 엑셀이 한글을 바로 읽게 BOM 을 앞에
    download(`imjang-notes-${stamp()}.csv`, "\uFEFF" + [head.map(esc).join(","), ...lines].join("\r\n"), "text/csv;charset=utf-8");
  }));

  notes.querySelector("[data-nt-print]").addEventListener("click", () => DJ.data().then(d => {
    const sheet = el("section", "nt-print");
    sheet.id = "nt-print";
    sheet.append(el("h2", "", "임장 노트"), el("p", "nt-print-sub", `${document.body.dataset.region || ""} 아파트 지수 · ${day(DJ.today())} 출력`));
    rows(d).forEach(({ c, v, items }) => {
      const art = el("article", "nt-p");
      const [n, all] = DJ.visitDone(v, items);
      art.append(el("h3", "", c.n), el("p", "nt-p-meta", [DJ.place(c), v.d ? day(v.d) + " 다녀옴" : "", `체크 ${n}/${all}`].filter(Boolean).join(" · ")));
      const ul = el("ul", "nt-p-checks");
      items.forEach(([id, t, why]) => ul.append(el("li", v.x[id] ? "on" : "", (v.x[id] ? "☑ " : "☐ ") + t + (why ? ` — ${why}` : ""))));
      DJ.CHECK.forEach((t, i) => ul.append(el("li", v.c[i] ? "on" : "", (v.c[i] ? "☑ " : "☐ ") + t)));
      art.append(ul);
      if (v.q.length) art.append(el("p", "", "들은 호가: " + v.q.map(quoteText).join(", ")));
      if (v.m) art.append(el("p", "nt-p-memo", "메모: " + v.m));
      if ((v.p || []).length && DJ.photoUrl) {   // 현장 사진도 작게
        const ph = el("div", "nt-p-photos");
        v.p.slice(0, 6).forEach(([path]) => { const img = el("img"); img.src = DJ.photoUrl(path); img.alt = ""; ph.append(img); });
        art.append(ph);
      }
      sheet.append(art);
    });
    document.body.append(sheet);
    document.body.classList.add("print-notes");
    return Promise.race([Promise.all([...sheet.querySelectorAll("img")].map(i => i.decode().catch(() => {}))),
      new Promise(ok => setTimeout(ok, 3000))]).then(() => sheet);   // 사진이 뜬 뒤 인쇄
  }).then(sheet => {
    window.print();
    setTimeout(() => { document.body.classList.remove("print-notes"); sheet.remove(); }, 800);
  }));
})();

// ---------- 가족과 함께 보기: 공유 링크 만들기·보내기·끊기 (로그인했을 때만) ----------
(function () {
  const box = document.querySelector("[data-share]");
  if (!box || !DJ.sb) return;
  const { el } = DJ;
  const acts = box.querySelector("[data-share-actions]");
  let tok = null, uid = null;
  const rpc = async name => DJ.sb.call("/rest/v1/rpc/" + name, { method: "POST", body: {} }, await DJ.sb.token());
  const link = () => location.origin + location.pathname.replace(/[^/]*$/, "") + "share.html?t=" + tok;
  const busy = b => { b.disabled = true; return () => { b.disabled = false; }; };
  function render() {
    acts.replaceChildren();
    if (!tok) {
      const mk = el("button", "btn primary", "링크 만들기");
      mk.type = "button";
      mk.addEventListener("click", () => {
        const done = busy(mk);
        rpc("share_create").then(t => { tok = t; render(); DJ.toast("함께 보기 링크를 만들었어요", "'링크 보내기'로 가족에게 보내 주세요."); })
          .catch(() => { done(); DJ.toast("링크를 만들지 못했어요", "잠시 뒤 다시 해 주세요."); });
      });
      acts.append(mk);
      return;
    }
    const url = el("input", "acct-share-url");
    url.readOnly = true; url.value = link(); url.setAttribute("aria-label", "함께 보기 링크");
    url.addEventListener("focus", () => url.select());
    const send = el("button", "btn primary", "링크 보내기");
    send.type = "button";
    send.addEventListener("click", () => {
      const text = "우리 집 임장 기록이에요. 관심 단지와 현장 메모를 같이 봐 주세요.";
      if (navigator.share) navigator.share({ title: "임장 기록 함께 보기", text, url: link() }).catch(() => {});
      else DJ.copyLink(link(), "카카오톡이나 문자로 가족에게 보내 주세요");
    });
    const cut = el("button", "btn ghost", "링크 끊기");
    cut.type = "button";
    cut.addEventListener("click", () => {
      if (!confirm("이 링크를 끊을까요? 링크를 받은 사람은 더 이상 볼 수 없어요.")) return;
      const done = busy(cut);
      rpc("share_revoke").then(() => { tok = null; render(); DJ.toast("링크를 끊었어요", "필요하면 새 링크를 만들 수 있어요."); })
        .catch(() => { done(); DJ.toast("끊지 못했어요", "잠시 뒤 다시 해 주세요."); });
    });
    acts.append(url, send, cut);
  }
  function check() {
    const u = DJ.sync && DJ.sync.user;
    box.hidden = !u;
    if (!u) { uid = null; tok = null; return; }
    if (uid === u.id) return;
    uid = u.id;
    acts.replaceChildren(el("span", "muted", "불러오는 중…"));
    rpc("share_get").then(t => { tok = t || null; render(); }).catch(() => { tok = null; render(); });
  }
  document.addEventListener("dj:auth", check);
  check();
})();
