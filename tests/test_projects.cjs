const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function setup(initial = {}) {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: k => storage[k] ?? null }, setItem: { value: (k, v) => { storage[k] = String(v); } },
    removeItem: { value: k => { delete storage[k]; } },
  });
  for (const [k, v] of Object.entries(initial)) storage.setItem(k, JSON.stringify(v));
  let next = 0;
  const ctx = { localStorage: storage, addEventListener() {}, location: { reload() {} }, crypto: { randomUUID: () => 'p-' + (++next) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(__dirname, '../static/records.js'), 'utf8'), ctx);
  const R = ctx.DJRecords;
  ctx.DJ = { records: R, load: (k, f) => R.get(k, f), save: (k, v) => R.put(k, v), locked: () => !R.current() };
  vm.runInContext(readFileSync(join(__dirname, '../static/project-store.js'), 'utf8'), ctx);
  return { P: ctx.DJProjects, R, ctx, storage };
}
const plain = v => JSON.parse(JSON.stringify(v));
test('projects are separate records and region-specific without moving existing records', () => {
  const b = setup({ 'djdex:favs': ['old'], 'djdex:visit:old': { m: 'keep' }, 'djdex:course': { list: ['old', 'two'] } });
  const before = Object.fromEntries(['favs', 'visit:old', 'course'].map(k => [k, b.storage['djdex:' + k]]));
  const a = b.P.create('신혼집', '역 가까이', '대전'), c = b.P.create('부모님 이사', '', '세종');
  assert.notEqual(a.id, c.id); assert.equal(b.P.list().length, 2); assert.equal(b.P.list('대전').length, 1);
  for (const [k, v] of Object.entries(before)) assert.equal(b.storage['djdex:' + k], v);
});
test('adding and removing membership never changes favorites, visits or another project', () => {
  const b = setup({ 'djdex:favs': ['apt-1'], 'djdex:visit:apt-1': { m: 'original' } });
  let a = b.P.create('A', '', '대전'); const c = b.P.create('B', '', '대전');
  a = b.P.update(a.id, a.region, a.updated, { slugs: ['apt-1', 'apt-2', 'apt-1'] });
  assert.deepEqual(plain(a.slugs), ['apt-1', 'apt-2']); assert.equal(b.P.read(c.id).slugs.length, 0);
  b.P.update(a.id, a.region, a.updated, { slugs: [] });
  assert.deepEqual(plain(b.R.get('favs')), ['apt-1']); assert.equal(b.R.get('visit:apt-1').m, 'original');
});
test('archive and reopen preserve candidate lists and project goals', () => {
  const { P } = setup(); let p = P.create('첫집', '주차', '대전');
  p = P.update(p.id, p.region, p.updated, { slugs: ['apt-1'], archived: true });
  assert.equal(p.archived, true); p = P.update(p.id, p.region, p.updated, { archived: false });
  assert.equal(p.goal, '주차'); assert.deepEqual(plain(p.slugs), ['apt-1']); assert.equal(p.archived, false);
});
test('stale edits and cross-region edits are rejected without overwriting newer content', () => {
  const { P } = setup(), p = P.create('처음', '', '대전');
  P.update(p.id, '대전', p.updated, { name: '다른 탭에서 저장' });
  assert.throws(() => P.update(p.id, '대전', p.updated, { name: '오래된 편집' }), /conflict/);
  assert.throws(() => P.update(p.id, '세종', P.read(p.id).updated, { name: '잘못된 지역' }), /missing/);
  assert.equal(P.read(p.id).name, '다른 탭에서 저장');
});
test('guest and account projects remain isolated during authentication changes', () => {
  const { P, R, storage } = setup(); const guest = P.create('비회원 프로젝트', '', '대전');
  storage.setItem('djdex-auth', JSON.stringify({ user: { id: 'A' } }));
  assert.throws(() => P.update(guest.id, '대전', guest.updated, { name: '전환 중' }));
  R.activate('A'); assert.equal(P.list().length, 0);
  P.create('A의 프로젝트', '', '대전');
  storage.setItem('djdex-auth', JSON.stringify({ user: { id: 'B' } })); R.activate('B'); assert.equal(P.list().length, 0);
  storage.removeItem('djdex-auth'); R.activate(null); assert.equal(P.list()[0].name, '비회원 프로젝트');
});
test('failed persistence leaves original project untouched and does not report success', () => {
  const b = setup(), p = b.P.create('보존', '', '대전'); b.ctx.DJ.save = () => false;
  assert.throws(() => b.P.update(p.id, '대전', p.updated, { name: '저장 실패' }), /save/);
  assert.equal(b.P.read(p.id).name, '보존');
});
test('invalid fields, unsafe slugs and excessive candidate counts are rejected', () => {
  const { P } = setup();
  assert.throws(() => P.create('  ', '', '대전'), /fields/);
  assert.throws(() => P.create('a'.repeat(51), '', '대전'), /fields/);
  const p = P.create('허용', '', '대전');
  for (const slugs of [['../bad'], ['<script>'], Array.from({ length: 101 }, (_, i) => 'a-' + i)])
    assert.throws(() => P.update(p.id, '대전', p.updated, { slugs }), /limit/);
  assert.equal(P.read(p.id).slugs.length, 0);
});
test('unsupported backup records are left untouched rather than silently rewritten', () => {
  const b = setup({ 'djdex:project:future': { version: 2, id: 'future', name: '미래 데이터' }, 'djdex:project:mismatch': { version: 1, id: 'other', name: 'x', region: '대전', slugs: [] } });
  assert.equal(b.P.list().length, 0); assert.equal(b.R.get('project:future').version, 2);
  assert.equal(b.P.read('mismatch'), null);
});
test('project edits preserve identity and cannot change region or creation time', () => {
  const { P } = setup(), p = P.create('A', '', '대전');
  const changed = P.update(p.id, p.region, p.updated, { id: 'other', region: '세종', created: 1, name: 'B' });
  assert.equal(changed.id, p.id); assert.equal(changed.region, p.region); assert.equal(changed.created, p.created);
  assert.ok(changed.updated > p.updated);
});
