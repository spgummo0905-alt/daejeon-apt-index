import test from "node:test";
import assert from "node:assert/strict";
import worker, { tileOf } from "../workers/satellite/index.js";

const call = (qs, headers = {}, env = { VWORLD_KEY: "TESTKEY" }, method = "GET") =>
  worker.fetch(new Request("https://w.example/tile" + qs, { method, headers }), env);
const okHeaders = { Origin: "https://www.jipgam.kr" };

test("좌표를 타일 번호로 바꾼다(대전 둔산 근처, z=17)", () => {
  assert.deepEqual(tileOf(36.3515, 127.377, 17), { x: 111912, y: 51311 });
});

test("허용한 사이트가 아니면 사진을 주지 않는다", async () => {
  for (const h of [{}, { Origin: "https://example.com" }, { Referer: "https://evil.example/x" }]) {
    const r = await call("?lat=36.35&lng=127.38&z=17", h);
    assert.equal(r.status, 403);
  }
});

test("Referer 만 와도 jipgam.kr 이면 통과(이미지 태그 요청)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("IMG", { status: 200, headers: { "Content-Type": "image/jpeg" } });
  try {
    const r = await call("?lat=36.35&lng=127.38&z=17", { Referer: "https://www.jipgam.kr/daejeon/apt/x.html" });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "IMG");
  } finally { globalThis.fetch = realFetch; }
});

test("한국 밖 좌표·너무 큰 확대·잘못된 값은 거절", async () => {
  for (const qs of ["?lat=0&lng=0&z=17", "?lat=36.35&lng=127.38&z=20", "?lat=36.35&lng=127.38&z=3", "?lat=abc&lng=127&z=17"])
    assert.equal((await call(qs, okHeaders)).status, 400, qs);
});

test("키가 없으면 503, 키는 응답 어디에도 나오지 않는다", async () => {
  assert.equal((await call("?lat=36.35&lng=127.38&z=17", okHeaders, {})).status, 503);
  const realFetch = globalThis.fetch; let asked = "";
  globalThis.fetch = async u => { asked = String(u); return new Response("IMG", { status: 200, headers: { "Content-Type": "image/jpeg" } }); };
  try {
    const r = await call("?lat=36.3515&lng=127.377&z=17", okHeaders);
    assert.ok(asked.includes("TESTKEY") && asked.includes("/Satellite/17/51311/111912.jpeg"));
    assert.ok(![...r.headers.values()].join(" ").includes("TESTKEY"));
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://www.jipgam.kr");
    assert.match(r.headers.get("Cache-Control"), /private/);
  } finally { globalThis.fetch = realFetch; }
});

test("POST 는 막고, 지원하지 않는 주소는 404", async () => {
  assert.equal((await call("?lat=36.35&lng=127.38", okHeaders, { VWORLD_KEY: "k" }, "POST")).status, 405);
  const r = await worker.fetch(new Request("https://w.example/other", { headers: okHeaders }), { VWORLD_KEY: "k" });
  assert.equal(r.status, 404);
});

test("옆 타일(dx,dy)은 단지 둘레 2칸까지만", async () => {
  const realFetch = globalThis.fetch; let asked = "";
  globalThis.fetch = async u => { asked = String(u); return new Response("IMG", { status: 200, headers: { "Content-Type": "image/jpeg" } }); };
  try {
    const r = await call("?lat=36.3515&lng=127.377&z=17&dx=1&dy=-1", okHeaders);
    assert.equal(r.status, 200);
    assert.ok(asked.includes("/Satellite/17/51310/111913.jpeg"));
    assert.equal((await call("?lat=36.3515&lng=127.377&z=17&dx=3", okHeaders)).status, 400);
  } finally { globalThis.fetch = realFetch; }
});
