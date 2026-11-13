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
    setItem: { configurable: true, value(k, v) { this[k] = String(v); } },
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
    const body = opt.body && !path.startsWith('/storage/v1/object/photos/') ? JSON.parse(opt.body) : null;   // 사진 올리기는 JSON 이 아니라 파일
    requests.push({ path, id, body });
    let data = [];
    if (path === '/auth/v1/token') data = { access_token: 'token-' + options.login, refresh_token: 'refresh-' + options.login, expires_in: 3600, user: { id: options.login, user_metadata: { name: options.login } } };
    if (path === '/rest/v1/user_kv') {
      if (options.readBarrier) await options.readBarrier;
      data = server[id] || [];
      if (options.switchAccountOnRead) localStorage.setItem('djdex-auth', JSON.stringify({ user: { id: 'B' }, at: 'token-B', exp: Date.now() / 1000 + 3600 }));
    }
    if (path === '/storage/v1/object/photos' && opt.method === 'DELETE') {
      if (options.failPhotoDelete) return { ok: false, status: 500, text: async () => 'storage down' };
      (options.deletedPhotos || []).push(...body.prefixes);
    }
    if (path === '/rest/v1/rpc/delete_me') options.accountDeleted && (options.accountDeleted.n = (options.accountDeleted.n || 0) + 1);
    if (path.startsWith('/storage/v1/object/photos/') && opt.method === 'POST') (options.uploaded || []).push(decodeURIComponent(path.slice('/storage/v1/object/photos/'.length)));
    if (path.startsWith('/storage/v1/object/sign/photos/')) {
      (options.signRequests || []).push(decodeURIComponent(path.slice('/storage/v1/object/sign/photos/'.length)));
      if (options.failSign) return { ok: false, status: 400, text: async () => 'not found', json: async () => ({}) };
      data = { signedURL: '/object/sign/photos/' + path.slice('/storage/v1/object/sign/photos/'.length) + '?token=T' };
    }
    if (path === '/rest/v1/rpc/my_member') data = { id };
    if (path === '/rest/v1/rpc/sync_put') {
      if (options.failPush) return { ok: false, status: 503, text: async () => 'unavailable' };
      const rows = new Map((server[id] || []).map(r => [r.k, r]));
      for (const item of body.items) rows.set(item.k, { ...item, updated_at: new Date().toISOString() });
      server[id] = [...rows.values()];
    }
    return { ok: true, text: async () => JSON.stringify(data), json: async () => data };
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


