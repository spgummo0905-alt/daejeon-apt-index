const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
// 접속자 수(online.js): 자동 조종 브라우저(navigator.webdriver)는 세지 않고, 보통 브라우저는 그대로 센다
function run(webdriver) {
  const calls = [];
  const ctx = { navigator: { webdriver }, localStorage: { getItem: () => null, setItem() {} }, document: { addEventListener() {}, querySelectorAll: () => [], hidden: false },
    addEventListener() {}, setTimeout: (f) => { calls.push('timer'); return 0; }, setInterval: () => 0, clearTimeout() {}, Math, Date, JSON, console };
  ctx.window = ctx; ctx.DJ_SB = { url: 'https://x.supabase.co', key: 'k' }; ctx.RoofNet = { connect: () => ({ leave() {} }) };
  vm.createContext(ctx); vm.runInContext(readFileSync(join(__dirname, '../static/online.js'), 'utf8'), ctx);
  return { online: !!(ctx.DJ && ctx.DJ.online), timers: calls.length };
}
test('automation browsers are not counted as visitors', () => {
  assert.equal(run(true).online, false);
  assert.equal(run(true).timers, 0);
});
test('normal browsers still join the visitor count', () => {
  assert.equal(run(false).online, true);
  assert.ok(run(false).timers > 0);
  assert.equal(run(undefined).online, true);
});
