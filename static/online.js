// 접속자 수 API: 지금 사이트를 열어 둔 사람 수 (Supabase Realtime 접속자 목록, 서버·DB 없이)
// 쓰는 법: DJ.online.count() → 숫자, DJ.online.onChange(n => ...) → 바뀔 때마다. [data-online] 요소 안의 <b> 에는 자동으로 채워 줘요.
// 보내는 것은 이 탭에서만 쓰는 무작위 번호뿐이고(이름·위치·기록 없음), 탭을 60초 넘게 숨기거나 닫으면 빠져요.
(function () {
  const SB = window.DJ_SB;
  if (!SB || !SB.url || !SB.key || !window.RoofNet) return;
  let id; try { id = sessionStorage.getItem("djdex:oid"); if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("djdex:oid", id); } } catch (e) { id = Math.random().toString(36).slice(2, 10); }
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
  DJ.online = { count: () => n, onChange: f => { subs.push(f); f(n); } };
})();
