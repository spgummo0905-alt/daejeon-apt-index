const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = name => readFileSync(join(__dirname, '../static', name), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));

function storage(initial = {}) {
  const s = {};
  Object.defineProperties(s, {
    getItem: { value(k) { return Object.hasOwn(this, k) ? this[k] : null; } },
    setItem: { value(k, v) { this[k] = String(v); } },
    removeItem: { value(k) { delete this[k]; } },
    key: { value(i) { return Object.keys(this)[i] ?? null; } },
    length: { get() { return Object.keys(this).length; } },
  });
  for (const [k, v] of Object.entries(initial)) s.setItem(k, JSON.stringify(v));
  return s;
}

function browser(localStorage = storage(), server = {}, options = {}) {
  const listeners = {}, requests = [];
  let reloads = 0;
  const ctx = vm.createContext({
    localStorage, sessionStorage: storage(), crypto: webcrypto,
    URLSearchParams, TextEncoder, Uint8Array, setTimeout, clearTimeout,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    location: { origin: 'https://jipgam.test', pathname: '/my.html', search: options.login ? '?code=test-code' : '', hash: '', reload() { reloads++; } },
    history: { replaceState() {} },
    document: {
      readyState: 'loading', body: { dataset: { page: 'my' } },
      documentElement: { classList: { toggle() {} } },
      querySelector() { return null; }, getElementById() { return null; }, querySelectorAll() { return []; },
      addEventListener(name, f) { listeners[name] = f; }, dispatchEvent() {},
    },
    CustomEvent: class {}, confirm: () => true,
    addEventListener(name, f) { listeners[name] = f; },
  });
  ctx.window = ctx;
  ctx.fetch = async (url, opt = {}) => {
    const path = new URL(url).pathname, id = (opt.headers?.Authorization || '').replace('Bearer token-', '');
    const body = opt.body ? JSON.parse(opt.body) : null;
    requests.push({ path, id, body });
    let data = [];
    if (path === '/auth/v1/token') data = { access_token: 'token-' + options.login, refresh_token: 'refresh-' + options.login, expires_in: 3600, user: { id: options.login, user_metadata: { name: options.login } } };
    if (path === '/rest/v1/user_kv') {
      data = server[id] || [];
      if (options.switchAccountOnRead) localStorage.setItem('djdex-auth', JSON.stringify({ user: { id: 'B' }, at: 'token-B', exp: Date.now() / 1000 + 3600 }));
    }
    if (path === '/rest/v1/rpc/my_member') data = { id };
    if (path === '/rest/v1/rpc/sync_put') {
      if (options.failPush) return { ok: false, status: 503, text: async () => 'unavailable' };
      const rows = new Map((server[id] || []).map(r => [r.k, r]));
      for (const item of body.items) rows.set(item.k, { ...item, updated_at: new Date().toISOString() });
      server[id] = [...rows.values()];
    }
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  vm.runInContext(source('records.js'), ctx);
  const R = ctx.DJRecords;
  ctx.DJ = { records: R, LOCAL_ONLY: ['kmap', 'seed', 'watchN'], el() {}, toast() {}, paintFavCount() {} };
  ctx.DJ_SB = { url: 'https://storage.test', key: 'test-public-key' };
  return {
    ctx, R, requests, listeners, get reloads() { return reloads; },
    async start() {
      vm.runInContext(source('sync.js'), ctx);
      await listeners.DOMContentLoaded();
    },
  };
}

test('guest, account A and account B cannot read or write each other’s records', () => {
  const s = storage(), b = browser(s), R = b.R;
  R.put('favs', ['guest']);
  s.setItem('djdex-auth', JSON.stringify({ user: { id: 'A' } })); R.activate('A');
  assert.deepEqual(plain(R.get('favs', [])), []);
  R.put('favs', ['A']);
  s.setItem('djdex-auth', JSON.stringify({ user: { id: 'B' } }));
  assert.equal(R.put('favs', ['stale-A']), false);
  assert.deepEqual(plain(R.get('favs', [])), []);
  b.listeners.storage({ key: 'djdex-auth' }); assert.equal(b.reloads, 1);
  R.activate('B'); R.put('favs', ['B']);
  s.removeItem('djdex-auth'); R.activate(null);
  assert.deepEqual(plain(R.get('favs', [])), ['guest']);
  assert.deepEqual(JSON.parse(s.getItem('djdex@A:favs')), ['A']);
  assert.deepEqual(JSON.parse(s.getItem('djdex@B:favs')), ['B']);
});

test('legacy account records migrate to their owner without becoming guest records', () => {
  const s = storage({ 'djdex-auth': { user: { id: 'A' } }, 'djdex:favs': ['old-A'], 'djdex-t': { favs: 42 }, 'djdex-sync': { uid: 'A', sent: { favs: 42 } } });
  const { R } = browser(s);
  assert.deepEqual(plain(R.get('favs')), ['old-A']);
  assert.equal(R.times().favs, 42); assert.equal(R.meta().uid, 'A');
  assert.equal(s.getItem('djdex:favs'), null);
  s.removeItem('djdex-auth'); R.activate(null);
  assert.deepEqual(plain(R.keys()), []);
});

test('legacy migration preserves the original if storage is full', () => {
  const s = storage({ 'djdex-auth': { user: { id: 'A' } }, 'djdex:favs': ['original'] });
  const failing = new Proxy(s, { get(target, key) { if (key === 'setItem') return () => { throw new Error('quota'); }; return Reflect.get(target, key); } });
  const { R } = browser(failing);
  assert.deepEqual(JSON.parse(s.getItem('djdex:favs')), ['original']);
  assert.equal(R.put('favs', ['replacement']), false);
});

test('logged-out legacy owner is archived and never imported into a different account', () => {
  const s = storage({ 'djdex-sync': { uid: 'A', sent: {} }, 'djdex:visit:private': { m: 'A only' } });
  const { R } = browser(s);
  assert.deepEqual(plain(R.guest()), {});
  assert.equal(JSON.parse(s.getItem('djdex@A:visit:private')).m, 'A only');
});

test('a late migration quota failure does not remove legacy originals', () => {
  const s = storage({ 'djdex-auth': { user: { id: 'A' } }, 'djdex:favs': ['original'], 'djdex-t': { favs: 123 } });
  const failing = new Proxy(s, { get(target, key) {
    if (key === 'setItem') return (k, v) => { if (k === 'djdex-records-v2') throw new Error('quota'); target.setItem(k, v); };
    return Reflect.get(target, key);
  } });
  browser(failing);
  assert.notEqual(s.getItem('djdex:favs'), null);
  const recovered = browser(s);
  assert.deepEqual(plain(recovered.R.get('favs')), ['original']);
  assert.equal(recovered.R.times().favs, 123);
});

test('visit merge preserves both memos, checks, quotes and photos and is idempotent', () => {
  const { R } = browser();
  const a = { m: 'guest memo', c: [true, false], x: { hill: true }, q: [[30, 2, 50000]], p: [['a.jpg', 'A']], d: '2026-11-01' };
  const b = { m: 'account memo', c: [false, true], x: { noise: true }, q: [[30, 3, 51000]], p: [['b.jpg', 'B']], d: '2026-11-02' };
  const merged = R.mergeVisit(a, b);
  assert.ok(merged.m.includes(a.m) && merged.m.includes(b.m));
  assert.deepEqual(plain(merged.c), [true, true]); assert.equal(merged.q.length, 2); assert.equal(merged.p.length, 2);
  assert.equal(merged.d, '2026-11-02'); assert.deepEqual(plain(R.mergeVisit(a, merged)), plain(merged));
});

test('login imports guest notes without losing existing cloud notes, logout isolates them', async () => {
  const s = storage({ 'djdex:favs': ['guest'], 'djdex:visit:one': { m: 'guest note', c: [true], q: [] }, 'djdex-pkce': { v: 'test' } });
  const server = { A: [{ k: 'favs', v: ['cloud'], t: 1, updated_at: '2026-01-01' }, { k: 'visit:one', v: { m: 'cloud note', c: [false, true], q: [] }, t: 1, updated_at: '2026-01-01' }] };
  const b = browser(s, server, { login: 'A' }); await b.start();
  assert.deepEqual(plain(b.R.get('favs')), ['guest', 'cloud']);
  assert.match(b.R.get('visit:one').m, /guest note/); assert.match(b.R.get('visit:one').m, /cloud note/);
  assert.equal(s.getItem('djdex:visit:one'), null);
  assert.ok(server.A.some(r => r.k === 'visit:one' && r.v.m.includes('guest note')));
  await b.ctx.DJ.logout(false);
  assert.equal(b.R.user, null); assert.deepEqual(plain(b.R.get('favs', [])), []);
  assert.match(JSON.parse(s.getItem('djdex@A:visit:one')).m, /cloud note/);
  s.setItem('djdex-pkce', JSON.stringify({ v: 'test' }));
  const other = browser(s, server, { login: 'B' }); await other.start();
  assert.deepEqual(plain(other.R.get('favs', [])), []);
  assert.equal(other.R.get('visit:one', null), null);
  assert.ok(!(server.B || []).some(r => r.k === 'visit:one'));
});

test('failed sync retains guest originals and retries the import after reload', async () => {
  const s = storage({ 'djdex:favs': ['guest'], 'djdex:visit:one': { m: 'must survive' }, 'djdex-pkce': { v: 'test' } });
  const server = {};
  const failing = browser(s, server, { login: 'A', failPush: true }); await failing.start();
  assert.notEqual(s.getItem('djdex:visit:one'), null);
  assert.equal(failing.R.get('_importGuest'), true);
  const retry = browser(s, server); await retry.start();
  assert.equal(s.getItem('djdex:visit:one'), null);
  assert.equal(retry.R.get('_importGuest', false), false);
  assert.ok(server.A.some(r => r.k === 'visit:one' && r.v.m === 'must survive'));
});

test('an account switch during a cloud read cannot upload the previous account to the new one', async () => {
  const s = storage({ 'djdex-records-v2': true, 'djdex-auth': { user: { id: 'A' }, at: 'token-A', exp: Date.now() / 1000 + 3600 }, 'djdex@A:favs': ['private-A'] });
  const b = browser(s, {}, { switchAccountOnRead: true }); await b.start();
  assert.ok(!b.requests.some(r => r.path === '/rest/v1/rpc/sync_put'));
  assert.equal(s.getItem('djdex@B:favs'), null);
  assert.deepEqual(JSON.parse(s.getItem('djdex@A:favs')), ['private-A']);
});
