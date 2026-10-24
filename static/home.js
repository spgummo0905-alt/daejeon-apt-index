// 메인: 찜한 단지 줄, 지역 카드를 누르면 목록을 그 구로 거르기, 구별 비교 탭
(function () {
  const { el } = DJ;
  // 관심 단지·최근 본 단지 줄 (이 브라우저에만 남는 목록)
  const strip = (slugs, sec, box) => {
    if (!slugs.length || !document.getElementById(sec)) return;
    DJ.data().then(d => {
      const list = slugs.map(s => d.bySlug[s]).filter(Boolean).slice(0, 8);
      if (!list.length) return;
      const b = document.getElementById(box);
      b.textContent = "";
      list.forEach(c => {
        const a = el("a", "strip-item");
        a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("strong", "", c.n), el("span", "muted", (c.i ?? "-") + "점"));
        b.append(a);
      });
      document.getElementById(sec).hidden = false;
    });
  };
  strip(DJ.favs(), "my-strip", "my-strip-list");
  strip(DJ.recent().map(r => r.s), "recent-strip", "recent-strip-list");
  const clr = document.getElementById("recent-clear");
  if (clr) clr.addEventListener("click", () => { DJ.save("recent", []); document.getElementById("recent-strip").hidden = true; dispatchEvent(new Event("dj:recent")); });
  // ---------- 오늘의 카드: 하루 한 번 뒤집어 보는 카드 세 장 ----------
  // 아직 모으지 않은 단지 위주로 이 기기에서 그날 한 번 정해 두고(새로 고쳐도 같음), 연 카드는 카드첩에 모입니다.
  // 한 장은 S·A 카드, 한 장은 요즘 신고가 단지, 한 장은 아무 단지 (자리는 섞음). 단지 자료는 이 칸이 보일 때 받습니다.
  const todaySec = document.getElementById("today");
  if (todaySec) DJ.onView([todaySec], () => DJ.data().then(d => todayCards(d, todaySec)), { rootMargin: "300px" });

  function seeded(seed) {   // 날짜·기기마다 정해지는 난수 (같은 날 같은 기기면 같은 카드)
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => {
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickToday(all, album, rand) {
    const fresh = all.filter(c => !album[c.s]);
    const pool = fresh.length >= 3 ? fresh : all;   // 다 모았으면 모은 카드에서 다시
    const out = [];
    const take = arr => {
      const left = arr.filter(c => !out.includes(c));
      if (left.length) out.push(left[Math.floor(rand() * left.length)]);
    };
    const S = pool.filter(c => c.g === "S"), A = pool.filter(c => c.g === "A");
    take(S.length && (rand() < 0.3 || !A.length) ? S : A);
    take(pool.filter(c => c.h));
    while (out.length < 3 && out.length < pool.length) take(pool);
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function todayCards(d, sec) {
    const all = d.complexes.filter(c => c.g && c.g !== "-");
    if (all.length < 3) { sec.hidden = true; return; }
    const key = "today-" + DJ.sido(all[0].s);   // 지역마다 따로 (같은 주소 아래 대전·세종·서울)
    const day = DJ.today();
    let st = DJ.load(key, null);
    if (!st || st.d !== day || !Array.isArray(st.s) || st.s.length !== 3 || !st.s.every(s => d.bySlug[s])) {
      let seed = DJ.load("seed", null);
      if (!seed) { seed = String(Math.random()).slice(2, 10); DJ.save("seed", seed); }
      st = { d: day, s: pickToday(all, DJ.album(), seeded(day + seed + key)).map(c => c.s), n: [null, null, null] };
      DJ.save(key, st);
    }
    const row = sec.querySelector("[data-today-row]");
    const count = sec.querySelector("[data-album-count]");
    const done = sec.querySelector("[data-today-done]");
    const paint = () => {
      count.textContent = `${DJ.albumCount(all).toLocaleString()} / ${all.length.toLocaleString()}장`;
      done.hidden = !st.n.every(v => v !== null);
    };
    row.replaceChildren();
    st.s.forEach((s, i) => {
      const c = d.bySlug[s];
      const slot = el("div", "tc g-" + c.g);
      const inner = el("div", "tc-in");
      const back = el("button", "tc-back");
      back.type = "button";
      back.setAttribute("aria-label", `오늘의 카드 ${i + 1}번째 열기`);
      const mark = el("span", "tc-mark");   // 사이트 표시(건물 막대 셋)
      mark.setAttribute("aria-hidden", "true");
      mark.append(el("i"), el("i"), el("i"));
      back.append(mark, el("span", "tc-hint", "눌러서 열기"));
      const front = el("div", "tc-front");
      const card = DJ.miniCard(c);
      const tag = el("span", "tc-tag");
      front.append(card, tag);
      inner.append(back, front);
      slot.append(inner);
      row.append(slot);
      const show = () => {
        const n = st.n[i];
        tag.textContent = n ? `새 카드 · ${n.toLocaleString()}장째` : "이미 모은 카드";
        tag.classList.toggle("new", !!n);
        slot.classList.add("open");
        back.inert = true;   // 뒤집힌 뒷면은 화면엔 남지만(돌아가는 동안) 누르거나 읽히지 않게
        back.setAttribute("aria-hidden", "true");
        front.inert = false;
        front.removeAttribute("aria-hidden");
      };
      if (st.n[i] !== null) { show(); return; }
      front.inert = true;
      front.setAttribute("aria-hidden", "true");
      back.addEventListener("click", e => {
        st.n[i] = DJ.collect(c.s);
        DJ.save(key, st);
        if (!DJ.calm) {
          slot.classList.add("flip");
          if (c.g === "S" || c.g === "A") slot.classList.add("shine");
        }
        show();
        paint();
        if (e.detail === 0) card.focus();   // 키보드로 열었으면 연 카드로
      });
    });
    paint();
  }

  // 첫 화면 카드 덱: 휴대폰에선 세 장 모두 넘겨 보고 누를 수 있게, 넓은 화면에선 뒤 카드는 장식
  const mq = matchMedia("(max-width: 900px)");
  const deck = () => document.querySelectorAll("[data-deck-back]").forEach(a => {
    if (mq.matches) { a.removeAttribute("aria-hidden"); a.removeAttribute("tabindex"); }
    else { a.setAttribute("aria-hidden", "true"); a.setAttribute("tabindex", "-1"); }
  });
  deck();
  if (mq.addEventListener) mq.addEventListener("change", deck);
  // 주목할 단지 탭 (화살표 키로도)
  const tabs = Array.from(document.querySelectorAll(".top-tabs [role=tab]"));
  const pick = t => tabs.forEach(b => {
    const on = b === t;
    b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
    document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
  });
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => pick(b));
    b.addEventListener("keydown", e => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const n = tabs[(i + step + tabs.length) % tabs.length];
      pick(n); n.focus();
    });
  });
  document.querySelectorAll("[data-gu-jump]").forEach(a => a.addEventListener("click", e => {
    if (!DJ.showArea) return;
    e.preventDefault();
    DJ.showArea(a.dataset.guJump);
  }));
  document.querySelectorAll(".gu-tabs .chip").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".gu-tabs .chip").forEach(b => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    document.querySelectorAll(".gu-board").forEach(bd => { bd.hidden = bd.dataset.board !== btn.dataset.board; });
  }));
  // 입지 대비 가격이 좋은 단지: 전체/아파트/빌라 필터, 10개씩 더 보기
  const vlist = document.getElementById("value-list");
  if (vlist) {
    const items = Array.from(vlist.children);
    const more = document.getElementById("value-more");
    let vtype = "apt", vlimit = 10;
    const draw = () => {
      let n = 0;
      items.forEach(li => {
        const ok = !vtype || li.dataset.type === vtype;
        if (ok) n++;
        li.hidden = !ok || n > vlimit;
        const rank = li.querySelector(".vl-rank");
        if (ok) { rank.textContent = n; rank.classList.toggle("top", n <= 3); }
      });
      more.hidden = n <= vlimit;
      document.getElementById("value-empty").hidden = n > 0;
      more.textContent = `${Math.min(10, n - vlimit)}곳 더 보기`;
    };
    document.querySelectorAll("#value-type .chip").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#value-type .chip").forEach(b => { b.classList.toggle("active", b === btn); b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      vtype = btn.dataset.type; vlimit = 10; draw();
    }));
    more.addEventListener("click", () => { vlimit += 10; draw(); });
    draw();
  }
})();
