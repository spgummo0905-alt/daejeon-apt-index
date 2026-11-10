// 단지 상세의 '위에서 본 단지': 대리 서버(workers/satellite)에서 단지 둘레 3×3 타일을 받아 한 장처럼 보여 줍니다.
// 키는 이 파일에 없습니다(서버에만). 사진은 저장하지 않고, 대부분 못 받으면 칸 전체를 지웁니다(빈 칸·깨진 그림을 보이지 않음).
// 첫 화면 속도를 지키려고 페이지가 다 뜬 뒤 한가할 때 불러옵니다.
(function () {
  "use strict";
  const box = document.querySelector("[data-sat]");
  if (!box) return;
  const api = (box.dataset.api || "").replace(/\/$/, ""), lat = +box.dataset.lat, lng = +box.dataset.lng, Z = 17;
  const grid = box.querySelector("[data-sat-grid]");
  if (!api || !isFinite(lat) || !isFinite(lng) || !grid) { box.remove(); return; }
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push([dx, dy]);
  let loaded = 0, failed = 0;
  const done = () => {
    if (loaded + failed < cells.length) return;
    if (loaded >= 5) box.hidden = false; else box.remove();
  };
  const start = () => cells.forEach(([dx, dy]) => {
    const img = new Image();
    img.alt = ""; img.decoding = "async"; img.referrerPolicy = "strict-origin-when-cross-origin";
    img.style.gridColumn = dx + 2; img.style.gridRow = dy + 2;
    img.onload = () => { loaded++; done(); };
    img.onerror = () => { failed++; img.remove(); done(); };
    grid.append(img);
    img.src = `${api}/tile?lat=${lat}&lng=${lng}&z=${Z}&dx=${dx}&dy=${dy}`;
  });
  const go = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 3000 }) : setTimeout(start, 800));
  if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
})();
