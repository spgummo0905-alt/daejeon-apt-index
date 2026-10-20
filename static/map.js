// 카카오맵 표시 (KAKAO_JS_KEY 가 있고, 카카오 콘솔에 사이트 도메인을 등록했을 때만 로드됩니다)
(function () {
  const el = document.getElementById("map");
  if (!el || !window.kakao) return;
  kakao.maps.load(() => {
    const pos = new kakao.maps.LatLng(parseFloat(el.dataset.lat), parseFloat(el.dataset.lng));
    const map = new kakao.maps.Map(el, { center: pos, level: 4 });
    new kakao.maps.Marker({ map, position: pos, title: el.dataset.name });
  });
})();
