// 일조 미리보기(정식): 저장 자료(data/preview) 형식과 계산 연결 시험. 실행: node --test tests/test_preview.cjs
const test = require("node:test"), assert = require("node:assert"), fs = require("node:fs"), path = require("node:path");
const C = require("../static/preview-calc.js");
const DIR = path.join(__dirname, "..", "data", "preview");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).flatMap(r => fs.readdirSync(path.join(DIR, r)).map(f => path.join(DIR, r, f))) : [];
const WINTER = { year: 2026, month: 12, day: 21 };

test("저장된 단지 자료가 있고, 모두 내 동 2개 이상·층수·높이·도형을 갖는다", () => {
  assert.ok(files.length > 500, "열린 단지 수 " + files.length);
  for (const f of files.filter((_, i) => i % 5 === 0)) {
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.ok(["A", "B"].includes(d.m.g), f);
    const own = d.b.filter(b => b.k === "own");
    assert.ok(own.length >= 2, f + " 내 동 " + own.length);
    for (const b of d.b) {
      assert.ok(b.p.length >= 3 && b.f > 0 && b.h > 0, f + " 건물 값");
      assert.ok(["hub", "vworld", "est"].includes(b.s), f + " 출처");
    }
    for (const b of own) assert.ok(b.r && b.r.length === 4, f + " 내 동 직사각형");
  }
});

test("저장 자료 -> 계산: 동마다 동지 직사광 시간이 정해지고 0~9시간 안이다", () => {
  const f = files.find(x => x.includes("30200-631"));
  const ctx = C.prepare(C.fromDoc(JSON.parse(fs.readFileSync(f, "utf8"))));
  const own = ctx.items.filter(b => b.k === "own" && C.calcable(b));
  assert.equal(own.length, 13);
  for (const b of own) {
    const sm = C.summarize(ctx, C.run(ctx, b.id, Math.max(1, Math.round(b.f / 3)), WINTER));
    assert.ok(sm.sunMin >= 0 && sm.sunMin <= 540, b.dn + " " + sm.sunMin);
    assert.ok(sm.sunMin % 15 === 0);
  }
});

test("높은 층일수록 직사광이 같거나 길다 (앞 동이 가리는 경우도 거꾸로 줄지 않는다)", () => {
  const f = files.find(x => x.includes("30200-631"));
  const ctx = C.prepare(C.fromDoc(JSON.parse(fs.readFileSync(f, "utf8"))));
  const b = ctx.items.find(x => x.k === "own" && C.calcable(x) && x.f >= 20);
  const lo = C.summarize(ctx, C.run(ctx, b.id, 2, WINTER)).sunMin, hi = C.summarize(ctx, C.run(ctx, b.id, b.f, WINTER)).sunMin;
  assert.ok(hi >= lo, "2층 " + lo + " / 꼭대기 " + hi);
});
