// 지역 소개 '빠른 설정'(시안 3·4번): 1/2 어떤 집을 찾는지 → 2/2 편의 설정. 폰 소개 화면의 '시작하기'로 열림.
// 저장은 기존 '내 설정'(DJ.setPref)에만. 저장 뒤 다시 읽어 맞을 때만 다음으로 넘어가고, 못 저장하면 화면에 알리고 머무름. 안 고르고 나가도 됨.
(function () {
  "use strict";
  const root = document.querySelector("[data-ob]");
  if (!root || !window.DJ || !DJ.prefs || !DJ.setPref) return;
  const $ = (s, r) => (r || root).querySelector(s), $$ = (s, r) => [...(r || root).querySelectorAll(s)];
  const openers = $$("[data-ob-open]", document);
  const st = { step: 1, region: "", budget: "", py: "", goals: new Set(), sw: { resume: true, collect: true, notify: true } };
  let opener = null;

  function load() {
    const p = DJ.prefs(), w = p.want && typeof p.want === "object" ? p.want : {};
    st.region = p.region || root.dataset.region || "";
    st.budget = w.budget ? String(w.budget) : ""; st.py = w.py ? String(w.py) : "";
    st.goals = new Set(Array.isArray(w.goals) ? w.goals : []);
    st.sw = { resume: p.resume !== false, collect: p.collect !== false, notify: p.dp !== 0 };
  }
  function paint() {
    $$("[data-ob-group]").forEach(g => {
      const k = g.dataset.obGroup;
      $$(".ob-chip", g).forEach(b => {
        const on = k === "goals" ? st.goals.has(b.dataset.v) : st[k] === b.dataset.v;
        b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("on", on);
      });
    });
    $$("[data-ob-sw]").forEach(b => { const on = st.sw[b.dataset.obSw]; b.setAttribute("aria-checked", on ? "true" : "false"); b.classList.toggle("on", on); });
  }
  const pyLabel = v => v === "40" ? "40평대 이상" : v + "평대";
  // 찾기 주소로 이어지는 조건: 예산·평형·(아이 키우기→학군 상위)·(역세권→역 500m). 나머지 목적은 기록만
  function findQuery() {
    const q = new URLSearchParams();
    if (st.budget) q.set("budget", st.budget);
    if (st.py) q.set("py", st.py === "40" ? "40,50" : st.py);
    if (st.goals.has("아이 키우기")) q.set("must", "edu");
    if (st.goals.has("역세권") && root.dataset.stn === "1") q.set("stn", "500");
    return q.toString();
  }
  function summary() {
    const l1 = [st.region, st.budget ? st.budget + "억 이하" : "", st.py ? pyLabel(st.py) : ""].filter(Boolean).join(" · ");
    $("[data-ob-l1]").textContent = l1 || "고른 조건이 없어요";
    $("[data-ob-l2]").textContent = [...st.goals].join(" · ");
    const a = $("[data-ob-find]"), q = findQuery();
    a.hidden = !q; a.href = (window.DJ_ROOT || "") + "finder.html" + (q ? "?" + q : "");
  }
  function go(n) {
    st.step = n;
    $$("[data-ob-step]").forEach(b => { b.hidden = +b.dataset.obStep !== n; });
    const bar = $("[data-ob-bar]"); bar.setAttribute("aria-valuenow", String(n)); $("i", bar).style.width = n * 50 + "%";
    $("[data-ob-count]").textContent = n + "/2";
    $("[data-ob-next]").textContent = n === 1 ? "다음" : "집감 시작하기";
    $("[data-ob-skip]").hidden = n === 1;
    $("[data-ob-err]").hidden = true;
    if (n === 2) summary();
    const h = $("#ob-h" + n); if (h) h.focus({ preventScroll: true });
    root.scrollTop = 0;
  }
  function open(e) {
    opener = e && e.currentTarget || document.activeElement;
    load(); paint(); root.hidden = false; document.documentElement.classList.add("ob-open"); go(1);
  }
  function close() { root.hidden = true; document.documentElement.classList.remove("ob-open"); if (opener && opener.focus) opener.focus(); }
  function home() { location.href = (window.DJ_ROOT || "") + "index.html"; }

  // 저장: 기존 내 설정 키에만 쓰고, 다시 읽어 같은지 확인
  function finish() {
    const dpNow = DJ.prefs().dp, dp = st.sw.notify ? (dpNow === 0 || dpNow == null ? 500 : dpNow) : 0;
    const want = { budget: st.budget ? +st.budget : 0, py: st.py ? +st.py : 0, goals: [...st.goals] };
    DJ.setPref("want", want); DJ.setPref("region", st.region);
    DJ.setPref("resume", st.sw.resume); DJ.setPref("collect", st.sw.collect); DJ.setPref("dp", dp); DJ.setPref("onb", 1);
    const p = DJ.prefs(), w = p.want || {};
    const ok = w.budget === want.budget && w.py === want.py && JSON.stringify(w.goals) === JSON.stringify(want.goals)
      && p.region === st.region && p.resume === st.sw.resume && p.collect === st.sw.collect && p.dp === dp && p.onb === 1;
    if (!ok) { $("[data-ob-err]").hidden = false; return; }
    const pick = $$("[data-ob-group=region] .ob-chip").find(b => b.dataset.v === st.region);
    const url = pick && pick.dataset.url;
    if (st.region !== root.dataset.region && url && /^(https:\/\/www\.jipgam\.kr\/|\/)/.test(url)) location.href = url; else home();
  }

  openers.forEach(b => b.addEventListener("click", open));
  if (/[?&]ob=1(&|$)/.test(location.search) && openers[0]) openers[0].click();   // 홈의 '이어하기'로 오면 바로 빠른 설정
  $$("[data-ob-group]").forEach(g => g.addEventListener("click", e => {
    const b = e.target.closest(".ob-chip"); if (!b) return;
    const k = g.dataset.obGroup, v = b.dataset.v;
    if (k === "goals") { st.goals.has(v) ? st.goals.delete(v) : st.goals.add(v); }
    else st[k] = st[k] === v && k !== "region" ? "" : v;      // 지역은 하나는 늘 고른 상태
    paint();
  }));
  $$("[data-ob-sw]").forEach(b => b.addEventListener("click", () => { st.sw[b.dataset.obSw] = !st.sw[b.dataset.obSw]; paint(); }));
  $("[data-ob-next]").addEventListener("click", () => { st.step === 1 ? go(2) : finish(); });
  $("[data-ob-back]").addEventListener("click", () => { st.step === 2 ? go(1) : close(); });
  $("[data-ob-skip]").addEventListener("click", home);                       // 저장 없이 홈으로
  root.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = $$("button:not([hidden]), a[href]:not([hidden])").filter(x => x.checkVisibility && x.checkVisibility());
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();
