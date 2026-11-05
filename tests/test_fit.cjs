const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function load() { const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(join(__dirname, '../static/fit.js'), 'utf8'), ctx); return ctx.DJFit; }
const J = o => JSON.parse(JSON.stringify(o));
const apt = { gu: '서구', y: 2019, tp: [[24, 52000, '59'], [34, 98000, '84']], f: { subway: 400, elementary: 300, mart: 900 }, stn: '시청역', i: 70, hh: 1380, pk: 1.0, st: [], hl: [10, 0] };
test('splits conditions into ok / miss / unknown using real values only', () => {
  const F = load(), s = { gus: ['서구'], budget: 6, py: ['20'], age: 'semi', stn: 500, sch: 200, must: ['mart', 'park', 'big', 'academy'] };
  const r = J(F.evaluate(s, apt, 2026));
  assert.equal(r.ok.map(x => x.label).join('|'), '지역 서구|평형 20평대|예산 6억 이하|준신축까지|역 500m 안|대형마트 1km 안|1,000세대 이상');
  assert.equal(r.miss.map(x => x.label).join('|'), '초등학교 200m 안|세대당 주차 1.2대 이상');
  assert.equal(r.skipped.join(','), 'academy');
  assert.equal(r.ok.find(x => x.label.startsWith('예산')).detail, '24평 5.2억');
});
test('missing data is unknown, never a guess; budget looks only at the chosen sizes', () => {
  const F = load(), bare = { gu: '동구', f: {}, tp: [], st: [] };
  const r = J(F.evaluate({ stn: 500, age: 'new', budget: 5, must: ['mart', 'top'] }, bare, 2026));
  assert.equal(r.ok.length, 0); assert.equal(r.miss.length, 0); assert.equal(r.unknown.length, 5);
  const r2 = J(F.evaluate({ budget: 5, py: ['30'] }, apt, 2026));
  assert.equal(r2.miss[0].detail, '34평 9.8억');   // 30평대만 보므로 24평 5.2억이 아닌 34평 기준
});
test('hasConditions is false for empty survey', () => {
  const F = load();
  assert.equal(F.hasConditions({}), false); assert.equal(F.hasConditions({ gus: [], must: [], py: [], budget: 0, age: '' }), false);
  assert.equal(F.hasConditions({ stn: 800 }), true);
});
test('2019 build is outside 신축 (built within 5 years) and shown as a miss with the real year', () => {
  const F = load(), r = J(F.evaluate({ age: 'new' }, apt, 2026));
  assert.equal(r.miss[0].label, '신축'); assert.equal(r.miss[0].detail, '2019년 준공');
});


test('budget line: only with a saved budget and real prices, plain numbers, no judgment words', () => {
  const F = load(), a = { tp: [[24, 52000, '59'], [34, 98000, '84']], p: 98000 };
  assert.equal(F.budgetGap({ budget: 0 }, a), null); assert.equal(F.budgetGap(null, a), null); assert.equal(F.budgetGap({ budget: 6 }, { tp: [], st: [] }), null);
  assert.equal(F.budgetGap({ budget: 6 }, null), null);
  const all = J(F.budgetGap({ budget: 6 }, a));                       // 평형 조건 없음: 전체에서 가장 낮은 24평 5.2억
  assert.equal(all.py, 24); assert.equal(all.diff, -8000); assert.equal(all.several, true);
  assert.equal(F.budgetText(F.budgetGap({ budget: 6 }, a), 6), '가장 낮은 평형 24평 추정 시세 5.2억 · 내 예산 6억보다 8,000만 낮아요');
  const only30 = J(F.budgetGap({ budget: 6, py: ['30'] }, a));         // 30평대만 보면 34평 9.8억
  assert.equal(only30.py, 34); assert.equal(only30.several, false); assert.equal(only30.diff, 38000);
  assert.equal(F.budgetText(F.budgetGap({ budget: 6, py: ['30'] }, a), 6), '34평 추정 시세 9.8억 · 내 예산 6억보다 3.8억 높아요');
  assert.equal(F.budgetText(F.budgetGap({ budget: 9.8, py: ['30'] }, a), 9.8), '34평 추정 시세 9.8억 · 내 예산 9.8억과 같아요');
  assert.equal(F.budgetGap({ budget: 6, py: ['50'] }, a), null);       // 고른 평형의 거래가 없으면 만들지 않음
  const only84 = J(F.budgetGap({ budget: 7 }, { p: 71175 }));         // 평형별 자료가 없으면 84㎡ 환산가
  assert.equal(only84.py, 34); assert.equal(only84.price, 71175);
  for (const w of ['좋', '나쁘', '추천', '유리', '불리', '저렴', '비싸']) assert.ok(!F.budgetText(F.budgetGap({ budget: 6 }, a), 6).includes(w), w);
});
