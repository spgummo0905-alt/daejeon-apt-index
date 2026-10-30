// 단지 화면 '이 단지 사려면 한 달에 얼마?': 평형 추정 시세 · 상황(LTV) · 자기자본 · 금리 · 기간으로
// 필요한 대출, 한도 안인지, 원리금균등 월 상환액, 그 상환액에 필요한 연소득(DSR)을 어림합니다.
// 기준값(LTV·DSR·금리·기간·집값 구간별 대출 한도)은 설정 [finder] 와 같고, 조건으로 찾기와 같은 계산입니다.
(function () {
  const box = document.querySelector("[data-pay]");
  if (!box) return;
  const { el } = DJ;
  let R = {};
  try { R = JSON.parse(box.dataset.rules || "{}"); } catch (e) { /* 기본값 */ }
  const LTV = Object.assign({ first: 0.8, none: R.ltv || 0.7, switch: R.ltv || 0.7, multi: 0.6 }, R.ltv_by || {});
  const DSR = R.dsr || 0.4, CAPS = Array.isArray(R.caps) && R.caps.length ? R.caps : null;
  const $ = s => box.querySelector(s);
  const py = $("[data-pay-py]"), st = $("[data-pay-st]"), eq = $("[data-pay-eq]"), rate = $("[data-pay-rate]"), yr = $("[data-pay-yr]"), out = $("[data-pay-out]");
  const saved = DJ.load("pay", {});
  rate.value = saved.rate ?? R.rate ?? 4;
  yr.value = saved.years ?? R.years ?? 30;
  if (saved.eq) eq.value = saved.eq;
  if (saved.st) st.value = saved.st;
  const eok = m => (Math.abs(m) >= 10000 ? (+(m / 10000).toFixed(2)) + "억" : Math.round(m).toLocaleString() + "만") + "원";
  const row = (k, v, cls) => { const d = el("div", "pay-row" + (cls ? " " + cls : "")); d.append(el("span", "", k), el("b", "", v)); return d; };

  function calc() {
    const price = +py.value, equity = Math.max(0, +eq.value || 0);
    const r = (+rate.value || 0) / 100 / 12, n = Math.max(1, +yr.value || 30) * 12;
    DJ.save("pay", { rate: +rate.value, years: +yr.value, eq: eq.value, st: st.value });
    out.replaceChildren();
    if (!eq.value) { out.append(el("p", "muted", "자기자본을 입력하면 필요한 대출과 한 달 상환액을 계산합니다.")); return; }
    const need = Math.max(0, price - equity);
    let limit = price * (LTV[st.value] || 0.7), why = `LTV ${Math.round((LTV[st.value] || 0.7) * 100)}%`;
    if (CAPS) {   // 집값 구간별 대출 한도 (서울)
      const cap = (CAPS.find(([hi]) => price <= hi) || CAPS[CAPS.length - 1])[1];
      if (cap < limit) { limit = cap; why = `집값 구간 한도 ${eok(cap)}`; }
    }
    const loan = Math.min(need, limit);
    const pay = loan ? (r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n) : 0;
    const big = el("div", "pay-big");
    big.append(el("span", "", "한 달 상환액 (원리금균등)"), el("strong", "", loan ? "약 " + eok(pay) : "대출 없음"));
    out.append(big,
      row("필요한 대출", need ? eok(need) : "없음"),
      row("대출 한도 어림", `${eok(limit)} (${why})`));
    if (need > limit) out.append(row("자기자본 부족", "약 " + eok(need - limit), "warn"));
    if (loan) out.append(row("필요한 연소득 (DSR " + Math.round(DSR * 100) + "%)", "약 " + eok(pay * 12 / DSR) + " 이상"),
      row(Math.round(n / 12) + "년간 낼 이자", "약 " + eok(pay * n - loan)));
  }
  [py, st, eq, rate, yr].forEach(x => x.addEventListener("input", calc));
  calc();
})();
