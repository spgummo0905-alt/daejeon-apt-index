// UX v2 공통 동작 부품 (PR 01): 모션 수치, 하단 영역 높이 공개, 취소할 수 있는 알림.
// 수치는 '집감 제안값'입니다(토스의 내부 값이 아님). CSS 변수(--ux-*)와 같은 값을 씁니다. 저장·계산에는 관여하지 않습니다.
(function () {
  "use strict";
  const DJ = window.DJ;
  if (!DJ || window.__uxMotion) return;     // 같은 페이지에 두 번 실리면 핸들러가 겹치지 않게
  window.__uxMotion = true;

  DJ.motion = Object.freeze({ press: 120, change: 220, sheet: 300, flip: 440, stamp: 380, undo: 3500, ease: "cubic-bezier(.2,.8,.2,1)" });

  // iOS 사파리는 터치 리스너가 하나라도 있어야 :active(눌림 모양)가 켜집니다
  document.addEventListener("touchstart", function () {}, { passive: true });

  // 하단 탭 막대·고정 버튼의 실제 높이를 한 곳에서 재서 변수로 공개합니다 (겹침 계산용: --tabbar-height, --actionbar-height)
  const root = document.documentElement;
  const publish = () => {
    const tab = document.querySelector(".tabbar"), cta = document.querySelector(".apt-cta:not([hidden]) .btn");
    const tabH = tab && getComputedStyle(tab).display !== "none" ? Math.round(tab.getBoundingClientRect().height) : 0;
    root.style.setProperty("--tabbar-height", tabH + "px");
    root.style.setProperty("--actionbar-height", (cta ? Math.round(cta.getBoundingClientRect().height) + 16 : 0) + "px");
  };
  publish();
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(publish);
    ro.observe(root);
    const tab = document.querySelector(".tabbar"); if (tab) ro.observe(tab);
  } else addEventListener("resize", publish);
  addEventListener("load", publish);

  // 취소할 수 있는 알림: 담기·저장 직후 3.5초 동안 '취소'. onUndo 는 원래 상태로 되돌리는 함수(호출하는 쪽이 책임)
  DJ.toastUndo = function (title, body, onUndo) {
    DJ.toast(title, body, DJ.motion.undo, { label: "취소", onClick: onUndo });
  };
})();
