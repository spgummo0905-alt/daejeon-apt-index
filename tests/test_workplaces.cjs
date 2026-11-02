const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');
const src = readFileSync(join(__dirname, '../static/workplaces.js'), 'utf8');
function setup({ address = [], places = [], addressStatus = 'OK', placeStatus = 'OK', sdk = true } = {}) {
  const calls = [], scripts = [];
  const services = { Status: { OK: 'OK', ZERO_RESULT: 'ZERO', ERROR: 'ERROR' },
    Geocoder: class { addressSearch(q, cb) { calls.push(['address', q]); cb(address, addressStatus); } },
    Places: class { keywordSearch(q, cb) { calls.push(['places', q]); cb(places, placeStatus); } },
  };
  const ctx = { document: { body: { dataset: {} }, head: { append: s => scripts.push(s) }, createElement: () => ({ remove() {} }) },
    setTimeout, clearTimeout, Promise, kakao: sdk ? { maps: { services } } : undefined };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return { api: ctx.DJWorkplaces, ctx, services, calls, scripts };
}
const p = { name: '테스트 직장', address: '테스트 도로 1', lat: 36.35, lng: 127.38 };
test('existing preset indexes and current location remain supported', () => {
  const { api } = setup();
  assert.equal(api.resolve({ w: '0', lim: 8 }, [p], null).name, p.name);
  assert.equal(api.resolve({ w: 'here', lim: 5 }, [], [36.3, 127.4]).lat, 36.3);
  for (const w of ['', 'bogus', 'custom', '-1', '1']) assert.equal(api.resolve({ w, lim: 8 }, [p], null), null);
});
test('custom workplaces keep independent coordinates and distance limits', () => {
  const { api } = setup();
  const a = api.resolve({ w: 'custom', p, lim: 3 }, [], null);
  const b = api.resolve({ w: 'custom', p: { ...p, lat: 37.5, name: '두 번째' }, lim: 12 }, [], null);
  assert.equal(a.lat, 36.35); assert.equal(a.lim, 3); assert.equal(b.lat, 37.5); assert.equal(b.lim, 12);
  assert.equal(api.resolve({ w: 'custom', p, lim: 0 }, [], null), null);
});
test('invalid stored coordinates and nonnumeric limits cannot apply a filter', () => {
  const { api } = setup();
  for (const bad of [{ ...p, lat: NaN }, { ...p, lng: null }, { ...p, lat: 0 }, { ...p, name: '' }])
    assert.equal(api.resolve({ w: 'custom', p: bad, lim: 8 }, [], null), null);
  assert.equal(api.resolve({ w: 'custom', p, lim: '8' }, [], null), null);
});
test('no-commute mode ignores saved workplaces and second workplace only applies when enabled', () => {
  const { api } = setup();
  const state = { works: [{ w: 'custom', p, lim: 3 }, { w: '0', lim: 8 }], two: true };
  assert.equal(api.active(state, [p]).length, 2);
  assert.equal(api.active({ ...state, two: false }, [p]).length, 1);
  assert.equal(api.active({ ...state, commute: 'any' }, [p]).length, 0);
  assert.equal(api.active({ works: [] }, [p]).length, 0);
});
test('address and building name searches both return selectable coordinates', async () => {
  const { api, calls } = setup({ address: [{ address_name: '지번 주소', road_address: { building_name: '테스트 빌딩', address_name: '도로명 주소' }, x: '127.38', y: '36.35' }],
    places: [{ place_name: '직장 건물', address_name: '지번 2', road_address_name: '도로 2', x: '127.4', y: '36.3' }] });
  const rows = await api.search('  테스트  ');
  assert.equal(rows.length, 2); assert.equal(rows[0].name, '직장 건물'); assert.equal(rows[1].address, '도로명 주소');
  assert.deepEqual(calls, [['address', '테스트'], ['places', '테스트']]);
});
test('duplicate results, bad coordinates, and excessive results are removed', async () => {
  const row = { place_name: '직장', address_name: '도로 1', x: '127.38', y: '36.35' };
  const { api } = setup({ places: [row, row, { ...row, x: 'bad' }, ...Array.from({ length: 10 }, (_, i) => ({ ...row, x: String(127.4 + i / 100) }))] });
  const rows = await api.search('직장');
  assert.equal(rows.length, 8); assert.ok(rows.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
});
test('no results differs from provider failures; partial useful results survive', async () => {
  assert.equal((await setup({ addressStatus: 'ZERO', placeStatus: 'ZERO' }).api.search('없는주소')).length, 0);
  await assert.rejects(setup({ addressStatus: 'ERROR', placeStatus: 'ZERO' }).api.search('주소'), /search/);
  const partial = setup({ addressStatus: 'ERROR', places: [{ place_name: '직장', x: '127.4', y: '36.3' }] });
  assert.equal((await partial.api.search('직장')).length, 1);
});
test('short queries and unavailable SDK never send a search request', async () => {
  const short = setup(); await assert.rejects(short.api.search('가'), /short/); assert.equal(short.calls.length, 0);
  const offline = setup({ sdk: false }); assert.equal(offline.api.available(), false);
  await assert.rejects(offline.api.search('직장'), /unavailable/); assert.equal(offline.scripts.length, 0);
});
test('SDK loads once on demand and a failed load is retryable', async () => {
  const b = setup({ sdk: false }); b.ctx.document.body.dataset.kakao = 'public-demo-key';
  assert.equal(b.scripts.length, 0);
  const one = b.api.search('직장'), two = b.api.search('주소');
  assert.equal(b.scripts.length, 1); assert.match(b.scripts[0].src, /libraries=services&autoload=false/);
  b.scripts[0].onerror(); await assert.rejects(one, /unavailable/); await assert.rejects(two, /unavailable/);
  const retry = b.api.search('직장'); assert.equal(b.scripts.length, 2);
  b.ctx.kakao = { maps: { services: b.services, load: cb => cb() } };
  b.scripts[1].onload(); assert.equal((await retry).length, 0);
});
