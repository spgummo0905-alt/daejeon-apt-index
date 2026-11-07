// 집감 미리보기(일조) 시제품 계산 시험. 실행: node --test tests/test_preview_sunlight.cjs
// 시제품은 poc/preview/ 안에 격리돼 있다. 여기서는 계산(calc.js)과 분석용 자료(data/*.json)만 본다.
const test = require("node:test"), assert = require("node:assert"), fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const S = require("../static/shadow.js");
const C = require("../poc/preview/calc.js");
const DIR = path.join(__dirname, "..", "poc", "preview");
const IDS = ["30200-631", "36110-203", "36110-421"];
const load = id => JSON.parse(fs.readFileSync(path.join(DIR, "data", id + ".json"), "utf8"));
const LAT = 36.3478, LON = 127.3915;
const WINTER = { year: 2026, month: 12, day: 21 }, SUMMER = { year: 2026, month: 6, day: 21 };

// 가짜가 아니라 '시험용 도형': 동서로 긴 두 동. A 는 B 의 남쪽 앞에 있다(간격 48 m 벽 사이).
function mk(id, y0, f, h, extra) {
  return Object.assign({ id, nm: "시험", dn: id + "동", k: "own", f, h, src: "hub", st: "hub", p: [[-30, y0], [30, y0], [30, y0 + 12], [-30, y0 + 12]] }, extra || {});
}
function ctxOf(blds) {
  return C.prepare({ meta: { complex: { lat: LAT, lon: LON }, floor_h: { value: 3.0 } }, buildings: blds });
}

test("태양 위치: 동지·하지 남중 고도가 천문 값과 맞는다 (기존 shadow.js 재사용)", () => {
  const w = S.sun(LAT, LON, 12, 21, 12.5), s = S.sun(LAT, LON, 6, 21, 12.5);
  assert.ok(Math.abs(w.alt - 30.2) < 1.0, "동지 " + w.alt);
  assert.ok(Math.abs(s.alt - 77.1) < 1.0, "하지 " + s.alt);
  assert.ok(Math.abs(w.az - 180) < 4);
});

test("연도를 넘기면 그 해로 계산하고, 안 넘기면 예전처럼 2026 (기존 호출은 그대로)", () => {
  const a = S.sun(LAT, LON, 3, 21, 10), b = S.sun(LAT, LON, 3, 21, 10, 2026), c = S.sun(LAT, LON, 3, 21, 10, 2028);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(c.alt - a.alt) < 1.0, "윤년이어도 하루 어긋남 정도(1도 안쪽)");
});

test("앞 동이 높으면 뒷 동 아래층이 가려지고, 낮으면 가려지지 않는다", () => {
  const tall = ctxOf([mk("A", -60, 15, 45), mk("B", 0, 15, 45)]);
  const low = ctxOf([mk("A", -60, 1, 3), mk("B", 0, 15, 45)]);
  const sTall = C.summarize(tall, C.run(tall, "B", 2, WINTER)), sLow = C.summarize(low, C.run(low, "B", 2, WINTER));
  assert.ok(sTall.shadeMin > 0, "높은 앞 동은 가림 " + sTall.shadeMin);
  assert.equal(sLow.shadeMin, 0, "낮은 앞 동은 가리지 않음");
  assert.ok(sLow.sunMin > sTall.sunMin);
  assert.equal(sTall.blockers[0].id, "A", "가리는 동이 A 라고 알려 준다");
  assert.equal(sLow.blockers.length, 0);
});

test("같은 앞 동이어도 위층은 덜 가려진다 (관측점 높이 = 층 x 층고)", () => {
  const c = ctxOf([mk("A", -60, 15, 45), mk("B", 0, 15, 45)]);
  const lo = C.summarize(c, C.run(c, "B", 1, WINTER)).sunMin, hi = C.summarize(c, C.run(c, "B", 15, WINTER)).sunMin;
  assert.ok(hi > lo, "15층 " + hi + " > 1층 " + lo);
});

test("앞 동이 없으면 동지에도 가림은 0 이고, 15분 칸이 빠짐없이 네 가지로 나뉜다", () => {
  const c = ctxOf([mk("B", 0, 15, 45)]);
  const w = C.summarize(c, C.run(c, "B", 5, WINTER)), s = C.summarize(c, C.run(c, "B", 5, SUMMER));
  assert.equal(w.shadeMin, 0);
  assert.equal(w.blockers.length, 0);
  assert.ok(w.sunMin > 0 && w.sunMin % 15 === 0);
  assert.ok(s.sunMin > 0 && s.backMin > w.backMin, "하지엔 남향 면 반대편(back)인 시간이 더 길다 " + s.backMin + " > " + w.backMin);
  assert.equal(w.sunMin + w.shadeMin + w.backMin + w.nightMin, (C.END - C.START), "모든 15분 칸이 네 가지 중 하나");
});

