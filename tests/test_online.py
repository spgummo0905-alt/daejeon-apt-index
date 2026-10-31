"""접속자 수 API: 지금 사이트를 열어 둔 사람 수 (DJ.online)"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCRIPT = r"""
const fs = require("fs"); let inst = null;
global.window = { DJ_SB: { url: "https://abc.supabase.co", key: "K" }, addEventListener() {} };
global.document = { hidden: false, addEventListener() {}, querySelectorAll: () => [] };
global.sessionStorage = { getItem: () => null, setItem() {} };
global.WebSocket = class { constructor() { this.readyState = 1; inst = this; setTimeout(() => this.onopen && this.onopen(), 0); } send() {} close() {} };
global.setTimeout = ((st) => (fn, ms) => st(fn, ms > 1000 ? 5 : ms))(global.setTimeout);   // 2.5초 기다림을 줄여서
eval(fs.readFileSync(process.argv[2], "utf8")); eval(fs.readFileSync(process.argv[3], "utf8"));
const seen = []; window.DJ.online.onChange(n => seen.push(n));
setTimeout(() => {
  const t = "realtime:site:online", rx = (event, payload) => inst.onmessage({ data: JSON.stringify({ topic: t, event, payload }) });
  rx("phx_reply", { status: "ok" });
  rx("presence_state", { a: { metas: [{ id: "a" }] }, b: { metas: [{ id: "b" }] }, me: { metas: [{ id: "x" }] } });
  console.log(seen.join(","), window.DJ.online.count()); process.exit(0);
}, 30);
"""


def test_online_count_api(tmp_path):
    js = tmp_path / "t.js"
    js.write_text(SCRIPT, encoding="utf-8")
    out = subprocess.run(["node", str(js), str(ROOT / "static" / "rooftop-net.js"), str(ROOT / "static" / "online.js")], capture_output=True, text=True, check=True).stdout.strip()
    assert out.endswith(",4") or out.endswith(" 4"), out      # 목록에 3명(나 포함 가능) → 나 + 남 합계


def test_online_wired_into_pages_with_account(tmp_path):
    src = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    assert "static/online.js" in src and "data-online" in src
