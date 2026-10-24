// 카드첩 화면: 오늘의 임장 후보 세 장, 임장 배지, 내 카드첩.
// 모두 이 기기의 브라우저에만 저장됩니다 (app.js 의 DJ.album·DJ.seen·DJ.checkBadges).
(function () {
  const { el } = DJ;
  const GRADES = ["S", "A", "B", "C", "D"];
  let D = null;

  DJ.data().then(d => {
    D = d;
    DJ.checkBadges(d);
    today(d);
    badges();
    album(d);
    document.addEventListener("dj:badges", badges);
  });

  // ---------- 오늘의 임장 후보 ----------
  // 내가 본 단지·관심 단지를 기준으로 고릅니다. 같은 날 같은 기기면 새로 고쳐도 같고, 지역마다 따로.
  // 1) 비교 후보: 기준 단지 1.5km 안, 84㎡ 값이 ±25% 안 (같은 동 먼저)
  // 2) 흐름 확인: 기준 단지가 있는 구에서 최근 신고가가 난 단지
  // 3) 가성비 후보: 기준 단지들 값(가운데) ±20% 안에서 입지 점수가 높은 단지
  // 기록이 없으면 지역 기준 단지(S·A), 최근 신고가, 입지에 비해 값이 낮은 단지로.
  const KIND = {
    cmp: { label: "비교 후보", icon: "compare" },
    hot: { label: "흐름 확인", icon: "fire" },
    val: { label: "가성비 후보", icon: "coin" },
    top: { label: "기준 단지", icon: "rank" },
    more: { label: "둘러보기", icon: "walk" },
  };
  function seeded(seed) {   // 날짜·기기마다 정해지는 난수 (같은 날 같은 기기면 같은 후보)
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => {
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const km = (a, b) => {   // 가까운 거리라 평면으로 근사
    const dy = (a.la - b.la) * 111, dx = (a.ln - b.ln) * 111 * Math.cos(a.la * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  };
  const money = m => m >= 10000 ? (m / 10000).toFixed(1).replace(/\.0$/, "") + "억 원" : (Math.round(m / 100) * 100).toLocaleString() + "만 원";
  function whyCmp(c, b) {
    const where = c.gu === b.gu && c.d === b.d ? `${DJ.josa(b.n, "과/와")} 같은 동` : `${b.n}에서 ${km(c, b).toFixed(1)}km`;
    const diff = c.p - b.p;
    const val = Math.abs(diff) < 1000 ? "84㎡ 값이 비슷해요" : `84㎡가 ${money(Math.abs(diff))} ${diff < 0 ? "낮아요" : "높아요"}`;
    return `${where}, ${val}. 나란히 놓고 차이의 이유를 봐요.`;
  }
  function pickToday(d, all, rand) {
    const album = DJ.album();
    const fresh = all.filter(c => !album[c.s]);
    const pool = fresh.length >= 3 ? fresh : all;   // 다 봤으면 본 단지에서 다시
    const base = [...new Set([...DJ.favs(), ...DJ.recent().map(r => r.s)])].map(s => d.bySlug[s]).filter(c => c && c.p);
    const out = [];
    const left = arr => arr.filter(c => !out.some(o => o.c === c));
    const one = arr => { const l = left(arr); return l.length ? l[Math.floor(rand() * l.length)] : null; };
    const has = k => out.some(o => o.k === k);
    if (base.length) {
      for (const b of base.slice(0, 6)) {
        if (!b.la) continue;
        const near = pool.filter(c => c !== b && c.p && c.la && km(c, b) <= 1.5 && Math.abs(c.p / b.p - 1) <= 0.25);
        const same = near.filter(c => c.gu === b.gu && c.d === b.d);
        const c = one(same.length ? same : near);
        if (c) { out.push({ c, k: "cmp", w: whyCmp(c, b) }); break; }
      }
      const gus = new Set(base.map(b => b.gu));
      const hot = pool.filter(c => c.h && gus.has(c.gu));
      const h = one(hot.length ? hot : pool.filter(c => c.h));
      if (h) out.push({ c: h, k: "hot", w: `${h.gu}에서 최근 신고가가 난 곳이에요. 요즘 수요가 몰리는지 현장 분위기를 확인해 봐요.` });
      const ps = base.map(b => b.p).sort((x, y) => x - y), mid = ps[Math.floor(ps.length / 2)];
      const band = left(pool.filter(c => c.p && Math.abs(c.p / mid - 1) <= 0.2 && c.st && c.st[0] != null)).sort((x, y) => y.st[0] - x.st[0]);
      const v = one(band.slice(0, 5));
      if (v) out.push({ c: v, k: "val", w: `내가 본 단지들과 비슷한 값(${money(mid)} 안팎)인데 입지 점수가 ${v.st[0]}점이에요.` });
    }
    if (!has("cmp") && out.length < 3) {
      const t = one(pool.filter(c => c.g === "S")) || one(pool.filter(c => c.g === "A"));
      if (t) out.push({ c: t, k: "top", w: `${t.gu}의 상위 등급 단지예요. 다른 단지를 잴 기준이 되니 먼저 봐 둬요.` });
    }
    if (!has("hot") && out.length < 3) {
      const h = one(pool.filter(c => c.h));
      if (h) out.push({ c: h, k: "hot", w: `${h.gu}에서 최근 신고가가 난 곳이에요. 요즘 수요가 몰리는지 현장 분위기를 확인해 봐요.` });
    }
    if (!has("val") && out.length < 3) {
      const v = one(left(pool.filter(c => c.st && c.st[3] != null)).sort((x, y) => y.st[3] - x.st[3]).slice(0, 10));
      if (v) out.push({ c: v, k: "val", w: `입지에 비해 값이 낮은 편이에요 (가성비 ${v.st[3]}점). 왜 싼지 현장에서 확인해 봐요.` });
    }
    while (out.length < 3 && left(pool).length) {
      const c = one(pool);
      out.push({ c, k: "more", w: "아직 안 본 단지예요. 시세 감을 넓혀 봐요." });
    }
    return out;
  }
  function today(d) {
    const sec = document.getElementById("today");
    const all = d.complexes.filter(c => GRADES.includes(c.g));
    if (all.length < 3) { sec.hidden = true; return; }
    const key = "picks-" + DJ.sido(all[0].s);   // 지역마다 따로 (같은 주소 아래 대전·세종·서울)
    const day = DJ.today();
    let st = DJ.load(key, null);
    const ok = st && st.d === day && Array.isArray(st.s) && st.s.length === 3 && st.s.every(s => d.bySlug[s]);
    if (!ok) {
      let seed = DJ.load("seed", null);
      if (!seed) { seed = String(Math.random()).slice(2, 10); DJ.save("seed", seed); }
      const picks = pickToday(d, all, seeded(day + seed + key));
      st = { d: day, s: picks.map(p => p.c.s), k: picks.map(p => p.k), w: picks.map(p => p.w), n: picks.map(() => null) };
      DJ.save(key, st);
    }
    const row = sec.querySelector("[data-today-row]"), done = sec.querySelector("[data-today-done]");
    const paint = () => { done.hidden = !st.n.every(v => v !== null); };
    row.replaceChildren();
    st.s.forEach((s, i) => {
      const c = d.bySlug[s], kind = KIND[st.k[i]] || KIND.more;
      const col = el("div", "tc-col");
      const slot = el("div", "tc g-" + c.g);
      const inner = el("div", "tc-in");
      const back = el("button", "tc-back");
      back.type = "button";
      back.setAttribute("aria-label", `${kind.label} 카드 열기`);
      const mark = el("span", "tc-mark");
      mark.append(DJ.icon(kind.icon));
      back.append(el("span", "tc-kind", kind.label), mark, el("span", "tc-hint", "눌러서 열기"));
      const front = el("div", "tc-front");
      const card = DJ.miniCard(c);
      const tag = el("span", "tc-tag");
      front.append(card, tag);
      inner.append(back, front);
      slot.append(inner);
      const why = el("p", "tc-why pending");   // 열기 전엔 어떤 후보인지만, 열면 왜 골랐는지
      const whyText = document.createTextNode(" 카드를 뒤집으면 왜 골랐는지 보여요.");
      why.append(el("b", "", kind.label), whyText);
      col.append(slot, why);
      row.append(col);
      const show = () => {
        const n = st.n[i];
        tag.textContent = n ? `새 카드 · ${n.toLocaleString()}장째` : "이미 모은 카드";
        tag.classList.toggle("new", !!n);
        slot.classList.add("open");
        back.inert = true;   // 뒤집힌 뒷면은 화면엔 남지만(돌아가는 동안) 누르거나 읽히지 않게
        back.setAttribute("aria-hidden", "true");
        front.inert = false;
        front.removeAttribute("aria-hidden");
        whyText.textContent = " " + (st.w[i] || "");
        why.classList.remove("pending");
      };
      if (st.n[i] !== null) { show(); return; }
      front.inert = true;
      front.setAttribute("aria-hidden", "true");
      back.addEventListener("click", e => {
        st.n[i] = DJ.collect(c.s);
        DJ.save(key, st);
        DJ.markDay();
        if (!DJ.calm) {
          slot.classList.add("flip");
          if (c.g === "S" || c.g === "A") slot.classList.add("shine");
        }
        show();
        paint();
        DJ.checkBadges(d);
        album(d);
        if (e.detail === 0) card.link.focus();   // 키보드로 열었으면 연 카드로
      });
    });
    paint();
  }

  // ---------- 임장 배지 (당근 활동 배지처럼 모으되, 배지마다 임장에 왜 필요한지) ----------
  const GROUP_CLS = { "둘러보기": "b1", "따져보기": "b2", "정리하기": "b3" };
  let selected = null;
  function badges() {
    const sec = document.getElementById("badges");
    if (!sec || !D) return;
    const got = DJ.earned(), st = DJ.badgeState(D);
    const prog = b => Math.min(b.goal, Math.max(0, b.n(st) || 0));
    sec.querySelector("[data-badge-n]").textContent = `${Object.keys(got).length} / ${DJ.BADGES.length}개`;
    if (!selected) {   // 처음엔 거의 다 된(진행이 가장 많이 된) 받지 않은 배지
      const todo = DJ.BADGES.filter(b => !got[b.id]).sort((x, y) => prog(y) / y.goal - prog(x) / x.goal);
      selected = (todo[0] || DJ.BADGES[0]).id;
    }
    const box = sec.querySelector("[data-badge-groups]");
    box.replaceChildren();
    [...new Set(DJ.BADGES.map(b => b.group))].forEach(g => {
      const wrap = el("div", "badge-group");
      wrap.append(el("h3", "", g));
      const ul = el("ul", "badge-grid");
      DJ.BADGES.filter(b => b.group === g).forEach(b => {
        const on = !!got[b.id], n = prog(b);
        const btn = el("button", "badge" + (on ? " on" : ""));
        btn.type = "button";
        btn.setAttribute("aria-pressed", selected === b.id ? "true" : "false");
        btn.setAttribute("aria-label", `${b.name}, ${on ? "받은 배지" : `${b.goal} 중 ${n}`}`);
        const medal = el("span", "badge-medal " + GROUP_CLS[g]);
        medal.append(DJ.icon(b.icon));
        btn.append(medal, el("span", "badge-name", b.name), el("span", "badge-n", on ? "받음" : `${n}/${b.goal}`));
        btn.addEventListener("click", () => { selected = b.id; badges(); });
        const li = el("li");
        li.append(btn);
        ul.append(li);
      });
      wrap.append(ul);
      box.append(wrap);
    });
    // 고른 배지 설명: 어떻게 받나요, 임장에 왜 필요할까요
    const b = DJ.BADGES.find(x => x.id === selected), on = !!got[b.id];
    const det = sec.querySelector("[data-badge-detail]");
    det.replaceChildren();
    const head = el("div", "bd-head");
    const medal = el("span", "badge-medal " + GROUP_CLS[b.group] + (on ? " on" : ""));
    medal.append(DJ.icon(b.icon));
    const t = el("div", "");
    t.append(el("b", "", b.name), el("span", "muted", on ? `${got[b.id].replace(/-/g, ".")} 받음` : `${prog(b)}/${b.goal} · 아직 받지 않았어요`));
    head.append(medal, t);
    const how = el("p", "bd-row"), why = el("p", "bd-row");
    how.append(el("span", "", "어떻게 받나요"), document.createTextNode(b.how));
    why.append(el("span", "", "임장에 왜 필요할까요"), document.createTextNode(b.why));
    det.append(head, how, why);
    if (b.go && !on) {
      const go = el("a", "btn", b.go[0] + " →");
      go.href = b.go[1];
      det.append(go);
    }
  }

  // ---------- 내 카드첩: 모은 수, 등급별, 모은 카드, 구(동)별 진행, 아직 못 모은 귀한 카드 하나 ----------
  let more = null;
  function album(d) {
    const sec = document.getElementById("album");
    if (!sec) return;
    const a = DJ.album();
    const all = d.complexes.filter(c => GRADES.includes(c.g));
    const got = all.filter(c => a[c.s]);
    const pct = all.length ? got.length / all.length : 0;
    sec.querySelector("[data-album-total]").textContent = `${got.length.toLocaleString()} / ${all.length.toLocaleString()}장`;
    sec.querySelector("[data-album-bar]").style.width = (got.length ? Math.max(1.5, pct * 100) : 0) + "%";
    const gl = sec.querySelector("[data-album-grades]");
    gl.replaceChildren();
    GRADES.forEach(g => {
      const t = all.filter(c => c.g === g).length;
      if (!t) return;
      const n = got.filter(c => c.g === g).length;
      const li = el("li", n === t ? "full" : "");
      li.append(el("span", "grade g-" + g, g), el("span", "", `${n}/${t}`));
      li.setAttribute("aria-label", `${g}등급 ${t}장 중 ${n}장`);
      gl.append(li);
    });
    sec.querySelector("[data-album-empty]").hidden = got.length > 0;
    // 모은 카드: 등급 높은 순, 같은 등급은 지수 순. 처음엔 12장, 더 보기로 24장씩
    const sorted = got.slice().sort((x, y) => GRADES.indexOf(x.g) - GRADES.indexOf(y.g) || (y.i ?? -1) - (x.i ?? -1));
    const box = sec.querySelector("[data-album-cards]"), btn = sec.querySelector("[data-album-more]");
    box.replaceChildren();
    let shown = 0;
    const draw = k => {
      sorted.slice(shown, shown + k).forEach(c => box.append(DJ.miniCard(c)));
      shown = Math.min(sorted.length, shown + k);
      btn.hidden = shown >= sorted.length;
      btn.textContent = `${Math.min(24, sorted.length - shown)}장 더 보기`;
    };
    draw(12);
    if (more) btn.removeEventListener("click", more);
    more = () => draw(24);
    btn.addEventListener("click", more);
    // 구(동)별: 모은 비율이 높은 곳부터. 한 동의 카드를 다 모으면 '다 모은 동'
    const areas = {};
    all.forEach(c => {
      const ar = areas[c.gu] || (areas[c.gu] = { n: 0, t: 0, dongs: {} });
      const dg = ar.dongs[c.d] || (ar.dongs[c.d] = { n: 0, t: 0 });
      ar.t++; dg.t++;
      if (a[c.s]) { ar.n++; dg.n++; }
    });
    const al = sec.querySelector("[data-album-areas]");
    al.replaceChildren();
    Object.entries(areas).sort((x, y) => y[1].n / y[1].t - x[1].n / x[1].t || x[0].localeCompare(y[0], "ko"))
      .forEach(([name, ar]) => {
        const li = el("li", ar.n === ar.t ? "full" : "");
        const bar = el("span", "album-bar sm"), fill = el("span", "");
        fill.style.width = (ar.n ? Math.max(3, ar.n / ar.t * 100) : 0) + "%";
        bar.append(fill);
        const full = Object.values(ar.dongs).filter(x => x.n === x.t && x.t).length;
        const multi = Object.keys(ar.dongs).length > 1;
        const note = ar.n === ar.t ? "다 모음" : multi && full ? `다 모은 동 ${full}곳` : "";
        li.append(el("span", "aa-name", name), bar, el("span", "aa-n", `${ar.n}/${ar.t}`));
        if (note) li.append(el("span", "aa-note", note));
        al.append(li);
      });
    // 아직 못 모은 카드 중 등급이 가장 높은 것 하나를 골라 열어 보기
    const next = sec.querySelector("[data-album-next]");
    next.replaceChildren();
    const left = all.filter(c => !a[c.s]);
    if (!left.length) { next.textContent = "이 지역 카드를 모두 모았어요."; next.hidden = false; return; }
    const g = GRADES.find(x => left.some(c => c.g === x));
    const pool = left.filter(c => c.g === g);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    next.append(el("span", "", `아직 못 모은 ${g}카드 ${pool.length.toLocaleString()}장`));
    const go = el("a", "btn", "하나 열어 보기 →");
    go.href = DJ.href(pick);
    next.append(go);
    next.hidden = false;
  }
})();
