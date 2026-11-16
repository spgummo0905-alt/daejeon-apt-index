const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
// maplabels.js 의 겹침 정리를 브라우저 없이 실제로 돌려 본다
function load() { const ctx = { window: {} }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(join(__dirname, '../static/maplabels.js'), 'utf8'), ctx); return ctx.DJ.pickLabels; }
const P = (k, x, y, pr, o = {}) => Object.assign({ k, x, y, w: 62, h: 34, pr }, o);
const hit = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2;
test('겹치는 가격 핀은 우선순위 높은 것만 크게 둔다', () => {
  const r = load()([P('a', 100, 100, 5), P('b', 110, 105, 9), P('c', 300, 300, 1)]);
  assert.ok(r.pill.has('b') && !r.pill.has('a') && r.pill.has('c'));
});
test('큰 핀끼리는 절대 겹치지 않는다(무작위 200곳)', () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 200 }, (_, i) => P('p' + i, rnd() * 390, 40 + rnd() * 540, rnd() * 100));
  const r = load()(pts), big = pts.filter(p => r.pill.has(p.k));
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) assert.ok(!hit(big[i], big[j]), big[i].k + ' ' + big[j].k);
  assert.ok(big.length >= 10);
});
test('선택한 단지는 늘 큰 핀으로 보인다', () => {
  const r = load()([P('a', 100, 100, 99), P('sel', 105, 100, 0, { keep: true })]);
  assert.ok(r.pill.has('sel') && !r.pill.has('a'));
});
test('가격이 없는 단지는 큰 핀이 되지 않고 점이다', () => {
  const r = load()([P('n', 50, 50, 99, { nopill: true })]);
  assert.ok(!r.pill.has('n') && !r.hide.has('n'));
});
test('큰 핀에 가려지는 점과 바짝 붙은 점은 숨기되 선택한 점은 숨기지 않는다', () => {
  const r = load()([P('big', 100, 100, 9), P('under', 100, 88, 0, { nopill: true }), P('d1', 300, 300, 0, { nopill: true }), P('d2', 303, 300, 0, { nopill: true }), P('sel', 301, 300, 0, { nopill: true, keep: true })]);
  assert.ok(r.hide.has('under') && !r.hide.has('sel'));          // 큰 핀 밑의 점은 숨김, 선택한 점은 보임
  assert.ok(r.hide.has('d1') && r.hide.has('d2'));                // 선택한 점에 바짝 붙은 점은 숨김
  const two = load()([P('d1', 300, 300, 0, { nopill: true }), P('d2', 303, 300, 0, { nopill: true })]);
  assert.equal([...two.hide].length, 1);                          // 선택이 없으면 둘 중 하나만 숨김(둘 다 사라지지 않음)
});
test('같은 입력은 같은 결과(깜빡이지 않음)', () => {
  const pts = Array.from({ length: 50 }, (_, i) => P('p' + i, (i * 37) % 390, 40 + (i * 53) % 500, (i * 13) % 50));
  const f = load(), a = f(pts), b = f(pts);
  assert.deepEqual([...a.pill].sort(), [...b.pill].sort());
});
