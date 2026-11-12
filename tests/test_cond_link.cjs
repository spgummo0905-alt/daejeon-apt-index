const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
// findcond.js 의 링크 도우미만 떼어 실제로 돌려 본다(브라우저 없이)
function load() {
  const ctx = { window: {}, document: { getElementById: () => null }, URLSearchParams };
  ctx.window = ctx; ctx.DJ = { load: () => ({}) }; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(__dirname, '../static/findcond.js'), 'utf8'), ctx);
  return ctx.DJ;
}
const J = o => JSON.parse(JSON.stringify(o));
test('round trip: condition -> link query -> condition', () => {
  const DJ = load();
  const q = DJ.condQuery({ budget: 5, py: ['20'], gus: ['서구', '유성구'], age: 'semi', stn: 500, sch: 0, must: ['mart', 'park'] });
  // 쉼표는 그대로, 한글 지역명은 주소용으로 인코딩됨
  assert.equal(q, 'budget=5&py=20&gu=' + encodeURIComponent('서구') + ',' + encodeURIComponent('유성구') + '&age=semi&stn=500&must=mart,park');
  const s = J(DJ.condFromQuery('?' + q));
  assert.deepEqual(s.py, ['20']); assert.equal(s.budget, 5); assert.deepEqual(s.gus, ['서구', '유성구']);
  assert.equal(s.age, 'semi'); assert.equal(s.stn, 500); assert.deepEqual(s.must, ['mart', 'park']);
  assert.equal(s.commute, 'any'); assert.deepEqual(s.works, []);
});
test('unknown values are dropped, empty link gives null, work place never travels', () => {
  const DJ = load();
  assert.equal(DJ.condFromQuery('?s=abc&q=x'), null);
  const s = J(DJ.condFromQuery('?py=20,99&must=mart,hack&age=zzz&budget=-3&stn=abc'));
  assert.deepEqual(s.py, ['20']); assert.deepEqual(s.must, ['mart']); assert.equal(s.age, ''); assert.equal(s.budget, 0); assert.equal(s.stn, 0);
  const q = DJ.condQuery({ budget: 7, works: [{ w: '0', lim: 5 }], here: [36.3, 127.3], commute: 'work' });
  assert.equal(q, 'budget=7');   // 직장·내 위치는 링크에 안 들어감
});
