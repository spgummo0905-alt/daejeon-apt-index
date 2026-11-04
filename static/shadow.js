// 앞 동 그림자 계산 (순수 계산, 서버·라이브러리 없음). 참고용 추정입니다.
// - 해 위치: 날짜·위도·경도·시각(한국 표준시)만으로 계산합니다.
// - 건물: 동마다 윤곽(미터, 단지 중심 기준)과 층수(높이를 모르면 층수 x 층고로 추정).
// - 향(창이 어느 쪽)은 자료가 없어서, 동의 '남쪽을 보는 긴 면' 기준으로 계산합니다.
(function (root) {
  const RAD = Math.PI / 180, FLOOR_H = 2.7;

  // 해 고도·방위(북 0, 시계 방향) — NOAA 간이식. 한국은 표준시 UTC+9, 서머타임 없음.
  function sun(lat, lon, month, day, hour) {
    const doy = Math.round((Date.UTC(2026, month - 1, day) - Date.UTC(2026, 0, 0)) / 864e5);
    const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hour * 60 + eq + 4 * lon - 60 * 9;           // 진태양시(분)
    const ha = (tst / 4 - 180) * RAD, la = lat * RAD;
    const sinAlt = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const azS = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(dec) * Math.cos(la)); // 남 0, 서 +
    let az = (azS / RAD + 180 + 360) % 360;
    return { alt: alt / RAD, az, up: alt > 1 * RAD };
  }

  const hOf = b => (b.h && b.h > 0) ? b.h : b.f * FLOOR_H;       // 높이 모르면 층수 x 2.7m
  const estOf = b => !(b.h && b.h > 0);

  // 남쪽을 보는 긴 면: 바깥쪽 법선이 가장 남쪽(-y)을 향하는 긴 변. 꼭짓점이 시계·반시계 어느 쪽으로 적혀 있어도 같은 변을 고른다
  // (예전에는 가장 긴 변을 고른 뒤 법선만 남쪽으로 돌려서, 긴 변이 둘인 직사각형에서 북쪽 벽을 잘못 잡을 수 있었다)
  function face(b) {
    const p = b.poly, n = p.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = p[i], c = p[(i + 1) % n]; area += a[0] * c[1] - c[0] * a[1]; }
    const sgn = area >= 0 ? 1 : -1;                               // +1 반시계, -1 시계
    const edges = [];
    let longest = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      longest = Math.max(longest, len);
      edges.push({ a, c, dx, dy, len, nx: sgn * dy / len, ny: -sgn * dx / len });   // 바깥쪽 법선
    }
    const longs = edges.filter(e => e.len >= 0.6 * longest);
    let best = null;
    for (const e of longs) if (!best || e.ny < best.ny - 1e-9 || (Math.abs(e.ny - best.ny) <= 1e-9 && e.len > best.len)) best = e;
    // 남쪽을 향하는 긴 변이 하나도 없으면(드문 모양) 가장 긴 변의 바깥쪽 법선을 그대로 쓴다
    return { a: best.a, ex: best.dx / best.len, ey: best.dy / best.len, len: best.len, nx: best.nx, ny: best.ny,
             cx: (best.a[0] + best.c[0]) / 2, cy: (best.a[1] + best.c[1]) / 2 };
  }

  // 레이(P + t*u)가 폴리곤에 처음 닿는 거리 (없으면 null)
  function hitT(px, py, ux, uy, poly) {
    let tmin = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length];
      const sx = c[0] - a[0], sy = c[1] - a[1], den = ux * sy - uy * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - px) * sy - (a[1] - py) * sx) / den, s = ((a[0] - px) * uy - (a[1] - py) * ux) / den;
      if (t > 0.01 && s >= 0 && s <= 1 && (tmin === null || t < tmin)) tmin = t;
    }
    return tmin;
  }

  // 한 칸(동 b의 남쪽 면, 폭 위치 w(0~1), 층 fl(1부터))에 해가 드는가
  //  'sun' 해가 듦 · 'shade' 앞 동 그림자 · 'back' 해가 면의 반대편 · 'night' 해가 없음
  function cell(blds, b, fl, w, s) {
    if (!s.up) return 'night';
    const fc = face(b), alt = s.alt * RAD, az = s.az * RAD;
    const ux = Math.sin(az), uy = Math.cos(az);                  // 해 쪽 수평 방향(동 +x, 북 +y)
    if (ux * fc.nx + uy * fc.ny <= 0.05) return 'back';
    const wl = fc.ex >= 0 ? w : 1 - w;                              // 폭 위치는 서쪽(0)에서 동쪽(1) 으로 통일
    const px = fc.a[0] + fc.ex * fc.len * wl + fc.nx * 0.3, py = fc.a[1] + fc.ey * fc.len * wl + fc.ny * 0.3;
    const z = (fl - 0.5) * FLOOR_H, tan = Math.tan(alt);
    for (const o of blds) {
      if (o === b) continue;
      const t = hitT(px, py, ux, uy, o.poly);
      if (t !== null && z + t * tan < hOf(o)) return 'shade';
    }
    return 'sun';
  }

  // 위에서 본 그림자 모양: 지붕 높이 / tan(고도) 만큼 해 반대쪽으로 늘인 영역 (볼록 껍질)
  function hull(pts) {
    pts = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function shadowPoly(b, s) {
    if (!s.up || s.alt < 1) return null;
    const len = Math.min(hOf(b) / Math.tan(s.alt * RAD), 400), az = s.az * RAD;
    const dx = -Math.sin(az) * len, dy = -Math.cos(az) * len;
    return hull(b.poly.concat(b.poly.map(p => [p[0] + dx, p[1] + dy])));
  }

  // 하루 중 층별 해 드는 시간(시간 단위, 15분 간격 합) — 동의 남쪽 면 가운데 열 기준
  function sunHours(blds, b, fl, lat, lon, month, day) {
    let n = 0;
    for (let m = 6 * 60; m <= 19 * 60; m += 15) {
      const s = sun(lat, lon, month, day, m / 60);
      if (cell(blds, b, fl, 0.5, s) === 'sun') n++;
    }
    return n * 0.25;
  }

  // 화면에 시간을 보여 줄 때 반드시 함께 보여 줄 문구. 실제 공간 자료와 견주어 검증하기 전까지는 '정확한 일조시간'이라고 쓰지 않습니다.
  const NOTICE = "추정한 참고용 그림이에요. 높이·창 방향·나무·지형을 다 반영하지 못해 법적 일조권 판단 자료가 아니에요.";
  const api = { sun, face, cell, shadowPoly, sunHours, hOf, estOf, FLOOR_H, NOTICE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DJShadow = api;
})(typeof window !== 'undefined' ? window : globalThis);
