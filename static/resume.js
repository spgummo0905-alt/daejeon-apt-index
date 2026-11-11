// 지역 첫 화면 '이어서 하기': 이 기기에 저장된 최근 본 단지·관심 단지를 읽기만 합니다(새 저장·판정값 없음).
// 기록이 없으면 칸을 숨긴 그대로 둡니다. 자동 이동 없음: 사용자가 눌러야 갑니다.
(function () {
  "use strict";
  const box = document.querySelector("[data-it-resume]");
  if (!box || !window.DJ || !DJ.data) return;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  DJ.data().then(d => {
    const recent = (DJ.recent() || []).map(r => r && d.bySlug[r.s]).filter(Boolean);
    const favs = (DJ.favs() || []).map(s => d.bySlug[s && s.s ? s.s : s]).filter(Boolean);
    const last = recent[0] || favs[0];
    if (!last) return;
    const a = el("a", "it-resume-main");
    a.href = DJ.href(last);
    a.append(el("span", "grade g-" + last.g, last.g),
      (() => { const s = el("span", "it-resume-t"); s.append(el("small", "", recent[0] ? "이어서 보기 · 마지막으로 본 집" : "이어서 보기 · 관심 단지"), el("b", "", last.n), el("span", "muted", DJ.place(last) + (last.i != null ? " · 지수 " + last.i + "점" : ""))); return s; })(),
      el("span", "it-resume-go", "›"));
    box.append(a);
    if (favs.length >= 2) {
      const n = el("a", "it-resume-next", `관심 집 ${favs.length}곳, 나란히 볼까요?`);
      n.href = (window.DJ_ROOT || "") + "compare.html?s=" + favs.slice(0, 4).map(c => encodeURIComponent(c.s)).join(",");
      box.append(n);
    }
    box.hidden = false;
  }).catch(() => {});
})();
