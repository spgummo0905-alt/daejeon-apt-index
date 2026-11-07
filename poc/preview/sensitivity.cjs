// 민감도 표: 입력을 조금 바꾸면 '직사광이 닿을 가능성이 있는 시간'이 얼마나 흔들리는가.
// 실행: node poc/preview/sensitivity.cjs   (결과는 표로 출력, --md 를 붙이면 마크다운 표)
// 바꾸는 값: 높이 ±5%(모든 건물), 층고 ±0.3 m(관측점 높이와 '층수로 추정'한 건물), 위치 ±5 m(선택한 동만 동·서·남·북).
// 선택 대상: 단지마다 '앞 동에 가려지는 정도가 서로 다른' 동·층 몇 곳을 코드가 고른다(손으로 고르지 않음).
const fs = require("node:fs"), path = require("node:path");
const C = require("./calc.js");
const IDS = ["30200-631", "36110-203", "36110-421"];
const DATES = [["동지 12/21", { year: 2026, month: 12, day: 21 }], ["하지 6/21", { year: 2026, month: 6, day: 21 }]];
const md = process.argv.includes("--md");

// 단지마다 동지 기준 '가림 시간(shade)'이 가장 큰 칸 1곳, 중간 1곳, 가림이 0인 칸 1곳을 고른다.
function pick(ctx) {
  const own = ctx.items.filter(b => b.k === "own" && C.calcable(b)), cand = [];
  for (const t of own) {
    for (const fl of [2, Math.max(2, Math.round(t.f / 2)), t.f]) {
      if (fl > t.f) continue;
      const s = C.summarize(ctx, C.run(ctx, t.id, fl, DATES[0][1]));
      cand.push({ t, fl, shade: s.shadeMin });
    }
  }
  cand.sort((a, b) => b.shade - a.shade || a.t.label.localeCompare(b.t.label) || a.fl - b.fl);
  const out = [cand[0], cand[Math.floor(cand.length / 2)], cand.filter(c => c.shade === 0)[0] || cand[cand.length - 1]];
  return out.filter((c, i, a) => c && a.findIndex(d => d.t.id === c.t.id && d.fl === c.fl) === i);
}

const rows = [], all = [];
for (const id of IDS) {
  const ctx = C.prepare(JSON.parse(fs.readFileSync(path.join(__dirname, "data", id + ".json"), "utf8")));
  for (const c of pick(ctx)) for (const [dn, d] of DATES) {
    const s = C.sensitivity(ctx, c.t.id, c.fl, d);
    const g = n => s.rows.find(r => r.name.startsWith(n));
    const rng = r => r.min === r.max ? "변화 없음" : C.durText(r.min) + " ~ " + C.durText(r.max);
    const row = { 단지: ctx.doc.meta.complex.label, 동층: c.t.label + " " + c.fl + "층", 날짜: dn, 기준: C.durText(s.base),
      높이5: rng(g("높이")), 층고: rng(g("층고")), 위치: rng(g("위치")), 전체: C.durText(s.min) + " ~ " + C.durText(s.max), 폭분: s.max - s.min };
    rows.push(row); all.push(row.폭분);
  }
}
const H = ["단지", "동·층", "날짜", "기준값", "높이 ±5%", "층고 ±0.3 m", "위치 ±5 m", "모두 합친 범위", "폭(분)"];
const L = rows.map(r => [r.단지, r.동층, r.날짜, r.기준, r.높이5, r.층고, r.위치, r.전체, r.폭분]);
if (md) { console.log("| " + H.join(" | ") + " |\n|" + H.map(() => "---").join("|") + "|"); for (const l of L) console.log("| " + l.join(" | ") + " |"); }
else { console.log(H.join("\t")); for (const l of L) console.log(l.join("\t")); }
all.sort((a, b) => a - b);
console.log("\n" + (md ? "- " : "") + "조합 " + all.length + "개, 합친 범위 폭: 최소 " + all[0] + "분, 중간 " + all[Math.floor(all.length / 2)] + "분, 최대 " + all[all.length - 1] + "분 (15분이 한 칸)");
