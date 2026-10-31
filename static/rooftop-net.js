// 함께 있는 옥상: Supabase Realtime(방송·접속자)에 직접 붙는 아주 작은 클라이언트 (Phoenix 채널 규칙).
// - 보내는 것은 위치·자세·이모지 인사·불꽃 한 발뿐이에요. 글은 보내지 않고 서버에 저장하지도 않아요.
// - 받은 값은 믿지 않고 rooftop3d.js 가 범위를 다시 맞춰서 써요. 한 사람이 너무 많이 보내면 무시해요.
(function () {
  const MAX_PER_SEC = 24;
  function connect(opt, h) {
    h = h || {};
    const url = String(opt.url || "").replace(/^http/, "ws").replace(/\/+$/, "") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(opt.key) + "&vsn=1.0.0";
    const topic = "realtime:" + opt.topic, me = opt.me, seen = new Map(), flow = new Map();
    let ws = null, ref = 0, hb = 0, closed = false, joined = false, retry = 0, sendT = 0, pend = null;
    const raw = (t, event, payload) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) })); };
    const send = (event, payload) => raw(topic, event, payload);
    function members(state) {   // presence_state: {키: {metas: [...]}}
      const out = []; Object.keys(state || {}).forEach(k => { const m = (state[k].metas || [])[0] || {}; out.push({ id: m.id || k, n: String(m.n || "이웃").slice(0, 12) }); }); return out;
    }
    function onMsg(m) {
      const ev = m.event, pl = m.payload || {};
      if (ev === "phx_reply" && !joined) {
        if (pl.status === "ok") { joined = true; retry = 0; send("presence", { type: "presence", event: "track", payload: { id: me.id, n: me.n } }); h.status && h.status("연결됨"); }
        else { h.status && h.status("연결 실패"); h.fail && h.fail(pl); }
      } else if (ev === "presence_state") {
        const list = members(pl).filter(x => x.id !== me.id); seen.clear(); list.forEach(x => seen.set(x.id, x)); h.peers && h.peers([...seen.values()]);
      } else if (ev === "presence_diff") {
        Object.keys(pl.joins || {}).forEach(k => { const x = members({ [k]: pl.joins[k] })[0]; if (x && x.id !== me.id) seen.set(x.id, x); });
        Object.keys(pl.leaves || {}).forEach(k => { const x = members({ [k]: pl.leaves[k] })[0]; if (x) { seen.delete(x.id); h.leave && h.leave(x.id); } });
        h.peers && h.peers([...seen.values()]);
      } else if (ev === "broadcast") {
        const b = pl.payload || {}, id = b.id; if (!id || id === me.id || typeof pl.event !== "string") return;
        const now = Date.now(), f = flow.get(id) || { t: now, n: 0 }; if (now - f.t > 1000) { f.t = now; f.n = 0; } if (++f.n > MAX_PER_SEC) { flow.set(id, f); return; } flow.set(id, f);
        h.event && h.event(pl.event, b, id);
      }
    }
    function open() {
      try { ws = new WebSocket(url); } catch (e) { h.status && h.status("연결 실패"); return; }
      ws.onopen = () => { raw(topic, "phx_join", { config: { broadcast: { self: false, ack: false }, presence: { key: me.id }, private: false }, access_token: opt.key }); hb = setInterval(() => raw("phoenix", "heartbeat", {}), 25000); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m && m.topic === topic) onMsg(m); };
      ws.onclose = () => { clearInterval(hb); joined = false; if (!closed) { h.status && h.status("다시 연결하는 중"); setTimeout(open, Math.min(15000, 2000 * ++retry)); } };
      ws.onerror = () => { /* onclose 에서 다시 시도 */ };
    }
    open();
    return {
      send(event, payload) { if (joined) send("broadcast", { type: "broadcast", event, payload: Object.assign({ id: me.id }, payload) }); },
      sendPos(payload) {   // 위치는 초당 5번까지만
        pend = payload; if (sendT) return;
        sendT = setTimeout(() => { sendT = 0; if (pend && joined) send("broadcast", { type: "broadcast", event: "pos", payload: Object.assign({ id: me.id, n: me.n }, pend) }); pend = null; }, 200);
      },
      count() { return seen.size + 1; },
      isOpen() { return joined; },
      leave() { closed = true; clearInterval(hb); clearTimeout(sendT); try { if (ws) ws.close(); } catch (e) { /* 이미 닫힘 */ } },
    };
  }
  window.RoofNet = { connect };
})();
