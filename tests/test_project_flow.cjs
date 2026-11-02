const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const ctx = { URLSearchParams }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync(join(__dirname, '../static/project-flow.js'), 'utf8'), ctx);
const F = ctx.DJProjectFlow;
const complexes = [
  { s: 'apt-a', n: '가람', gu: '서구', d: '둔산동', stn: '시청역', p: 70000, la: 36.3, ln: 127.3 },
  { s: 'apt-b', n: '나래', gu: '유성구', d: '봉명동', p: 90000, la: 36.4, ln: 127.4 },
  { s: 'apt-c', n: '푸른', gu: '서구', d: '둔산동', p: null, la: null, ln: null },
];
const bySlug = Object.fromEntries(complexes.map(c => [c.s, c]));
const slugs = result => Array.from(result, c => c.s);
test('search combines apartment, district, dong and station names without changing candidates', () => {
  assert.deepEqual(slugs(F.search(complexes, { query: '둔산동 시청역', district: '서구' })), ['apt-a']);
  assert.deepEqual(slugs(F.search(complexes, { query: '나래', district: '서구' })), []);
  assert.deepEqual(slugs(F.search(complexes, {})), complexes.map(c => c.s));
  assert.equal(complexes[0].p, 70000);
});
test('84m2 price ceiling is in eok, includes the boundary and excludes unknown prices only when filtered', () => {
  assert.deepEqual(slugs(F.search(complexes, { maxPrice: '7' })), ['apt-a']);
  assert.deepEqual(slugs(F.search(complexes, { maxPrice: '' })), ['apt-a', 'apt-b', 'apt-c']);
  for (const maxPrice of ['NaN', '-1', '0', 'Infinity']) assert.equal(F.search(complexes, { maxPrice }).length, 0);
});
test('panel eligibility deduplicates candidates and rejects incomplete coordinates', () => {
  const s = F.selection(['apt-a', 'apt-a', 'missing', '__proto__', 'constructor', 'apt-b'], bySlug);
  assert.deepEqual(Array.from(s.list), ['apt-a', 'apt-b']); assert.equal(s.compare, true); assert.equal(s.course, true);
  const missing = F.selection(['apt-a', 'apt-c'], bySlug);
  assert.equal(missing.compare, true); assert.equal(missing.course, false);
  assert.equal(F.selection(['apt-a'], bySlug).compare, false);
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['s' + i, { la: 36, ln: 127 }]));
  assert.equal(F.selection(Object.keys(many), many).course, false);
  assert.equal(F.selection(Object.keys(many).slice(0, 5), many).compare, false);
});
test('workspace urls are relative, bounded to known modules, and carry the project context', () => {
  const url = new URL(F.url('field', { slug: 'apt-a', projectId: 'p-1' }), 'https://jipgam.test/daejeon/');
  assert.equal(url.origin, 'https://jipgam.test'); assert.equal(url.pathname, '/daejeon/apt/apt-a.html');
  assert.equal(url.searchParams.get('workspace'), '1'); assert.equal(url.searchParams.get('project'), 'p-1');
  assert.equal(url.searchParams.get('view'), 'field'); assert.equal(url.hash, '#field');
  assert.equal(F.url('https://evil.test'), null); assert.equal(F.url('field', { slug: '../private' }), null);
  const course = new URL(F.url('course', { slugs: ['apt-a', 'apt-b'] }), 'https://jipgam.test/');
  assert.equal(course.searchParams.get('from'), 'project'); assert.equal(course.searchParams.get('c'), 'apt-a,apt-b');
});
test('standalone pages and foreign parent frames cannot activate embed behavior', () => {
  const src = readFileSync(join(__dirname, '../static/workspace-embed.js'), 'utf8');
  for (const [standalone, parentOrigin, optedIn] of [[true, 'https://jipgam.test', true], [false, 'https://foreign.test', true], [false, 'https://jipgam.test', false]]) {
    let touched = false;
    const window = { frameElement: { hasAttribute: () => optedIn } };
    const c = { window, parent: standalone ? window : { location: { origin: parentOrigin } }, URLSearchParams,
      location: { origin: 'https://jipgam.test', search: '?workspace=1' },
      document: { documentElement: { classList: { add() { touched = true; } } } } };
    vm.runInNewContext(src, c); assert.equal(touched, false);
  }
});
