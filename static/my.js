(function () {
  const { el } = DJ;
  DJ.data().then(d => {
    const favs = DJ.favs().map(s => d.bySlug[s]).filter(Boolean);
    const recent = DJ.recent().map(r => d.bySlug[r.s]).filter(Boolean);

    const favBox = document.getElementById("favs");
    if (!favs.length) favBox.append(el("p", "muted", "아직 저장한 단지가 없습니다. 단지 페이지 오른쪽 위의 ☆를 누르면 여기에 모입니다."));
    favs.forEach(c => favBox.append(DJ.card(c, d.stats)));
    if (favs.length >= 2) {  // 비교는 네 곳까지
      const b = document.getElementById("fav-battle");
      b.hidden = false;
      b.href = "compare.html?s=" + favs.slice(0, 4).map(c => encodeURIComponent(c.s)).join(",");
      b.querySelector("span").textContent = favs.length > 4 ? "관심 단지 앞 4곳 비교" : "관심 단지끼리 비교";
    }

    // 최근 본 단지: 등급·이름·위치·지수, 관심 단지는 별 표시
    const rec = document.getElementById("recent"), clear = document.getElementById("recent-clear");
    const draw = list => {
      rec.replaceChildren();
      if (!list.length) { rec.append(el("li", "muted", "아직 둘러본 단지가 없습니다.")); clear.hidden = true; return; }
      clear.hidden = false;
      list.forEach(c => {
        const a = el("a", "recent-item"); a.href = DJ.href(c);
        a.append(el("span", "grade g-" + c.g, c.g), el("span", "ri-name", c.n), el("span", "ri-where muted", DJ.place(c)),
                 el("span", "ri-score", c.i == null ? "-" : c.i + "점"));
        if (DJ.isFav(c.s)) a.append(el("span", "ri-star", "★"));
        const li = el("li"); li.append(a); rec.append(li);
      });
    };
    draw(recent);
    clear.addEventListener("click", () => { DJ.save("recent", []); draw([]); });
  });
})();
