// 입체(2.5D) 그림과 기존 계산의 정합성 시험. 실행: node --test tests/test_preview_iso.cjs
// 입체 그림은 새로 판정하지 않는다: 해 쪽 선이 앞 동에 닿는 칸 = 기존 계산이 '앞 동에 가림'이라고 한 칸이어야 한다.
const test = require("node:test"), assert = require("node:assert"), fs = require("node:fs"), path = require("node:path");
const C = require("../static/preview-calc.js"), I = require("../static/preview-iso.js"), S = require("../static/shadow.js");
const DIR = path.join(__dirname, "..", "data", "preview");
const pick = ["daejeon/30200-631", "sejong/36110-421", "cheongju/" + fs.readdirSync(path.join(DIR, "cheongju"))[0].replace(".json", "")];
const load = id => { const ctx = C.prepare(C.fromDoc(JSON.parse(fs.readFileSync(path.join(DIR, id + ".json"), "utf8")))); return ctx; };
const DATES = [{ year: 2026, month: 12, day: 21 }, { year: 2026, month: 6, day: 21 }, { year: 2026, month: 11, day: 7 }];

test("해 쪽 선이 앞 동에 닿는 칸 = 기존 계산의 '앞 동에 가림' 칸 (동·층·날짜·시각 전부)", () => {
  let checked = 0, shade = 0;
  for (const id of pick) {
    const ctx = load(id);
    const own = ctx.items.filter(b => b.k === "own" && C.calcable(b));
    assert.ok(own.length >= 2, id);
    for (const b of own.filter((_, i) => i % 3 === 0)) {
      const fi = C.faceInfo(ctx, b.id), blds = C.variant(ctx, b.id).blds, fh = C.baseFh(ctx, b);
      for (const fl of [1, Math.max(1, Math.round(b.f / 2)), b.f]) {
        const z = (fl - 0.5) * fh;
        for (const d of DATES) {
          const slots = C.run(ctx, b.id, fl, d);
          for (const s of slots) {
            if (s.state !== "sun" && s.state !== "shade") continue;
            const r = I.ray(fi, z, s, blds, b.id);
            assert.equal(r.hit, s.state === "shade", id + " " + b.dn + " " + fl + "층 " + d.month + "/" + d.day + " " + C.minToHM(s.m));
            if (r.hit) assert.ok(s.by.includes(r.by), "가린 동이 계산 결과 목록에 있어야 함");
            checked++; if (r.hit) shade++;
          }
        }
      }
    }
  }
  assert.ok(checked > 3000 && shade > 300, "확인 칸 " + checked + " / 가림 " + shade);
});

test("투영: 같은 높이의 위가 아래보다 화면에서 위쪽, 북쪽은 화면에서 위쪽으로 멀어짐", () => {
  const a = I.P(0, 0, 0), b = I.P(0, 0, 30), n = I.P(0, 50, 0), e = I.P(50, 0, 0);
  assert.ok(b[1] < a[1]);                       // 높을수록 화면 위
  assert.ok(n[1] < a[1]);                       // 북쪽일수록 화면 위(멀리)
  assert.ok(I.depth(0, 50) > I.depth(0, 0));    // 북쪽이 더 멀다
  assert.ok(Math.abs(e[0] - a[0]) > 20);        // 동쪽 이동은 가로 이동으로 보인다
});

test("그리기: 내 동·가리는 동·층 띠·해 쪽 선이 들어가고, 높이 자료가 없는 건물은 그리지 않는다", () => {
  const ctx = load("daejeon/30200-631"), b = ctx.items.find(x => x.dn.startsWith("512") && x.k === "own");
  const fi = C.faceInfo(ctx, b.id), blds = C.variant(ctx, b.id).blds, fh = C.baseFh(ctx, b), fl = 8, z = (fl - 0.5) * fh;
  const slots = C.run(ctx, b.id, fl, DATES[0]), s = slots.find(x => x.m === 12 * 60 + 30), sm = C.summarize(ctx, slots);
  const o = { items: ctx.calc, tid: b.id, fl, fh, sun: { alt: s.alt, az: s.az, up: true }, state: s.state, blockIds: new Set(sm.blockers.map(x => x.id)), nowIds: new Set(s.state === "shade" ? s.by : []),
    fitIds: sm.blockers.slice(0, 3).map(x => x.id), fi, ray: I.ray(fi, z, s, blds, b.id), wide: false, label: C.label, num: x => (C.dongNo(x.dn) ? C.dongNo(x.dn) + "동" : ""), SRC: x => C.SRC_LABEL[x.src], calcable: C.calcable };
  const v = I.bounds(o, 1), svg = I.render(o, v, 358);
  assert.ok(svg.includes("iso-own") && svg.includes("iso-blk") && svg.includes("iso-band") && svg.includes("iso-ray"));
  assert.ok(svg.includes("내 동 512동"));
  assert.ok(!/NaN|undefined|Infinity/.test(svg), "숫자 오류가 없어야 함");
  const excl = ctx.excluded.length; assert.equal(ctx.calc.length + excl, ctx.items.length);
  const wide = I.bounds(Object.assign({}, o, { wide: true }), 1); assert.ok(wide.w > v.w, "넓게 보기는 더 넓은 영역");
});
