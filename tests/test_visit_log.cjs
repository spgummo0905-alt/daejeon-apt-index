const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function setup() {
  const values = {}, storage = {};
  Object.defineProperties(storage, {
    getItem: { value: k => values[k] ?? null },
    setItem: { value: (k, v) => { values[k] = String(v); storage[k] = String(v); } },
    removeItem: { value: k => { delete values[k]; delete storage[k]; } },
  });
  let id = 0;
  const ctx = { localStorage: storage, addEventListener() {}, location: { reload() {} }, crypto: { randomUUID: () => 'id-' + (++id) } }; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(__dirname, '../static/records.js'), 'utf8'), ctx);
  const R = ctx.DJRecords;
  ctx.DJ = { records: R, load: (k, f) => R.get(k, f), save: (k, v) => R.put(k, v), locked: () => !R.current(), today: () => '2026-11-02' };
  for (const file of ['project-store.js', 'visit-log.js']) vm.runInContext(readFileSync(join(__dirname, '../static', file), 'utf8'), ctx);
  return { V: ctx.DJVisitLog, P: ctx.DJProjects, R, ctx, storage };
}
const input = { region: '대전', slug: 'apt-1', date: '2026-11-02', memo: '저녁 주차 확인' };
test('revisits and same-day visits are independent and never overwrite common notes or course', () => {
  const { V, R } = setup(); R.put('visit:apt-1', { m: '원본' }); R.put('course', { list: ['apt-1', 'apt-2'] });
  const a = V.create({ ...input, period: '아침' }), b = V.create({ ...input, period: '밤' });
  assert.notEqual(a.id, b.id); assert.equal(V.list({ slug: 'apt-1' }).length, 2);
  assert.equal(R.get('visit:apt-1').m, '원본'); assert.equal(R.get('course').list.length, 2);
});
test('project and region filters isolate logs; removal and archiving do not remove history', () => {
  const { V, P } = setup(); let p = P.create('첫집', '', '대전'); p = P.update(p.id, '대전', p.updated, { slugs: ['apt-1'] });
  V.create({ ...input, projectId: p.id }); V.create(input); V.create({ ...input, region: '세종' });
  assert.equal(V.list({ projectId: p.id }).length, 1); assert.equal(V.list({ region: '대전' }).length, 2);
  p = P.update(p.id, '대전', p.updated, { slugs: [], archived: true });
  assert.equal(V.list({ projectId: p.id }).length, 1); assert.throws(() => V.create({ ...input, projectId: p.id }), /project/);
});
test('snapshots are detached and omit photo paths, quotes and common memo', () => {
  const { V } = setup(), snapshot = { c: [true], x: { hill: true }, labels: [{ label: '경사', on: true }], p: [['private/photo']], q: [[1]], m: 'common' };
  const v = V.create({ ...input, snapshot }); snapshot.c[0] = false; snapshot.x.hill = false; snapshot.labels[0].label = '바뀜';
  assert.equal(V.read(v.id).checks.c[0], true); assert.equal(V.read(v.id).checks.x.hill, true);
  assert.equal(V.read(v.id).checks.labels[0].label, '경사'); assert.equal(v.checks.p, undefined); assert.equal(v.checks.m, undefined);
});
test('invalid dates including impossible and future dates, blank entries and unsafe identities are rejected', () => {
  const { V } = setup();
  for (const date of ['2026-02-30', '2026-13-01', '2026-11-03', '11/2/2026', '']) assert.throws(() => V.create({ ...input, date }), /fields/);
  assert.throws(() => V.create({ ...input, slug: '../bad' }), /fields/);
  assert.throws(() => V.create({ ...input, memo: 'a'.repeat(2001) }), /fields/);
  assert.throws(() => V.create({ ...input, memo: ' ' }), /empty/);
  assert.equal(V.list().length, 0);
});
test('failed save keeps all previous records intact and never reports success', () => {
  const { V, ctx } = setup(), v = V.create(input); ctx.DJ.save = () => false;
  assert.throws(() => V.create(input), /save/); assert.throws(() => V.remove(v.id, v.created), /save/);
  assert.equal(V.list().length, 1);
});
test('delete writes a minimal synced tombstone and leaves other visits and notes untouched', () => {
  const { V, R } = setup(), a = V.create(input), b = V.create(input); R.put('visit:apt-1', { m: 'original' });
  assert.throws(() => V.remove(a.id, 1), /conflict/); V.remove(a.id, a.created);
  assert.equal(V.read(a.id), null); assert.equal(V.list()[0].id, b.id);
  assert.equal(R.get('visitlog:' + a.id).deleted, true); assert.equal(R.get('visitlog:' + a.id).memo, undefined);
  assert.equal(R.get('visit:apt-1').m, 'original');
});
test('guest and account isolation blocks stale tabs during account switching', () => {
  const { V, R, storage } = setup(), v = V.create(input);
  storage.setItem('djdex-auth', JSON.stringify({ user: { id: 'A' } }));
  assert.throws(() => V.create(input), /save/); R.activate('A'); assert.equal(V.list().length, 0);
  V.create(input); storage.removeItem('djdex-auth'); R.activate(null); assert.equal(V.list()[0].id, v.id);
});
test('malformed and future-version backups do not break history rendering or get rewritten', () => {
  const { V, R } = setup(), v = V.create(input);
  R.put('visitlog:' + v.id, { ...v, checks: { labels: {} } }); assert.equal(V.list().length, 0);
  R.put('visitlog:' + v.id, { ...v, version: 2 }); assert.equal(V.list().length, 0);
  assert.equal(R.get('visitlog:' + v.id).version, 2);
});
test('editing changes only date, period and memo; checks, id and creation time stay; conflicts and bad input are refused', () => {
  const { V } = setup(), v = V.create({ ...input, snapshot: { c: [true], x: {}, labels: [{ label: '경사', on: true }] } });
  const u = V.update(v.id, v.created, { date: '2026-11-01', period: '밤', memo: '  고친 메모  ' });
  assert.equal(u.memo, '고친 메모'); assert.equal(u.date, '2026-11-01'); assert.equal(u.period, '밤');
  assert.equal(u.id, v.id); assert.equal(u.created, v.created); assert.equal(u.checks.c[0], true); assert.equal(V.list({}).length, 1);
  assert.throws(() => V.update(v.id, v.created + 1, { date: '2026-11-01' }), /conflict/);
  assert.throws(() => V.update(v.id, v.created, { date: '2099-01-01' }), /fields/);
  assert.throws(() => V.update(v.id, v.created, { date: '2026-11-01', period: '새벽' }), /fields/);
  const m = V.create({ ...input, memo: '메모만' });
  assert.throws(() => V.update(m.id, m.created, { date: '2026-11-02', memo: '  ' }), /empty/);
  assert.equal(V.read(m.id).memo, '메모만');
  V.remove(v.id, v.created); assert.throws(() => V.update(v.id, v.created, { date: '2026-11-01', memo: 'x' }), /conflict/);
});
