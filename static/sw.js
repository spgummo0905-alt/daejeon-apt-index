// 앱처럼 쓰기(서비스 워커): 현장에서 데이터가 약하거나 끊겨도 본 적 있는 화면과 관심 단지가 열리게.
// - 화면(HTML)은 인터넷 먼저, 안 되면 저장해 둔 것
// - 스타일·스크립트·단지 자료는 저장해 둔 것을 바로 쓰고 뒤에서 새로 받아 둠
// - 관심 단지·임장 코스 단지 화면은 app.js 가 '미리 저장'을 부탁함 (현장 모드를 끊김 없이)
// 빌드할 때 아래 두 값이 바뀝니다 (site.py): 사이트 버전, 이 사이트 안의 다른 지역 폴더(그 지역 워커가 맡음)
const VERSION = "__VERSION__";
const OTHER = __OTHER__;
const CACHE = "djdex-" + VERSION;
const SCOPE = new URL(self.registration.scope).pathname;
const CORE = ["index.html", "my.html", "static/style.css?v=" + VERSION, "static/app.js?v=" + VERSION, "static/field.js?v=" + VERSION,
  "static/charts.js?v=" + VERSION, "static/holo.js?v=" + VERSION, "complexes.json", "static/icons/icon-192.png"];
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>연결 없음</title><body style="font-family:system-ui,sans-serif;padding:40px 24px;line-height:1.6;color:#1b2333">' +
  '<h1 style="font-size:22px">인터넷에 연결되어 있지 않아요</h1><p>한 번 열어 본 화면과 관심 단지는 연결 없이도 열립니다. ' +
  '연결되면 다시 시도해 주세요.</p><p><a href="' + SCOPE + 'my.html">관심 단지로 가기</a></p></body>';

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("djdex-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const mine = url => {
  if (url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return false;
  const rest = url.pathname.slice(SCOPE.length);
  return !OTHER.some(d => rest.startsWith(d + "/"));
};

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!mine(url)) return;   // 카카오·로그인 서버·다른 지역은 건드리지 않음
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit ||
      new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } }))));
    return;
  }
  // 스타일·스크립트·자료·그림: 저장해 둔 것 먼저, 뒤에서 새로
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});

// 관심 단지·코스 단지 화면 미리 저장 (app.js 가 주소 목록을 보냄). 이미 있으면 건너뜀
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type !== "precache" || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(d.urls.slice(0, 40).map(u =>
    c.match(u).then(hit => hit || c.add(u).catch(() => {}))))));
});

// 관심 단지 새 소식 알림 (scripts/push_send.py 가 매일 배포 뒤 보냄). 누르면 그 단지 거래 목록이나 관심 화면 '새 소식'으로
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "관심 단지 새 소식", {
    body: d.body || "", tag: d.tag || "djdex-news", renotify: true,
    icon: SCOPE + "static/icons/icon-192.png", badge: SCOPE + "static/icons/icon-192.png",
    data: { url: new URL(d.url || "my.html#news", self.registration.scope).href },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(url).then(c => (c || open).focus()).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
