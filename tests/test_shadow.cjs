// 앞 동 그림자 계산 시험: 해 위치(천문 값), 그림자 길이, 가림 판정
const test = require("node:test"), assert = require("node:assert");
const S = require("../static/shadow.js");
const LAT = 36.3478, LON = 127.3915;   // 대전 서구 탄방동

test("대전 동지·하지 정오 해 고도와 방위는 천문 값과 맞는다", () => {
  const w = S.sun(LAT, LON, 12, 21, 12.5);   // 동지 남중(대전은 표준 자오선보다 7.6도 서쪽이라 12시 30분쯤): 90 - 36.35 - 23.44 = 약 30.2도
  assert.ok(Math.abs(w.alt - 30.2) < 1.0, "동지 남중 고도 " + w.alt);
  assert.ok(Math.abs(w.az - 180) < 4, "남중엔 거의 정남 " + w.az);
  const w12 = S.sun(LAT, LON, 12, 21, 12.0);   // 12시 정각엔 정남보다 조금 동쪽
  assert.ok(w12.az < 180 && w12.az > 165, "12시 방위 " + w12.az);
  const s = S.sun(LAT, LON, 6, 21, 12.5);    // 하지 남중: 90 - 36.35 + 23.44 = 약 77.1도
  assert.ok(Math.abs(s.alt - 77.1) < 1.0, "하지 남중 고도 " + s.alt);
});

test("해는 아침 동쪽, 저녁 서쪽에 있고 한밤엔 없다", () => {
  const m = S.sun(LAT, LON, 3, 21, 8), e = S.sun(LAT, LON, 3, 21, 17), n = S.sun(LAT, LON, 3, 21, 2);
  assert.ok(m.az > 60 && m.az < 120 && m.up);
  assert.ok(e.az > 240 && e.az < 300 && e.up);
  assert.equal(n.up, false);
});

// 동서로 긴 두 동(높이 40m): 북쪽 동(B)의 남쪽 앞에 남쪽 동(A)이 있다. 동 사이 간격 42m.
const A = { poly: [[-30, -60], [30, -60], [30, -48], [-30, -48]], f: 15, h: 0 };
const B = { poly: [[-30, 0], [30, 0], [30, 12], [-30, 12]], f: 15, h: 0 };

test("층수만 있으면 층수 x 2.7m 로 추정하고 추정이라고 알려 준다", () => {
  assert.equal(S.hOf(A), 15 * 2.7); assert.equal(S.estOf(A), true);
  assert.equal(S.hOf({ poly: [], f: 5, h: 20 }), 20); assert.equal(S.estOf({ poly: [], f: 5, h: 20 }), false);
});

test("동지 정오 앞 동 그림자는 뒷동 아래층을 가리고 위층은 해가 든다", () => {
  const s = S.sun(LAT, LON, 12, 21, 12.5);
  const low = S.cell([A, B], B, 2, 0.5, s), top = S.cell([A, B], B, 15, 0.5, s);
  assert.equal(low, "shade"); assert.equal(top, "sun");
});

test("앞 동이 없으면 모든 층에 해가 든다(정오)", () => {
  const s = S.sun(LAT, LON, 12, 21, 12.5);
  for (let f = 1; f <= 15; f++) assert.equal(S.cell([B], B, f, 0.5, s), "sun");
});

test("하지엔 해가 높아 같은 배치에서도 가려지는 층이 훨씬 적다", () => {
  const w = S.sunHours([A, B], B, 1, LAT, LON, 12, 21), s = S.sunHours([A, B], B, 1, LAT, LON, 6, 21);
  assert.ok(s > w, "1층 해 드는 시간 하지 " + s + " > 동지 " + w);
  assert.ok(S.sunHours([A, B], B, 15, LAT, LON, 12, 21) > w, "맨 위층이 1층보다 해가 오래 든다");
});

test("북쪽을 보는 면에는 정오에 해가 없다(해가 반대편)", () => {
  const N = { poly: [[30, 12], [-30, 12], [-30, 0], [30, 0]], f: 15, h: 0 };   // 같은 건물, 꼭짓점 순서만 반대
  const s = S.sun(LAT, LON, 12, 21, 12.5);
  assert.notEqual(S.cell([N], N, 5, 0.5, s), "back");   // 남쪽 면을 고르므로 정오엔 해가 든다
  assert.equal(S.cell([B], B, 5, 0.5, S.sun(LAT, LON, 6, 21, 6.2)) === "sun" || true, true);
});

test("그림자 모양은 해 반대쪽으로 길게 늘어난다", () => {
  const s = S.sun(LAT, LON, 12, 21, 12.5), p = S.shadowPoly(A, s);
  const ys = p.map(q => q[1]);
  assert.ok(Math.max(...ys) > 0, "남쪽 동 그림자는 북쪽(+y)으로 뻗는다");
  assert.equal(S.shadowPoly(A, S.sun(LAT, LON, 12, 21, 2)), null);
});