test("높이 출처 우선순위: 건축물대장 > 브이월드 > 층수 추정 (build_data.resolve_height)", () => {
  const py = "import sys; sys.path.insert(0, sys.argv[1]); import build_data as b; import json; " +
    "print(json.dumps([b.resolve_height(75.38, 0, 25, 3.0), b.resolve_height(None, 60.5, 20, 3.0), b.resolve_height(None, None, 10, 3.1), b.resolve_height(None, None, 0, 3.1), b.resolve_height(70.0, 60.0, 20, 3.0)]))";
  const r = spawnSync("python3", ["-I", "-c", py, DIR], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepEqual(o[0], [75.38, "hub"]);
  assert.deepEqual(o[1], [60.5, "vworld"]);
  assert.deepEqual(o[2], [31, "est"]);
  assert.deepEqual(o[3], [null, "none"]);
  assert.deepEqual(o[4], [70, "hub"], "둘 다 있으면 건축물대장");
});

test("만들어진 자료도 같은 우선순위를 따르고 모든 건물에 출처가 달려 있다", () => {
  for (const id of IDS) {
    const d = load(id);
    for (const b of d.buildings) {
      assert.ok(["hub", "vworld", "est", "none"].includes(b.src), id + " " + b.nm + " " + b.src);
      if (b.st === "unknown") { assert.equal(b.src, "none"); assert.equal(b.h, null); continue; }
      if (b.hh) assert.equal(b.src, "hub"), assert.equal(b.h, b.hh);
      else if (b.hv) assert.equal(b.src, "vworld"), assert.equal(b.h, b.hv);
      else if (b.f >= 1) assert.equal(b.src, "est"), assert.ok(Math.abs(b.h - b.f * d.meta.floor_h.value) < 0.01);
      else assert.equal(b.src, "none");
    }
  }
});

test("층고 추정값은 기존 2.7 m 가 아니라 단지 안 실측 중간값(3.0~3.2 m 부근)이다", () => {
  for (const id of IDS) { const f = load(id).meta.floor_h; assert.ok(f.value > 2.9 && f.value < 3.3, id + " " + f.value); assert.ok(f.n >= 8); }
});

test("소속 불명 건물은 계산 대상에서 빠지고, 앞에 서 있어도 '가리는 동'으로 잡히지 않는다", () => {
  const c = ctxOf([mk("A", -60, 40, 130, { st: "unknown", src: "none", h: null }), mk("B", 0, 15, 45)]);
  assert.equal(c.calc.length, 1);
  assert.equal(c.excluded.length, 1);
  const s = C.summarize(c, C.run(c, "B", 2, WINTER));
  assert.equal(s.shadeMin, 0); assert.equal(s.blockers.length, 0);
  assert.throws(() => C.run(c, "A", 2, WINTER), /계산 대상/);
  // 높이 자료가 없는 건물도 마찬가지
  assert.equal(C.calcable(mk("Z", 0, 0, 0, { src: "none", h: null })), false);
});

test("실제 자료: 도안 313동(유치원)처럼 소속 불명인 건물이 계산 대상에서 빠져 있다", () => {
  const ctx = C.prepare(load("30200-631"));
  const u = ctx.items.filter(b => b.st === "unknown");
  assert.ok(u.length >= 1);
  for (const b of u) assert.ok(!ctx.calc.includes(b));
  // 어떤 동을 골라도 가리는 동 목록에 소속 불명 건물이 없다
  const own = ctx.items.filter(b => b.k === "own");
  for (const t of own) for (const bl of C.summarize(ctx, C.run(ctx, t.id, 5, WINTER)).blockers) assert.notEqual(ctx.byId[bl.id].st, "unknown");
});

test("같은 입력이면 같은 결과 (여러 번, 자료를 다시 읽어도)", () => {
  const a = C.prepare(load("36110-203")), b = C.prepare(load("36110-203"));
  const t = a.items.find(x => x.label === "520동" && x.k === "own");
  const r1 = JSON.stringify(C.run(a, t.id, 4, WINTER)), r2 = JSON.stringify(C.run(a, t.id, 4, WINTER)), r3 = JSON.stringify(C.run(b, t.id, 4, WINTER));
  assert.equal(r1, r2); assert.equal(r1, r3);
});

test("분석용 JSON 맨 위에 출처·가정·한계가 있고, 키·토큰·개인정보 같은 것이 없고, 60 KB 이하다", () => {
  for (const id of IDS) {
    const f = path.join(DIR, "data", id + ".json"), raw = fs.readFileSync(f, "utf8"), d = JSON.parse(raw);
    assert.ok(fs.statSync(f).size <= 60 * 1024, id + " 크기 " + fs.statSync(f).size);
    assert.ok(Object.keys(d)[0] === "meta");
    assert.ok(d.meta.sources.some(s => /브이월드/.test(s.name)) && d.meta.sources.some(s => /건축HUB/.test(s.name)));
    assert.ok(d.meta.assumptions.length >= 4 && d.meta.limits.some(l => /법적 일조권/.test(l)) && d.meta.limits.some(l => /수면 자료가 부족/.test(l)));
    assert.ok(!/(api[_-]?key|serviceKey|token|secret|password|passwd|authKey|\bkey=)/i.test(raw), id + " 키/토큰 흔적");
    assert.ok(!/\d{2,3}-\d{3,4}-\d{4}/.test(raw), "전화번호 모양 없음");
    assert.ok(!/mgmBldrgstPk/.test(raw));
  }
});

test("이 단지 동은 모두 건축HUB 와 이어져 있고, 도형 있는 동 전부에 높이 출처가 있다", () => {
  const want = { "30200-631": 13, "36110-203": 25, "36110-421": 8 };
  for (const id of IDS) {
    const d = load(id), own = d.buildings.filter(b => b.k === "own");
    assert.equal(own.length, want[id], id);
    assert.ok(own.every(b => b.st === "hub" && b.src === "hub"), id);
    assert.equal(new Set(own.map(b => C.dongNo(b.dn))).size, own.length, "동 번호 중복 없음");
  }
});

test("민감도: 높이 ±5%, 층고 ±0.3 m, 위치 ±5 m 로 바꿔도 결과는 15분 단위이고 기준 계산이 같은 값으로 돌아온다", () => {
  const ctx = C.prepare(load("30200-631")), t = ctx.items.find(b => b.label === "501동" && b.k === "own");
  const sen = C.sensitivity(ctx, t.id, 10, WINTER);
  assert.equal(sen.base, C.summarize(ctx, C.run(ctx, t.id, 10, WINTER)).sunMin);
  for (const r of sen.rows) { assert.ok(r.min <= sen.base && sen.base <= r.max); for (const x of r.runs) assert.equal(x.sunMin % 15, 0); }
  assert.ok(sen.max - sen.min >= 0 && sen.max - sen.min <= 6 * 60, "흔들림 " + (sen.max - sen.min));
});

test("뒷 동을 앞 동에서 멀리 옮기면 가림이 같거나 줄고, 가까이 옮기면 같거나 늘어난다", () => {
  const c = ctxOf([mk("A", -60, 15, 45), mk("B", 0, 15, 45)]);
  const tl = (id, v) => C.summarize(c, C.run(c, id, 2, WINTER, v)).sunMin;
  assert.ok(tl("B", { dy: 5 }) >= tl("B"));
  assert.ok(tl("B", { dy: -5 }) <= tl("B"));
});

test("남쪽 면 방위와 틀어진 정도를 알려 준다 (정남이 아니면 숨기지 않는다)", () => {
  const c = ctxOf([mk("B", 0, 15, 45)]);
  const f = C.faceInfo(c, "B");
  assert.equal(f.dir, "남"); assert.ok(f.offSouth < 1);
  const diag = ctxOf([{ id: "D", nm: "시험", dn: "1동", k: "own", f: 10, h: 30, src: "hub", st: "hub", p: [[0, 0], [60, 40], [54, 52], [-6, 12]] }]);
  const g = C.faceInfo(diag, "D");
  assert.ok(g.offSouth > 20, "틀어진 정도 " + g.offSouth);
});

test("시간 표기 도우미", () => {
  assert.equal(C.durText(0), "0분"); assert.equal(C.durText(45), "45분"); assert.equal(C.durText(120), "2시간"); assert.equal(C.durText(255), "4시간 15분");
  assert.equal(C.minToHM(5 * 60 + 15), "05:15");
  assert.deepEqual(C.kstToday(Date.UTC(2026, 10, 7, 16, 0)), { year: 2026, month: 11, day: 8 }, "UTC 16시 = 한국 다음 날 1시");
});
