// 다녀온 뒤 정리: 방문 기록(날짜별)에서 후보마다 '확인한 것 · 아직 못 확인한 것 · 남긴 메모'를 모읍니다.
// 사실만 모아 보여 주고, 좋다·나쁘다 판단이나 추천은 하지 않습니다. UI 와 분리해 검증합니다.
(function () {
  const MEMOS = 3;
  // logs: DJVisitLog.list() 결과(최신순), names: {slug: 단지 이름}. 후보 순서는 slugs 를 따릅니다.
  // field: 현장 모드에 남긴 단지 공통 기록 {slug: {d: 다녀온 날, m: 메모, labels: [{label,on}] | null}} (날짜별 기록이 없어도 함께 모읍니다)
  function build(slugs, logs, names = {}, field = {}) {
    return slugs.map(slug => {
      const mine = logs.filter(v => v.slug === slug), f = field[slug] || null;
      const hasField = !!(f && (f.d || f.m || (f.labels && f.labels.length)));
      const name = names[slug] || slug;
      if (!mine.length && !hasField) return { slug, name, visited: false, visits: 0, last: "", done: [], todo: [], memos: [], checked: 0, total: 0, field: false };
      // 항목마다 한 번이라도 확인했으면 '확인함'. 체크 상태를 같이 보관한 기록이 없으면 항목은 비어 있습니다.
      const seen = new Map();   // label -> 확인한 적 있는지
      mine.forEach(v => (v.checks?.labels || []).forEach(item => seen.set(item.label, seen.get(item.label) || item.on)));
      (f?.labels || []).forEach(item => seen.set(item.label, seen.get(item.label) || item.on));
      const done = [...seen].filter(([, on]) => on).map(([l]) => l), todo = [...seen].filter(([, on]) => !on).map(([l]) => l);
      const memos = mine.filter(v => v.memo).slice(0, MEMOS).map(v => ({ date: v.date, period: v.period, text: v.memo }));
      if (f && f.m) memos.push({ date: f.d || "", period: "", text: f.m, field: true });
      const last = [mine[0]?.date || "", f?.d || ""].sort().pop();
      return { slug, name, visited: true, visits: mine.length, last, done, todo, memos, checked: done.length, total: seen.size, field: hasField };
    });
  }
  window.DJVisitSummary = { build };
})();
