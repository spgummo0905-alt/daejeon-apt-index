// 실기기 A/B(SVG vs 3D) 시험 도구. 폰 Chrome 에 USB 로 연결해 같은 시나리오를 돌리고 JSON 으로 저장한다.
// 사용법은 docs/ux-completion/AB-실기기시험절차.md. 결과를 '추정'하지 않는다: 연결 실패하면 아무 값도 만들지 않고 끝낸다.
//   node ab-device.mjs --url https://… 또는 http://PC주소:포트/preview.html --cdp http://127.0.0.1:9222 --label 저사양폰 --runs 5 --out 결과.json
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const A = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, r) => (x.startsWith('--') ? a.concat([[x.slice(2), r[i + 1]]]) : a), []))
const URL_ = A.url, CDP = A.cdp || 'http://127.0.0.1:9222', LABEL = A.label || 'device', RUNS = +(A.runs || 5), OUT = A.out || `ab-${LABEL}.json`
const HASH = '#c=30200-631&d=512&f=8&date=dec&t=750'
if (!URL_) { console.error('--url 이 필요합니다'); process.exit(2) }
const fresh = async u => { await page.goto('about:blank'); await page.goto(u, { waitUntil: 'load' }) }
// 준비 완료 판정: 3D 는 실제로 한 번 그려졌을 때만, SVG 는 건물 도형이 생겼을 때만
const READY = { gl: () => !!(window.__gl && window.__gl.stats().calls > 0), svg: () => !!document.querySelector('#iso g.iso-b') }
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1) : null }
const b = await chromium.connectOverCDP(CDP).catch(e => { console.error('기기에 연결하지 못했습니다(값을 만들지 않음):', e.message); process.exit(3) })
const ctx = b.contexts()[0] || await b.newContext(); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page)
if (A.mobile) await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })   // PC 점검용
await cdp.send('Performance.enable')
if (A['emulate-touch']) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })   // PC 에서 도구 점검할 때만. 실기기는 쓰지 마세요
const info = await page.evaluate(() => ({ ua: navigator.userAgent, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, w: innerWidth, h: innerHeight }))
const metric = async n => ((await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === n) || {}).value
async function tap(x, y) {                      // 진짜 터치 이벤트
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const dongNow = () => page.evaluate(() => { const on = document.querySelector('#dong [aria-pressed="true"]'); return on && on.dataset.dong })
async function run(eng) {
  const t0 = Date.now()
  await fresh(URL_.split('#')[0] + HASH + (eng === 'gl' ? '&e=gl' : ''))
  await page.waitForFunction(READY[eng], null, { timeout: 30000 })
  const ready = Date.now() - t0; await page.waitForTimeout(1500)
  const h0 = await metric('JSHeapUsedSize'), n0 = await metric('Nodes')
  // 프레임 간격: 시간 24칸 + 층 6칸 연속 조작
  const frames = await page.evaluate(async () => {
    const ts = []; let last = performance.now()
    const step = async id => { document.getElementById(id).click(); await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); ts.push(n - last); last = n }
    for (let i = 0; i < 24; i++) await step('tup'); for (let i = 0; i < 3; i++) await step('fup'); for (let i = 0; i < 3; i++) await step('fdn'); return ts })
  // 반응 시간: 버튼을 진짜 터치한 뒤 결과 글이 바뀔 때까지
  const lat = []
  for (let i = 0; i < 8; i++) {
    const pos = await page.evaluate(() => { const r = document.getElementById('tup').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: document.getElementById('state').textContent } })
    const t = Date.now(); await tap(pos.x, pos.y); await page.waitForFunction(s => document.getElementById('state').textContent !== s, pos.s, { timeout: 5000 }).catch(() => {}); lat.push(Date.now() - t)
  }
  // 건물 직접 터치: 화면에 보이고 다른 조작부 뒤에 가려지지 않은 '다른 동' 전부를 중심에서 누른다
  const targets = await page.evaluate(() => {
    const own = [...document.querySelectorAll('#dong [data-dong]')].map(e => e.dataset.dong), out = [], gl = window.__gl, cur = document.querySelector('#dong [aria-pressed="true"]').dataset.dong
    if (gl) { const roles = gl.roles(), r = document.getElementById('glbox').getBoundingClientRect(); for (const id of Object.keys(roles)) { if (id === cur || !own.includes(id)) continue; const q = gl.project(id); if (q && q.ok) out.push({ id, x: r.left + q.x, y: r.top + q.y }) } }
    else document.querySelectorAll('#iso g.iso-b[data-b]').forEach(g => { const id = g.dataset.b; if (id === cur) return; const r = g.getBoundingClientRect(); for (let fy = .2; fy <= .9; fy += .1) for (let fx = .2; fx <= .9; fx += .1) { const x = r.left + r.width * fx, y = r.top + r.height * fy, el = document.elementFromPoint(x, y); if (el && el.closest('g.iso-b') === g) { out.push({ id, x, y }); return } } })
    return out.map(o => Object.assign(o, { covered: !!(document.elementFromPoint(o.x, o.y) || {}).closest && !!document.elementFromPoint(o.x, o.y).closest('button,input,.seg') })) })
  const tapRes = []
  for (const tg of targets) { await fresh(URL_.split('#')[0] + HASH + (eng === 'gl' ? '&e=gl' : '')); await page.waitForFunction(READY[eng], null, { timeout: 30000 }); await page.waitForTimeout(1200)
    await tap(tg.x, tg.y); await page.waitForTimeout(450); tapRes.push({ id: tg.id, covered: tg.covered, ok: (await dongNow()) === tg.id }) }
  const h1 = await metric('JSHeapUsedSize')
  return { ready_ms: ready, heap_MB: +(h1 / 1048576).toFixed(1), heapGrowth_MB: +((h1 - h0) / 1048576).toFixed(1), nodes: n0,
    frame: { n: frames.length, p50: pct(frames, .5), p95: pct(frames, .95), p99: pct(frames, .99), max: +Math.max(...frames).toFixed(1), over33_pct: +(100 * frames.filter(x => x > 33.4).length / frames.length).toFixed(1), over50_pct: +(100 * frames.filter(x => x > 50).length / frames.length).toFixed(1), over100_pct: +(100 * frames.filter(x => x > 100).length / frames.length).toFixed(1) },
    touchLatency_ms: { p50: pct(lat, .5), max: Math.max(...lat) }, buildingTap: { tried: tapRes.length, ok: tapRes.filter(t => t.ok).length, detail: tapRes }, gl: await page.evaluate(() => window.__gl ? window.__gl.stats() : null) }
}
const out = { label: LABEL, when: new Date().toISOString(), url: URL_, device: info, runs: { svg: [], gl: [] } }
for (let i = 0; i < RUNS; i++) for (const eng of ['svg', 'gl']) { try { out.runs[eng].push(await run(eng)); console.log(LABEL, eng, i + 1, '/', RUNS, '완료') } catch (e) { out.runs[eng].push({ error: e.message }); console.log(LABEL, eng, i + 1, '실패:', e.message) } }
// 3D → SVG 전환 시 상태 보존
await fresh(URL_.split('#')[0] + '#c=30200-631&d=503&f=12&date=jun&t=840&e=gl'); await page.waitForFunction(READY.gl, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500)
const snap = () => page.evaluate(() => { const h = new URLSearchParams(location.hash.slice(1)); return { d: h.get('d'), f: h.get('f'), date: h.get('date'), t: h.get('t'), e: h.get('e'), state: document.getElementById('state').textContent } })
const before = await snap(); await page.evaluate(() => document.getElementById('engBtn') && document.getElementById('engBtn').click()); await page.waitForTimeout(900); const after = await snap()
out.stateKeep = { before, after, same: ['d', 'f', 'date', 't'].every(k => before[k] === after[k]) && before.state === after.state, engNow: after.e || 'svg' }
// 글자 확대 125% / 화면 읽기용 글 / 두 손가락
await page.evaluate(() => { document.documentElement.style.fontSize = '125%' }); await page.waitForTimeout(500)
out.fontScale125 = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, timeBarVisible: document.getElementById('vtime').getBoundingClientRect().bottom <= (document.querySelector('.tabbar') ? document.querySelector('.tabbar').getBoundingClientRect().top + 1 : innerHeight) }))
fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('저장:', OUT)
await b.close()
