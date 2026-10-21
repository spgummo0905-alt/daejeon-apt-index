(function () {
  const { el } = DJ;
  const params = new URLSearchParams(location.search);
  let a = params.get("a"), b = params.get("b");
  const out = document.getElementById("vs-result");
  const shareBtn = document.getElementById("vs-share");

  DJ.data().then(d => {
    const ia = document.getElementById("pick-a"), ib = document.getElementById("pick-b");
    if (a && d.bySlug[a]) ia.value = d.bySlug[a].n;
    if (b && d.bySlug[b]) ib.value = d.bySlug[b].n;
    DJ.search(ia, c => { a = c.s; render(d); });
    DJ.search(ib, c => { b = c.s; render(d); });
    document.getElementById("vs-random").addEventListener("click", () => {
      const pool = d.complexes.filter(c => c.i != null);
      const x = pool[Math.floor(Math.random() * pool.length)];
      // 같은 구의 단지끼리 비교해야 의미가 큽니다.
      const same = pool.filter(c => c.gu === x.gu && c.s !== x.s);
      const y = (same.length ? same : pool)[Math.floor(Math.random() * (same.length || pool.length))];
      a = x.s; b = y.s; ia.value = x.n; ib.value = y.n;
      render(d);
    });
    render(d);
  });

  function render(d) {
    const ca = d.bySlug[a], cb = d.bySlug[b];
    if (!ca || !cb) return;
    history.replaceState(null, "", "?a=" + encodeURIComponent(a) + "&b=" + encodeURIComponent(b));
    let wa = 0, wb = 0;
    ca.st.forEach((v, k) => {
      const o = cb.st[k];
      if (v != null && (o == null || v > o)) wa++;
      else if (o != null && (v == null || v < o)) wb++;
    });
    out.replaceChildren();
    const lead = wa === wb ? null : (wa > wb ? ca : cb);
    const board = el("div", "scoreboard");
    board.append(el("span", "sb-side" + (wa > wb ? " win" : ""), ca.n),
                 el("span", "sb-score", wa + " : " + wb),
                 el("span", "sb-side" + (wb > wa ? " win" : ""), cb.n));
    const verdict = el("p", "verdict", lead
      ? lead.n + "이(가) 다섯 항목 중 " + Math.max(wa, wb) + "개에서 앞섭니다"
      : "두 단지가 항목별로 비슷합니다");
    const cards = el("div", "vs-cards");
    cards.append(DJ.card(ca, d.stats, { compare: cb }), el("div", "vs-mid", "vs"), DJ.card(cb, d.stats, { compare: ca }));
    const note = el("p", "muted center", "▲ 표시와 초록 막대가 그 항목에서 앞선 쪽입니다. 종합 지수 " +
      ca.n + " " + (ca.i ?? "-") + "점, " + cb.n + " " + (cb.i ?? "-") + "점");
    out.append(board, verdict, cards, note);
    out.classList.remove("pop"); void out.offsetWidth; out.classList.add("pop");
    shareBtn.hidden = false;
    shareBtn.onclick = () => DJ.share("단지 비교: " + ca.n + " vs " + cb.n,
      ca.n + "와(과) " + cb.n + "을(를) 입지·성장성·상승세·가성비·거래량으로 비교했습니다");
  }
})();
