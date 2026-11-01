// 접속자 수 API: 지금 사이트를 열어 둔 사람 수 (Supabase Realtime 접속자 목록, 서버·DB 없이)
// 쓰는 법: DJ.online.count() → 숫자, DJ.online.onChange(n => ...) → 바뀔 때마다. [data-online] 요소 안의 <b> 에는 자동으로 채워 줘요.
// 보내는 것은 이 브라우저에서 하루만 쓰는 무작위 번호뿐이고(이름·위치·기록 없음), 탭을 60초 넘게 숨기거나 닫으면 빠져요.
(function () {
  const SB = window.DJ_SB;
  if (!SB || !SB.url || !SB.key || !window.RoofNet) return;
  // 이 브라우저에서 하루 동안만 쓰는 무작위 번호 (날이 바뀌면 새로): 오늘 다녀간 사람 수를 세는 데만 써요
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let id; try { const o = JSON.parse(localStorage.getItem("djdex:oid") || "null"); id = o && o.d === day ? o.id : Math.random().toString(36).slice(2, 10); localStorage.setItem("djdex:oid", JSON.stringify({ d: day, id })); } catch (e) { id = Math.random().toString(36).slice(2, 10); }
  let conn = null, n = 1, hideT = 0; const subs = [];
  const set = v => {
    n = v; subs.forEach(f => f(n));
    document.querySelectorAll("[data-online]").forEach(el => { el.hidden = false; const b = el.querySelector("b"); if (b) b.textContent = n.toLocaleString(); });
  };
  const join = () => { if (conn || document.hidden) return; conn = window.RoofNet.connect({ url: SB.url, key: SB.key, topic: "site:online", me: { id, n: "" } }, { peers: l => set(l.length + 1) }); };
  const leave = () => { if (conn) { conn.leave(); conn = null; } };
  document.addEventListener("visibilitychange", () => { clearTimeout(hideT); if (document.hidden) hideT = setTimeout(leave, 60000); else join(); });
  window.addEventListener("pagehide", leave);
  setTimeout(join, 2500);   // 화면이 먼저 뜬 뒤에 붙어요
  const DJ = (window.DJ = window.DJ || {});
  // 오늘 다녀간 사람: 어느 화면이든 사이트를 열면 하루 하나의 번호를 기록 보관함에 알리고 오늘 수를 받아요 ('지금'과 같은 기준: 사이트 전체)
  let today = 0; const tsubs = [];
  const ping = () => { if (!(DJ.sb && DJ.sb.call)) return; DJ.sb.call("/rest/v1/rpc/roof_visit", { method: "POST", body: { vid: id } })
    .then(v => { if (+v > 0) { today = +v; tsubs.forEach(f => f(today)); } }).catch(() => { /* 보관함이 없으면 '오늘'은 숨김 */ }); };
  setTimeout(ping, 3000); setInterval(ping, 5 * 60e3);
  DJ.online = { count: () => n, onChange: f => { subs.push(f); f(n); }, vid: () => id, today: () => today, onToday: f => { tsubs.push(f); if (today) f(today); } };
})();
