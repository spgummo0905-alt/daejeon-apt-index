// 집감 위성 사진 대리 서버 (Cloudflare Workers).
// 브이월드 키를 사이트 코드에 넣지 않으려고, 브라우저는 이 주소로 요청하고 키는 여기(시크릿)에만 둡니다.
// 사진은 저장하지 않고 그때그때 받아 전달합니다(브이월드 약관: 저장·DB 구축 금지). 출처 표기는 화면에서 합니다.
const ALLOWED = ["https://www.jipgam.kr", "https://jipgam.kr"];
const Z_MIN = 15, Z_MAX = 18;

export function tileOf(lat, lng, z) {
  const n = 2 ** z, rad = lat * Math.PI / 180;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n);
  return { x, y };
}

function origin(req) {
  const o = req.headers.get("Origin");
  if (o) return o;
  const r = req.headers.get("Referer");
  try { return r ? new URL(r).origin : ""; } catch (_) { return ""; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), from = origin(req);
    const ok = ALLOWED.includes(from) || (env.ALLOW_LOCAL === "1" && /^http:\/\/localhost(:\d+)?$/.test(from));
    const cors = ok ? { "Access-Control-Allow-Origin": from, "Vary": "Origin" } : {};
    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (req.method !== "GET") return new Response("허용하지 않는 요청이에요.", { status: 405 });
    if (!ok) return new Response("이 주소에서는 쓸 수 없어요.", { status: 403 });
    if (url.pathname !== "/tile") return new Response("없는 주소예요.", { status: 404, headers: cors });
    const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng")), z = Math.round(Number(url.searchParams.get("z") || 17));
    if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) || !(z >= Z_MIN && z <= Z_MAX))   // 한국 안의 좌표만
      return new Response("좌표나 확대 값이 올바르지 않아요.", { status: 400, headers: cors });
    if (!env.VWORLD_KEY) return new Response("서버 설정이 아직 끝나지 않았어요.", { status: 503, headers: cors });
    const dx = Math.round(Number(url.searchParams.get("dx") || 0)), dy = Math.round(Number(url.searchParams.get("dy") || 0));
    if (!(Math.abs(dx) <= 2 && Math.abs(dy) <= 2)) return new Response("이동 값이 올바르지 않아요.", { status: 400, headers: cors });   // 단지 둘레 몇 칸만
    const t0 = tileOf(lat, lng, z), x = t0.x + dx, y = t0.y + dy;
    const up = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${env.VWORLD_KEY}/Satellite/${z}/${y}/${x}.jpeg`);
    if (!up.ok) return new Response("사진을 받아오지 못했어요.", { status: 502, headers: cors });
    return new Response(up.body, { status: 200, headers: { ...cors, "Content-Type": up.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "private, max-age=3600", "X-Tile": `${z}/${x}/${y}` } });   // 브라우저에만 1시간, 서버에는 저장하지 않음
  },
};
