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

  // 핀에 보일 값: 84㎡ 가격(기본)·지수·전세가율
  const label = { p: p => p.pt || "-", i: p => (p.i == null ? "-" : p.i + "점"), j: p => (p.jr ? p.jr + "%" : "-") };

  // ---------- 거르기: 84㎡ 가격대(지역 단지들의 4분위로 나눔)와 조건, 핀 값 바꾸기. 고른 것은 이 기기에 기억 ----------
  function filters(items, clusterer) {
    const ctl = document.getElementById("kmap-ctl");
    if (!ctl) return;
    const st = Object.assign({ show: "p", band: -1, flags: [] }, DJ.load("kmap", {}));
    const now = new Date().getFullYear();
    const prices = items.map(function (x) { return x.p.p; }).filter(function (v) { return v; }).sort(function (a, b) { return a - b; });
    // 경계는 4분위를 보기 좋은 값으로 (10억 아래는 0.5억, 위는 1억 단위)
    const nice = function (v) { const e = v / 10000; return e < 10 ? Math.round(e * 2) / 2 : Math.round(e); };
    const q = [0.25, 0.5, 0.75].map(function (k) { return nice(prices[Math.floor(prices.length * k)] || 0); })
      .filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
    const bands = [{ lo: 0, hi: Infinity, label: "전체" }];
    q.forEach(function (v, i) { bands.push({ lo: i ? q[i - 1] : 0, hi: v, label: (i ? q[i - 1] + "~" : "") + v + "억" + (i ? "" : " 이하") }); });
    if (q.length) bands.push({ lo: q[q.length - 1], hi: Infinity, label: q[q.length - 1] + "억 넘게" });
    const pbox = ctl.querySelector("[data-km-price]");
    bands.forEach(function (b, k) {
      const btn = text("button", "chip", b.label);
      btn.type = "button";
      btn.dataset.band = k - 1;   // -1 = 전체
      pbox.append(btn);
    });
    const FLAG = {
      new: function (p) { return p.nw || (p.y && now - p.y <= 10); },
      big: function (p) { return p.hh >= 500; },
      stn: function (p) { return p.f && p.f.subway != null && p.f.subway <= 500; },
      hi: function (p) { return p.h; },
    };
    const count = ctl.querySelector("[data-km-count]");
    function ok(p) {
      if (st.band >= 0) {
        const b = bands[st.band + 1];
        if (!p.p || p.p / 10000 <= b.lo || p.p / 10000 > b.hi) return false;
      }
      return st.flags.every(function (f) { return FLAG[f] && FLAG[f](p); });
    }
    function apply() {
      DJ.save("kmap", st);
      items.forEach(function (x) { x.val.textContent = label[st.show](x.p); });
      const on = items.filter(function (x) { return ok(x.p); });
      clusterer.clear();
      clusterer.addMarkers(on.map(function (x) { return x.ov; }));
      count.textContent = on.length === items.length ? "단지 " + items.length.toLocaleString() + "곳" : "조건에 맞는 단지 " + on.length.toLocaleString() + "곳 / " + items.length.toLocaleString() + "곳";
      ctl.querySelectorAll("[data-km-show]").forEach(function (b) { const v = b.dataset.kmShow === st.show; b.classList.toggle("active", v); b.setAttribute("aria-pressed", v); });
      pbox.querySelectorAll("button").forEach(function (b) { const v = +b.dataset.band === st.band; b.classList.toggle("active", v); b.setAttribute("aria-pressed", v); });
      ctl.querySelectorAll("[data-km-flag]").forEach(function (b) { const v = st.flags.indexOf(b.dataset.kmFlag) >= 0; b.classList.toggle("active", v); b.setAttribute("aria-pressed", v); });
    }
    ctl.addEventListener("click", function (e) {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.kmShow) st.show = b.dataset.kmShow;
      else if (b.dataset.band != null) st.band = +b.dataset.band;
      else if (b.dataset.kmFlag) {
        const f = b.dataset.kmFlag, i = st.flags.indexOf(f);
        if (i >= 0) st.flags.splice(i, 1); else st.flags.push(f);
      }
      apply();
    });
    if (!label[st.show]) st.show = "p";
    if (st.band >= bands.length - 1) st.band = -1;
    ctl.hidden = false;
    apply();
  }

  kakao.maps.load(async function () {
    let pts;
    try {
      pts = (await DJ.data()).complexes.filter(function (c) { return c.la != null && c.ln != null; });
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
      title.href = DJ.href(p);
      title.style.fontWeight = "700";
      left.append(title, document.createElement("br"),
        text("span", "muted", DJ.place(p) + " · 지수 " + (p.i == null ? "-" : p.i) + " · " + p.g + "등급" +
          (p.pt ? " · 84㎡ " + p.pt : "") + (p.h ? " · 최근 신고가" : "")));
      const go = text("a", "btn", "자세히 →");
      go.href = title.href;
      card.append(left, go);
    }

    const bounds = new kakao.maps.LatLngBounds();
    const items = pts.map(function (p) {
      const pos = new kakao.maps.LatLng(p.la, p.ln);
      bounds.extend(pos);
      const pin = document.createElement("div");
      pin.className = "kpin g-" + p.g + (p.h ? " hi" : "");
      const val = text("span", "", label.p(p));
      pin.append(val, text("span", "nm", p.n));
      pin.addEventListener("click", function (e) { e.stopPropagation(); show(p); });
      return { p: p, val: val, ov: new kakao.maps.CustomOverlay({ position: pos, content: pin, xAnchor: 0.5, yAnchor: 1, clickable: true }) };
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
    clusterer.addMarkers(items.map(function (x) { return x.ov; }));
    filters(items, clusterer);

    // 충분히 확대하면 값 옆에 단지 이름도 보여줍니다.
    const names = function () { wrap.classList.toggle("show-names", map.getLevel() <= 4); };
    kakao.maps.event.addListener(map, "zoom_changed", names);
    names();
  });
})();
