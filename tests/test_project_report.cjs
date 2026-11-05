// 프로젝트 한 장 보고서: 조건·공개 숫자·확인·미확인·메모를 섞지 않고, 없는 값은 만들지 않는다
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ window: {} });
ctx.window = ctx;
vm.runInContext(readFileSync(join(__dirname, '../static/project-report.js'), 'utf8'), ctx);
const R = ctx.DJProjectReport;
const plain = v => JSON.parse(JSON.stringify(v));

const bySlug = {
  a: { s: 'a', n: '가단지', gu: '서구', d: '탄방동', pt: '8.0억', y: 1991, hh: 2600, stn: '탄방역', f: { subway: 350 } },
  b: { s: 'b', n: '나단지', gu: '유성구', d: '봉명동' },                       // 공개 숫자가 하나도 없음
  c: { s: 'c', n: '다단지', gu: '중구', d: '대흥동', p: 52000 },               // pt 없이 p 만 있음
};
const rows = [
  { slug: 'a', name: '가단지', visited: true, visits: 2, last: '2026-11-02', done: ['소음 확인'], todo: ['주차 확인', '언덕 확인'], memos: [{ date: '2026-11-02', period: '낮', text: '엘리베이터 대기 김' }], checked: 1, total: 3 },
  { slug: 'b', name: '나단지', visited: false, visits: 0, last: '', done: [], todo: [], memos: [], checked: 0, total: 0 },
];

test('separates conditions, confirmed, unconfirmed and memos for visited candidates', () => {
  const r = R.build({ project: { name: '내년 이사', goal: '역세권, 예산 8억 이하', slugs: ['a', 'b'] }, rows, bySlug, today: '2026-11-05', region: '대전' });
  assert.equal(r.conditions, '역세권, 예산 8억 이하');
  assert.equal(r.visited.length, 1);
  const a = r.visited[0];
  assert.deepEqual(plain(a.done), ['소음 확인']);
  assert.deepEqual(plain(a.todo), ['주차 확인', '언덕 확인']);
  assert.equal(a.memos[0].text, '엘리베이터 대기 김');
  assert.equal(a.last, '2026-11-02'); assert.equal(a.place, '서구 탄방동');
  assert.deepEqual(plain(r.totals), { candidates: 2, visited: 1, pending: 1, unchecked: 2 });
});

test('candidates without any record go to pending and never get invented checks or memos', () => {
  const r = R.build({ project: { name: 'p', goal: '', slugs: ['a', 'b'] }, rows, bySlug });
  const b = r.pending[0];
  assert.equal(b.name, '나단지');
  assert.ok(!('done' in b) && !('todo' in b) && !('memos' in b), 'pending candidates carry no confirmation fields');
  assert.deepEqual(plain(b.facts), [], 'no public numbers -> no fact lines at all');
});

test('public facts appear only when the value really exists', () => {
  assert.deepEqual(plain(R.facts(bySlug.a)), [['84㎡ 최근 시세', '8.0억'], ['준공', '1991년'], ['세대수', '2,600세대'], ['가까운 역', '탄방역 직선 350m']]);
  assert.deepEqual(plain(R.facts(bySlug.b)), []);
  assert.deepEqual(plain(R.facts(bySlug.c)), [['84㎡ 최근 시세', '5.2억']]);
  assert.deepEqual(plain(R.facts({ pt: '', p: 0, y: 0, hh: -1 })), []);
  assert.deepEqual(plain(R.facts(null)), []);
});

test('empty conditions stay empty (nothing is generated) and unknown slugs are skipped', () => {
  const r = R.build({ project: { name: 'p', goal: '   ', slugs: ['a', 'zzz'] }, rows, bySlug });
  assert.equal(r.conditions, '');
  assert.equal(r.visited.length + r.pending.length, 1, 'a slug with neither data nor record is dropped');
});

test('no judgment words or recommendations are produced', () => {
  const text = JSON.stringify(R.build({ project: { name: 'p', goal: 'g', slugs: ['a', 'b', 'c'] }, rows, bySlug }));
  for (const w of ['추천', '유리', '불리', '명당', '초품아', '수익', '오를', '내릴']) assert.ok(!text.includes(w), w);
  assert.match(R.build({ project: { name: 'p', goal: '', slugs: [] }, rows: [], bySlug }).notice, /판단은 하지 않아요/);
});

test('candidate order follows the project order, not the record order', () => {
  const both = [
    { slug: 'a', name: '가단지', visited: true, visits: 1, last: '2026-11-02', done: [], todo: [], memos: [], checked: 0, total: 0 },
    { slug: 'b', name: '나단지', visited: true, visits: 1, last: '2026-11-03', done: [], todo: [], memos: [], checked: 0, total: 0 },
  ];
  assert.deepEqual(plain(R.build({ project: { name: 'p', goal: '', slugs: ['b', 'a'] }, rows: both, bySlug }).visited.map(x => x.slug)), ['b', 'a']);
  assert.deepEqual(plain(R.build({ project: { name: 'p', goal: '', slugs: ['a', 'b'] }, rows: both, bySlug }).visited.map(x => x.slug)), ['a', 'b']);
});


test('long memos are split for print without losing or adding a single character', () => {
  const C = R.chunks;
  assert.deepEqual(plain(C('')), ['']); assert.deepEqual(plain(C(null)), ['']); assert.deepEqual(plain(C('짧은 메모')), ['짧은 메모']);
  const samples = [
    '엘리베이터 대기가 길었음. 주차장이 거의 찼다. '.repeat(60),
    '아주 긴 메모입니다 '.repeat(200),
    'https://example.com/' + 'abcdefghij'.repeat(120),            // 띄어쓰기 없는 긴 글은 길이로 자른다
    '첫 줄\n' + '둘째 줄 내용 '.repeat(120) + '\n마지막 줄',
    '가'.repeat(1000) + ' ' + '나'.repeat(10),
  ];
  for (const s of samples) {
    const parts = plain(C(s));
    assert.equal(parts.join(''), s, '이어 붙이면 원문과 정확히 같다');
    assert.ok(parts.every(x => x.length > 0 && x.length <= 420), '토막 길이 상한');
    assert.ok(parts.length >= 2);
  }
  assert.ok(plain(C('문장입니다. '.repeat(100)))[0].endsWith('.'), '가능하면 문장 끝(마침표 뒤)에서 자른다');
});
