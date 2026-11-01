// 층별 시세: 최근 5년 매매를 그달 같은 평형의 추정 시세(pricechart 와 같은 자료 d/<단지>.json)와 견줘
// 층마다 시세보다 비싸게·싸게 팔렸는지를 입체 건물 그림으로. 임장에서 어느 층을 노릴지, 값을 깎을 근거를 봅니다.
(function () {
  const sec = document.querySelector("[data-floors]");
  if (!sec) return;
  const { el } = DJ;
  const NS = "http://www.w3.org/2000/svg";
  const F_CANCEL = 1, F_DIRECT = 2, F_PRESALE = 4;
  const YEARS = 5;
  // 색 다섯 단계 (시세보다 낮음 파랑 ↔ 비슷 회색 ↔ 높음 주황)
  const TONES = [["6% 넘게 낮게", v => v <= -0.06], ["2~6% 낮게", v => v < -0.02], ["비슷(±2%)", v => v <= 0.02], ["2~6% 높게", v => v < 0.06], ["6% 넘게 높게", () => true]];
  const tone = v => TONES.findIndex(t => t[1](v));
  const pct = v => (Math.round(v * 100) > 0 ? "+" : Math.round(v * 100) < 0 ? "−" : "") + Math.abs(Math.round(v * 100)) + "%";
  const s = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };

  // 시세 그래프(pricechart.js)와 같은 파일이라 브라우저 캐시에서 바로 옵니다
  fetch(sec.dataset.src).then(r => r.json()).then(draw).catch(() => {});

  function draw(D) {
    const from = D.n - YEARS * 12;
    const rows = D.tr.filter(t => t[0] >= from && t[4] > 0 && !(t[5] & (F_CANCEL | F_DIRECT | F_PRESALE)))
      .map(t => {
        const e = D.types[t[2]] && D.types[t[2]].est[t[0]];
        return e ? { f: t[4], r: t[3] / e - 1 } : null;
      })
      .filter(x => x && Math.abs(x.r) < 0.4);   // 시세와 40% 넘게 동떨어진 거래(입력 오류·특수 거래)는 뺌
    if (rows.length < 8 || new Set(rows.map(x => x.f)).size < 3) return;   // 견줄 거래가 적으면 그리지 않음
    const top = Math.max(+sec.dataset.top || 0, ...rows.map(x => x.f));
    const by = Array.from({ length: top + 2 }, () => []);
    rows.forEach(x => by[x.f].push(x));
    const mean = a => a.reduce((t, x) => t + x.r, 0) / a.length;
    // 층마다 평균. 한 건뿐인 층은 바로 위아래 층과 묶어 한 거래에 휘둘리지 않게
    const floors = [];
    for (let f = 1; f <= top; f++) {
      const a = by[f];
      if (!a.length) { floors.push({ f, n: 0, v: null }); continue; }
      const pool = a.length >= 2 ? a : [...(by[f - 1] || []), ...a, ...(by[f + 1] || [])];
      floors.push({ f, n: a.length, v: mean(pool) });
    }
    // 저층·중층·고층 묶음 (낮은 건물은 1~2층과 그 위로만)
    const lowTop = top >= 9 ? 3 : 2, highFrom = top >= 9 ? Math.floor(top * 2 / 3) + 1 : null;
    const bands = [
      { name: "저층", lo: 1, hi: lowTop },
      ...(highFrom ? [{ name: "중층", lo: lowTop + 1, hi: highFrom - 1 }, { name: "고층", lo: highFrom, hi: top }] : [{ name: "그 위", lo: lowTop + 1, hi: top }]),
    ].map(b => {
      const a = rows.filter(x => x.f >= b.lo && x.f <= b.hi);
      return { ...b, n: a.length, v: a.length ? mean(a) : null };
    });
    sec.hidden = false;
    const link = document.querySelector("[data-floors-link]");
    if (link) link.hidden = false;
    tower(floors, top);
    side(bands, rows.length);
    table(floors);
  }

  // 입체 건물: 앞면은 층마다 색, 옆면은 같은 색을 어둡게, 지붕 (아이소메트릭)
  function tower(floors, top) {
    const box = sec.querySelector("[data-fl-tower]");
    const h = Math.max(6, Math.min(16, Math.floor(320 / top)));
    const W = 112, Dx = 34, Dy = 17, L = 34, R = 50;
    const H = top * h, y0 = Dy + 6, base = y0 + H;
    const svg = s("svg", { viewBox: `0 0 ${L + W + Dx + R} ${base + 18}`, class: "fl-svg", role: "img",
      "aria-label": `${top}층 건물의 층별 시세. 파란색일수록 시세보다 낮게, 주황색일수록 높게 거래됐습니다.` });
    s("ellipse", { cx: L + (W + Dx) / 2, cy: base + 6, rx: (W + Dx) / 1.6, ry: 8, class: "fl-shadow" }, svg);
    const g = s("g", { class: "fl-floors" }, svg);
    // 옆 숫자는 시세와 2% 넘게 다른 층만, 글자끼리 겹치지 않게 (층이 많으면 한 칸이 글자보다 낮음)
    let lastY = -1e9;
    floors.forEach((fl, i) => {
      const y = base - fl.f * h, cls = fl.v == null ? "fl-none" : "fl-t" + tone(fl.v);
      const row = s("g", { class: "fl-row " + cls, style: `--i:${i}` }, g);
      s("rect", { x: L, y, width: W, height: h, class: "fl-front" }, row);
      s("polygon", { points: `${L + W},${y} ${L + W + Dx},${y - Dy} ${L + W + Dx},${y - Dy + h} ${L + W},${y + h}`, class: "fl-sidef" }, row);
      if (h >= 9) s("line", { x1: L + 6, x2: L + W - 6, y1: y + h / 2, y2: y + h / 2, class: "fl-win" }, row);
      const t = s("title", {}, row);
      t.textContent = fl.v == null ? `${fl.f}층 · 최근 거래 없음` : `${fl.f}층 · ${fl.n}건 · 시세 대비 ${pct(fl.v)}`;
      if (fl.f === 1 || fl.f === top || fl.f % 5 === 0) {
        const lb = s("text", { x: L - 6, y: y + h / 2 + 4, class: "fl-lab", "text-anchor": "end" }, svg);
        lb.textContent = fl.f + "층";
      }
      const vy = y - Dy / 2 + h / 2 + 4;
      if (fl.v != null && fl.n >= 2 && h >= 9 && Math.abs(fl.v) > 0.02 && Math.abs(vy - lastY) >= 13) {
        const v = s("text", { x: L + W + Dx + 6, y: vy, class: "fl-val" }, svg);
        v.textContent = pct(fl.v);
        lastY = vy;
      }
    });
    s("polygon", { points: `${L},${y0} ${L + W},${y0} ${L + W + Dx},${y0 - Dy} ${L + Dx},${y0 - Dy}`, class: "fl-roof" }, svg);
    box.replaceChildren(svg);
    const legend = sec.querySelector("[data-fl-legend]");
    legend.replaceChildren(...TONES.map(([label], k) => { const i = el("span", "fl-key"); i.append(el("i", "fl-sw fl-t" + k), document.createTextNode(label)); return i; }),
      (() => { const i = el("span", "fl-key"); i.append(el("i", "fl-sw fl-none"), document.createTextNode("거래 없음")); return i; })());
    DJ.onView([box], () => box.classList.add("in"), { threshold: 0.3 });
  }

  // 옆 요약: 저층·중층·고층이 시세보다 얼마나, 그리고 임장에서 무엇을 볼지
  function side(bands, n) {
    const box = sec.querySelector("[data-fl-side]");
    box.replaceChildren();
    const got = bands.filter(b => b.v != null && b.n >= 2);
    if (got.length >= 2) {
      const gap = Math.max(...got.map(b => b.v)) - Math.min(...got.map(b => b.v));
      const big = el("p", "fl-big");
      big.append(el("span", "", "층에 따라"), el("b", "", Math.round(gap * 100) + "%"), el("span", "", "차이"));
      box.append(big);
    }
    const ul = el("ul", "fl-bands");
    bands.forEach(b => {
      const li = el("li", b.v == null ? "none" : "fl-t" + tone(b.v));
      li.append(el("span", "fb-name", `${b.name} (${b.lo === b.hi ? b.lo : b.lo + "~" + b.hi}층)`),
                el("b", "fb-v", b.v == null ? "거래 없음" : pct(b.v)), el("span", "fb-n", b.n ? b.n + "건" : ""));
      ul.append(li);
    });
    box.append(ul);
    const low = bands[0], high = bands.length > 2 ? bands[2] : null;
    let tip;
    if (low.v != null && low.n >= 2 && low.v <= -0.03)
      tip = `저층은 시세보다 평균 ${pct(low.v).slice(1)} 낮게 거래돼요. 저층을 노린다면 일조·소음·사생활(앞 동과의 거리, 길가 소음)을 현장에서 꼭 확인해 보세요.`;
    else if (high && high.v != null && high.n >= 2 && high.v >= 0.03)
      tip = `고층은 시세보다 평균 ${pct(high.v)} 높게 거래돼요. 조망·일조가 값에 반영되는 단지라, 매물의 동·향과 앞이 트였는지 현장에서 확인해 보세요.`;
    else if (low.v != null && low.n >= 2 && low.v >= 0.03)
      tip = `저층이 오히려 시세보다 평균 ${pct(low.v)} 높게 거래돼요. 1층 정원·테라스나 필로티 위 세대인지, 매물 구조를 현장에서 확인해 보세요.`;
    else if (high && high.v != null && high.n >= 2 && high.v <= -0.03)
      tip = `고층이 시세보다 평균 ${pct(high.v).slice(1)} 낮게 거래돼요. 꼭대기층 누수·단열이나 조망을 가리는 건물이 있는지 확인해 보세요.`;
    else tip = "층에 따른 가격 차이가 크지 않은 단지입니다. 층보다는 동 위치·향·수리 상태를 비교해 보세요.";
    const t = el("p", "fl-tip");
    t.append(el("b", "", "임장 팁 "), document.createTextNode(tip));
    box.append(t, el("p", "fl-note muted", `최근 ${YEARS}년 매매 ${n}건 · 해제·직거래·분양권 빼고 · 그달 같은 평형 추정 시세와 견준 값`));
  }

  function table(floors) {
    const tb = el("table", "fl-tbl");
    const head = el("tr");
    ["층", "거래", "시세 대비"].forEach(h => { const th = el("th", "", h); th.scope = "col"; head.append(th); });
    tb.append(el("thead"), el("tbody"));
    tb.tHead.append(head);
    floors.slice().reverse().filter(f => f.n).forEach(f => {
      const tr = el("tr");
      const th = el("th", "", f.f + "층"); th.scope = "row";
      tr.append(th, el("td", "", f.n + "건"), el("td", "", pct(f.v)));
      tb.tBodies[0].append(tr);
    });
    sec.querySelector("[data-fl-table]").replaceChildren(tb);
  }
})();
