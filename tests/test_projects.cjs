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
// ---- 4-B3 방문 예정일 ----
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const later = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function withToday(b) { b.ctx.DJ.today = today; return b; }
test('existing projects without a planned date read as no date and are not rewritten', () => {
  const old = { version: 1, id: 'old', name: '옛 프로젝트', goal: '역세권', region: '대전', slugs: ['a-1'], archived: false, created: 5, updated: 9 };
  const b = withToday(setup({ 'djdex:project:old': old }));
  const raw = b.storage['djdex:project:old'];
  const p = b.P.read('old'); assert.equal(p.planned, ''); assert.equal(p.name, '옛 프로젝트');
  assert.equal(b.P.list().length, 1); assert.equal(b.storage['djdex:project:old'], raw);       // 읽기만으로는 저장 내용이 바뀌지 않음
  const q = b.P.update('old', '대전', p.updated, { name: '이름만 수정' });                          // 예정일을 건드리지 않는 수정도 정상
  assert.equal(q.planned, ''); assert.equal(plain(q.slugs)[0], 'a-1');
});
test('planned date can be set, changed and cancelled without touching candidates, archive state or other projects', () => {
  const b = withToday(setup()); let p = b.P.create('A', '', '대전'); const other = b.P.create('B', '', '대전');
  p = b.P.update(p.id, p.region, p.updated, { slugs: ['x-1', 'x-2'] });
  p = b.P.update(p.id, p.region, p.updated, { planned: later(3) }); assert.equal(p.planned, later(3)); assert.deepEqual(plain(p.slugs), ['x-1', 'x-2']);
  p = b.P.update(p.id, p.region, p.updated, { planned: later(7) }); assert.equal(p.planned, later(7));        // 변경
  p = b.P.update(p.id, p.region, p.updated, { planned: '' }); assert.equal(p.planned, '');                    // 취소
  assert.equal(b.P.read(other.id).planned, ''); assert.equal(b.P.read(other.id).updated, other.updated);
});
test('planned date survives archive and reopen, and unrelated edits keep it', () => {
  const b = withToday(setup()); let p = b.P.create('A', '', '대전');
  p = b.P.update(p.id, p.region, p.updated, { planned: later(2) });
  p = b.P.update(p.id, p.region, p.updated, { archived: true }); assert.equal(p.planned, later(2));
  p = b.P.update(p.id, p.region, p.updated, { archived: false }); assert.equal(p.planned, later(2));
  p = b.P.update(p.id, p.region, p.updated, { goal: '학교' }); assert.equal(p.planned, later(2));
  p = b.P.update(p.id, p.region, p.updated, { slugs: ['z-1'] }); assert.equal(p.planned, later(2));
});
test('invalid or past planned dates are rejected and the saved project is untouched', () => {
  const b = withToday(setup()), p = b.P.create('A', '', '대전'); const raw = b.storage['djdex:project:' + p.id];
  for (const bad of ['2026-02-30', '내일', '2026/11/10', later(-1), '2026-13-01', 20261110, null])
    assert.throws(() => b.P.update(p.id, '대전', p.updated, { planned: bad }), /fields/);
  assert.equal(b.storage['djdex:project:' + p.id], raw);
  const ok = b.P.update(p.id, '대전', p.updated, { planned: today() }); assert.equal(ok.planned, today());    // 오늘은 가능
});
test('a stored past date stays readable (the visit day has passed) and can be cleared', () => {
  const b = withToday(setup({ 'djdex:project:p': { version: 1, id: 'p', name: '지난 일정', goal: '', region: '대전', slugs: [], archived: false, created: 1, updated: 2, planned: '2020-01-02' } }));
  let p = b.P.read('p'); assert.equal(p.planned, '2020-01-02');
  p = b.P.update('p', '대전', p.updated, { name: '이름 수정' }); assert.equal(p.planned, '2020-01-02');      // 다른 수정이 지난 날짜를 지우지 않음
  p = b.P.update('p', '대전', p.updated, { planned: '' }); assert.equal(p.planned, '');
});
test('a malformed planned value in a backup is read as no date instead of breaking the project', () => {
  const b = withToday(setup({ 'djdex:project:p': { version: 1, id: 'p', name: '깨진 날짜', goal: '', region: '대전', slugs: ['a'], archived: false, created: 1, updated: 2, planned: '곧' } }));
  const p = b.P.read('p'); assert.equal(p.planned, ''); assert.equal(b.P.list().length, 1); assert.deepEqual(plain(p.slugs), ['a']);
});
test('stale planned-date edit from another device is rejected and the newer date is kept', () => {
  const b = withToday(setup()), p = b.P.create('A', '', '대전');
  b.P.update(p.id, '대전', p.updated, { planned: later(5) });                                                // 다른 기기에서 먼저 저장
  assert.throws(() => b.P.update(p.id, '대전', p.updated, { planned: later(9) }), /conflict/);                // 오래된 화면의 저장은 거절
  assert.equal(b.P.read(p.id).planned, later(5));
});
test('failed persistence while setting a planned date leaves the project unchanged', () => {
  const b = withToday(setup()), p = b.P.create('A', '', '대전'); b.ctx.DJ.save = () => false;
  assert.throws(() => b.P.update(p.id, '대전', p.updated, { planned: later(1) }), /save/);
  assert.equal(b.P.read(p.id).planned, '');
});
test('guest and account planned dates stay isolated', () => {
  const b = withToday(setup()); const g = b.P.create('비회원', '', '대전'); b.P.update(g.id, '대전', g.updated, { planned: later(4) });
  b.storage.setItem('djdex-auth', JSON.stringify({ user: { id: 'A' } })); b.R.activate('A');
  assert.equal(b.P.list().length, 0); const a = b.P.create('A', '', '대전'); assert.equal(a.planned, '');
  b.storage.removeItem('djdex-auth'); b.R.activate(null); assert.equal(b.P.list()[0].planned, later(4));
});
test('planned date is plain JSON so account sync, backup restore and the guest-copy path carry it unchanged', () => {
  const b = withToday(setup()); let p = b.P.create('A', '목표', '대전'); p = b.P.update(p.id, '대전', p.updated, { planned: later(6), slugs: ['x-1'] });
  const wire = JSON.parse(JSON.stringify(b.R.get('project:' + p.id)));                           // 계정으로 보내고 받는 것과 같은 JSON 왕복
  assert.equal(wire.planned, later(6)); assert.equal(wire.version, 1);                           // 버전을 올리지 않아 옛 읽기 코드도 프로젝트를 그대로 읽음
  const copy = Object.assign({}, wire, { id: 'copy-1' });                                         // sync.js 의 같은 ID 충돌 사본 만들기와 같은 방식
  const b2 = withToday(setup({ 'djdex:project:copy-1': copy })); assert.equal(b2.P.read('copy-1').planned, later(6));
  const legacy = Object.assign({}, wire); delete legacy.planned;                                  // 예정일 칸이 없는 옛 기기의 저장본
  const b3 = withToday(setup({ 'djdex:project:legacy': Object.assign({}, legacy, { id: 'legacy' }) })); assert.equal(b3.P.read('legacy').planned, '');
});
// ---- 4-C1: 앞으로 더해질 칸을 지우지 않음 + 옛 코드의 한계 기록 ----
test('fields this code does not know yet survive a read-modify-save cycle (so the next added field is not lost like planned was)', () => {
  const b = withToday(setup({ 'djdex:project:f': { version: 1, id: 'f', name: '미래 칸', goal: '', region: '대전', slugs: ['a'], archived: false, created: 1, updated: 2, nextFeature: 'keep-me', flag: true, n: 7 } }));
  const p = b.P.update('f', '대전', 2, { name: '이름만 수정' });
  assert.equal(p.nextFeature, 'keep-me'); assert.equal(p.flag, true); assert.equal(p.n, 7);
  const raw = JSON.parse(b.storage['djdex:project:f']); assert.equal(raw.nextFeature, 'keep-me'); assert.equal(raw.name, '이름만 수정');
});
test('unknown fields cannot override known fields or smuggle objects, long text or script-like keys', () => {
  const b = withToday(setup({ 'djdex:project:g': { version: 1, id: 'g', name: '안전', goal: '', region: '대전', slugs: [], archived: false, created: 1, updated: 2,
    obj: { a: 1 }, arr: [1], long: 'x'.repeat(401), '__proto__x': 1, 'bad-key': 1, 'on click': 1, ok: 'fine' } }));
  const p = b.P.read('g'); assert.equal(p.ok, 'fine');
  for (const k of ['obj', 'arr', 'long', '__proto__x', 'bad-key', 'on click']) assert.equal(Object.hasOwn(p, k), false, k);
  assert.equal(p.version, 1); assert.equal(p.id, 'g'); assert.equal(p.name, '안전');
});
test('KNOWN LIMIT: a tab still running the pre-4-B3 code drops planned when it edits the project (documented, cannot be fixed from new code)', () => {
  // 4-B3 이전 project-store.js 의 clean() 과 같은 동작을 그대로 옮긴 것: planned 를 모르므로 수정 저장 때 지워짐
  const oldClean = v => ({ version: 1, id: v.id, name: v.name.slice(0, 50), goal: String(v.goal || '').slice(0, 200), region: v.region, slugs: v.slugs, archived: !!v.archived, created: Number(v.created) || 0, updated: Number(v.updated) || 0 });
  const saved = { version: 1, id: 'o', name: '새 기기에서 예정일 설정', goal: '', region: '대전', slugs: ['a'], archived: false, created: 1, updated: 5, planned: '2026-11-20' };
  const writtenByOldTab = Object.assign(oldClean(saved), { name: '옛 탭에서 수정', updated: 6 });
  assert.equal(writtenByOldTab.planned, undefined);              // 옛 코드가 쓰면 예정일은 사라짐: 사실로 기록
  const b = withToday(setup({ 'djdex:project:o': writtenByOldTab }));
  assert.equal(b.P.read('o').planned, ''); assert.equal(b.P.read('o').name, '옛 탭에서 수정'); assert.deepEqual(plain(b.P.read('o').slugs), ['a']);   // 프로젝트 자체는 멀쩡히 읽힘
});

