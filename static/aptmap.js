// 단지 페이지 입지 지도: 도보권 → 교육 → 생활 편의 → 녹지 → 치안·안전을 차례로 넘겨 보며
// 카카오맵 위에 주변 시설을 올립니다. 시설은 보는 사람 브라우저에서 카카오 장소 검색으로 그때 찾고(단계마다 한 번),
// 거리는 단지에서 직선거리입니다. KAKAO_JS_KEY 가 있고 카카오 콘솔에 사이트 도메인을 등록했을 때만 동작합니다.
// 문구는 textContent 로만 넣습니다.
(function () {
  const root = document.querySelector("[data-lm]");
  if (!root || !window.kakao || !kakao.maps) return;
  const el = DJ.el;
  const lat = parseFloat(root.dataset.lat), lng = parseFloat(root.dataset.lng), NAME = root.dataset.name;
  const HUBS = (() => { try { return JSON.parse(root.dataset.hubs || "[]"); } catch (e) { return []; } })();
  const STOP = root.dataset.stop || "지하철역";
  const walk = m => Math.max(1, Math.round(m * 1.3 / 80));   // 직선거리 → 걸어서 몇 분 (우회 1.3배, 분당 80m)
  const fmtM = m => m >= 1000 ? (m / 1000).toFixed(1) + "km" : Math.round(m) + "m";

  const STEPS = [
    { id: "walk", name: "도보권", level: 4, searches: [
        { key: "stn", code: "SW8", radius: 1500, max: 3 },
        { key: "ele", code: "SC4", radius: 1500, filter: p => /초등학교$/.test(p.place_name), max: 2 }],
      draw: drawWalk },
    { id: "edu", name: "교육", level: 4, searches: [
        { key: "sch", code: "SC4", radius: 1000, max: 45 },
        { key: "aca", code: "AC5", radius: 750, max: 45 }],
      draw: drawEdu },
    { id: "life", name: "생활 편의", level: 4, searches: [
        { key: "mart", code: "MT1", radius: 2000, max: 3 },
        { key: "conv", code: "CS2", radius: 500, max: 15 },
        { key: "hosp", code: "HP8", radius: 1000, max: 45 },
        { key: "phar", code: "PM9", radius: 750, max: 15 },
        { key: "bank", code: "BK9", radius: 1000, max: 8 },
        { key: "pub", code: "PO3", radius: 1000, max: 8 }],
      draw: drawLife },
    { id: "green", name: "녹지", level: 5, searches: [
        { key: "park", word: "공원", radius: 1500, filter: p => /공원|숲|수목원|산책로/.test(p.category_name + p.place_name), max: 15 },
        { key: "water", word: "천", radius: 1500, filter: p => /하천|강|호수|천$/.test(p.category_name + p.place_name), max: 5 }],
      draw: drawGreen },
    { id: "safe", name: "치안·안전", level: 5, searches: [
        { key: "police", word: "지구대", radius: 2000, filter: p => /지구대|파출소|경찰서/.test(p.place_name), max: 4 },
        { key: "police2", word: "파출소", radius: 2000, filter: p => /지구대|파출소|경찰서/.test(p.place_name), max: 4 },
        { key: "fire", word: "119안전센터", radius: 3000, filter: p => /소방서|안전센터/.test(p.place_name), max: 3 },
        { key: "er", word: "응급실", radius: 5000, filter: p => /병원/.test(p.category_name + p.place_name), max: 2 }],
      draw: drawSafe },
  ];

  let map, home, places, cur = 0;
  const cache = {}, layers = [];
  const factsBox = root.querySelector("[data-lm-facts]"), legendBox = root.querySelector("[data-lm-legend]");

  kakao.maps.load(() => {
    home = new kakao.maps.LatLng(lat, lng);
    map = new kakao.maps.Map(root.querySelector("[data-lm-map]"), { center: home, level: 4 });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    places = kakao.maps.services ? new kakao.maps.services.Places() : null;
    const pin = el("div", "lm-home");
    pin.append(el("b", "", NAME));
    new kakao.maps.CustomOverlay({ map, position: home, content: pin, yAnchor: 1.15, zIndex: 5 });
    root.querySelectorAll("[data-lm-type]").forEach(b => b.addEventListener("click", () => {
      const sat = b.dataset.lmType === "sat";
      map.setMapTypeId(sat ? kakao.maps.MapTypeId.HYBRID : kakao.maps.MapTypeId.ROADMAP);
      root.querySelectorAll("[data-lm-type]").forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", x === b); });
    }));
    tabs();
    go(0);
  });

  // ---------- 단계 이동 ----------
  function tabs() {
    const box = root.querySelector("[data-lm-tabs]");
    box.replaceChildren(...STEPS.map((st, i) => {
      const b = el("button", "lm-tab");
      b.type = "button";
      b.append(el("i", "", String(i + 1)), document.createTextNode(st.name));
      b.addEventListener("click", () => go(i));
      return b;
    }));
    root.querySelector("[data-lm-prev]").addEventListener("click", () => go(Math.max(0, cur - 1)));
    root.querySelector("[data-lm-next]").addEventListener("click", () => go((cur + 1) % STEPS.length));
  }
  function go(i) {
    cur = i;
    const st = STEPS[i];
    root.querySelectorAll(".lm-tab").forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-pressed", k === i); });
    root.querySelector("[data-lm-count]").textContent = `${i + 1} / ${STEPS.length}`;
    const prev = root.querySelector("[data-lm-prev]"), next = root.querySelector("[data-lm-next]");
    prev.hidden = i === 0;
    if (!prev.hidden) prev.querySelector("b").textContent = STEPS[i - 1].name;
    next.querySelector("span").textContent = i === STEPS.length - 1 ? "처음으로" : "다음 지도";
    next.querySelector("b").textContent = STEPS[(i + 1) % STEPS.length].name;
    clear();
    map.setLevel(st.level);
    map.setCenter(home);
    factsBox.replaceChildren(el("p", "muted", "주변을 찾는 중…"));
    legendBox.replaceChildren();
    load(st).then(res => { if (cur === i) st.draw(res); });
  }
  function clear() { while (layers.length) layers.pop().setMap(null); }

  // ---------- 카카오 장소 검색 (단계마다 한 번, 결과는 기억) ----------
  function search(s) {
    return new Promise(resolve => {
      if (!places) return resolve([]);
      const S = kakao.maps.services;
      const out = [];
      const opts = { location: home, radius: s.radius, sort: S.SortBy.DISTANCE };
      const cb = (data, status, page) => {
        if (status === S.Status.OK) {
          data.forEach(p => { if (!s.filter || s.filter(p)) out.push(p); });
          if (out.length < s.max && page && page.hasNextPage && page.current < 3) return page.nextPage();
        }
        resolve(out.slice(0, s.max));
      };
      if (s.code) places.categorySearch(s.code, cb, opts); else places.keywordSearch(s.word, cb, opts);
    });
  }
  function load(st) {
    if (cache[st.id]) return Promise.resolve(cache[st.id]);
    return Promise.all(st.searches.map(s => search(s).then(r => [s.key, r]))).then(pairs => {
      const res = {};
      pairs.forEach(([k, r]) => { res[k] = r; });
      cache[st.id] = res;
      return res;
    });
  }

  // ---------- 지도 위에 올리기 ----------
  const pos = p => new kakao.maps.LatLng(+p.y, +p.x);
  const dist = p => +p.distance || 0;
  function dot(p, cls, label, z) {
    const d = el("div", "lm-dot " + cls);
    if (label) d.append(el("span", "", label));
    d.title = p.place_name + " · " + fmtM(dist(p));
    const o = new kakao.maps.CustomOverlay({ map, position: pos(p), content: d, yAnchor: 0.5, xAnchor: label ? 0.08 : 0.5, zIndex: z || 2 });
    layers.push(o);
  }
  function ring(m, label) {
    layers.push(new kakao.maps.Circle({ map, center: home, radius: m, strokeWeight: 1.5, strokeColor: "#1baf7a", strokeOpacity: 0.8,
      strokeStyle: "shortdash", fillColor: "#1baf7a", fillOpacity: m <= 250 ? 0.10 : 0.04 }));
    if (label) {
      const t = el("div", "lm-ring", label);
      const p = new kakao.maps.LatLng(lat + m / 111320, lng);
      layers.push(new kakao.maps.CustomOverlay({ map, position: p, content: t, yAnchor: 1.1, zIndex: 1 }));
    }
  }
  function line(p, cls) {
    layers.push(new kakao.maps.Polyline({ map, path: [home, pos(p)], strokeWeight: 3, strokeColor: cls === "stn" ? "#2a78d6" : "#52514e",
      strokeOpacity: 0.85, strokeStyle: "shortdot" }));
  }
  function legend(items) {
    legendBox.replaceChildren(...items.map(([cls, text]) => { const s = el("span", "lm-key"); s.append(el("i", cls), document.createTextNode(text)); return s; }));
  }
  function facts(rows, note) {
    const ul = el("ul", "lm-list");
    rows.forEach(([k, v, sub]) => {
      const li = el("li");
      li.append(el("span", "lm-k", k), el("b", "", v));
      if (sub) li.append(el("span", "lm-sub", sub));
      ul.append(li);
    });
    factsBox.replaceChildren(ul);
    if (note) factsBox.append(el("p", "muted lm-note", note));
  }
  const nearest = (arr, n) => (arr || []).slice(0, n || 1);
  const shortStn = n => n.replace(/\s.*$/, "");

  function drawWalk(r) {
    [[250, "반경 250m · 걸어서 약 4분"], [500, "500m · 약 8분"], [750, "750m · 약 12분"]].forEach(([m, t]) => ring(m, t));
    nearest(r.stn, 2).forEach(p => { line(p, "stn"); dot(p, "stn", `${shortStn(p.place_name)} ${fmtM(dist(p))}`, 4); });
    nearest(r.ele, 1).forEach(p => { line(p); dot(p, "ele", `${p.place_name.replace(/등학교$/, "")} ${fmtM(dist(p))}`, 4); });
    legend([["k-ring", "반경 250·500·750m"], ["k-stn", STOP], ["k-ele", "가장 가까운 초등학교"]]);
    const rows = nearest(r.stn, 2).map(p => [STOP, `${shortStn(p.place_name)} ${fmtM(dist(p))}`, `걸어서 약 ${walk(dist(p))}분`]);
    if (!rows.length) rows.push([STOP, "1.5km 안에 없음", ""]);
    const e = nearest(r.ele, 1)[0];
    rows.push(["초등학교", e ? `${e.place_name} ${fmtM(dist(e))}` : "1.5km 안에 없음", e ? `걸어서 약 ${walk(dist(e))}분` : ""]);
    facts(rows, "거리는 단지 중심에서 직선거리이고, 걷는 시간은 길이 1.3배 돌아간다고 보고 어림했습니다. 배정 학교는 교육청 학구도를 확인하세요.");
  }
  function drawEdu(r) {
    const kind = p => /초등학교$/.test(p.place_name) ? "ele" : /중학교$/.test(p.place_name) ? "mid" : /고등학교$/.test(p.place_name) ? "high" : null;
    const sch = (r.sch || []).filter(kind);
    ring(1000, "반경 1km");
    (r.aca || []).forEach(p => dot(p, "aca"));
    sch.forEach(p => dot(p, kind(p), p.place_name.replace(/(등학교|학교)$/, ""), 3));
    HUBS.forEach(h => {
      layers.push(new kakao.maps.Circle({ map, center: new kakao.maps.LatLng(h.lat, h.lng), radius: 450, strokeWeight: 2, strokeColor: "#db2777",
        strokeOpacity: 0.7, strokeStyle: "dash", fillColor: "#f472b6", fillOpacity: 0.10 }));
      const t = el("div", "lm-ring hub", h.name);
      layers.push(new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(h.lat, h.lng), content: t, zIndex: 1 }));
    });
    legend([["k-ele", "초등학교"], ["k-mid", "중학교"], ["k-high", "고등학교"], ["k-aca", "학원"], ...(HUBS.length ? [["k-hub", "주요 학원가"]] : [])]);
    const n = k => sch.filter(p => kind(p) === k).length;
    const near = k => sch.find(p => kind(p) === k);
    const fmt = p => p ? `${p.place_name} ${fmtM(dist(p))}` : "1km 안에 없음";
    const aca = (r.aca || []).length;
    facts([["반경 1km 학교", `초 ${n("ele")} · 중 ${n("mid")} · 고 ${n("high")}`, ""],
      ["가까운 중학교", fmt(near("mid")), ""], ["가까운 고등학교", fmt(near("high")), ""],
      ["반경 750m 학원", aca >= 45 ? "45곳 넘음" : `${aca}곳`, root.dataset.hub || ""]],
      "학교 이름은 카카오 장소 정보 기준입니다. 고등학교는 평준화 지역이라 지망·추첨으로 배정됩니다.");
  }
  function drawLife(r) {
    ring(500, "반경 500m"); ring(1000, "1km");
    (r.conv || []).forEach(p => dot(p, "conv"));
    (r.phar || []).forEach(p => dot(p, "phar"));
    (r.hosp || []).forEach(p => dot(p, "hosp"));
    (r.bank || []).forEach(p => dot(p, "bank"));
    (r.pub || []).forEach(p => dot(p, "pub"));
    nearest(r.mart, 2).forEach(p => dot(p, "mart", `${p.place_name} ${fmtM(dist(p))}`, 4));
    legend([["k-mart", "대형마트"], ["k-hosp", "병원"], ["k-phar", "약국"], ["k-conv", "편의점"], ["k-bank", "은행"], ["k-pub", "공공기관"]]);
    const m = nearest(r.mart, 1)[0];
    const c = arr => (arr || []).length;
    facts([["대형마트", m ? `${m.place_name} ${fmtM(dist(m))}` : "2km 안에 없음", m ? `걸어서 약 ${walk(dist(m))}분` : ""],
      ["반경 1km 병원", c(r.hosp) >= 45 ? "45곳 넘음" : `${c(r.hosp)}곳`, ""],
      ["반경 500m 편의점", `${c(r.conv)}곳`, ""], ["반경 750m 약국", `${c(r.phar)}곳`, ""],
      ["반경 1km 은행·공공기관", `${c(r.bank)} · ${c(r.pub)}곳`, ""]]);
  }
  function drawGreen(r) {
    ring(800, "반경 800m");
    (r.park || []).forEach(p => dot(p, "park", p.place_name, 3));
    (r.water || []).forEach(p => dot(p, "water", p.place_name, 3));
    legend([["k-park", "공원·숲"], ["k-water", "하천·호수"]]);
    const p = nearest(r.park, 1)[0], w = nearest(r.water, 1)[0];
    const in800 = (r.park || []).filter(x => dist(x) <= 800).length;
    facts([["가까운 공원", p ? `${p.place_name} ${fmtM(dist(p))}` : "1.5km 안에 없음", p ? `걸어서 약 ${walk(dist(p))}분` : ""],
      ["반경 800m 공원·숲", `${in800}곳`, ""], ["가까운 물가", w ? `${w.place_name} ${fmtM(dist(w))}` : "1.5km 안에 없음", ""]],
      "공원은 카카오에 '공원'으로 등록된 곳입니다. 큰 산이나 녹지 면적은 위성 지도로 함께 보세요.");
  }
  function drawSafe(r) {
    const seen = new Set();
    const police = [...(r.police || []), ...(r.police2 || [])].filter(p => !seen.has(p.id) && seen.add(p.id)).sort((a, b) => dist(a) - dist(b));
    police.slice(0, 4).forEach(p => dot(p, "police", p.place_name, 3));
    (r.fire || []).forEach(p => dot(p, "fire", p.place_name, 3));
    nearest(r.er, 1).forEach(p => dot(p, "er", p.place_name, 3));
    ring(1000, "반경 1km");
    legend([["k-police", "지구대·파출소"], ["k-fire", "소방서·안전센터"], ["k-er", "응급실 있는 병원"]]);
    const f = (arr, none) => arr && arr[0] ? `${arr[0].place_name} ${fmtM(dist(arr[0]))}` : none;
    facts([["경찰", f(police, "2km 안에 없음"), ""], ["소방", f(r.fire, "3km 안에 없음"), ""], ["응급실", f(r.er, "5km 안에 없음"), ""]]);
  }
})();
