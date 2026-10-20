// 메인 지도: 카카오맵 위에 단지별 지수 배지를 올리고, 멀리서 볼 때는 개수 묶음(클러스터)으로 보여줍니다.
// KAKAO_JS_KEY 가 있고 카카오 콘솔에 사이트 도메인이 등록됐을 때만 동작하고,
// 아니면 아래의 그림 지도(SVG)가 그대로 남습니다.
(function () {
  const wrap = document.getElementById("kmap-wrap");
  if (!wrap || !window.kakao || !kakao.maps) return;

  function text(tag, cls, value) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value;
    return el;
  }

  kakao.maps.load(async function () {
    let pts;
    try {
      pts = await (await fetch("points.json")).json();
    } catch (e) {
      return;
    }
    if (!pts || !pts.length) return;
    wrap.classList.add("kmap-on");

    const map = new kakao.maps.Map(document.getElementById("kmap"), {
      center: new kakao.maps.LatLng(36.35, 127.385), level: 8,
    });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    const card = document.getElementById("kmap-card");

    function show(p) {
      card.replaceChildren();
      const left = document.createElement("div");
      const title = text("a", "", p.n);
      title.href = "apt/" + p.s + ".html";
      title.style.fontWeight = "700";
      left.append(title, document.createElement("br"),
        text("span", "muted", p.d + " · 지수 " + (p.i == null ? "-" : p.i) + " · " + p.g + "등급" +
          (p.p ? " · 84㎡ " + p.p : "") + (p.h ? " · 최근 신고가" : "")));
      const go = text("a", "btn", "자세히 →");
      go.href = title.href;
      card.append(left, go);
    }

    const bounds = new kakao.maps.LatLngBounds();
    const overlays = pts.map(function (p) {
      const pos = new kakao.maps.LatLng(p.la, p.ln);
      bounds.extend(pos);
      const pin = document.createElement("div");
      pin.className = "kpin g-" + p.g + (p.h ? " hi" : "");
      pin.append(text("span", "", p.i == null ? "-" : String(p.i)), text("span", "nm", p.n));
      pin.addEventListener("click", function (e) { e.stopPropagation(); show(p); });
      return new kakao.maps.CustomOverlay({ position: pos, content: pin, xAnchor: 0.5, yAnchor: 1, clickable: true });
    });
    map.setBounds(bounds);

    const circle = function (size, bg) {
      return { width: size + "px", height: size + "px", lineHeight: size + "px", borderRadius: size / 2 + "px",
               background: bg, color: "#fff", textAlign: "center", fontWeight: "700", border: "2px solid #fff" };
    };
    const clusterer = new kakao.maps.MarkerClusterer({
      map: map, averageCenter: true, minLevel: 6, gridSize: 70,
      calculator: [10, 50, 150],
      styles: [circle(34, "rgba(85,152,231,.92)"), circle(42, "rgba(42,120,214,.92)"),
               circle(50, "rgba(28,92,171,.92)"), circle(58, "rgba(16,66,129,.92)")],
    });
    clusterer.addMarkers(overlays);

    // 충분히 확대하면 점수 옆에 단지 이름도 보여줍니다.
    const names = function () { wrap.classList.toggle("show-names", map.getLevel() <= 4); };
    kakao.maps.event.addListener(map, "zoom_changed", names);
    names();
  });
})();
