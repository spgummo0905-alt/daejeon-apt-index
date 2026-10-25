(function () {
  const { el } = DJ;
  DJ.data().then(d => {
    // 카드첩으로 가는 카드: 모은 카드·받은 배지 수
    const sum = document.querySelector("[data-cards-sum]");
    if (sum) {
      const all = d.complexes.filter(c => c.g && c.g !== "-");
      sum.textContent = `카드 ${DJ.albumCount(all).toLocaleString()}장 · 임장 배지 ${Object.keys(DJ.earned()).length}/${DJ.BADGES.length}개`;
    }
    const favs = DJ.favs().map(s => d.bySlug[s]).filter(Boolean);
    const recent = DJ.recent().map(r => d.bySlug[r.s]).filter(Boolean);

    // 새 소식: 지난번 확인한 뒤 새 거래·시세 변화. 누르면 그 단지 거래 목록으로, '확인'하면 지금 상태를 기준으로
    const news = DJ.watchSync(d.bySlug), nbox = document.querySelector("[data-news]");
    if (nbox && news.length) {
      const list = nbox.querySelector("[data-news-list]"), cnt = nbox.querySelector("[data-news-n]");
      const left = () => {
        const k = list.children.length;
        cnt.textContent = k;
        DJ.save("watchN", k);
        DJ.paintFavCount();
        nbox.hidden = !k;
      };
      news.forEach(({ c, n }) => {
        const li = el("li", "wn-item");
        const a = el("a", "wn-link");
        a.href = DJ.href(c) + "#trades";
        const tags = el("span", "wn-tags");
        DJ.newsText(n).forEach(t => tags.append(el("span", "wn-tag", t)));
        if (n.high) tags.append(el("span", "wn-tag hot", "신고가"));
        a.append(el("span", "grade g-" + c.g, c.g),
          el("span", "wn-name", c.n), el("span", "wn-where muted", DJ.place(c) + " · " + n.since.slice(5).replace("-", ".") + " 확인 뒤"), tags);
        const ok = el("button", "wn-ok", "확인");
        ok.type = "button";
        ok.setAttribute("aria-label", c.n + " 소식 확인");
        ok.addEventListener("click", () => { DJ.watchSeen(c); li.remove(); left(); });
        li.append(a, ok);
        list.append(li);
      });
      nbox.querySelector("[data-news-done]").addEventListener("click", () => {
        news.forEach(({ c }) => DJ.watchSeen(c));
        list.replaceChildren();
        left();
      });
      left();
    }

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
