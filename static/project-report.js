// 프로젝트 한 장 보고서의 내용 만들기 (화면과 분리해 검증). 기존 방문 요약(DJVisitSummary)을 그대로 쓰고, 새 판단은 만들지 않습니다.
// 네 가지를 섞지 않고 따로 보여 줍니다:
//   1) 내가 정한 조건(프로젝트 '중요한 조건')  2) 공개 자료 숫자(자료가 있는 것만)  3) 직접 확인한 것·아직 못 확인한 것  4) 내가 남긴 메모
// 값이 없으면 칸을 비워 두거나 지어내지 않고, 그 항목 자체를 싣지 않습니다. 좋다·나쁘다·추천 문구도 없습니다.
(function () {
  const won = v => {   // 만원 단위 정수 → '8.0억' 같은 글. 숫자가 아니면 null
    if (!Number.isFinite(v) || v <= 0) return null;
    return v >= 10000 ? (v / 10000).toFixed(1).replace(/\.0$/, "") + "억" : Math.round(v).toLocaleString() + "만원";
  };
  function facts(c) {   // 공개 자료에서 실제로 있는 값만
    if (!c) return [];
    const out = [];
    if (c.pt) out.push(["84㎡ 최근 시세", String(c.pt)]);
    else if (won(c.p)) out.push(["84㎡ 최근 시세", won(c.p)]);
    if (Number.isFinite(c.y) && c.y > 1900) out.push(["준공", c.y + "년"]);
    if (Number.isFinite(c.hh) && c.hh > 0) out.push(["세대수", c.hh.toLocaleString() + "세대"]);
    if (c.stn && Number.isFinite(c.f && c.f.subway)) out.push(["가까운 역", `${c.stn} 직선 ${c.f.subway < 1000 ? Math.round(c.f.subway) + "m" : (c.f.subway / 1000).toFixed(1) + "km"}`]);
    return out;
  }
  // project: {name, goal, slugs}, rows: DJVisitSummary.build 결과(후보 순서), bySlug: {slug: 단지}, today: 'YYYY-MM-DD'
  function build({ project, rows, bySlug = {}, today = "", region = "" }) {
    const byRow = new Map((rows || []).map(r => [r.slug, r]));
    const visited = [], pending = [];
    (project.slugs || []).forEach(slug => {
      const c = bySlug[slug], r = byRow.get(slug);
      if (!c && !r) return;
      const name = (c && c.n) || (r && r.name) || slug;
      const place = c ? [c.gu, c.d].filter(Boolean).join(" ") : "";
      if (r && r.visited) visited.push({ slug, name, place, facts: facts(c), last: r.last || "", visits: r.visits || 0,
        done: r.done || [], todo: r.todo || [], memos: r.memos || [], checked: r.checked || 0, total: r.total || 0 });
      else pending.push({ slug, name, place, facts: facts(c) });
    });
    const unchecked = visited.reduce((n, v) => n + v.todo.length, 0);
    return {
      title: project.name, region, date: today,
      conditions: String(project.goal || "").trim(),          // 사용자가 직접 적은 글 그대로
      visited, pending,
      totals: { candidates: (project.slugs || []).length, visited: visited.length, pending: pending.length, unchecked },
      notice: "내가 적은 조건과 직접 확인·메모한 내용, 공개 자료 숫자를 따로 모았어요. 기록이 없는 항목은 적지 않았고, 어느 집이 낫다는 판단은 하지 않아요.",
    };
  }
  window.DJProjectReport = { build, facts };
})();
