// 카카오 로그인과 기록 이어 보기 (설정했을 때만 실리는 파일).
// 현장에서 휴대폰으로 적은 호가·메모·체크를 집에서 PC로 이어 정리할 수 있게, 이 기기의 기록(djdex:…)을
// 카카오 계정에 저장하고 다른 기기의 새 기록을 받아 옵니다.
// - 저장소는 Supabase: 로그인 확인과 user_kv 표 (scripts/supabase_setup.sql). 사이트에는 공개용 키만 들어가고,
//   표는 '본인 줄만 읽기' 규칙과 sync_put 함수로만 씁니다.
// - 기록마다 고친 시각(djdex-t, app.js 가 적음)을 견줘 더 새 것을 남깁니다. 이 기기를 처음 이을 때만
//   관심 단지·최근 본 단지처럼 목록인 기록은 두 쪽을 합칩니다.
// - 로그인하지 않으면 지금처럼 이 기기에만 남고, 사이트는 그대로 동작합니다.
(function () {
  const C = window.DJ_SB;
  if (!C || !C.url || !C.key || !window.fetch || !window.crypto || !crypto.subtle) return;
  const { el } = DJ;
  const API = C.url.replace(/\/+$/, "");
  const PFX = "djdex:", STAMP = "djdex-t", AUTH = "djdex-auth", META = "djdex-sync", PKCE = "djdex-pkce";
  const ls = {
    get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 저장 불가 */ } },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* 저장 불가 */ } },
  };
  const a0 = ls.get(AUTH, null);
  const S = DJ.sync = { user: a0 && a0.user, state: a0 ? "saved" : "", at: 0 };

  // ---------- Supabase 부르기 ----------
  async function call(path, opt, token) {
    const o = opt || {}, h = { apikey: C.key };
    if (o.body !== undefined) h["Content-Type"] = "application/json";
    if (token) h.Authorization = "Bearer " + token;
    const r = await fetch(API + path, { method: o.method || "GET", headers: h, keepalive: !!o.keepalive,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
    const txt = await r.text();
    let d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (e) { /* 본문 없음 */ }
    if (!r.ok) {
      const err = new Error((d && (d.error_description || d.msg || d.message || d.error)) || "HTTP " + r.status);
      err.status = r.status;
      throw err;
    }
    return d;
  }
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const https = u => String(u || "").replace(/^http:\/\//, "https://");

  // 로그인 응답을 이 기기에 둡니다 (토큰과 보여 줄 이름·사진만)
  function keep(s) {
    const prev = ls.get(AUTH, null), u = s.user, md = (u && u.user_metadata) || {};
    const a = {
      at: s.access_token, rt: s.refresh_token,
      exp: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user: u ? { id: u.id, name: md.name || md.full_name || md.nickname || md.preferred_username || md.user_name || "카카오 회원",
        img: https(md.avatar_url || md.picture) } : prev && prev.user,
    };
    ls.set(AUTH, a);
    S.user = a.user;
    return a;
  }
  let refreshing = null;
  async function token() {
    const a = ls.get(AUTH, null);
    if (!a) return null;
    if (a.exp * 1000 - Date.now() > 60000) return a.at;
    if (!refreshing) {
      refreshing = call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: a.rt } })
        .then(s => keep(s).at)
        .catch(e => { if (e.status === 400 || e.status === 401) forget(); throw e; })   // 다른 곳에서 로그아웃·탈퇴한 경우
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  function forget() {
    ls.del(AUTH); ls.del(META);
    S.user = null; S.state = "";
    paint();
  }

  // ---------- 기록 고르기 ----------
  function localKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PFX) && !DJ.LOCAL_ONLY.includes(k.slice(PFX.length))) out.push(k.slice(PFX.length));
      }
    } catch (e) { /* 저장소를 못 쓰는 브라우저 */ }
    return out;
  }
  function getLocal(k) {
    try { const v = localStorage.getItem(PFX + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; }
  }
  function putLocal(k, v) {
    try { localStorage.setItem(PFX + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  // 처음 이을 때 두 쪽을 합치는 기록 (나머지는 더 새 쪽)
  const uniq = (arr, by) => { const seen = new Set(); return arr.filter(x => { const k = by ? by(x) : x; if (k == null || seen.has(k)) return false; seen.add(k); return true; }); };
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  const JOIN = {
    favs: [Array.isArray, (a, b) => uniq([...a, ...b]).slice(0, 100)],
    recent: [Array.isArray, (a, b) => uniq([...a, ...b], x => x && x.s).slice(0, 30)],
    searches: [Array.isArray, (a, b) => uniq([...a, ...b], x => x && x.u).slice(0, 12)],
    days: [Array.isArray, (a, b) => uniq([...a, ...b]).sort().slice(-60)],
    acts: [isObj, (a, b) => { const o = Object.assign({}, b); Object.keys(a).forEach(k => { o[k] = Math.max(+a[k] || 0, +b[k] || 0); }); return o; }],
    album: [isObj, (a, b) => Object.assign({}, b, a)],
    badges: [isObj, (a, b) => Object.assign({}, b, a)],
    seen: [isObj, (a, b) => Object.assign({}, b, a)],
    watch: [isObj, (a, b) => Object.assign({}, b, a)],
  };

  // ---------- 보내기·받기 ----------
  // META = {uid: 이은 계정, since: 마지막으로 받은 서버 시각, sent: {기록: 보낸 고친 시각}}
  const meta = () => ls.get(META, null);
  async function fetchAll(since, at) {
    const rows = [];
    for (let i = 0; i < 20; i++) {
      let q = "/rest/v1/user_kv?select=k,v,t,updated_at&order=updated_at.asc&limit=1000";
      if (since) q += "&updated_at=gt." + encodeURIComponent(since);
      const page = await call(q, null, at);
      rows.push(...page);
      if (page.length < 1000) break;
      since = page[page.length - 1].updated_at;
    }
    return rows;
  }
  let pushing = null;
  async function push(keepalive) {
    if (pushing) return pushing.then(() => push(keepalive));
    pushing = (async () => {
      const m = meta(), at = m && await token();
      if (!at) return;
      const t = ls.get(STAMP, {}), items = [];
      localKeys().forEach(k => {
        const tk = t[k] || 1;
        if (m.sent[k] === tk) return;
        const v = getLocal(k);
        if (v !== undefined) items.push({ k, v, t: tk });
      });
      for (let i = 0; i < items.length; i += 100) {
        const part = items.slice(i, i + 100);
        await call("/rest/v1/rpc/sync_put", { method: "POST", body: { items: part }, keepalive }, at);
        const m2 = meta() || m;
        part.forEach(x => { m2.sent[x.k] = x.t; });
        ls.set(META, m2);
      }
      S.at = Date.now();
    })().finally(() => { pushing = null; });
    return pushing;
  }
  // 다른 기기에서 바뀐 기록을 받아 이 기기보다 새 것만 반영. 바뀐 기록 이름을 돌려줌
  async function pull() {
    const m = meta(), at = m && await token();
    if (!at) return [];
    const rows = await fetchAll(m.since, at), t = ls.get(STAMP, {}), changed = [];
    rows.forEach(r => {
      if (r.updated_at > (m.since || "")) m.since = r.updated_at;
      if (DJ.LOCAL_ONLY.includes(r.k) || !((t[r.k] || 0) < r.t || getLocal(r.k) === undefined)) return;
      if (putLocal(r.k, r.v)) { t[r.k] = r.t; m.sent[r.k] = r.t; changed.push(r.k); }
    });
    ls.set(STAMP, t); ls.set(META, m);
    S.at = Date.now();
    return changed;
  }
  // 이 기기를 이 계정에 처음 이을 때: 계정의 기록을 모두 받아 이 기기 기록과 합친 뒤 보냅니다. 이 기기가 바뀌었으면 true
  async function link(user) {
    const at = await token();
    const rows = await fetchAll("", at), t = ls.get(STAMP, {}), m = { uid: user.id, since: "", sent: {} };
    const now = Date.now(), cloud = {};
    let changed = false;
    rows.forEach(r => { cloud[r.k] = r; if (r.updated_at > m.since) m.since = r.updated_at; });
    const keys = uniq([...localKeys(), ...Object.keys(cloud)]).filter(k => !DJ.LOCAL_ONLY.includes(k));
    keys.forEach(k => {
      const r = cloud[k], mine = getLocal(k), tk = t[k] || 1;
      if (!r) { t[k] = tk; return; }                          // 이 기기에만 있음: 보냄
      const j = JOIN[k];
      if (mine !== undefined && j && j[0](mine) && j[0](r.v)) {
        const v = j[1](mine, r.v);
        if (JSON.stringify(v) === JSON.stringify(r.v)) { t[k] = r.t; m.sent[k] = r.t; }
        else { t[k] = Math.max(now, r.t + 1); }               // 합친 것을 보냄
        if (JSON.stringify(v) !== JSON.stringify(mine)) { putLocal(k, v); changed = true; }
      } else if (mine === undefined || r.t >= tk) {
        if (JSON.stringify(mine) !== JSON.stringify(r.v)) { putLocal(k, r.v); changed = true; }
        t[k] = r.t; m.sent[k] = r.t;
      } else {
        t[k] = tk;                                            // 이 기기 것이 더 새것: 보냄
      }
    });
    ls.set(STAMP, t); ls.set(META, m);
    await push();
    return changed;
  }

  // 받아 온 기록이 화면에 바로 보이게: 기록을 모아 보여 주는 화면은 한 번 새로 엽니다
  function applied(changed, hello) {
    if (hello) ss.set("djdex-hello", hello);
    if (DJ.applyPrefs && (changed.includes("prefs") || changed.includes("*"))) DJ.applyPrefs();   // 다른 기기의 면적 단위 등
    const page = document.body.dataset.page;
    const last = +ss.get("djdex-reload") || 0;
    if ((hello || ["my", "cards"].includes(page)) && Date.now() - last > 4000) {   // 연달아 새로 열지는 않게
      ss.set("djdex-reload", String(Date.now()));
      location.reload();
      return;
    }
    if (hello) { ss.del("djdex-hello"); welcome(hello); }
    if (changed.length) DJ.paintFavCount();
  }
  function welcome(name) {
    DJ.toast(`${name}님, 반가워요`, "이제 관심 단지와 임장 기록이 카카오 계정에 저장돼요.");
  }

  // ---------- 로그인·로그아웃·탈퇴 ----------
  DJ.login = async function () {
    const v = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const ch = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
    const back = location.origin + location.pathname + location.search;
    ls.set(PKCE, { v, hash: location.hash || (document.body.dataset.page === "my" ? "#account" : "") });
    location.assign(`${API}/auth/v1/authorize?provider=${encodeURIComponent(C.provider || "kakao")}&redirect_to=${encodeURIComponent(back)}` +
      `&code_challenge=${ch}&code_challenge_method=s256`);
  };
  DJ.logout = async function (wipe) {
    try { await push(); } catch (e) { /* 못 보낸 기록은 이 기기에 남음 */ }
    const a = ls.get(AUTH, null);
    if (a) call("/auth/v1/logout?scope=local", { method: "POST", body: {} }, a.at).catch(() => {});
    forget();
    if (wipe) {
      localKeys().concat(DJ.LOCAL_ONLY).forEach(k => { try { localStorage.removeItem(PFX + k); } catch (e) { /* 무시 */ } });
      ls.del(STAMP);
      DJ.toast("로그아웃했어요", "이 기기의 기록도 지웠어요. 다시 로그인하면 계정에 저장된 기록을 불러와요.");
      setTimeout(() => location.reload(), 900);
      return;
    }
    DJ.toast("로그아웃했어요", "이 기기의 기록은 그대로 남아 있어요.");
  };
  DJ.deleteAccount = async function () {
    if (!confirm("카카오 로그인 연결과 계정에 저장된 기록을 모두 지울까요?\n이 기기에 남은 기록은 지우지 않아요.")) return;
    try {
      await call("/rest/v1/rpc/delete_me", { method: "POST", body: {} }, await token());
      forget();
      DJ.toast("계정을 지웠어요", "계정에 저장된 기록도 모두 지웠어요. 이 기기 기록은 그대로예요.");
    } catch (e) {
      DJ.toast("지우지 못했어요", "잠시 뒤 다시 해 주세요.");
    }
  };

  // ---------- 화면: 위쪽 계정 버튼, 관심 화면 계정 칸, 현장 모드 안내 ----------
  function face(box, u, big) {
    box.replaceChildren();
    if (u && u.img) {
      const img = el("img");
      img.src = u.img; img.alt = ""; img.referrerPolicy = "no-referrer";
      img.width = img.height = big ? 44 : 28;
      img.addEventListener("error", () => { img.replaceWith(el("span", "acct-ini", (u.name || "?").slice(0, 1))); });
      box.append(img);
    } else if (u) box.append(el("span", "acct-ini", (u.name || "?").slice(0, 1)));
  }
  const when = ts => { const d = new Date(ts); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
  function stateText() {
    if (S.state === "busy") return "저장하는 중…";
    if (S.state === "error") return "지금은 저장하지 못했어요. 이 기기에는 남아 있고, 연결되면 다시 저장해요.";
    return S.at ? `카카오 계정에 저장돼요 · 마지막 저장 ${when(S.at)}` : "카카오 계정에 저장돼요";
  }
  function setState(s) { S.state = s; paint(); }
  function paint() {
    const u = S.user;
    document.querySelectorAll("[data-acct]").forEach(b => {
      b.classList.toggle("on", !!u);
      b.setAttribute("aria-label", u ? `${u.name}님 · 기록이 카카오 계정에 저장돼요` : "카카오 로그인 · 기록 이어 보기");
      b.title = u ? `${u.name}님` : "카카오 로그인";
      const ico = b.querySelector(".ic"), fc = b.querySelector("[data-acct-face]");
      if (ico) ico.toggleAttribute("hidden", !!u);
      if (fc) { fc.hidden = !u; face(fc, u, false); }
      b.classList.toggle("err", !!u && S.state === "error");
    });
    const box = document.querySelector("[data-account]");
    if (box) {
      box.querySelector("[data-acct-out]").hidden = !!u;
      box.querySelector("[data-acct-in]").hidden = !u;
      if (u) {
        face(box.querySelector("[data-acct-av]"), u, true);
        box.querySelector("[data-acct-name]").textContent = `${u.name}님의 기록`;
        const st = box.querySelector("[data-acct-state]");
        st.textContent = stateText();
        st.classList.toggle("bad", S.state === "error");
      }
    }
    document.querySelectorAll("[data-sync-note]").forEach(p => {
      p.textContent = u ? "기록은 카카오 계정에 저장돼 다른 기기에서도 이어 볼 수 있어요. 관심 화면의 '임장 노트'와 '임장 코스'에서 다시 볼 수 있어요."
        : "기록은 이 기기의 브라우저에 남아요. 관심 화면에서 카카오로 로그인하면 다른 기기에서도 이어 볼 수 있어요.";
    });
  }
  DJ.paintSync = paint;
  function wire() {
    document.querySelectorAll("[data-login]").forEach(b => b.addEventListener("click", () => {
      b.disabled = true;
      DJ.login().catch(() => { b.disabled = false; DJ.toast("로그인 창을 열지 못했어요", "잠시 뒤 다시 해 주세요."); });
    }));
    document.querySelectorAll("[data-logout]").forEach(b => b.addEventListener("click", () => DJ.logout(false)));
    document.querySelectorAll("[data-logout-wipe]").forEach(b => b.addEventListener("click", () => {
      if (confirm("로그아웃하고 이 기기에 남은 관심 단지·임장 기록을 지울까요?\n계정에 저장된 기록은 그대로예요.")) DJ.logout(true);
    }));
    document.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => DJ.deleteAccount()));
  }

  // ---------- 자동 저장 ----------
  let timer = null;
  DJ.onSave = function () {
    if (!S.user) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(false); }, 1200);
  };
  async function sync(withPull) {
    if (!S.user) return;
    S.state = "busy";
    try {
      await push();
      const ch = withPull ? await pull() : [];
      setState("saved");
      return ch;
    } catch (e) {
      setState(S.user ? "error" : "");
      return [];
    }
  }
  // 화면을 떠날 때 남은 저장을 마저 보냄
  addEventListener("pagehide", () => {
    if (timer) { clearTimeout(timer); timer = null; push(true).catch(() => {}); }
  });
  // 다른 기기에서 바꿨을 수 있으니, 오래 있다 돌아오면 다시 받아 옴
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.user && Date.now() - S.at > 60000)
      sync(true).then(ch => { if (ch && ch.length) applied(ch); });
  });

  // ---------- 시작 ----------
  async function start() {
    wire();
    paint();
    const hello = ss.get("djdex-hello");
    if (hello) { ss.del("djdex-hello"); welcome(hello); }
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const err = [q.get("error"), h.get("error"), q.get("error_description"), h.get("error_description")].filter(Boolean).join(" ");
    const code = q.get("code"), pk = ls.get(PKCE, null);
    // 실패하면 카카오·Supabase 가 알려 준 이유를 함께 보여 줌 (원인을 캡처해 알려 줄 수 있게)
    const why = msg => `잠시 뒤 다시 해 주세요. (이유: ${String(msg || "알 수 없음").slice(0, 140)})`;
    if (err || (pk && code)) {
      ls.del(PKCE);
      ["code", "error", "error_code", "error_description", "state"].forEach(k => q.delete(k));
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + (err || !pk ? "" : pk.hash || location.hash));
      if (err) {
        const no = /access_denied|denied|cancel/i.test(err);   // 카카오 동의 화면에서 취소
        if (no) DJ.toast("로그인을 취소했어요", "언제든 다시 로그인할 수 있어요.");
        else DJ.toast("로그인하지 못했어요", why(err), 12000);
        return;
      }
      try {
        const a = keep(await call("/auth/v1/token?grant_type=pkce", { method: "POST", body: { auth_code: code, code_verifier: pk.v } }));
        setState("busy");
        const changed = await link(a.user);
        setState("saved");
        if (changed) applied([], a.user.name);
        else welcome(a.user.name);
      } catch (e) {
        if (!S.user) DJ.toast("로그인하지 못했어요", why(e.message), 12000);
        else setState("error");
      }
      return;
    }
    if (!S.user) return;
    try {
      const m = meta();
      if (!m || m.uid !== S.user.id) {
        setState("busy");
        const changed = await link(S.user);
        setState("saved");
        if (changed) applied(["*"]);
        return;
      }
    } catch (e) { setState("error"); return; }
    const ch = await sync(true);
    if (ch && ch.length) applied(ch);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
