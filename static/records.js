// 비회원과 계정별 기기 기록을 분리합니다. 인증 토큰은 이 보관함에 넣지 않습니다.
(function () {
  const read = (key, fallback) => { try { const s = localStorage.getItem(key); return s === null ? fallback : JSON.parse(s); } catch (_) { return fallback; } };
  const authId = () => (read("djdex-auth", null) || {}).user?.id || null;
  let user = authId();
  const prefix = id => id ? `djdex@${id}:` : "djdex:";
  const rawKeys = id => { try { const p = prefix(id); return Object.keys(localStorage).filter(k => k.startsWith(p)).map(k => k.slice(p.length)).filter(k => !k.startsWith("_")); } catch (_) { return []; } };
  const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  // 이전 버전의 공용 기록은 소유 계정이 확인될 때에만 그 계정으로 옮깁니다.
  // 복사가 모두 성공한 뒤 원본을 지워 저장 공간 부족 시에도 원본을 보존합니다.
  if (!read("djdex-records-v2", false)) {
    try {
      const owner = user || (read("djdex-sync", null) || {}).uid;
      if (owner) {
        const keys = rawKeys(null);
        keys.forEach(k => { if (localStorage.getItem(prefix(owner) + k) === null) set(prefix(owner) + k, read("djdex:" + k, null)); });
        if (localStorage.getItem(prefix(owner) + "_times") === null) set(prefix(owner) + "_times", read("djdex-t", {}));
        const meta = read("djdex-sync", null);
        if (meta && meta.uid === owner && localStorage.getItem(prefix(owner) + "_sync") === null) set(prefix(owner) + "_sync", meta);
        set("djdex-records-v2", true); // 성공 표시를 남길 공간까지 확보한 뒤에만 원본을 정리
        keys.forEach(k => localStorage.removeItem("djdex:" + k));
        localStorage.removeItem("djdex-t"); localStorage.removeItem("djdex-sync");
      }
      set("djdex-records-v2", true);
    } catch (_) { /* 다음 방문에 다시 시도. 원본을 못 옮긴 동안 쓰기는 막습니다. */ }
  }
  const current = () => authId() === user && read("djdex-records-v2", false);
  const key = name => prefix(user) + name;
  const timesKey = () => user ? key("_times") : "djdex-t";
  const mergeVisit = (a, b) => {
    const unique = arr => [...new Map(arr.map(v => [JSON.stringify(v), v])).values()];
    const ma = a.m || "", mb = b.m || "";
    return Object.assign({}, b, a, {
      c: Array.from({ length: Math.max((a.c || []).length, (b.c || []).length) }, (_, i) => !!((a.c || [])[i] || (b.c || [])[i])),
      x: Object.fromEntries([...new Set([...Object.keys(a.x || {}), ...Object.keys(b.x || {})])].map(k => [k, !!(a.x?.[k] || b.x?.[k])])),
      m: !ma || mb.includes(ma) ? mb : !mb || ma.includes(mb) ? ma : ma + "\n\n— 함께 보관한 메모 —\n" + mb,
      q: unique([...(a.q || []), ...(b.q || [])]),
      p: [...new Map([...(b.p || []), ...(a.p || [])].map(v => [v[0], v])).values()],
      d: [a.d || "", b.d || ""].sort().pop(),
    });
  };
  const R = window.DJRecords = {
    mergeVisit,
    get user() { return user; },
    current,
    activate(id) { user = id || null; },
    key,
    keys() { return current() ? rawKeys(user) : []; },
    get(name, fallback) { return current() ? read(key(name), fallback) : fallback; },
    put(name, value) { if (!current()) return false; try { set(key(name), value); return true; } catch (_) { return false; } },
    remove(name) { if (current()) localStorage.removeItem(key(name)); },
    times() { return current() ? read(timesKey(), {}) : {}; },
    setTimes(value) { if (current()) set(timesKey(), value); },
    meta() { return R.get("_sync", null); },
    setMeta(value) { return R.put("_sync", value); },
    guest() { const data = {}; rawKeys(null).forEach(k => { data[k] = read("djdex:" + k, null); }); return data; },
    clearGuest(snapshot) {
      Object.keys(snapshot).forEach(k => {
        if (JSON.stringify(read("djdex:" + k, null)) === JSON.stringify(snapshot[k])) localStorage.removeItem("djdex:" + k);
      });
    },
  };
  // 다른 탭에서 로그인/로그아웃한 직후, 이전 화면이 다른 계정에 쓰지 않게 먼저 막고 새로 엽니다.
  addEventListener("storage", e => { if (e.key === "djdex-auth" && !current()) location.reload(); });
})();
