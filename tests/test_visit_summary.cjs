const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function load() { const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(join(__dirname, '../static/visit-summary.js'), 'utf8'), ctx); return ctx.DJVisitSummary; }
const log = (slug, date, memo, labels) => ({ slug, date, period: '', memo, checks: labels ? { c: [], x: {}, labels } : null });
test('items checked on any visit count as confirmed; never-checked ones stay open; unvisited candidates are flagged', () => {
  const S = load();
  const r = S.build(['a', 'b', 'c'], [
    log('a', '2026-11-02', '저녁 주차 어려움', [{ label: '주차', on: false }, { label: '소음', on: true }]),
    log('a', '2026-10-30', '', [{ label: '주차', on: true }, { label: '언덕', on: false }]),
    log('b', '2026-11-01', '메모만', null)], { a: '가', b: '나' });
  assert.equal(JSON.stringify([...r[0].done].sort()), JSON.stringify(['소음', '주차'])); assert.equal(JSON.stringify([...r[0].todo]), JSON.stringify(['언덕']));
  assert.equal(r[0].visits, 2); assert.equal(r[0].last, '2026-11-02'); assert.equal(r[0].checked, 2); assert.equal(r[0].total, 3);
  assert.equal(r[1].total, 0); assert.equal(r[1].memos[0].text, '메모만'); assert.equal(r[1].name, '나');
  assert.equal(r[2].visited, false); assert.equal(r[2].visits, 0);
});
test('keeps only the three latest memos and skips empty ones', () => {
  const S = load(), logs = [1, 2, 3, 4, 5].map(i => log('a', '2026-11-0' + (6 - i), i === 2 ? '' : '메모' + i, null));
  const r = S.build(['a'], logs)[0];
  assert.equal(r.memos.length, 3); assert.equal(JSON.stringify(r.memos.map(m => m.text)), JSON.stringify(['메모1', '메모3', '메모4']));
});

test('field-mode note alone counts as visited; its checks merge with dated logs; field memo is flagged', () => {
  const S = load();
  const r = S.build(['a', 'b', 'c'], [log('a', '2026-11-02', '', [{ label: '주차', on: false }])],
    { a: '가' }, {
      a: { d: '2026-11-03', m: '현장 메모', labels: [{ label: '주차', on: true }, { label: '소음', on: false }] },
      b: { d: '2026-11-01', m: '', labels: null },
      c: { d: '', m: '', labels: null } });
  assert.equal(r[0].visits, 1); assert.equal(r[0].last, '2026-11-03'); assert.equal(JSON.stringify([...r[0].done]), JSON.stringify(['주차']));
  assert.equal(JSON.stringify([...r[0].todo]), JSON.stringify(['소음'])); assert.equal(r[0].memos[0].field, true); assert.equal(r[0].memos[0].text, '현장 메모');
  assert.equal(r[1].visited, true); assert.equal(r[1].visits, 0); assert.equal(r[1].field, true); assert.equal(r[1].last, '2026-11-01');
  assert.equal(r[2].visited, false);
});
