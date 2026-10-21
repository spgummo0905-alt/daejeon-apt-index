(function () {
  const { el } = DJ;
  const box = document.getElementById("quiz");
  const ROUNDS = 5;
  const TITLES = [[5, "🏆 부동산 감별사"], [4, "🥇 임장 고수"], [3, "🥈 동네 박사"], [2, "🥉 부린이 탈출 중"], [0, "🌱 임장 새내기"]];

  // 날짜로 정해지는 난수: 같은 날에는 모두 같은 문제를 받습니다.
  function rng(seedText) {
    let h = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }
  const eok = v => (v >= 10000 ? (v / 10000).toFixed(1) + "억" : Math.round(v).toLocaleString() + "만");

  function makeRounds(pool, rand) {
    const picked = [], used = new Set();
    while (picked.length < Math.min(ROUNDS, pool.length)) {
      const c = pool[Math.floor(rand() * pool.length)];
      if (used.has(c.s)) continue;
      used.add(c.s);
      // 정답과 헷갈릴 만한 보기 3개: 정답의 ±15~35%
      const mult = [0.7, 0.82, 0.9, 1.12, 1.22, 1.38].sort(() => rand() - 0.5);
      const opts = new Set([eok(c.p)]);
      for (const m of mult) { if (opts.size >= 4) break; opts.add(eok(c.p * m)); }
      picked.push({ c, answer: eok(c.p), options: [...opts].sort(() => rand() - 0.5) });
    }
    return picked;
  }

  function start(seedText, daily) {
    DJ.data().then(d => {
      const pool = d.complexes.filter(c => c.p && c.i != null).sort((x, y) => x.s < y.s ? -1 : 1);
      if (pool.length < 4) { box.replaceChildren(el("p", "muted center", "문제를 만들 단지가 부족해요.")); return; }
      play(makeRounds(pool, rng(seedText)), d, seedText, daily);
    });
  }

  function play(rounds, d, seedText, daily) {
    let k = 0;
    const marks = [];
    function show() {
      const r = rounds[k];
      box.replaceChildren();
      const top = el("div", "quiz-top");
      top.append(el("span", "quiz-step", (k + 1) + " / " + rounds.length), el("span", "quiz-marks", marks.join("") || " "));
      const progress = el("div", "quiz-progress"); const f = el("span", ""); f.style.width = (k / rounds.length * 100) + "%"; progress.append(f);
      const q = el("div", "quiz-q");
      q.append(el("span", "grade big g-" + r.c.g, r.c.g), el("h2", "", r.c.n),
               el("p", "muted", r.c.gu + " " + r.c.d + (r.c.y ? " · " + r.c.y + "년 준공" : "") + " · 지수 " + r.c.i + "점"));
      const hint = el("p", "quiz-hint", "입지 " + (r.c.st[0] ?? "-") + " · 성장 " + (r.c.st[1] ?? "-") + " · 인기 " + (r.c.st[4] ?? "-"));
      const opts = el("div", "quiz-opts");
      r.options.forEach(o => {
        const b = el("button", "quiz-opt", o);
        b.addEventListener("click", () => answer(b, o));
        opts.append(b);
      });
      box.append(top, progress, q, hint, el("p", "quiz-ask", "전용 84㎡ 기준 최근 시세는?"), opts);
    }
    function answer(btn, o) {
      const r = rounds[k];
      const ok = o === r.answer;
      marks.push(ok ? "🟩" : "🟥");
      box.querySelectorAll(".quiz-opt").forEach(b => {
        b.disabled = true;
        if (b.textContent === r.answer) b.classList.add("right");
      });
      if (!ok) btn.classList.add("wrong");
      const fb = el("div", "quiz-feedback " + (ok ? "ok" : "no"));
      fb.append(el("strong", "", ok ? "정답! 👏" : "아쉬워요"), el("span", "", "84㎡ 환산 " + r.answer + (r.c.lp ? " · 최근 거래 " + r.c.lp : "")));
      const link = el("a", "", "단지 보기 →"); link.href = DJ.href(r.c); link.target = "_blank"; fb.append(link);
      const next = el("button", "btn primary", k + 1 < rounds.length ? "다음 문제" : "결과 보기");
      next.addEventListener("click", () => { k++; k < rounds.length ? show() : finish(); });
      box.append(fb, next);
      next.focus();
    }
    function finish() {
      const score = marks.filter(m => m === "🟩").length;
      const title = TITLES.find(([min]) => score >= min)[1];
      box.replaceChildren();
      const res = el("div", "quiz-result pop");
      res.append(el("p", "eyebrow", daily ? "오늘의 결과 · " + seedText : "연습 결과"), el("div", "quiz-score", score + " / " + rounds.length),
                 el("div", "quiz-title", title), el("div", "quiz-marks big", marks.join("")));
      const actions = el("div", "row-actions");
      const share = el("button", "btn primary", "결과 공유하기");
      share.addEventListener("click", () => DJ.share("대전 아파트 가격 맞히기",
        "대전 아파트 가격 맞히기 " + (daily ? seedText + " " : "") + score + "/" + rounds.length + " " + marks.join("") + "\n" + title,
        location.href.split("?")[0]));
      const again = el("button", "btn", "🎲 랜덤 문제 더 풀기");
      again.addEventListener("click", () => start("practice-" + Date.now(), false));
      actions.append(share, again);
      res.append(actions);
      box.append(res);
      if (daily) {
        const best = DJ.load("quiz", {});
        best[seedText] = Math.max(best[seedText] || 0, score);
        DJ.save("quiz", best);
      }
      DJ.unlock("quiz_any");
      if (score === rounds.length) DJ.unlock("quiz_master");
    }
    show();
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜
  start(today, true);
})();
