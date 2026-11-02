// 조건으로 찾기: 주소·장소 검색은 검색 버튼을 누를 때만 카카오에 요청합니다.
(function () {
  const valid = p => !!p && typeof p.name === "string" && !!p.name.trim()
    && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 30 && p.lat <= 40 && p.lng >= 123 && p.lng <= 133;
  function resolve(slot, presets, here) {
    if (!slot || !Number.isFinite(slot.lim) || slot.lim <= 0) return null;
    const p = slot.w === "custom" ? slot.p : slot.w === "here"
      ? (Array.isArray(here) ? { name: "내 위치", lat: here[0], lng: here[1] } : null)
      : /^\d+$/.test(slot.w) ? presets[Number(slot.w)] : null;
    return valid(p) ? { name: p.name, address: p.address || "", lat: p.lat, lng: p.lng, lim: slot.lim } : null;
  }
  let loading;
  function active(state, presets) {
    if (state.commute === "any" || !Array.isArray(state.works)) return [];
    return state.works.slice(0, state.two ? 2 : 1).map(w => resolve(w, presets, state.here)).filter(Boolean);
  }
  const available = () => !!document.body.dataset.kakao || !!window.kakao?.maps?.services;
  function services() {
    if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps.services);
    if (!available()) return Promise.reject(new Error("unavailable"));
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => fail(), 12000);
      function fail() { clearTimeout(timeout); script.remove(); reject(new Error("unavailable")); }
      script.onerror = fail;
      script.onload = () => {
        if (!window.kakao?.maps?.load) return fail();
        window.kakao.maps.load(() => {
          clearTimeout(timeout);
          if (window.kakao.maps.services) resolve(window.kakao.maps.services); else fail();
        });
      };
      script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + encodeURIComponent(document.body.dataset.kakao) + "&libraries=services&autoload=false";
      document.head.append(script);
    }).catch(e => { loading = null; throw e; });
    return loading;
  }
  function lookup(service, method, query, status) {
    return new Promise(resolve => {
      let finished = false;
      const done = value => { if (!finished) { finished = true; clearTimeout(timeout); resolve(value); } };
      const timeout = setTimeout(() => done({ rows: [], error: true }), 10000);
      try { service[method](query, (rows, code) => done({ rows: code === status.OK && Array.isArray(rows) ? rows : [], error: code !== status.OK && code !== status.ZERO_RESULT }), { size: 5 }); }
      catch (_) { done({ rows: [], error: true }); }
    });
  }
  async function search(query) {
    query = String(query || "").trim();
    if (query.length < 2) throw new Error("short");
    const s = await services();
    const [addresses, places] = await Promise.all([
      lookup(new s.Geocoder(), "addressSearch", query, s.Status),
      lookup(new s.Places(), "keywordSearch", query, s.Status),
    ]);
    const seen = new Set(), rows = [];
    for (const [items, address] of [[places.rows, false], [addresses.rows, true]]) for (const r of items) {
      const road = address ? r.road_address?.address_name : r.road_address_name;
      const p = { name: address ? (r.road_address?.building_name || road || r.address_name) : r.place_name,
        address: road || r.address_name || "", lat: Number(r.y), lng: Number(r.x) };
      const key = p.lat.toFixed(5) + ":" + p.lng.toFixed(5) + ":" + p.address;
      if (!valid(p) || seen.has(key)) continue;
      seen.add(key); rows.push(p);
    }
    if (!rows.length && (addresses.error || places.error)) throw new Error("search");
    return rows.slice(0, 8);
  }
  window.DJWorkplaces = { valid, resolve, active, available, search };
})();
