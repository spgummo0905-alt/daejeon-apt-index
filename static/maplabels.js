// 지도 가격 핀 겹침 정리(순수 계산, 화면 없이 시험 가능). map.js 가 부름.
// 입력 pts: [{k, x, y, w, h, pr, keep, nopill}]  x,y = 핀 아래 가운데의 화면 좌표, w,h = 핀 크기, pr = 우선순위(클수록 먼저),
//          keep = 꼭 보여야 함(선택한 단지), nopill = 가격이 없어 늘 점으로만
// 출력 {pill: 큰 핀으로 둘 키 집합, hide: 아예 숨길 점 집합}  — 나머지는 작은 점.
// 규칙: 우선순위 순으로 큰 핀을 놓되 이미 놓인 핀과 겹치면 점으로. 큰 핀에 가려지는 점과, 다른 점에 바짝 붙은 점은 숨김(확대하면 다시 보임).
(function () {
  "use strict";
  const DJ = (window.DJ = window.DJ || {});
  DJ.pickLabels = function (pts, o) {
    o = o || {};
    const pad = o.pad == null ? 4 : o.pad, dot = o.dot || 16, near = o.near == null ? 10 : o.near;
    const sorted = pts.slice().sort((a, b) => (b.keep ? 1 : 0) - (a.keep ? 1 : 0) || b.pr - a.pr);
    const boxes = [], pill = new Set(), hide = new Set(), left = [];
    const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    sorted.forEach(p => {
      if (p.nopill) { left.push(p); return; }
      const b = { l: p.x - p.w / 2 - pad, r: p.x + p.w / 2 + pad, t: p.y - p.h - pad, b: p.y + pad };
      if (p.keep || !boxes.some(q => hit(b, q))) { boxes.push(b); pill.add(p.k); } else left.push(p);
    });
    const seen = [];
    left.forEach(p => {
      const cy = p.y - dot / 2;
      const covered = boxes.some(q => p.x > q.l && p.x < q.r && cy > q.t && cy < q.b);
      const crowded = seen.some(s => Math.hypot(s.x - p.x, s.y - cy) < near);
      if (covered || crowded) { if (!p.keep) { hide.add(p.k); return; } }
      seen.push({ x: p.x, y: cy });
    });
    return { pill, hide };
  };
})();
