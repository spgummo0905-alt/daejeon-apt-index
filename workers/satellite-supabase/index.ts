// 집감 위성 사진 대리 서버 (Supabase Edge Function, 서울 쪽에서 실행되도록 사용).
// 브이월드가 Cloudflare 서버의 요청을 거절해서 옮겼습니다. 키는 Supabase 시크릿 VWORLD_KEY 에만 있습니다.
// 사진은 저장하지 않고 그대로 전달합니다(브이월드 약관). DB·로그인·SQL은 전혀 쓰지 않습니다.
const ALLOWED = ["https://www.jipgam.kr", "https://jipgam.kr"];

function tileOf(lat: number, lng: number, z: number) {
  const n = 2 ** z, rad = lat * Math.PI / 180;
  return { x: Math.floor((lng + 180) / 360 * n), y: Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n) };
}
function originOf(req: Request) {
  const o = req.headers.get("Origin");
  if (o) return o;
  try { const r = req.headers.get("Referer"); return r ? new URL(r).origin : ""; } catch (_) { return ""; }
}
const text = (m: string, status: number, h: Record<string, string> = {}) =>
  new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...h } });

export async function handle(req: Request, key: string | undefined): Promise<Response> {
  const url = new URL(req.url), from = originOf(req), ok = ALLOWED.includes(from);
  const cors: Record<string, string> = ok ? { "Access-Control-Allow-Origin": from, "Vary": "Origin" } : {};
  if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
  if (req.method !== "GET") return text("허용하지 않는 요청이에요.", 405);
  if (!ok) return text("이 주소에서는 쓸 수 없어요.", 403);
  if (!url.pathname.endsWith("/tile")) return text("없는 주소예요.", 404, cors);
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  const z = Math.round(Number(url.searchParams.get("z") || 17));
  const dx = Math.round(Number(url.searchParams.get("dx") || 0)), dy = Math.round(Number(url.searchParams.get("dy") || 0));
  if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) || !(z >= 15 && z <= 18) || !(Math.abs(dx) <= 2 && Math.abs(dy) <= 2))
    return text("좌표나 확대 값이 올바르지 않아요.", 400, cors);
  if (!key) return text("서버 설정이 아직 끝나지 않았어요.", 503, cors);
  const t0 = tileOf(lat, lng, z), x = t0.x + dx, y = t0.y + dy;
  const path = `/req/wmts/1.0.0/${encodeURIComponent(key.replace(/\s+/g, ""))}/Satellite/${z}/${y}/${x}.jpeg`;
  const log: string[] = []; let up: Response | null = null;
  for (const [name, u, headers] of [
    ["https", `https://api.vworld.kr${path}`, {}],
    ["http", `http://api.vworld.kr${path}`, {}],
    ["https+ref", `https://api.vworld.kr${path}`, { Referer: "https://www.jipgam.kr/" }],
  ] as [string, string, Record<string, string>][]) {
    try {
      const r = await fetch(u, { headers });
      log.push(`${name}:${r.status}`);
      if (r.ok && (r.headers.get("Content-Type") || "").startsWith("image/")) { up = r; break; }
    } catch (_) { log.push(`${name}:err`); }
  }
  if (!up) return text("사진을 받아오지 못했어요.", 502, { ...cors, "X-Attempts": log.join(",") });   // 번호만, 키는 절대 넣지 않음
  return new Response(up.body, { status: 200, headers: { ...cors, "Content-Type": up.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}

// @ts-ignore Deno 환경에서만 있음
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve((req: Request) => handle(req, Deno.env.get("VWORLD_KEY")));
