// 홈 '맞춤 설정 이어하기' 배너(시안 5·6번). 빠른 설정을 끝냈거나(prefs.onb) 닫았으면(prefs.onbHide) 안 보임. 저장은 기존 내 설정에만.
(function () {
  "use strict";
  const el = document.querySelector("[data-ob-banner]");
  if (!el || !window.DJ || !DJ.prefs || !DJ.setPref) return;
  const p = DJ.prefs();
  if (!p.onb && !p.onbHide) el.hidden = false;
  el.querySelector("[data-ob-banner-x]").addEventListener("click", () => {
    DJ.setPref("onbHide", 1);
    if (DJ.prefs().onbHide === 1) el.hidden = true;          // 저장이 확인된 뒤에만 닫음
  });
})();
