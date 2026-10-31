"""함께 있는 옥상: Realtime 클라이언트(rooftop-net.js)를 가짜 WebSocket 으로 점검"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCRIPT = r"""
const fs = require("fs"); const sent = []; let inst = null;
global.window = {}; global.WebSocket = class { constructor(u) { this.url = u; this.readyState = 1; inst = this; setTimeout(() => this.onopen && this.onopen(), 0); }
  send(m) { sent.push(JSON.parse(m)); } close() { this.readyState = 3; this.onclose && this.onclose(); } };
eval(fs.readFileSync(process.argv[2], "utf8"));
const log = []; const topic = "realtime:roof:t1";
const c = window.RoofNet.connect({ url: "https://abc.supabase.co/", key: "KEY", topic: "roof:t1", me: { id: "me1", n: "나" } },
  { status: t => log.push("status:" + t), peers: l => log.push("peers:" + l.map(x => x.id + "/" + x.n).join(",")), leave: id => log.push("leave:" + id), event: (e, b, id) => log.push("ev:" + e + ":" + id) });
const rx = (event, payload) => inst.onmessage({ data: JSON.stringify({ topic, event, payload }) });
setTimeout(() => {
  const join = sent.find(m => m.event === "phx_join");
  if (!join || join.topic !== topic || join.payload.config.broadcast.self !== false || join.payload.access_token !== "KEY") throw new Error("join");
  if (!/^wss:\/\/abc\.supabase\.co\/realtime\/v1\/websocket\?apikey=KEY&vsn=1\.0\.0$/.test(inst.url)) throw new Error("url " + inst.url);
  rx("phx_reply", { status: "ok" });
  if (!sent.some(m => m.event === "presence" && m.payload.payload.id === "me1")) throw new Error("track");
  rx("presence_state", { me1: { metas: [{ id: "me1", n: "나" }] }, p2: { metas: [{ id: "p2", n: "다정한 구름" }] } });
  rx("presence_diff", { joins: { p3: { metas: [{ id: "p3", n: "포근한 달빛" }] } }, leaves: { p2: { metas: [{ id: "p2" }] } } });
  rx("broadcast", { event: "pos", payload: { id: "p3", x: 1 } });
  rx("broadcast", { event: "pos", payload: { id: "me1", x: 1 } });          // 내가 보낸 건 무시
  for (let i = 0; i < 60; i++) rx("broadcast", { event: "emo", payload: { id: "spam", e: "x" } });   // 너무 많이 보내면 무시
  c.send("emo", { e: "👋" });
  const b = sent.find(m => m.event === "broadcast"); if (!b || b.payload.event !== "emo" || b.payload.payload.id !== "me1") throw new Error("send");
  console.log(log.join("|"), "spam=" + log.filter(x => x === "ev:emo:spam").length, "count=" + c.count());
  c.leave(); process.exit(0);
}, 20);
"""


def test_roof_net_client_flow(tmp_path):
    js = tmp_path / "t.js"
    js.write_text(SCRIPT, encoding="utf-8")
    out = subprocess.run(["node", str(js), str(ROOT / "static" / "rooftop-net.js")], capture_output=True, text=True, check=True).stdout
    assert "status:연결됨" in out and "peers:p2/다정한 구름" in out and "leave:p2" in out
    assert "ev:pos:p3" in out and "ev:pos:me1" not in out and "spam=24" in out and "count=2" in out


def test_roof_page_has_room_ui_and_probe(tmp_path):
    from djdex import cli
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "rooftop.html").read_text(encoding="utf-8")
    assert 'data-roof-modal="room"' in page and "data-roof-emobar" in page and "static/rooftop-net.js" in page
    assert "자유 대화" not in page and "<input" not in page.split('data-roof-modal="room"')[1].split("data-roof-modal=\"wish\"")[0]   # 글 입력칸 없음
    assert (ROOT / "scripts" / "realtime_probe.py").exists() and (ROOT / ".github" / "workflows" / "realtime-probe.yml").exists()