const authA = () => ({ 'djdex-records-v2': true, 'djdex-auth': { user: { id: 'A' }, at: 'token-A', exp: Date.now() / 1000 + 3600 }, 'djdex@A:_sync': { uid: 'A', since: '', sent: {} } });
const edit = (b, k, v, t) => { b.R.put(k, v); const x = b.R.times(); x[k] = t; b.R.setTimes(x); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const srvRow = (server, k) => (server.A || []).find(r => r.k === k);

test('v6.2 REL-C: two devices editing the same visit memo keep both memos (server and both devices)', async () => {
  const server = {}, s1 = storage(authA()), s2 = storage(authA());
  const d1 = browser(s1, server, { login: 'A' }), d2 = browser(s2, server, { login: 'A' });
  await d1.start(); await d2.start();
  const now = Date.now();
  edit(d1, 'visit:one', { m: '기기1 메모: 층간소음 확인', c: [true], q: [], p: [] }, now + 1000);
  edit(d2, 'visit:one', { m: '기기2 메모: 주차 자리 부족', c: [false, true], q: [], p: [] }, now + 2000);
  await d1.ctx.DJ.syncRetry(); await d2.ctx.DJ.syncRetry();
  const m = srvRow(server, 'visit:one').v.m;
  assert.match(m, /층간소음 확인/); assert.match(m, /주차 자리 부족/);
  assert.match(d2.R.get('visit:one').m, /층간소음 확인/);          // 합친 쪽 기기에도 두 메모
  assert.deepEqual(plain(d2.R.get('visit:one').c), [true, true]);   // 체크는 양쪽 합집합
  // 먼저 보낸 기기도 다음에 받으면 합쳐진 글을 받음
  d1.ctx.document.visibilityState = 'visible'; d1.ctx.DJ.sync.at = 0; d1.listeners.visibilitychange();
  await wait(300);
  assert.match(d1.R.get('visit:one').m, /주차 자리 부족/); assert.match(d1.R.get('visit:one').m, /층간소음 확인/);
});

test('v6.2 REL-C: merging happens only on a real conflict, so a normal edit or deletion never comes back to life', async () => {
  const server = {}, s1 = storage(authA());
  const d1 = browser(s1, server, { login: 'A' }); await d1.start();
  const now = Date.now();
  edit(d1, 'visit:one', { m: '처음 메모', c: [true, true], q: [], p: [['u/a.jpg', '2026-11-13']] }, now + 100);
  await d1.ctx.DJ.syncRetry();
  assert.equal(srvRow(server, 'visit:one').v.m, '처음 메모');
  // 이 기기에서 메모와 사진을 지움 (서버는 이 기기가 마지막으로 본 그대로) -> 충돌이 아니므로 지운 그대로 올라감
  edit(d1, 'visit:one', { m: '', c: [true, false], q: [], p: [] }, now + 5000);
  const before = d1.requests.filter(r => r.path === '/rest/v1/user_kv').length;
  await d1.ctx.DJ.syncRetry();
  assert.ok(d1.requests.filter(r => r.path === '/rest/v1/user_kv').length > before);   // 서버를 확인함
  const v = srvRow(server, 'visit:one').v;
  assert.equal(v.m, ''); assert.deepEqual(plain(v.p), []); assert.deepEqual(plain(v.c), [true, false]);
  assert.equal(d1.R.get('visit:one').m, '');
  assert.deepEqual(plain(d1.R.get('visit:one').p), []);
});

test('v6.2 REL-C: non-visit records and clean records are not touched or requested by the merge check', async () => {
  const server = {}, s1 = storage(authA());
  const d1 = browser(s1, server, { login: 'A' }); await d1.start();
  const reads = () => d1.requests.filter(r => r.path === '/rest/v1/user_kv').length;
  const n0 = reads();   // 시작할 때 한 번 받아오는 읽기는 기존 동작
  edit(d1, 'favs', ['a', 'b'], Date.now() + 10);
  await d1.ctx.DJ.syncRetry();
  assert.deepEqual(plain(srvRow(server, 'favs').v), ['a', 'b']);
  assert.equal(reads(), n0);   // 방문 기록 수정이 없으면 합치기 확인용 서버 읽기가 더 생기지 않음
});

test('v6.2 REL-C: an offline device keeps its record, then resends by itself when the connection returns', async () => {
  const server = {}, opts = { login: 'A', failPush: true }, s1 = storage(authA());
  const d = browser(s1, server, opts); await d.start();
  assert.equal(typeof d.listeners.online, 'function');
  edit(d, 'visit:two', { m: '오프라인 메모', c: [], q: [], p: [] }, Date.now() + 10);
  await d.ctx.DJ.syncRetry();
  assert.equal(d.ctx.DJ.sync.state, 'error');
  assert.equal(JSON.parse(s1.getItem('djdex@A:visit:two')).m, '오프라인 메모');
  assert.ok(!srvRow(server, 'visit:two'));
  opts.failPush = false;
  d.listeners.online(); await wait(100);
  assert.equal(d.ctx.DJ.sync.state, 'saved');
  assert.equal(srvRow(server, 'visit:two').v.m, '오프라인 메모');
});

test('v6.2 REL-C: coming online with nothing pending sends nothing, and a failed resend stays in the error state with the record kept', async () => {
  const server = {}, opts = { login: 'A' }, s1 = storage(authA());
  const d = browser(s1, server, opts); await d.start();
  const n = d.requests.length;
  d.listeners.online(); await wait(60);
  assert.equal(d.requests.length, n);                       // 오류 상태가 아니면 아무것도 하지 않음
  opts.failPush = true;
  edit(d, 'visit:three', { m: '보내기 실패', c: [], q: [], p: [] }, Date.now() + 10);
  await d.ctx.DJ.syncRetry(); assert.equal(d.ctx.DJ.sync.state, 'error');
  d.listeners.online(); await wait(100);
  assert.equal(d.ctx.DJ.sync.state, 'error');               // 또 실패하면 오류 그대로, "다시 시도"가 남음
  assert.equal(JSON.parse(s1.getItem('djdex@A:visit:three')).m, '보내기 실패');
});

test('v6.2 REL-C: another account is never merged into this one', async () => {
  const server = { B: [{ k: 'visit:one', v: { m: 'B의 비밀 메모', c: [], q: [] }, t: 5, updated_at: '2026-01-01' }] };
  const s1 = storage(authA()); const d = browser(s1, server, { login: 'A' }); await d.start();
  edit(d, 'visit:one', { m: 'A의 메모', c: [], q: [], p: [] }, Date.now() + 10);
  await d.ctx.DJ.syncRetry();
  assert.equal(d.R.get('visit:one').m, 'A의 메모');
  assert.ok(!JSON.stringify(server.A || []).includes('B의 비밀'));
});

test('v6.2 REL-C: if the merge check request is rejected for its format, saving still goes through like before', async () => {
  const server = {}, s1 = storage(authA());
  const d = browser(s1, server, { login: 'A' }); await d.start();
  const orig = d.ctx.fetch;
  d.ctx.fetch = async (url, opt = {}) => {
    const u = new URL(url);
    if (u.pathname === '/rest/v1/user_kv' && u.searchParams.get('k')) return { ok: false, status: 400, text: async () => '{"message":"bad filter"}', json: async () => ({}) };
    return orig(url, opt);
  };
  edit(d, 'visit:fmt', { m: '저장은 계속', c: [], q: [], p: [] }, Date.now() + 10);
  await d.ctx.DJ.syncRetry();
  assert.equal(d.ctx.DJ.sync.state, 'saved');
  assert.equal(srvRow(server, 'visit:fmt').v.m, '저장은 계속');
});

test('v6.2 REL-C: a network failure during the merge check keeps the record and shows the error state (not a silent overwrite)', async () => {
  const server = {}, s1 = storage(authA());
  const d = browser(s1, server, { login: 'A' }); await d.start();
  const orig = d.ctx.fetch;
  d.ctx.fetch = async (url, opt = {}) => {
    const u = new URL(url);
    if (u.pathname === '/rest/v1/user_kv' && u.searchParams.get('k')) throw new TypeError('network down');
    return orig(url, opt);
  };
  edit(d, 'visit:net', { m: '연결 끊김', c: [], q: [], p: [] }, Date.now() + 10);
  await d.ctx.DJ.syncRetry();
  assert.equal(d.ctx.DJ.sync.state, 'error');
  assert.ok(!srvRow(server, 'visit:net'));
  assert.equal(JSON.parse(s1.getItem('djdex@A:visit:net')).m, '연결 끊김');
});
