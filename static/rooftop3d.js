// 집감 옥상 3D 장면 (three.js). 그림 파일 없이 전부 코드로 만듭니다.
// - 하늘: 지금 시각·달 모양·날씨(바깥에서 받아 옴)를 반영, 별·은하수·구름은 셰이더
// - 도시: 창문이 있는 건물 수백 채(인스턴스), 먼 곳은 안개로 흐려짐
// - 불꽃: 3D 입자, 종류가 열 가지, 쏘는 소리·터지는 소리는 rooftop.js 가 맡음
// rooftop.js 가 start() 를 불러 장면을 받아 가고, 눌러서 하는 일은 콜백(cb)으로 알려줍니다.
import * as THREE from "./vendor/three.module.min.js";

const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const mulberry = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hashStr = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const C = (r, g, b) => new THREE.Color(r / 255, g / 255, b / 255);
const FW_COLORS = [[255, 200, 110], [255, 80, 70], [110, 255, 140], [90, 150, 255], [200, 120, 255], [255, 248, 235], [255, 130, 190], [255, 150, 60], [90, 235, 255]];

// ---------- 하늘 색 (해 높이에 따라) ----------
const KEYS = [
  { a: -0.55, top: [3, 6, 20], mid: [11, 22, 52], bot: [40, 48, 86], fog: [34, 36, 62], amb: [.10, .12, .20], night: 1, stars: 1 },
  { a: -0.17, top: [8, 14, 40], mid: [30, 40, 92], bot: [96, 76, 120], fog: [74, 62, 104], amb: [.14, .15, .26], night: .95, stars: .8 },
  { a: -0.05, top: [24, 36, 86], mid: [120, 76, 128], bot: [255, 138, 84], fog: [214, 120, 100], amb: [.30, .26, .34], night: .55, stars: .18 },
  { a: 0.06, top: [54, 96, 176], mid: [160, 150, 190], bot: [255, 196, 140], fog: [226, 178, 150], amb: [.5, .46, .46], night: .15, stars: 0 },
  { a: 0.40, top: [62, 128, 214], mid: [128, 184, 238], bot: [210, 230, 246], fog: [190, 214, 236], amb: [.8, .84, .9], night: 0, stars: 0 },
];
function skyAt(alt) {
  let i = 0; while (i < KEYS.length - 2 && alt > KEYS[i + 1].a) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = clamp((alt - A.a) / (B.a - A.a), 0, 1), s = t * t * (3 - 2 * t);
  const mix = k => A[k].map((v, j) => lerp(v, B[k][j], s));
  return { top: mix("top"), mid: mix("mid"), bot: mix("bot"), fog: mix("fog"), amb: mix("amb"), night: lerp(A.night, B.night, s), stars: lerp(A.stars, B.stars, s) };
}
// 해·달 위치 (대략). 장면에서 -z 가 남쪽
function astro(date, lat, lon) {
  const jd = date.getTime() / 864e5 + 2440587.5, d = jd - 2451545.0, rad = Math.PI / 180;
  const L = (280.46 + 0.9856474 * d) % 360, g = ((357.528 + 0.9856003 * d) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = 23.439 * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, lst = (gmst * 15 + lon) * rad;
  const pos = (ra_, dec_) => {
    const H = lst - ra_, phi = lat * rad;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec_) + Math.cos(phi) * Math.cos(dec_) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec_) * Math.cos(phi)) + Math.PI;   // 북쪽 기준 시계 방향
    return { alt, az };
  };
  const sun = pos(ra, dec);
  const phase = (((jd - 2451550.1) / 29.530588853) % 1 + 1) % 1;
  const mra = ra + phase * TAU, mdec = Math.sin(phase * TAU + 1.2) * 0.38;   // 달은 해보다 늦게 뜨고 지며 높이는 달라짐 (대략)
  const moon = pos(mra, mdec);
  return { sun, moon, phase };
}
const dirOf = (alt, az) => new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt));   // x 동, z 북 → -z 남

// ---------- 셰이더 ----------
const NOISE = `
float h11(float n){ return fract(sin(n)*43758.5453123); }
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float h31(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=.5; } return s; }`;

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*.9999; }`;
const SKY_FS = `
precision highp float;
uniform vec3 uTop,uMid,uBot,uSunDir,uSunCol,uCloudCol,uFlashCol; uniform float uStars,uMilky,uTime,uCloud,uFlash,uWind,uFog,uCity,uPhotoK; uniform sampler2D uPhoto;
varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uBot, uMid, smoothstep(-.02,.16,h)); col = mix(col, uTop, smoothstep(.1,.8,h));
  float sg = max(dot(d,uSunDir),0.); col += uSunCol*(pow(sg,40.)*.9 + pow(sg,6.)*.35 + pow(sg,2.)*.08);
  float hz = exp(-abs(h)*7.); col += uBot*.25*hz;
  col += vec3(1.,.52,.24)*.2*uCity*exp(-max(h,0.)*9.);   // 도시 불빛이 하늘 아래를 따뜻하게 물들여요
  // 별
  vec3 sp = d*150.; vec3 ip = floor(sp); vec3 fp = fract(sp)-.5;
  float rr = h31(ip); vec3 off = vec3(h31(ip+3.1),h31(ip+7.7),h31(ip+1.9))-.5;
  float sd = length(fp - off*.7);
  float st = step(.93,rr)*smoothstep(.11,.0,sd)*(.35+.65*h11(rr*91.));
  st *= .7+.3*sin(uTime*(1.2+3.*rr)+rr*40.);
  float hs = smoothstep(.02,.18,h);
  // 은하수
  vec3 np = normalize(vec3(.45,.55,-.7)); float bd = dot(d,np);
  float band = exp(-pow(bd/.17,2.)); float cl = fbm(d.xz*5.+d.y*3.)*.9+fbm(d.xy*14.)*.5;
  float mw = band*(.35+cl*.9); vec3 mwc = mix(vec3(.55,.6,.95), vec3(1.,.82,.7), smoothstep(.2,.9,cl));
  float dust = smoothstep(.45,.75,fbm(d.xy*9.+4.))*band*.5; mw = max(mw-dust,0.);
  // 구름
  vec2 cuv = d.xz/(h+.28)*1.15 + vec2(uTime*uWind*.004, uTime*.0017);
  float cn = fbm(cuv*1.3); float cov = smoothstep(1.-uCloud, 1.-uCloud+.28, cn) * smoothstep(.0,.1,h) * step(.001,uCloud);
  vec3 ccol = uCloudCol*(.7+.5*fbm(cuv*3.1)) + uSunCol*.25*pow(sg,3.);
  vec3 sky = col;
  sky += (vec3(1.)*st*1.3*hs + mwc*mw*uMilky*.55) * uStars * (1.-cov*.95);
  sky = mix(sky, ccol, cov*.88);
  // 실제 사진 같은 노을 하늘 (정면 쪽 넓은 부분에 깔고 가장자리는 부드럽게 섞어요)
  float paz = atan(d.x, -d.z), pel = asin(clamp(d.y,-1.,1.));
  vec2 puv = vec2(.5 + paz/2.6, pel/1.15);
  float pw = smoothstep(0.,.14,puv.x)*smoothstep(1.,.86,puv.x)*smoothstep(0.,.03,pel)*smoothstep(1.,.78,puv.y);
  sky = mix(sky, texture2D(uPhoto, puv).rgb*1.05, pw*uPhotoK*(1.-cov*.5));
  sky += uFlashCol*uFlash*(.22+.9*exp(-abs(h)*3.));
  sky = mix(sky, uBot, uFog*smoothstep(.5,.0,h)*.6);
  sky += (h21(gl_FragCoord.xy)-.5)/200.;
  gl_FragColor = vec4(sky,1.);
  #include <colorspace_fragment>
}`;

const BLD_VS = `
attribute vec3 aSize; attribute vec4 aTint; attribute float aId;
varying vec3 vL; varying vec3 vN; varying vec3 vW; varying vec4 vT; varying vec3 vO; varying float vSY; varying float vId; varying vec3 vS;
void main(){
  vL = position*aSize; vO = normal; vSY = aSize.y; vT = aTint; vId = aId; vS = aSize;
  vec4 wp = modelMatrix*instanceMatrix*vec4(position,1.); vW = wp.xyz;
  vN = normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const BLD_FS = `
precision highp float;
uniform vec3 uFogColor,uLightDir,uLightCol,uAmb,uFlash; uniform float uFogD,uNight,uTime;
varying vec3 vL; varying vec3 vN; varying vec3 vW; varying vec4 vT; varying vec3 vO; varying float vSY; varying float vId; varying vec3 vS;
${NOISE}
void main(){
  vec3 n = normalize(vN); float roof = step(.5,abs(vO.y));
  float dif = max(dot(n,uLightDir),0.);
  vec3 col = vT.rgb*(uAmb*.5 + uLightCol*dif*.45);
  vec3 em = vec3(0.);
  if(roof < .5){
    bool sideX = abs(vO.x) > .5; float along = sideX ? vL.z : vL.x, W = sideX ? vS.z : vS.x; float hh = vL.y + vSY*.5;
    bool apt = (vS.z < 17. || vS.x < 17.) && vSY > 36. && !sideX == (vS.x > vS.z);   // 판상형 아파트의 긴 면: 발코니
    float cw = apt ? 3.1 : 2.7, chh = apt ? 2.85 : 3.2;
    vec2 q = vec2((along + W*.5)/cw, hh/chh); vec2 cell = floor(q); vec2 f = fract(q);
    float top = vSY - 1.4;                                   // 옥상 난간 띠
    float pil = apt ? step(mod(cell.x, 4.), .5) : step(mod(cell.x, 5.), .5)*step(18., W);   // 세대·기둥 사이 벽
    float win = apt ? step(.1,f.x)*step(f.x,.9)*step(.3,f.y)*step(f.y,.94) : step(.18,f.x)*step(f.x,.82)*step(.26,f.y)*step(f.y,.76);
    win *= (1.-pil)*step(hh, top)*step(apt ? 2.9 : 4.4, hh);
    float r = h21(cell + vId*7.13 + floor(uTime/45. + h21(cell+vId)*6.)*.37);
    float lit = step(vT.a, r)*win;
    float r2 = h21(cell*1.7+vId), r3 = h21(cell*2.3+vId*.7);
    vec3 wc = r2<.68 ? vec3(1.,.72,.38) : (r2<.9 ? vec3(1.,.88,.66) : vec3(.55,.72,1.));
    float fx = apt ? (f.x-.1)/.8 : (f.x-.18)/.64, fy = apt ? (f.y-.3)/.64 : (f.y-.26)/.5;
    float inner = mix(.78, 1.12, fy);                                                     // 방 안 불빛은 위가 조금 밝게
    if(r3 < .32) inner *= .5 + .5*smoothstep(.05,.2,abs(fx-.5));                           // 가운데 커튼
    else if(r3 < .48) inner *= .72 + .28*step(.45, fract(fy*7.));                           // 블라인드
    wc *= inner * (.55 + .6*h21(cell+3.3)) * (r2>.86 ? (.8+.2*sin(uTime*7.+vId)) : 1.);
    em = wc*lit*(uNight*1.3 + .07);
    col = mix(col, col*.45 + vec3(.012,.018,.03) + uFogColor*.10, win*(1.-lit));         // 불 꺼진 유리
    if(apt){
      float slab = step(f.y,.09)*step(2.9,hh)*step(hh,top);                               // 발코니 바닥판
      float rail = step(.09,f.y)*step(f.y,.3)*step(2.9,hh)*step(hh,top)*(1.-pil);          // 난간
      col = mix(col, vT.rgb*(uAmb*.62 + uLightCol*dif*.5) + vec3(.02), slab);
      col = mix(col, col*.62, rail*(.55 + .45*step(.5, fract(along*3.))));
      em *= 1. - rail*.55;                                                                  // 난간 너머로 불빛
    } else {
      col *= 1. - .22*step(f.y,.06)*step(hh,top);                                           // 층 구분선
      col = mix(col, col*1.12 + vec3(.01), pil*step(hh,top));                                // 기둥 띠
      float shop = step(hh, 4.2)*step(.6, hh)*step(vSY, 60.)*step(.25, h21(vec2(vId,2.)));  // 1층 상가 불빛
      vec3 sc = h21(vec2(vId,5.)) < .5 ? vec3(1.,.8,.5) : vec3(.8,.9,1.);
      em += sc*shop*(.5 + .5*step(.12, fract(along/4.)))*uNight*.9;
    }
    col *= .86 + .14*h21(vec2(floor(along*1.3), floor(hh*.7)));
    float cap = step(top, hh);                                                               // 난간 띠·윗선
    col = mix(col, vT.rgb*(uAmb*.7 + uLightCol*dif*.55) + vec3(.015), cap*.85);
    col *= 1. - .25*step(vSY-.25, hh);
    float ed = W*.5 - abs(along);                                                            // 모서리·바닥 그늘
    col *= (.74 + .26*smoothstep(0., 2.5, ed)) * (.62 + .38*smoothstep(0., 9., hh));
    em *= .8 + .2*smoothstep(0., 1.2, ed);
  } else {
    col = vT.rgb*.1 + vec3(.012,.008,.014) + vec3(.008)*h21(floor(vW.xz*.7));
  }
  col += em;
  col += uFlash*(.35 + .65*max(n.y*.5+.5,0.))*(roof<.5?.7:.5);
  float dist = length(vW - cameraPosition); float ff = 1.-exp(-uFogD*uFogD*dist*dist);
  col = mix(col, uFogColor, clamp(ff,0.,1.));
  gl_FragColor = vec4(col,1.);
  #include <colorspace_fragment>
}`;

const GLOW_VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vC = aCol; vA = aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
  gl_PointSize = clamp(aSize*uScale/max(-mv.z,.1), 0., 90.); }`;
const GLOW_FS = `precision highp float; varying vec3 vC; varying float vA; uniform float uSoft, uMul;
void main(){ float d = length(gl_PointCoord-.5)*2.; if(d>1.) discard; float a = pow(1.-d, uSoft); gl_FragColor = vec4(vC*1.3, a*vA*uMul);
  #include <colorspace_fragment>
}`;

// ---------- 그림판으로 만드는 무늬 ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const noiseFill = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "0,0,0" : "255,255,255"},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
const texConcrete = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#8b8f98"; g.fillRect(0, 0, w, h); noiseFill(g, w, h, 5000, .09);
  g.strokeStyle = "rgba(30,34,44,.55)"; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke(); }
}, [4, 3]);
const texGrass = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#4d8a3c"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const v = 70 + Math.random() * 70; g.fillStyle = `rgba(${v * .55},${v + 30},${v * .4},${.2 + Math.random() * .35})`; g.fillRect(Math.random() * w, Math.random() * h, 1.2, 2 + Math.random() * 4); }
}, [6, 5]);
const texWood = () => canvasTex(256, 256, (g, w, h) => {
  for (let i = 0; i < 8; i++) { const v = 96 + (Math.random() * 26 | 0); g.fillStyle = `rgb(${v + 30},${v + 4},${v - 40})`; g.fillRect(0, i * h / 8, w, h / 8 - 2); }
  noiseFill(g, w, h, 1500, .12); g.fillStyle = "rgba(20,10,4,.6)"; for (let i = 0; i < 8; i++) g.fillRect(0, i * h / 8 - 1, w, 2);
}, [3, 2]);
const texPlaid = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#c95b5b"; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,244,224,.55)"; for (let i = 0; i < 4; i++) { g.fillRect(i * 32 + 6, 0, 12, h); g.fillRect(0, i * 32 + 6, w, 12); }
  g.fillStyle = "rgba(40,30,70,.3)"; for (let i = 0; i < 4; i++) { g.fillRect(i * 32 + 20, 0, 4, h); g.fillRect(0, i * 32 + 20, w, 4); }
  noiseFill(g, w, h, 600, .08);
});
const texCorn = () => canvasTex(64, 32, (g, w, h) => { g.fillStyle = "#f2c23c"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(255,235,150,.7)"; for (let x = 3; x < w; x += 6) for (let y = 3; y < h; y += 6) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); } });
// 삼겹살 결: 흰 비계와 붉은 살코기가 번갈아 (색은 익은 정도에 따라 위에서 곱해져요)
const texPork = () => canvasTex(128, 64, (g, w, h) => {
  const bands = [[.0, .16, 1], [.16, .34, .62], [.34, .42, .98], [.42, .6, .66], [.6, .67, 1], [.67, .85, .6], [.85, 1, .96]];
  bands.forEach(([a, b, v]) => { const c = Math.round(v * 255); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(0, a * h, w, (b - a) * h + 1); });
  for (let i = 0; i < 260; i++) { const v = 150 + Math.random() * 105; g.fillStyle = `rgba(${v},${v},${v},.22)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 5, 1); }
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1.2; [.16, .34, .6, .85].forEach(y => { g.beginPath(); g.moveTo(0, y * h); for (let x = 0; x <= w; x += 8) g.lineTo(x, y * h + Math.sin(x * .3) * 1.4); g.stroke(); }); });
// 석쇠 자국: 구워질수록 진해져요
const texMarks = () => canvasTex(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "rgba(40,22,12,.95)"; for (let x = 6; x < w; x += 18) { g.save(); g.translate(x, 0); g.rotate(.0); g.fillRect(0, 0, 5, h); g.restore(); } });
const texLabel = (text, bg) => {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  g.font = "700 26px 'Pretendard Variable', system-ui, sans-serif"; const w = Math.min(250, g.measureText(text).width + 34);
  g.fillStyle = bg || "rgba(255,255,255,.88)"; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = "#252b45"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const texEmoji = e => {
  const c = document.createElement("canvas"); c.width = c.height = 96; const g = c.getContext("2d");
  g.font = "64px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(e, 48, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const texLantern = text => {
  const c = document.createElement("canvas"); c.width = 128; c.height = 160; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, "#ffd9a0"); gr.addColorStop(1, "#ff9a4d"); g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
  g.fillStyle = "rgba(120,50,10,.75)"; g.font = "700 19px 'Pretendard Variable', system-ui, sans-serif"; g.textAlign = "center";
  const words = String(text || "").slice(0, 36); const lines = []; for (let i = 0; i < words.length; i += 6) lines.push(words.slice(i, i + 6));
  lines.slice(0, 6).forEach((l, i) => g.fillText(l, 64, 40 + i * 24));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const softTex = (() => { let t; return () => t || (t = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); })); })();

// ---------- 사람(아바타·이웃)과 고양이 ----------
const stdM = (c, r = .85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function makePerson(o) {
  const g = new THREE.Group(), body = new THREE.Group(); body.position.y = .46; g.add(body);
  const skin = stdM(o.skin || 0xf1c6a0, .7), hood = stdM(o.hood, .9), pant = stdM(o.pant || 0x2b3350, .9), hairM = stdM(o.hair || 0x2a2438, .8);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .2, 6, 14), hood); torso.position.y = .2; body.add(torso);
  const hd = new THREE.Group(); hd.position.y = .64; body.add(hd);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 28, 20), skin); head.scale.set(1.05, 1, 1); hd.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.245, 28, 14, 0, TAU, 0, Math.PI * .52), hairM); hair.position.set(0, .01, -.02); hair.rotation.x = -.22; hd.add(hair);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1b1b24 });
  [-1, 1].forEach(s => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), eyeM); e.position.set(s * .085, -.01, .215); e.scale.set(1, 1.3, .6); hd.add(e);
    const b = new THREE.Mesh(new THREE.CircleGeometry(.04, 12), new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: .55 })); b.position.set(s * .135, -.07, .19); b.rotation.y = s * .5; hd.add(b);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.03, .008, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8a3b3b })); mouth.position.set(0, -.085, .222); mouth.rotation.z = Math.PI; hd.add(mouth);
  const limb = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat); m.position.y = -len / 2 - r * .6; return m; };
  const mkArm = s => { const p = new THREE.Group(); p.position.set(s * .2, .3, 0); p.add(limb(.05, .2, hood)); const hand = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), skin); hand.position.y = -.33; p.add(hand); body.add(p); return p; };
  const mkLeg = s => { const p = new THREE.Group(); p.position.set(s * .085, .02, 0); p.add(limb(.065, .12, pant));
    const kn = new THREE.Group(); kn.position.y = -.2; const sh = limb(.058, .1, pant); kn.add(sh);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), stdM(0xeeeeee, .8)); shoe.position.set(0, -.165, .03); shoe.scale.set(1, .7, 1.4); kn.add(shoe); p.add(kn); p.userData.knee = kn; body.add(p); return p; };
  const arms = [mkArm(-1), mkArm(1)], legs = [mkLeg(-1), mkLeg(1)];
  const food = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), stdM(0xd89a60, .9)); food.position.set(0, -.33, .06); food.visible = false; arms[0].add(food);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .32, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; g.add(shadow);
  g.rotation.order = "YXZ"; const P = { g, body, head: hd, arms, legs, food, pose: "idle", ph: Math.random() * 6, seat: 0, yaw: 0, tag: null, mouth };
  g.userData.person = P; return P;
}
const dampTo = (o, k, v, d) => { o.rotation[k] += (v - o.rotation[k]) * d; };
function animPerson(P, dt, t, moving) {
  const d = Math.min(1, dt * 11), pose = moving ? "walk" : P.pose;
  if (pose === "walk") P.ph += dt * 9.5;
  const s = Math.sin(P.ph), sit = pose === "sit", chairSit = sit && P.seat > .15, crawl = pose === "crawl";
  P.body.position.y += ((crawl ? .3 : sit ? .2 + P.seat : .46 + (pose === "walk" ? Math.abs(Math.cos(P.ph)) * .045 : Math.sin(t * 1.6) * .006)) - P.body.position.y) * d;
  dampTo(P.legs[0], "x", sit ? -1.5 : crawl ? .5 + s * .5 : pose === "walk" ? s * .75 : 0, d); dampTo(P.legs[1], "x", sit ? -1.5 : crawl ? .5 - s * .5 : pose === "walk" ? -s * .75 : 0, d);
  const kA = chairSit ? 1.5 : sit ? .12 : crawl ? .9 : pose === "walk" ? Math.max(0, -s) * .9 : 0, kB = chairSit ? 1.5 : sit ? .12 : crawl ? .9 : pose === "walk" ? Math.max(0, s) * .9 : 0;
  dampTo(P.legs[0].userData.knee, "x", kA, d); dampTo(P.legs[1].userData.knee, "x", kB, d);
  const A = P.arms; let a0x = 0, a1x = 0, a0z = 0, a1z = 0, hx = 0;
  if (pose === "walk") { a0x = -s * .6; a1x = s * .6; }
  else if (pose === "wave") { a0z = -2.45 + Math.sin(t * 11) * .35; a1x = .1; }
  else if (pose === "cheer") { a0z = -2.7 + Math.sin(t * 9) * .15; a1z = 2.7 - Math.sin(t * 9 + 1) * .15; }
  else if (pose === "eat") { a0x = -2.0 + Math.sin(t * 7) * .12; hx = Math.sin(t * 7) * .05; }
  else if (pose === "watch") { hx = -.5; a0x = a1x = .05; }
  else if (pose === "sit") { a0x = a1x = chairSit ? -.7 : -.35; }
  else if (crawl) { a0x = -1.5 + s * .5; a1x = -1.5 - s * .5; }
  dampTo(A[0], "x", a0x, d); dampTo(A[1], "x", a1x, d); dampTo(A[0], "z", a0z, d); dampTo(A[1], "z", a1z, d);
  dampTo(P.head, "x", pose === "watch" ? -.5 : pose === "eat" ? hx : 0, d);
  dampTo(P.g, "x", pose === "lie" ? -Math.PI / 2 : crawl ? .95 : 0, d);
  P.food.visible = pose === "eat";
  P.g.rotation.y += (((P.yaw - P.g.rotation.y + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 8);
}
function makeCat() {
  const g = new THREE.Group(), fur = stdM(0xd9a066, .95), dark = stdM(0xa6713a, .95);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), fur); body.scale.set(.95, 1.05, 1.25); body.position.y = .17; g.add(body);
  const head = new THREE.Group(); head.position.set(0, .34, .14); g.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), fur));
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.ConeGeometry(.05, .09, 4), dark); e.position.set(s * .07, .115, -.01); e.rotation.z = -s * .25; head.add(e);
    const ey = new THREE.Mesh(new THREE.SphereGeometry(.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20262a })); ey.position.set(s * .045, .015, .108); head.add(ey); });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe88a8a })); nose.position.set(0, -.018, .118); head.add(nose);
  const tail = new THREE.Group(); tail.position.set(0, .12, -.2); g.add(tail);
  const tm = new THREE.Mesh(new THREE.CapsuleGeometry(.03, .26, 4, 8), dark); tm.position.set(0, .12, -.04); tm.rotation.x = -.5; tail.add(tm);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(.22, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .012; g.add(sh);
  return { g, body, head, tail, mode: "sit", t: 0, yaw: 0 };
}

// 흰 강아지: 털 뭉치(작은 공 여러 개)로 복슬복슬하게, 처진 귀·까만 코와 눈·분홍 혀·말린 꼬리
function makeDog() {
  const g = new THREE.Group(), furs = [0xf7f4ee, 0xf1ece4, 0xfbf9f5, 0xebe5dc].map(c => { const m = stdM(c, 1); m.emissive.setHex(0xc9c2b8); m.emissiveIntensity = .42; return m; }), F = () => pick(furs);   // 밤에도 하얗게 보이게 털이 빛을 살짝 머금음
  const fluff = (parent, cx, cy, cz, rx, ry, rz, n, sz) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, b = Math.acos(Math.random() * 2 - 1);
    const m = new THREE.Mesh(new THREE.SphereGeometry(sz * rnd(.75, 1.15), 9, 7), F()); m.position.set(cx + Math.sin(b) * Math.cos(a) * rx, cy + Math.cos(b) * ry, cz + Math.sin(b) * Math.sin(a) * rz); parent.add(m); } };
  const bodyG = new THREE.Group(); g.add(bodyG);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), F()); body.scale.set(1, .95, 1.35); body.position.y = .2; bodyG.add(body);
  fluff(bodyG, 0, .2, 0, .125, .115, .17, 18, .058);
  const legs = [[-.075, .1], [.075, .1], [-.075, -.11], [.075, -.11]].map(([x, z]) => { const L = new THREE.Group(); L.position.set(x, .14, z); g.add(L);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(.035, .08, 4, 8), F()); l.position.y = -.07; L.add(l); fluff(L, 0, -.11, .01, .03, .015, .03, 4, .03); return L; });
  const head = new THREE.Group(); head.position.set(0, .36, .17); g.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.105, 16, 12), F())); fluff(head, 0, .025, -.015, .085, .08, .075, 14, .047);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 10), F()); snout.scale.set(1.05, .85, 1); snout.position.set(0, -.035, .095); head.add(snout);
  const black = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: .25, metalness: .1 });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.019, 10, 8), black); nose.scale.set(1.25, .9, 1); nose.position.set(0, -.02, .142); head.add(nose);
  [-1, 1].forEach(sx => { const e = new THREE.Mesh(new THREE.SphereGeometry(.017, 10, 8), black); e.position.set(sx * .042, .02, .1); head.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.005, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(sx * .042 + .005, .027, .115); head.add(hl); });
  const ears = [-1, 1].map(sx => { const E = new THREE.Group(); E.position.set(sx * .085, .05, -.005); head.add(E);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), F()); ear.scale.set(.6, 1.45, .9); ear.position.set(sx * .02, -.06, 0); E.add(ear); fluff(E, sx * .02, -.07, 0, .025, .05, .03, 5, .028); return E; });
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf08a9a, roughness: .6 })); tongue.scale.set(1, .4, 1.3); tongue.position.set(0, -.075, .12); tongue.visible = false; head.add(tongue);
  const tail = new THREE.Group(); tail.position.set(0, .3, -.19); g.add(tail);
  fluff(tail, 0, .05, -.01, .03, .045, .03, 9, .04);   // 등 위로 말린 복슬 꼬리
  const sh = new THREE.Mesh(new THREE.CircleGeometry(.24, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .012; g.add(sh);
  return { g, body: bodyG, head, tail, legs, ears, tongue, mode: "sit", t: 0, yaw: 0, hop: 0, ph: Math.random() * 6 };
}

// =====================================================================================
export function start(host, cb, opt) {
  opt = opt || {};
  const reduced = !!opt.reduced, mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
  let quality = opt.quality || (mobile ? "mid" : "high");
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
  renderer.setClearColor(0x050816);
  const el = renderer.domElement; el.className = "roof-cv"; el.setAttribute("aria-hidden", "true"); host.prepend(el);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3200);
  const clock = new THREE.Clock();
  let W = 1, H = 1, time = 0, running = true;
  const POOL = quality === "high" ? 11000 : quality === "mid" ? 6500 : 3500;

  // ----- 공통 재질 -----
  const glowMat = (blend, soft) => new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false,
    blending: blend || THREE.AdditiveBlending, uniforms: { uScale: { value: 600 }, uSoft: { value: soft || 1.6 }, uMul: { value: 1 } } });
  const addGlow = glowMat(THREE.AdditiveBlending, 1.6), smokeMat = glowMat(THREE.NormalBlending, .9);
  const mkPoints = (n, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const p = new THREE.Points(geo, mat); p.frustumCulled = false; scene.add(p); return p;
  };

  // ----- 하늘과 해·달 -----
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uSunCol: { value: new THREE.Color() },
    uCloudCol: { value: new THREE.Color() }, uFlashCol: { value: new THREE.Color() }, uStars: { value: 1 }, uMilky: { value: .4 }, uTime: { value: 0 }, uCloud: { value: 0 }, uFlash: { value: 0 }, uWind: { value: 1 }, uFog: { value: 0 }, uCity: { value: 1 }, uPhotoK: { value: 0 }, uPhoto: { value: null } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; scene.add(sky);
  const texLoader = new THREE.TextureLoader(), bgUrl = n => new URL("./bg/" + n, import.meta.url).href;
  const loadTex = n => { const t = texLoader.load(bgUrl(n)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  skyU.uPhoto.value = loadTex("sky.webp");
  const moonU = { uLight: { value: new THREE.Vector3(0, 0, 1) }, uAlpha: { value: 1 } };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 40, 28), new THREE.ShaderMaterial({ uniforms: moonU, transparent: true, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vN; varying vec3 vO; void main(){ vO=normal; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `precision highp float; varying vec3 vN; varying vec3 vO; uniform vec3 uLight; uniform float uAlpha; ${NOISE}
      void main(){ float l = clamp(dot(normalize(vN), normalize(uLight)),0.,1.); float lit = smoothstep(.0,.12,l);
        float m = fbm(vO.xy*4.+vO.z*3.); float cr = smoothstep(.55,.7,fbm(vO.xz*11.+3.))*.25;
        vec3 base = mix(vec3(.62,.6,.56), vec3(.97,.95,.88), m) - cr; vec3 col = base*lit + vec3(.05,.06,.09)*(1.-lit);
        gl_FragColor = vec4(col, uAlpha);
        #include <colorspace_fragment>
      }` }));
  moon.renderOrder = -8; scene.add(moon);
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xfff1d0, transparent: true, opacity: .28, depthWrite: false, blending: THREE.AdditiveBlending }));
  moonHalo.scale.set(420, 420, 1); moonHalo.renderOrder = -9; scene.add(moonHalo);

  const hemi = new THREE.HemisphereLight(0x6070a0, 0x202030, .6); scene.add(hemi);
  const dirL = new THREE.DirectionalLight(0xaab8ff, .6); dirL.position.set(-3, 8, -6); scene.add(dirL);
  const flashLight = new THREE.PointLight(0xffffff, 0, 90, 1.4); flashLight.position.set(0, 18, -30); scene.add(flashLight);
  const coalLight = new THREE.PointLight(0xff8a3a, 1.4, 7, 1.6); scene.add(coalLight);
  const lampLights = [new THREE.PointLight(0xffc680, 1.1, 9, 1.5), new THREE.PointLight(0xffc680, 1.1, 9, 1.5)]; lampLights.forEach(l => scene.add(l));

  const bldU = { uFogColor: { value: new THREE.Color() }, uFogD: { value: .0011 }, uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightCol: { value: new THREE.Color() },
    uAmb: { value: new THREE.Color() }, uFlash: { value: new THREE.Color() }, uNight: { value: 1 }, uTime: { value: 0 } };
  const bldMat = new THREE.ShaderMaterial({ vertexShader: BLD_VS, fragmentShader: BLD_FS, uniforms: bldU });
  scene.fog = new THREE.FogExp2(0x222a48, .0011);

  // ----- 도시 -----
  const OURH = 55;   // 우리 옥상이 땅에서 올라온 높이(m)
  const RX = 13, RZ = 10;   // 우리 옥상의 반폭·반깊이(m): 26m × 20m
  const city = [], towers = [];
  const R = mulberry(20241031);
  const ROAD_X = [-780, -660, -540, -420, -300, -180, -60, 60, 180, 300, 420, 540, 660, 780], ROAD_Z = [-300, -180, -60, 60, 180, 300, 420, 540, 660, 780];   // 격자 도로 (건물은 길을 비켜서)
  const addB = (x, z, w, d, hgt, yaw, tint, thr) => { if (z < -330) return; if (ROAD_X.some(r => Math.abs(x - r) < 16) || ROAD_Z.some(r => Math.abs(z - r) < 16)) return; city.push({ x, z, w, d, h: hgt, yaw, tint, thr }); };
  const topOK = (dist, hgt) => { const top = hgt - OURH; return dist < 90 ? top <= -12 : dist < 220 ? top <= 12 : true; };
  const fwd = () => (R() < .72 ? (-Math.PI / 2 + (R() - .5) * 2.7) : R() * TAU);   // 대부분 앞쪽(남쪽)
  for (let k = 0; k < 40; k++) {   // 아파트 단지
    const a = fwd(), dist = 120 + Math.pow(R(), 1.3) * 900, cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, yaw = Math.floor(R() * 4) * Math.PI / 2 + (R() - .5) * .12;
    const hgt = 42 + R() * 50, cols = 2 + (R() * 3 | 0), rows = 2 + (R() * 2 | 0), warm = .55 + R() * .2;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const ox = (i - cols / 2) * 62, oz = (j - rows / 2) * 36, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const x = cx + ox * cy - oz * sy, z = cz + ox * sy + oz * cy, hh = hgt * (.8 + R() * .35);
      if (Math.abs(x) < 24 && Math.abs(z) < 22) continue;
      if (!topOK(Math.hypot(x, z), hh)) continue;
      addB(x, z, 46 + R() * 8, 14, hh, yaw, pick([[.30, .33, .54], [.36, .30, .50], [.28, .38, .52]]).map(v => v * (.6 + R() * .25)), .30 + R() * .2 * warm);
    }
  }
  for (let k = 0; k < 520; k++) {   // 저층·중층 건물
    const a = fwd(), dist = 55 + Math.pow(R(), 1.5) * 1150, x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    if (Math.abs(x) < 24 && Math.abs(z) < 22) continue;
    const hh = 10 + Math.pow(R(), 2.2) * 70;
    if (!topOK(dist, hh)) continue;
    const tc = pick([[.36, .38, .58], [.52, .36, .34], [.32, .46, .52], [.46, .38, .58]]), t = .55 + R() * .3; addB(x, z, 12 + R() * 28, 12 + R() * 22, hh, Math.floor(R() * 4) * Math.PI / 2 + (R() - .5) * .3, tc.map(v => v * t), .38 + R() * .24);
  }
  for (let k = 0; k < 24; k++) {   // 도심 고층 (남쪽 멀리)
    const x = (k % 2 ? 1 : -1) * (440 + R() * 300), z = -350 - R() * 300, hh = 140 + Math.pow(R(), 1.3) * 230;   // 만 양쪽 해안의 고층
    addB(x, z, 28 + R() * 20, 28 + R() * 16, hh, (R() - .5) * .3, [.26, .40, .62], .58 + R() * .12); towers.push({ x, y: hh - OURH + 2, z, w: 28 + R() * 20 });
  }
  const signs = [];   // 가까운 동네: 벽돌색 낮은 건물과 간판 불빛
  for (let k = 0; k < 24; k++) {
    const a = -Math.PI / 2 + rnd(-1.2, 1.2), dist = rnd(27, 58), x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    if ((Math.abs(x) < 24 && Math.abs(z) < 22) || Math.hypot(x + 33, z + 48) < 17 || Math.hypot(x - 31, z + 66) < 19) continue;
    const hh = OURH - rnd(7, 21), w = rnd(9, 17), d = rnd(9, 15), t = .5 + Math.random() * .22;
    addB(x, z, w, d, hh, 0, [t * .8, t * .52, t * .44], .28 + Math.random() * .2); signs.push({ x, y: hh - OURH - rnd(3, 13), z: z + d / 2 + .4, w });
  }
  const NB = city.length, bgeo = new THREE.BoxGeometry(1, 1, 1);
  const sizeA = new Float32Array(NB * 3), tintA = new Float32Array(NB * 4), idA = new Float32Array(NB);
  const bld = new THREE.InstancedMesh(bgeo, bldMat, NB);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  city.forEach((b, i) => {
    e3.set(0, b.yaw, 0); q.setFromEuler(e3); v3.set(b.x, b.h / 2 - OURH, b.z); s3.set(b.w, b.h, b.d); m4.compose(v3, q, s3); bld.setMatrixAt(i, m4);
    sizeA.set([b.w, b.h, b.d], i * 3); tintA.set([...b.tint, b.thr], i * 4); idA[i] = i;
  });
  bgeo.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizeA, 3)); bgeo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tintA, 4)); bgeo.setAttribute("aId", new THREE.InstancedBufferAttribute(idA, 1));
  bld.frustumCulled = false; scene.add(bld);
  // 땅(멀리 어둡게)과 도로 불빛, 고층 위 붉은 점멸등
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 6), new THREE.MeshBasicMaterial({ color: 0x080a14, fog: true })); ground.rotation.x = -Math.PI / 2; ground.position.y = -OURH - 1; scene.add(ground);
  const glowPts = mkPoints(14000, addGlow); const gp = glowPts.geometry, gpos = gp.attributes.position, gcol = gp.attributes.aCol, gsz = gp.attributes.aSize, gal = gp.attributes.aAlpha;
  let gn = 0; const gAdd = (x, y, z, r, g, b, s, a) => { if (gn >= 14000) return -1; gpos.setXYZ(gn, x, y, z); gcol.setXYZ(gn, r, g, b); gsz.setX(gn, s); gal.setX(gn, a); return gn++; };
  const crowns = []; towers.forEach((t, i) => { for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; crowns.push({ x: t.x + Math.cos(a) * 12, y: t.y - 2 - (i % 3) * 6, z: t.z + Math.sin(a) * 12, h: i * .07 + k * .05 }); } });
  const beacons = towers.map(t => ({ i: gAdd(t.x, t.y, t.z, 1, .12, .1, 9, .9), ph: rnd(0, TAU) }));
  // 옥상 위 물탱크·기계실 (건물 윤곽이 살아나요) + 높은 건물 꼭대기 붉은 항공등 (다 같이 천천히 깜빡)
  { const rb = []; city.forEach(b => { const dist = Math.hypot(b.x, b.z); if (dist > 760 || b.h < 18 || dist < 30) return; const n = b.h > 60 ? 2 : (Math.random() < .7 ? 1 : 0); for (let k = 0; k < n; k++) rb.push(b);
      if (b.h > 75 && dist < 1100 && Math.random() < .55) { const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw); [[-1, -1], [1, 1]].forEach(([sx, sz]) => { const ox = sx * b.w * .45, oz = sz * b.d * .45; beacons.push({ i: gAdd(b.x + ox * cy - oz * sy, b.h - OURH + .6, b.z + ox * sy + oz * cy, 1, .1, .08, 5.5, .9), ph: 0 }); }); } });
    const rbm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x262b3e, roughness: .95 }), Math.max(1, rb.length));
    rb.forEach((b, i) => { const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw), w = b.w * rnd(.14, .3), d = b.d * rnd(.2, .42), h = rnd(2.2, 5.2), ox = rnd(-.3, .3) * b.w, oz = rnd(-.25, .25) * b.d;
      e3.set(0, b.yaw, 0); q.setFromEuler(e3); v3.set(b.x + ox * cy - oz * sy, b.h - OURH + h / 2, b.z + ox * sy + oz * cy); s3.set(w, h, d); m4.compose(v3, q, s3); rbm.setMatrixAt(i, m4); });
    rbm.count = rb.length; scene.add(rbm); }
  const roadMat = new THREE.MeshBasicMaterial({ color: 0x7a4418, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }), roadGroup = new THREE.Group(); scene.add(roadGroup);
  const cars = [];   // 도로를 따라 흐르는 차량 불빛과 가로등
  const road = (cx, cz, ux, uz, len) => {
    const y = -OURH + 1.6;
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(len, 11), roadMat); rib.rotation.x = -Math.PI / 2; rib.rotation.z = Math.atan2(uz, ux) * -1 + 0; rib.position.set(cx, -OURH + .35, cz); roadGroup.add(rib);
    const nl = Math.round(len / 11);
    for (let i = 0; i < nl; i++) for (const side of [-6.5, 6.5]) { const s = (i / nl - .5) * len; gAdd(cx + ux * s + uz * side, y + 7, cz + uz * s - ux * side, 1, .74, .4, 6, .85); }
    const n = Math.max(6, Math.round(len / 24));
    for (let i = 0; i < n; i++) { const dirn = i % 2 ? 1 : -1, lane = dirn * 3.2; cars.push({ ux, uz, cx: cx + uz * lane, cz: cz - ux * lane, y, s: rnd(-.5, .5) * len, v: dirn * rnd(8, 21), len, i: gAdd(0, 0, 0, 1, dirn > 0 ? .93 : .16, dirn > 0 ? .75 : .1, 5.4, .95) }); }
  };
  ROAD_X.forEach(x => { if (Math.abs(x) < 430) road(x, (900 - 330) / 2, 0, 1, 1230); else road(x, -50, 0, 1, 1900); });
  ROAD_Z.forEach(z => { if (z >= -330) road(0, z, 1, 0, 2200); });
  const crownIdx = crowns.map(c => ({ i: gAdd(c.x, c.y, c.z, 1, .8, .5, 14, .9), h: c.h }));
  signs.forEach(sg_ => { for (let k = 0; k < 2; k++) { const c = pick([[1, .25, .25], [.3, 1, .55], [.4, .65, 1], [1, .85, .3], [1, .4, .85]]); gAdd(sg_.x + rnd(-sg_.w / 3, sg_.w / 3), sg_.y - k * 2.2, sg_.z, c[0], c[1], c[2], 6.5, .85); } });
  // 만(바다)과 다리: 높은 곳에서 내려다보면 불꽃과 불빛이 물에 비쳐요
  const WATER_Y = -OURH + .4, BAY = { x: 2700, z0: -330, z1: -2700 };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(BAY.x * 2, BAY.z0 - BAY.z1), new THREE.ShaderMaterial({ depthWrite: false, transparent: true,
    uniforms: { uFogColor: bldU.uFogColor, uFogD: bldU.uFogD, uNight: bldU.uNight, uTime: bldU.uTime, uSkyBot: skyU.uBot, uSkyTop: skyU.uTop, uFlashCol: skyU.uFlashCol, uFlash: skyU.uFlash },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: `precision highp float; uniform vec3 uFogColor,uSkyBot,uSkyTop,uFlashCol; uniform float uFogD,uNight,uTime,uFlash; varying vec3 vW; ${NOISE}
      void main(){
        vec3 V = normalize(cameraPosition - vW); float fr = pow(1.-clamp(V.y,0.,1.), 2.3);
        vec2 q = vW.xz*.05; float w = vn(q+vec2(uTime*.04,uTime*.03))*.6 + vn(q*2.7-vec2(uTime*.05,0.))*.4;
        vec3 deep = vec3(.02,.035,.08) + uSkyTop*.12;
        vec3 refl = mix(uSkyBot, uSkyTop, .75) * (.22 + .4*w);
        vec3 col = mix(deep, refl, clamp(fr*1.15,0.,1.));
        float near = 1.-smoothstep(0.,420.,abs(vW.z+330.));
        float st = smoothstep(.6,.95, vn(vec2(vW.x*.06 + uTime*.05, vW.z*.06)));
        col += vec3(1.,.72,.42)*st*uNight*(.03+.16*near);
                col = mix(col, uSkyBot*.55 + vec3(.02,.025,.05), smoothstep(-900.,-2600., vW.z)*.85);   // 먼 곳은 수평선의 노을빛으로 자연스럽게 이어 붙임
        col += uFlashCol*uFlash*(.9*fr+.25)*1.3;
        float dist = length(vW - cameraPosition); float ff = 1.-exp(-uFogD*uFogD*dist*dist*.4); col = mix(col, uFogColor*vec3(.38,.36,.55), clamp(ff,0.,1.));
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }` }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, (BAY.z0 + BAY.z1) / 2); scene.add(water);
  // 땅: 만 자리는 뚫어 둠 (물에 비친 불꽃이 가려지지 않게)
  const gsh = new THREE.Shape(); gsh.absarc(0, 0, 2800, 0, TAU, false);
  const hole = new THREE.Path(); hole.moveTo(-BAY.x, -BAY.z0); hole.lineTo(-BAY.x, -BAY.z1); hole.lineTo(BAY.x, -BAY.z1); hole.lineTo(BAY.x, -BAY.z0); hole.closePath(); gsh.holes.push(hole);
  scene.remove(ground); ground.geometry.dispose(); ground.geometry = new THREE.ShapeGeometry(gsh); scene.add(ground);
  // 먼 산과 섬
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x0a0d1e, fog: false, side: THREE.DoubleSide });
  const ridge = []; for (let x = -2800; x <= 2800; x += 70) ridge.push([x, 50 + 95 * (.5 + .5 * Math.sin(x * .0021 + 1)) + 70 * (.5 + .5 * Math.sin(x * .0057 + 2)) + rnd(0, 16)]);
  const hs = new THREE.Shape(); hs.moveTo(-2800, -6); ridge.forEach(([x, y]) => hs.lineTo(x, y)); hs.lineTo(2800, -6); hs.closePath();
  const hills = new THREE.Mesh(new THREE.ShapeGeometry(hs), hillMat); hills.position.set(0, -OURH, -2720); hills.scale.y = .45; scene.add(hills);
  const BAYW = 2500, bayBoard = new THREE.Mesh(new THREE.PlaneGeometry(BAYW, BAYW * 460 / 2048), new THREE.MeshBasicMaterial({ map: loadTex("bay.webp"), transparent: true, depthWrite: false, fog: false }));
  bayBoard.position.set(0, -OURH + BAYW * 460 / 2048 / 2 - 10, -2050); bayBoard.renderOrder = -5; scene.add(bayBoard);
  bayBoard.visible = false;   // 외국 다리 사진(골든게이트)은 한국 야경에 안 맞아 뺌
  for (let i = 0; i < 260; i++) gAdd(rnd(-2600, 2600), -OURH + rnd(1, 10), -2690 + rnd(-30, 30), 1, rnd(.6, .85), rnd(.35, .55), 6, rnd(.35, .75));   // 건너편 도시의 불빛
  // 광안대교 같은 현수교 (색이 천천히 바뀌는 조명)
  const BA = new THREE.Vector3(-300, 0, -352), BB = new THREE.Vector3(250, 0, -830), BY = -OURH + 16, bdir = BB.clone().sub(BA), BL = bdir.length(); bdir.normalize();
  const bYaw = Math.atan2(bdir.x, bdir.z), bAt = (t, lat) => new THREE.Vector3(BA.x + bdir.x * BL * t + bdir.z * lat, BY, BA.z + bdir.z * BL * t - bdir.x * lat);
  const bdeck = new THREE.Mesh(new THREE.BoxGeometry(11, 1.6, BL), new THREE.MeshBasicMaterial({ color: 0x1b1f33 })); bdeck.position.copy(bAt(.5, 0)); bdeck.rotation.y = bYaw; scene.add(bdeck);
  for (let k = 1; k < 12; k++) { const pier = new THREE.Mesh(new THREE.BoxGeometry(3.4, 16, 3.4), new THREE.MeshBasicMaterial({ color: 0x151930 })); pier.position.copy(bAt(k / 12, 0)); pier.position.y = -OURH + 8; scene.add(pier); }
  const bridgeLights = [], cableMat = new THREE.LineBasicMaterial({ color: 0x3a4263, transparent: true, opacity: .8 });
  for (let k = 0; k <= 64; k++) for (const lat of [-6, 6]) { const p = bAt(k / 64, lat); bridgeLights.push({ i: gAdd(p.x, p.y + 2.2, p.z, 1, .7, .4, 4.6, .9), h: k / 64 }); }
  [.38, .72].forEach(t => {
    for (const lat of [-6, 6]) { const base = bAt(t, lat), top = base.clone(); top.y = BY + 72; const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, 72, 2.6), new THREE.MeshBasicMaterial({ color: 0x1b1f33 })); leg.position.set(base.x, BY + 36, base.z); scene.add(leg);
      for (let k = 0; k < 10; k++) { const p = bAt(t + (k + 1) * .006, lat), q = bAt(t - (k + 1) * .006, lat), pts = [top.clone(), p, top.clone(), q]; scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
        bridgeLights.push({ i: gAdd(p.x, p.y + 40 - k * 3.6, p.z, 1, .7, .4, 3.8, .8), h: t + k * .02 }); bridgeLights.push({ i: gAdd(q.x, q.y + 40 - k * 3.6, q.z, 1, .7, .4, 3.8, .8), h: t - k * .02 }); }
      bridgeLights.push({ i: gAdd(top.x, top.y, top.z, 1, 1, 1, 9, .95), h: t }); }
  });
  for (const lane of [-3, 3]) for (let k = 0; k < 22; k++) { const dirn = lane < 0 ? 1 : -1, c0 = bAt(.5, lane); cars.push({ ux: bdir.x, uz: bdir.z, cx: c0.x, cz: c0.z, y: BY + 1.4, s: rnd(-BL / 2, BL / 2), v: dirn * rnd(9, 17), len: BL, i: gAdd(0, 0, 0, 1, dirn > 0 ? .95 : .2, dirn > 0 ? .8 : .15, 3.2, .8) }); }
  const updGlowStatic = () => { gpos.needsUpdate = gcol.needsUpdate = gsz.needsUpdate = gal.needsUpdate = true; gp.setDrawRange(0, gn); };

  // ----- 우리 옥상 -----
  const roof = new THREE.Group(); scene.add(roof);
  const obstacles = [];   // 지나갈 수 없는 곳 (원)
  const floorMat = new THREE.MeshStandardMaterial({ map: texGrass(), roughness: 1, color: 0xd6dccf });   // 인조 잔디
  // 옥상을 넓게 (26m × 20m): 장애물은 가장자리로, 가운데와 앞쪽(하늘·야경 쪽)은 탁 트이게
  floorMat.map.repeat.set(10, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), floorMat); floor.rotation.x = -Math.PI / 2; roof.add(floor);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(RX * 2 + .6, OURH, RZ * 2 + .6), stdM(0x3a3f55, .95)); bodyM.position.y = -OURH / 2 - .02; roof.add(bodyM);
  const parM = stdM(0x7c8196, .9), capM = stdM(0xa4a8b8, .8);
  [[0, -RZ + .15, RX * 2 + .4, .3], [0, RZ - .15, RX * 2 + .4, .3]].forEach(([x, z, w, d]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, d), parM); p.position.set(x, .52, z); roof.add(p); const c = new THREE.Mesh(new THREE.BoxGeometry(w + .1, .08, d + .16), capM); c.position.set(x, 1.07, z); roof.add(c); });
  [[-RX + .15, 0], [RX - .15, 0]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(.3, 1.05, RZ * 2), parM); p.position.set(x, .52, z); roof.add(p); const c = new THREE.Mesh(new THREE.BoxGeometry(.4, .08, RZ * 2 + .1), capM); c.position.set(x, 1.07, z); roof.add(c); });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, .08, 6), new THREE.MeshStandardMaterial({ map: texWood(), roughness: .85 })); deck.position.set(.4, .04, -.2); roof.add(deck);
  // 계단실·물탱크·실외기
  const stair = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.7, 2.4), stdM(0x6a7088, .9)); stair.position.set(-RX + 2.3, 1.35, RZ - 1.6); roof.add(stair); obstacles.push({ x: -RX + 2.3, z: RZ - 1.6, r: 2.3 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(.9, 1.9), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); door.position.set(-RX + 2.3, 1, RZ - 2.79); roof.add(door);
  const doorL = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: softTex(), color: 0xffb870, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false })); doorL.position.set(-RX + 2.3, 1.1, RZ - 2.7); roof.add(doorL);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 2, 20), stdM(0x8a92a8, .6, .3)); tank.position.set(RX - 1.8, 2.2, RZ - 1.8); roof.add(tank); obstacles.push({ x: RX - 1.8, z: RZ - 1.8, r: 1.1 });
  for (const [lx, lz] of [[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.2, 6), stdM(0x555b70)); l.position.set(RX - 1.8 + lx, .6, RZ - 1.8 + lz); roof.add(l); }
  for (const [x, z] of [[RX - 5.6, RZ - .9], [RX - 4.2, RZ - .9]]) { const u = new THREE.Mesh(new THREE.BoxGeometry(1.2, .9, .8), stdM(0x9aa0b4, .6, .3)); u.position.set(x, .45, z); roof.add(u); const f = new THREE.Mesh(new THREE.CircleGeometry(.3, 16), stdM(0x333844)); f.position.set(x, .5, z - .41); f.rotation.y = Math.PI; roof.add(f); }
  obstacles.push({ x: RX - 4.9, z: RZ - .9, r: 1.3 });
  // 화분
  const potM = stdM(0xa0644a, .9), leaf = [stdM(0x2f7a45, .9), stdM(0x3f9a55, .9), stdM(0x276b3c, .9)];
  const plant = (x, z, s) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.26 * s, .2 * s, .38 * s, 14), potM); p.position.set(x, .19 * s, z); roof.add(p);
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.22 * s * rnd(.7, 1.1), 10, 8), pick(leaf)); l.position.set(x + rnd(-.18, .18) * s, (.55 + rnd(0, .45)) * s, z + rnd(-.18, .18) * s); l.scale.y = 1.2; roof.add(l); } obstacles.push({ x, z, r: .3 * s }); };
  [[-RX + .9, -RZ + .9, 1.5], [RX - .9, -RZ + .9, 1.7], [-RX + .9, 1.5, 1.1], [RX - .9, 2.5, 1.2], [-6, -RZ + .7, 1], [6.5, -RZ + .7, 1], [-RX + .9, -4, 1.2], [RX - .9, -3.5, 1], [0, RZ - .8, 1.3]].forEach(a => plant(...a));
  // 나무 울타리 (옥상달빛정원처럼 한쪽을 가려 아늑하게)
  const fenceTex = texWood(); fenceTex.repeat.set(1, 3);
  const fence = (x, z, len) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.7, len), new THREE.MeshStandardMaterial({ map: fenceTex, roughness: .9, color: 0xb98b58 })); f.position.set(x, .85, z); roof.add(f);
    const n = Math.round(len / 1.6); for (let k = 0; k <= n; k++) { const po = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.85, .18), stdM(0x6f4a2a, .9)); po.position.set(x, .92, z + (k / n - .5) * len); roof.add(po); }
  };
  fence(-RX + .85, 5, 4.2); fence(RX - .85, 5.6, 3.2);   // 뒤쪽 옆에만 (앞쪽 전망은 탁 트이게)
  // ----- 꾸미기: 텐트·돗자리·의자·랜턴·탁자 (눌러서 놓고, 눌러서 치워요) -----
  const LIM = { tent: 4, mat: 4, chair: 6, lantern: 6, table: 3 }, RAD = { tent: 1.1, mat: 0, chair: .36, lantern: .15, table: .5 }, NAME = { tent: "텐트", mat: "돗자리", chair: "의자", lantern: "랜턴", table: "탁자" };
  const items = [], TENT_C = [0x2f6f8f, 0xd9703a, 0x6b8e5a, 0x7d5fa8], MAT_T = [0xffffff, 0xa9d2ff, 0xffe08a, 0xc9f0c0], matTex = texPlaid();
  const fabric = c => new THREE.MeshStandardMaterial({ color: c, roughness: .92, side: THREE.DoubleSide });
  const glowSprite = (c, sc, op, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(sc, sc, 1); sp.position.set(0, y, z || 0); return sp; };
  function buildItem(t, c) {
    const g = new THREE.Group(); let sit = null, parts = null;
    if (t === "tent") {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 14, 0, TAU, 0, Math.PI / 2), fabric(TENT_C[c % 4])); body.scale.set(1, .85, 1.1); g.add(body);
      const door = new THREE.Mesh(new THREE.CircleGeometry(.5, 18), new THREE.MeshBasicMaterial({ color: 0x14182a })); door.scale.set(.85, 1.1, 1); door.position.set(0, .42, 1.2); g.add(door);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, .035, 6, 32), stdM(0xe9e6dc, .8)); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.1, 1); rim.position.y = .02; g.add(rim);
      const tg = glowSprite(0xffb870, 1.9, .42, .5, 1.3); g.add(tg); g.scale.setScalar(.85); sit = { dx: 0, dz: 1.45, y: 0 }; parts = { body, glow: tg };
    } else if (t === "mat") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, .03, 1.8), new THREE.MeshStandardMaterial({ map: matTex, color: MAT_T[c % 4], roughness: 1 })); m.position.y = .1; g.add(m); sit = { dx: 0, dz: 0, y: .1 };
    } else if (t === "chair") {
      const fm = stdM(0x2e3a58, .85), sm = stdM(0xe0a060, .9);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(.55, .06, .5), sm); seat.position.y = .31; g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(.55, .26, .05), sm); back.position.set(0, .47, .25); back.rotation.x = .2;   // 낮은 등받이: 앉은 모습이 뒤에서도 보이게 g.add(back);
      for (const [lx, lz] of [[-.24, -.2], [.24, -.2], [-.24, .22], [.24, .22]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .31, 6), fm); l.position.set(lx, .155, lz); g.add(l); }
      sit = { dx: 0, dz: .03, y: .2 };
    } else if (t === "lantern") {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.08, .09, .2, 12), new THREE.MeshBasicMaterial({ color: 0xffd89a })); b.position.y = .13; g.add(b);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .03, 12), stdM(0x2a2f40, .6)); cap.position.y = .245; g.add(cap);
      const lg = glowSprite(0xffb870, 1.6, .55, .3); g.add(lg); parts = { bulb: b, glow: lg };
    } else {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .05, 22), stdM(0xb98b58, .8)); top.position.y = .5; g.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.05, .12, .48, 10), stdM(0x59627c, .6)); leg.position.y = .25; g.add(leg);
      [[.14, .1], [-.16, -.08]].forEach(([x, z]) => { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.045, .035, .09, 10), stdM(0xf2efe6, .5)); cup.position.set(x, .575, z); g.add(cup); });
    }
    // 눌리는 범위를 넉넉히 (의자 등받이처럼 얇은 것도 손가락으로 잘 눌리게): 보이지 않는 상자
    const HIT = { tent: [2.4, 1.5, 2.4], mat: [2.4, .4, 1.8], chair: [.8, 1, .8], lantern: [.55, .8, .55], table: [1.1, .85, 1.1] }[t];
    if (HIT) { const hp = new THREE.Mesh(new THREE.BoxGeometry(HIT[0], HIT[1], HIT[2]), new THREE.MeshBasicMaterial({ visible: false })); hp.position.y = HIT[1] / 2; g.add(hp); }
    return { g, sit, parts };
  }
  const itemList = () => items.map(i => ({ t: i.t, x: +i.x.toFixed(2), z: +i.z.toFixed(2), c: i.c }));
  function addItem(t, x, z, c, silent) {
    if (items.filter(i => i.t === t).length >= LIM[t]) { cb.say && cb.say("더 놓을 수 없어요", `${NAME[t]}는 ${LIM[t]}개까지예요`); return null; }
    x = clamp(x, -RX + 1.1, RX - 1.1); z = clamp(z, -RZ + 1.2, RZ - 1);
    if (!silent && RAD[t] > 0 && obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + RAD[t] - .05)) { cb.say && cb.say("여기에는 놓을 수 없어요", "빈 자리를 눌러 보세요"); return null; }
    const o = buildItem(t, c); o.g.position.set(x, 0, z); roof.add(o.g);
    const it = { t, x, z, c, g: o.g, sit: o.sit, parts: o.parts, lit: true, obs: RAD[t] > 0 ? { x, z, r: RAD[t] } : null }; o.g.userData.item = it; if (it.obs) obstacles.push(it.obs); items.push(it);
    if (!silent) cb.layout && cb.layout(itemList());
    return it;
  }
  function removeItem(it) { roof.remove(it.g); if (it.obs) obstacles.splice(obstacles.indexOf(it.obs), 1); items.splice(items.indexOf(it), 1); cb.layout && cb.layout(itemList()); }
  const DEF_LAYOUT = [["tent", -9.5, -1.5, 0], ["tent", 9.4, 0.5, 1], ["mat", -1, 1.2, 0], ["chair", -3.2, -4.6, 0], ["chair", -1.9, -4.6, 1], ["lantern", -4.3, -4.3, 0], ["lantern", 1.6, .4, 0]];
  (Array.isArray(opt.layout) ? opt.layout.map(i => [i.t, i.x, i.z, i.c]) : DEF_LAYOUT).forEach(a => { if (LIM[a[0]]) addItem(a[0], a[1], a[2], a[3] || 0, true); });
  lampLights[0].position.set(-4.0, 1.2, -3.4);
  // 고기 굽는 자리
  const GR = { x: 6.8, z: -2.4 }; obstacles.push({ x: GR.x, z: GR.z, r: 1.05 });
  const gStart = roof.children.length;
  const gtab = new THREE.Mesh(new THREE.BoxGeometry(1.7, .08, .8), stdM(0x3b4259, .6, .2)); gtab.position.set(GR.x, .72, GR.z + .02); roof.add(gtab);
  for (const [lx, lz] of [[-.78, -.32], [.78, -.32], [-.78, .34], [.78, .34]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .72, 6), stdM(0x2b3044, .5, .5)); l.position.set(GR.x + lx, .36, GR.z + lz); roof.add(l); }
  const pan = new THREE.Mesh(new THREE.BoxGeometry(1.4, .16, .62), stdM(0x1a1d28, .5, .5)); pan.position.set(GR.x, .84, GR.z); roof.add(pan);
  const coalsM = new THREE.MeshBasicMaterial({ color: 0xff6a22 }); const coals = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .52), coalsM); coals.rotation.x = -Math.PI / 2; coals.position.set(GR.x, .9, GR.z); roof.add(coals);
  for (let i = 0; i <= 14; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .6, 4), stdM(0x9aa0b4, .4, .8)); b.rotation.x = Math.PI / 2; b.position.set(GR.x - .65 + i * .0929, 1.0, GR.z); roof.add(b); }
  const grillKids = roof.children.slice(gStart);
  coalLight.position.set(GR.x, 1.3, GR.z + .3);
  // 줄조명 (끈과 전구)
  const bulbPos = [], bulbCol = [];
  const strand = (z, x0, x1, y, sag) => {
    for (const px of [x0, x1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, y, 6), stdM(0x39405a, .6, .3)); pole.position.set(px, y / 2, z); roof.add(pole); }
    const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(new THREE.Vector3(lerp(x0, x1, t), y - Math.sin(t * Math.PI) * sag, z)); }
    roof.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2f45 })));
    for (let i = 1; i < 30; i += 1) { const p = pts[i]; bulbPos.push(p.x, p.y - .05, p.z); const c = [[255, 210, 140], [255, 180, 130], [200, 220, 255]][i % 3]; bulbCol.push(c[0] / 255, c[1] / 255, c[2] / 255); }
  };
  strand(-RZ + .6, -RX + .6, RX - .6, 2.6, .5); strand(RZ - .5, -RX + 4.6, RX - 6.8, 3.1, .5);   // 뒤쪽 가장자리 (카메라 바로 앞에 걸리지 않게)
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPos.length / 3);
  const bc = new THREE.Color(); for (let i = 0; i < bulbPos.length / 3; i++) { m4.makeTranslation(bulbPos[i * 3], bulbPos[i * 3 + 1], bulbPos[i * 3 + 2]); bulbs.setMatrixAt(i, m4); bulbs.setColorAt(i, bc.setRGB(bulbCol[i * 3], bulbCol[i * 3 + 1], bulbCol[i * 3 + 2])); }
  roof.add(bulbs);
  lampLights[1].position.set(0, 2.4, -3.4);
  const roofGlow = mkPoints(bulbPos.length / 3 + 40, addGlow), rg = roofGlow.geometry;
  const nBulb = bulbPos.length / 3;
  for (let i = 0; i < nBulb; i++) { rg.attributes.position.setXYZ(i, bulbPos[i * 3], bulbPos[i * 3 + 1], bulbPos[i * 3 + 2]); rg.attributes.aCol.setXYZ(i, bulbCol[i * 3], bulbCol[i * 3 + 1], bulbCol[i * 3 + 2]); rg.attributes.aSize.setX(i, .26); rg.attributes.aAlpha.setX(i, .75); }
  // 한지 등 세 개
  for (const [x, y, z] of [[-2.4, 2.35, -4.7], [1.3, 2.4, -4.7], [4.8, 2.3, -4.7]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a8 })); l.scale.y = 1.25; l.position.set(x, y, z); roof.add(l);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffb070, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(1.5, 1.5, 1); gl.position.copy(l.position); roof.add(gl); }
  // 반딧불
  const FF = 22, ffs = Array.from({ length: FF }, () => ({ x: rnd(-RX + 1, RX - 1), y: rnd(.4, 2.2), z: rnd(-RZ + 1, RZ - 1), p: rnd(0, TAU), s: rnd(.3, .8) }));
  for (let i = 0; i < FF; i++) { rg.attributes.aCol.setXYZ(nBulb + i, .8, 1, .45); rg.attributes.aSize.setX(nBulb + i, .22); }
  // 그림자 막(불판 아래)
  const flameSm = mkPoints(160, smokeMat); const fsg = flameSm.geometry; const smoke = Array.from({ length: 160 }, () => ({ l: 0, m: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  let smokeN = 0;
  const addSmoke = (x, y, z, vx, vy, vz, s, a, life, tint) => { const p = smoke[smokeN++ % 160]; p.l = life; p.m = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.a = a; p.t = tint || [.8, .82, .9]; };

  // ----- 이웃 옥상과 사람들 -----
  const neighbors = [];
  const neighborRoof = (cx, cy, cz, w, d, ppl) => {
    const g = new THREE.Group(); g.position.set(cx, cy, cz); scene.add(g);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 40, d), stdM(0x353a52, .95)); b.position.y = -20; g.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, .12, d), stdM(0x6f7488, .9)); t.position.y = .02; g.add(t);
    [[0, d / 2 - .1, w, .2], [0, -d / 2 + .1, w, .2]].forEach(([x, z, ww, dd]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(ww, .9, dd), stdM(0x555a70, .9)); p.position.set(x, .5, z); g.add(p); });
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffb070, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(6, 4, 1); gl.position.set(0, 1.4, 0); g.add(gl);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * .8, .05, .05), new THREE.MeshBasicMaterial({ color: 0xffd8a0 })); lamp.position.set(0, 2.5, d / 2 - .6); g.add(lamp);
    ppl.forEach(([px, pz, hood, pose]) => { const P = makePerson({ hood }); P.g.position.set(px, .1, pz); P.pose = pose; P.yaw = Math.PI; P.base = pose; P.nextWave = rnd(6, 18); P.waveT = 0; P.g.scale.setScalar(1); g.add(P.g); neighbors.push(P); });
  };
  neighborRoof(-33, -3, -48, 12, 9, [[-2, 0, 0xe86a6a, "sit"], [1.2, .5, 0x4fb08a, "idle"]]);
  neighborRoof(31, -7, -66, 14, 10, [[-1, 0, 0xf0b040, "idle"], [2, 1, 0x6a8ae8, "sit"]]);

  // ----- 나(아바타)와 고양이 -----
  const me = makePerson({ hood: opt.hood || 0x7b5cf8 }); roof.add(me.g); me.g.position.set(0, 0, 1.0); me.yaw = Math.PI;
  const cat = makeCat(); roof.add(cat.g); cat.g.position.set(1.8, 0, 1.6);
  const dog = makeDog(); roof.add(dog.g); dog.g.position.set(-1.0, 0, -.1); dog.g.rotation.y = dog.yaw = .35;   // 흰 강아지
  const tagSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLabel("나 · " + (opt.nick || "고요한 구름")), transparent: true, depthWrite: false })); tagSpr.scale.set(1.3, .33, 1); tagSpr.position.set(0, 1.78, 0); me.g.add(tagSpr);
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); bubble.scale.set(.5, .5, 1); bubble.visible = false; me.g.add(bubble);
  let bubbleT = 0;
  const emote = e => { bubble.material.map = texEmoji(e); bubble.material.needsUpdate = true; bubble.visible = true; bubbleT = 2.2; bubble.position.set(0, 2.15, 0); };
  let target = null, sitSpot = null, eatT = 0, cheerT = 0, waveT = 0, afterWalk = null;
  const pushOut = p => { for (const o of obstacles) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + .28; if (d < m) { const k = m / (d || 1e-3); p.x = o.x + dx * k; p.z = o.z + dz * k; } } p.x = clamp(p.x, -RX + 1.1, RX - 1.1); p.z = clamp(p.z, -RZ + 1.1, RZ - .9); return p; };
  const walkTo = (x, z, then, sit) => { target = pushOut({ x, z }); if (sit) { target.x = x; target.z = z; } sitSpot = sit || null; afterWalk = then || null; me.pose = "idle"; };
  let sittingOn = null;
  let inTent = null, focus = null, fcs = 0, focusItem = null, lookDev = false;
  const standUp = () => { seq = null; if (focus && focus !== "grill" && focus !== "sky") { focus = null; cb.focus && cb.focus(null); }
    if (inTent) { const it0 = inTent, q = pushOut({ x: it0.x, z: it0.z + 1.5 }); inTent = null; me.g.position.set(it0.x, 0, it0.z + .5); me.pose = "crawl"; me.yaw = 0; lookT = .22; slide({ x: q.x, z: q.z }, 1.0, "crawl", 0, () => { me.pose = "idle"; me.yaw = Math.PI; emote("☀️"); }, 0, 0); return; }
    if (me.pose === "sit" || me.pose === "lie") { me.pose = "idle"; me.g.position.y = 0; me.seat = 0; sittingOn = null; lookT = .22; cb.seated && cb.seated(false); } };
  // 움직임 이어 붙이기: 앉으러 돌아서 천천히 앉고, 텐트는 엎드려 기어 들어가요
  let seq = null;
  const slide = (to, dur, pose, seat, done, delay, yaw) => { seq = { to, dur, pose, seat: seat || 0, done, t: -(delay || 0), yaw, started: false }; };
  const sitOn = it => {
    standUp(); const q = it.sit;
    if (it.t === "chair") walkTo(it.x, it.z - .85, () => { me.yaw = Math.PI; slide({ x: it.x + q.dx, z: it.z + q.dz }, .55, "sit", q.y, () => { sittingOn = it; emote("😌"); cb.seated && cb.seated(true); }, .5, Math.PI); }, true);
    else walkTo(it.x + q.dx, it.z + q.dz, () => { me.yaw = Math.PI; me.pose = "sit"; me.seat = q.y; me.g.position.y = 0; sittingOn = it; emote("😌"); cb.seated && cb.seated(true); }, true);
  };
  const lieOn = it => { me.pose = "lie"; me.yaw = 0; me.g.position.set(it.x, .32, it.z + .65); sittingOn = it; lookT = .95; emote("🌙"); cb.lie && cb.lie(); setFocus("lie"); };
  // ----- 소품 동작: 소품을 눌러 앉기·눕기·텐트 들어가기·차 마시기·랜턴 켜고 끄기 -----
  const itemActions = it => ({ tent: [{ id: "enter", label: "들어가기" }, { id: "sit", label: "앞에 앉기" }], mat: [{ id: "sit", label: "앉기" }, { id: "lie", label: "눕기" }],
    chair: [{ id: "sit", label: "앉기" }], lantern: [{ id: "toggle", label: it.lit ? "끄기" : "켜기" }], table: [{ id: "tea", label: "차 마시기" }] }[it.t] || []);
  function doAction(it, id) {
    standUp();
    if (id === "sit") sitOn(it);
    else if (id === "lie") { standUp(); walkTo(it.x, it.z + .65, () => lieOn(it), true); }
    else if (id === "enter") walkTo(it.x, it.z + 1.45, () => { me.yaw = Math.PI; slide({ x: it.x, z: it.z + .5 }, 1.1, "crawl", 0, () => { inTent = it; me.pose = "lie"; me.yaw = 0; me.g.position.set(it.x, .16, it.z + .5); lookT = .9; emote("🌙"); cb.say && cb.say("텐트 안이에요", "지붕이 비쳐서 밤하늘이 보여요. '그만하기'를 누르면 나가요"); cb.lie && cb.lie(); focusItem = it; setFocus("tent"); }, .3, Math.PI); }, true);
    else if (id === "tea") walkTo(it.x + .95, it.z + .1, () => { me.yaw = -Math.PI / 2; me.pose = "eat"; eatT = 3.2; emote("☕"); cb.say && cb.say("차를 마셔요", "따뜻한 한 잔 ☕"); focusItem = it; setFocus("table"); });
    else if (id === "toggle") { it.lit = !it.lit; const pp = it.parts; if (pp) { pp.glow.visible = it.lit; pp.bulb.material.color.setHex(it.lit ? 0xffd89a : 0x3a3f50); } emote(it.lit ? "💡" : "🌙"); }
  }
  const nearestItem = t => items.filter(i => i.t === t).sort((a, b) => Math.hypot(a.x - mePos.x, a.z - mePos.z) - Math.hypot(b.x - mePos.x, b.z - mePos.z))[0];
  const sitNearest = () => { const c = nearestItem("chair") || nearestItem("mat"); if (!c) { cb.say && cb.say("앉을 곳이 없어요", "꾸미기에서 의자나 돗자리를 놓아 보세요"); return; } doAction(c, "sit"); };
  const enterNearest = () => { const t = nearestItem("tent"); if (!t) { cb.say && cb.say("텐트가 없어요", "꾸미기에서 텐트를 놓아 보세요"); return; } doAction(t, "enter"); };
  const lieDown = () => { const m = items.filter(i => i.t === "mat").sort((a, b) => Math.hypot(a.x - mePos.x, a.z - mePos.z) - Math.hypot(b.x - mePos.x, b.z - mePos.z))[0];
    if (!m) { cb.say && cb.say("돗자리가 없어요", "꾸미기에서 돗자리를 펴 보세요"); return; } standUp(); walkTo(m.x, m.z + .65, () => lieOn(m), true); };
  // 동작을 시작하면 그 동작에 맞는 시점으로 자동 전환하고 고정해요 (그만하기를 누르면 원래대로)
  function setFocus(id) {
    if (id === focus) return; const prev = focus; focus = id; if (id === "grill" || prev === "grill") snapCam = true;
    if (!id) { if (inTent || me.pose === "lie" || (me.pose === "sit" && prev === "table")) standUp(); if (counting) { counting = false; starDim = 1; applySky(); } }
    else if (id === "sky") { counting = true; starDim = 1.5; applySky(); }
    cb.focus && cb.focus(id);
  }
  let placing = null, removing = false, colorIdx = 0, view = "ground", aer = 0;

  // ----- 별 세기 (오늘의 별 150개, 눌러서 세면 금빛으로 바뀌고 별자리로 이어짐) -----
  const starRand = mulberry(hashStr(new Date().toDateString()));
  const STARS = Array.from({ length: 150 }, () => { const az = starRand() * TAU, alt = (8 + starRand() * 62) * Math.PI / 180; return { d: dirOf(alt, az), mag: starRand() }; });
  const starPts = mkPoints(STARS.length, addGlow), sg = starPts.geometry;
  let counted = new Set(opt.stars || []);
  const paintStars = () => STARS.forEach((s, i) => { const on = counted.has(i); const bright = (on ? 1 : .35 + .45 * s.mag);
    sg.attributes.position.setXYZ(i, s.d.x * 1300, s.d.y * 1300, s.d.z * 1300); sg.attributes.aCol.setXYZ(i, on ? 1 : .8, on ? .86 : .88, on ? .45 : 1); sg.attributes.aSize.setX(i, on ? 22 : 7 + s.mag * 8); sg.attributes.aAlpha.setX(i, bright); });
  const conLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffdf8a, transparent: true, opacity: .55, depthWrite: false })); conLine.frustumCulled = false; scene.add(conLine);
  const paintLines = () => { const idx = [...counted]; conLine.geometry.dispose(); conLine.geometry = new THREE.BufferGeometry().setFromPoints(idx.map(i => STARS[i].d.clone().multiplyScalar(1298))); };
  paintStars(); paintLines();
  let starDim = 1;
  const nearestStar = (dir, maxDeg) => { let best = -1, bd = Math.cos(maxDeg * Math.PI / 180); STARS.forEach((s, i) => { const c = s.d.dot(dir); if (c > bd) { bd = c; best = i; } }); return best; };
  const countStar = i => {
    if (i < 0 || counted.has(i)) return false;
    counted.add(i); paintStars(); sg.attributes.aSize.needsUpdate = sg.attributes.aCol.needsUpdate = sg.attributes.aAlpha.needsUpdate = true; paintLines();
    flare.push({ p: STARS[i].d.clone().multiplyScalar(1296), t: 0 });
    cb.starCounted && cb.starCounted(counted.size, [...counted]); return true;
  };
  const flare = [];

  // ----- 소원 풍등 -----
  const lanterns = [];
  const sendLantern = (text, from) => {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .17, .42, 14, 1, true), new THREE.MeshBasicMaterial({ map: texLantern(text), side: THREE.DoubleSide }));
    g.add(body); const top = new THREE.Mesh(new THREE.CircleGeometry(.22, 14), new THREE.MeshBasicMaterial({ color: 0xffb46a, side: THREE.DoubleSide })); top.rotation.x = -Math.PI / 2; top.position.y = .21; g.add(top);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xff9a50, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(2.4, 2.4, 1); gl.position.y = 0; g.add(gl);
    const p = from || me.g.position.clone().add(new THREE.Vector3(0, 1.3, 0)); g.position.copy(p); roof.add(g);
    lanterns.push({ g, gl, t: 0, vx: rnd(-.3, .3), vz: rnd(-1.1, -.5), ph: rnd(0, TAU), life: 38 });
    return g;
  };

  // ----- 불꽃 -----
  const mirMat = glowMat(THREE.AdditiveBlending, 1.5); mirMat.uniforms.uMul.value = .3;
  const fw = mkPoints(POOL, addGlow), fg = fw.geometry, fpos = fg.attributes.position.array, fcol = fg.attributes.aCol.array, fsz = fg.attributes.aSize.array, fal = fg.attributes.aAlpha.array;
  const vel = new Float32Array(POOL * 3), life = new Float32Array(POOL), maxL = new Float32Array(POOL), drag = new Float32Array(POOL), grav = new Float32Array(POOL), sz0 = new Float32Array(POOL),
    base = new Float32Array(POOL * 3), flags = new Uint8Array(POOL), splitAt = new Float32Array(POOL);   // flags: 1 꼬리, 2 반짝, 4 쪼개짐
  let pn = 0;
  const spark = (x, y, z, vx, vy, vz, c, size, lf, dg, gr, fl, sp) => {
    const i = pn++ % POOL; fpos[i * 3] = x; fpos[i * 3 + 1] = y; fpos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    base[i * 3] = Math.pow(c[0] / 255, 2.2); base[i * 3 + 1] = Math.pow(c[1] / 255, 2.2); base[i * 3 + 2] = Math.pow(c[2] / 255, 2.2); life[i] = lf; maxL[i] = lf; drag[i] = dg; grav[i] = gr; sz0[i] = size; flags[i] = fl || 0; splitAt[i] = sp || 0;
  };
  const mirror = new THREE.Points(fg, mirMat); mirror.frustumCulled = false; mirror.scale.y = -1; mirror.position.y = 2 * WATER_Y; scene.add(mirror);
  const flashes = []; let flashAmt = 0; const flashCol = new THREE.Color(0, 0, 0);
  const rockets = [], timers = [];
  const later = (ms, fn) => timers.push({ t: ms / 1000, fn });
  const randDir = () => { const u = rnd(-1, 1), a = rnd(0, TAU), r = Math.sqrt(1 - u * u); return [r * Math.cos(a), u, r * Math.sin(a)]; };
  const fib = (n, rot) => { const out = []; for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), ph = i * 2.399963; out.push(new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r).applyQuaternion(rot)); } return out; };
  const SCALE = quality === "low" ? .6 : 1;
  const KINDS = ["peony", "peony", "chrys", "willow", "ring", "heart", "palm", "crossette", "crackle", "double", "saturn"];
  function burst(pos, kind, c, size) {
    const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...randDir())), sp = (size || 1) * rnd(.9, 1.15) * 1.3, gold = [255, 195, 95];
    const N = n => Math.max(12, Math.round(n * SCALE)), c2 = pick(FW_COLORS);
    const shell = (n, v, c_, lf, dg, gr, size_, fl) => fib(N(n), rot).forEach(d => { const k = v * sp * rnd(.93, 1.04); spark(pos.x, pos.y, pos.z, d.x * k, d.y * k, d.z * k, c_, size_, lf * rnd(.85, 1.1), dg, gr, fl); });
    if (kind === "peony") shell(230, 78, c, 2.3, 1.5, 9, 3.4, 0);
    else if (kind === "chrys") shell(190, 95, c, 3, 1.25, 9, 3.2, 1);
    else if (kind === "willow") shell(150, 62, gold, 4.6, 1.05, 12, 3.2, 1 | 2);
    else if (kind === "ring") { const nrm = new THREE.Vector3(...randDir()), a = new THREE.Vector3(...randDir()).cross(nrm).normalize(), b = nrm.clone().cross(a);
      for (let i = 0; i < N(110); i++) { const t = i / N(110) * TAU, d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)); spark(pos.x, pos.y, pos.z, d.x * 74 * sp, d.y * 74 * sp, d.z * 74 * sp, c, 3.4, 2.3, 1.5, 7, 0); }
      for (let i = 0; i < N(50); i++) { const t = i / N(50) * TAU, d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)); spark(pos.x, pos.y, pos.z, d.x * 36 * sp, d.y * 36 * sp, d.z * 36 * sp, c2, 2.8, 2, 1.5, 7, 0); } }
    else if (kind === "heart") { const toCam = camera.position.clone().sub(pos).normalize(), a = new THREE.Vector3(0, 1, 0).cross(toCam).normalize(), b = toCam.clone().cross(a).normalize();
      for (let i = 0; i < N(150); i++) { const t = i / N(150) * TAU, hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        const d = a.clone().multiplyScalar(hx * 1.25).addScaledVector(b, hy * 1.25); spark(pos.x, pos.y, pos.z, d.x * sp, d.y * sp, d.z * sp, [255, 105, 160], 3.6, 2.6, 1.3, 5, 0); } }
    else if (kind === "palm") { for (let a = 0; a < 7; a++) { const ang = a / 7 * TAU + rnd(-.2, .2), d = new THREE.Vector3(Math.cos(ang) * .75, rnd(.35, .8), Math.sin(ang) * .75).normalize();
      for (let j = 0; j < N(16); j++) spark(pos.x, pos.y, pos.z, d.x * (34 + j * 4.2) * sp, d.y * (34 + j * 4.2) * sp, d.z * (34 + j * 4.2) * sp, gold, 3.2, 2.6 + j * .03, 1.0, 14, 1 | 2); } }
    else if (kind === "crossette") fib(N(20), rot).forEach(d => spark(pos.x, pos.y, pos.z, d.x * 62 * sp, d.y * 62 * sp, d.z * 62 * sp, c, 4.2, 1.5, 1.2, 8, 4, 0.85));
    else if (kind === "crackle") shell(130, 62, [255, 220, 150], 3.2, 1.6, 6, 2.6, 2);
    else if (kind === "double") { shell(170, 72, c, 2.3, 1.5, 9, 3.4, 0); shell(120, 38, c2, 2.1, 1.5, 9, 3, 0); later(260, () => burst(pos.clone().add(new THREE.Vector3(rnd(-8, 8), rnd(-6, 6), rnd(-8, 8))), "peony", pick(FW_COLORS), size * .75)); }
    else if (kind === "saturn") { shell(130, 40, c, 2.4, 1.5, 8, 3.2, 0); const nrm = new THREE.Vector3(...randDir()), a = new THREE.Vector3(...randDir()).cross(nrm).normalize(), b = nrm.clone().cross(a);
      for (let i = 0; i < N(110); i++) { const t = i / N(110) * TAU, d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)); spark(pos.x, pos.y, pos.z, d.x * 92 * sp, d.y * 92 * sp, d.z * 92 * sp, c2, 3.2, 2.4, 1.6, 6, 0); } }
    flashes.push({ c: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), t: 0, a: kind === "willow" ? .55 : .9 }); flashAmt = Math.max(flashAmt, .0);
    flashLight.position.copy(pos).multiplyScalar(.12).add(new THREE.Vector3(0, 8, 0));
    for (let i = 0; i < 3; i++) addSmoke(pos.x + rnd(-14, 14), pos.y + rnd(-10, 10), pos.z + rnd(-14, 14), rnd(-1.2, 1.2), rnd(-.4, .2), rnd(-.6, .6), rnd(55, 90), .045, rnd(9, 15), [c[0] / 300 + .25, c[1] / 300 + .25, c[2] / 300 + .3]);
    const dist = Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z);
    cb.burst && cb.burst({ kind, big: (size || 1) > 1.25, pan: clamp(pos.x / Math.max(120, Math.abs(pos.z) * .9), -1, 1), height: clamp((pos.y + 50) / 300, 0, 1), dist, size: size || 1 });
    neighbors.forEach(n => { if (Math.random() < .7) { n.waveT = rnd(2.5, 4.5); n.pose = Math.random() < .5 ? "cheer" : "wave"; } });
    if (me.pose !== "eat" && me.pose !== "sit" && !target) { cheerT = rnd(1.2, 2); }
  }
  function launch(tx, ty, tz, kind, c, size, quiet) {
    const bx = tx * .98, bz = tz * .98;
    rockets.push({ x: bx, y: -OURH + 2, z: bz, tx, ty, tz, v: rnd(105, 130), c: c || pick(FW_COLORS), kind: kind || pick(KINDS), size: size || rnd(.85, 1.2), t: 0 });
    if (!quiet && cb.launch) cb.launch({ pan: clamp(bx / Math.max(120, Math.abs(bz) * .9), -1, 1) });
  }
  const aimShell = (dir) => {   // 화면을 눌러 쏘기: 바라본 방향 멀리에서 (같은 방 사람들에게도 보내요)
    const h = Math.hypot(dir.x, dir.z) || 1, dist = rnd(380, 520), x = camera.position.x + dir.x / h * dist, z = camera.position.z + dir.z / h * dist;
    const y = clamp(camera.position.y + dir.y / h * dist, 55, 250), kind = pick(KINDS), ci = (Math.random() * FW_COLORS.length) | 0, size = +rnd(.85, 1.2).toFixed(2);
    launch(x, y, z, kind, FW_COLORS[ci], size);
    cb.fwOut && cb.fwOut({ x: Math.round(x), y: Math.round(y), z: Math.round(z), k: kind, c: ci, s: size });
  };
  const remoteShell = p => {   // 같은 방 사람이 쏜 불꽃 (받은 값은 범위를 다시 맞춰서)
    if (!p || !KINDS.includes(p.k)) return;
    const n = (v, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : 0);
    launch(n(p.x, -1200, 1200), n(p.y, -60, 300), n(p.z, -1400, 1200), p.k, FW_COLORS[(n(p.c, 0, FW_COLORS.length - 1)) | 0], n(p.s, .7, 1.9));
  };
  const autoShell = (kind, size, low) => { const a = -Math.PI / 2 + rnd(-.5, .5), dist = rnd(420, 760); launch(Math.cos(a) * dist, low ? rnd(10, 175) : rnd(70, 230), Math.sin(a) * dist, kind, null, size); };
  const show = (seed) => {   // 한바탕: 점점 커지다 마지막에 한꺼번에. 같은 seed 면 누가 열어도 같은 순서 (정각 쇼를 함께 봐요)
    cb.showStart && cb.showStart();
    const R = seed != null ? mulberry(seed >>> 0) : Math.random, r = (a, b) => a + R() * (b - a), pk = a => a[(R() * a.length) | 0];
    const shell = size => { const a = -Math.PI / 2 + r(-.6, .6), dist = r(360, 600); return [Math.cos(a) * dist, r(70, 230), Math.sin(a) * dist, pk(KINDS), pk(FW_COLORS), size]; };
    let t = 0; for (let i = 0; i < 34; i++) { t += i < 20 ? r(1100, 1900) : r(380, 800); const a = shell(i > 26 ? r(1.2, 1.5) : r(.9, 1.2)); later(t, () => launch(...a)); }
    for (let i = 0; i < 10; i++) { const a = shell(r(1.3, 1.7)); later(t + 1500 + i * 190, () => launch(...a)); }
    later(t + 6000, () => cb.showEnd && cb.showEnd());
    return t / 1000 + 8;
  };

  // ----- 먹을거리 -----
  const FOOD = { pork: { name: "삼겹살" }, shrimp: { name: "새우" }, mushroom: { name: "버섯" }, corn: { name: "옥수수" } };
  const CK = { pork: [[238, 160, 170], [216, 150, 96], [120, 70, 40], [34, 26, 24]], shrimp: [[210, 190, 190], [240, 120, 70], [200, 80, 40], [40, 28, 24]],
    mushroom: [[214, 196, 170], [190, 150, 100], [130, 90, 56], [36, 28, 22]], corn: [[250, 228, 130], [248, 205, 70], [200, 140, 40], [48, 34, 22]] };
  const colorAt = (kind, v) => { const k = CK[kind], p = clamp(v, 0, 1.3) / 1.3 * 3, i = Math.min(2, Math.floor(p)), f = p - i; return k[i].map((x, j) => (x + (k[i + 1][j] - x) * f) / 255); };
  // 고기 굽기 미니게임: 옥상·도시를 다 가리고 불판만 어둡고 따뜻한 배경에 크게 보여요
  const miniBg = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "#2b1d17"); gr.addColorStop(.45, "#171a24"); gr.addColorStop(1, "#0a0d14"); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ map: t, fog: false })); m.rotation.x = -Math.PI / 2; m.position.set(GR.x, .3, GR.z); m.visible = false; scene.add(m);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xff7a30, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.scale.set(4.2, 4.2, 1); gl.position.set(GR.x, .86, GR.z); gl.visible = false; scene.add(gl);
    return { m, gl }; })();
  let snapCam = false;
  // 익은 정도 막대(앞/뒤)와 기름 튀는 불꽃
  const gaugeCv = () => { const c = document.createElement("canvas"); c.width = 128; c.height = 40; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, t }; };
  const drawGauge = (G, a, b, topIsA) => { const g = G.c.getContext("2d"), W = 128, M = 1.3; g.clearRect(0, 0, W, 40);
    [[a, 6], [b, 24]].forEach(([v, y], i) => { g.fillStyle = "rgba(10,12,20,.72)"; g.beginPath(); g.roundRect(2, y, 124, 11, 5); g.fill();
      g.fillStyle = "rgba(120,220,140,.28)"; g.fillRect(2 + 124 * .55 / M, y + 1, 124 * (1.05 - .55) / M, 9); g.fillStyle = "rgba(255,90,70,.28)"; g.fillRect(2 + 124 * 1.15 / M, y + 1, 124 * (.15) / M, 9);
      const w = Math.min(1, v / M) * 124, ok = v >= .55 && v <= 1.05, burnt = v > 1.15; g.fillStyle = burnt ? "#ff5a46" : ok ? "#7ee08f" : "#ffc36b"; g.beginPath(); g.roundRect(2, y, Math.max(6, w), 11, 5); g.fill();
      g.fillStyle = "rgba(255,255,255,.85)"; g.font = "700 9px system-ui, sans-serif"; g.fillText(i === 0 ? "위" : "아래", 7, y + 9); });
    G.t.needsUpdate = true; };
  const sparks = Array.from({ length: 30 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffd08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.visible = false; scene.add(sp); return { sp, l: 0, vx: 0, vy: 0, vz: 0 }; });
  let sparkN = 0; const oilSpark = (x, y, z) => { const q = sparks[sparkN++ % sparks.length]; q.l = rnd(.35, .6); q.vx = rnd(-.4, .4); q.vy = rnd(.8, 1.6); q.vz = rnd(-.25, .25); q.sp.position.set(x, y, z); q.sp.scale.setScalar(rnd(.03, .06)); q.sp.visible = true; };
  const foods = [], foodGroup = new THREE.Group(); roof.add(foodGroup);
  const slotPos = i => new THREE.Vector3(GR.x - .48 + i * .32, 1.05, GR.z);
  const mkFood = kind => {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ roughness: .8 });
    let mesh;
    if (kind === "pork") { const geo = new THREE.BoxGeometry(.3, .045, .11, 12, 2, 5), pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), ex = Math.abs(x) / .15, ez = Math.abs(z) / .055;
        pa.setY(i, y * (1 - .3 * Math.max(ex, ez) ** 4) + (y > 0 ? Math.sin(x * 53 + z * 31) * .0022 : 0)); pa.setX(i, x * (1 - .06 * ez * ez)); pa.setZ(i, z * (1 - .08 * ex ** 3)); }
      geo.computeVertexNormals(); m.map = texPork(); m.roughness = .55; m.needsUpdate = true; mesh = new THREE.Mesh(geo, m);
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(.26, .095), new THREE.MeshBasicMaterial({ map: texMarks(), transparent: true, opacity: 0, depthWrite: false })); mk.rotation.x = -Math.PI / 2; mk.position.y = .0235; mesh.add(mk); mesh.userData.marks = mk; }
    else if (kind === "shrimp") { mesh = new THREE.Mesh(new THREE.TorusGeometry(.07, .035, 8, 14, Math.PI * 1.3), m); mesh.rotation.x = Math.PI / 2; }
    else if (kind === "mushroom") { mesh = new THREE.Mesh(new THREE.SphereGeometry(.09, 18, 10, 0, TAU, 0, Math.PI / 2), m); m.roughness = .5;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .07, 10), stdM(0xe8dcc0, .8)); st.position.y = -.03; mesh.add(st); }
    else { mesh = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .26, 12), new THREE.MeshStandardMaterial({ map: texCorn(), roughness: .8 })); mesh.rotation.z = Math.PI / 2; }
    g.add(mesh); g.userData = { food: true }; mesh.userData.food = true; return { g, mesh, m };
  };
  const slotFree = () => { const used = new Set(foods.map(f => f.slot)); return [0, 1, 2, 3, 4].find(i => !used.has(i)); };
  const addFood = kind => {
    const slot = slotFree(); if (slot === undefined) { cb.say && cb.say("불판이 가득 찼어요", "먹거나 치우고 올려 보세요"); return false; }
    const o = mkFood(kind), f = { kind, slot, c: [0, 0], down: 0, flip: 0, ...o }; o.g.position.copy(slotPos(slot)); foodGroup.add(o.g); foods.push(f);
    const G = gaugeCv(), gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.t, transparent: true, depthWrite: false, depthTest: false, fog: false })); gs.scale.set(.3, .094, 1); gs.renderOrder = 15; gs.visible = focus === "grill"; foodGroup.add(gs); f.gauge = { G, gs }; drawGauge(G, 0, 0);
    o.mesh.traverse(c => { c.userData.foodRef = f; }); cb.sizzle && cb.sizzle(foods.length); cb.hint && cb.hint("뒤집어 가며 노릇하게 구워 보세요. 다 익으면 눌러서 먹어요.");
    if (!target && focus !== "grill") walkTo(GR.x - .1, GR.z + 1.2, () => { me.yaw = Math.PI; });
    return true;
  };
  const ready = f => Math.min(f.c[0], f.c[1]) >= .55 && Math.max(f.c[0], f.c[1]) <= 1.05, burnt = f => Math.max(f.c[0], f.c[1]) > 1.15;
  const rmFood = f => { foodGroup.remove(f.g); if (f.gauge) { foodGroup.remove(f.gauge.gs); f.gauge.G.t.dispose(); } foods.splice(foods.indexOf(f), 1); cb.sizzle && cb.sizzle(foods.length); };
  const tapFood = (f, close) => {
    const perfect = Math.min(f.c[0], f.c[1]) >= .72 && Math.max(f.c[0], f.c[1]) <= .95;
    if (ready(f) && close) { rmFood(f); cb.eat && cb.eat(f.kind, FOOD[f.kind].name, perfect ? 2 : 1); emote(perfect ? "🤩" : "😋"); }
    else if (ready(f)) { rmFood(f); walkTo(GR.x - .3, GR.z + 1.15, () => { me.pose = "eat"; eatT = 2.6; me.yaw = 0; emote("😋"); cb.eat && cb.eat(f.kind, FOOD[f.kind].name, 1); }); }
    else if (burnt(f)) { rmFood(f); cb.burnt && cb.burnt(); cb.say && cb.say("조금 탔어요", "괜찮아요, 다시 구워 봐요"); emote("😅"); }
    else { f.down = 1 - f.down; f.flip = 1; }
  };

  // ----- 함께 있는 사람들 (rooftop-net.js 가 보내 주는 상태를 그려요. 이모지 인사만, 말은 없어요) -----
  const EMO = ["👋", "❤️", "😂", "👏", "🙏", "🎆"], HOODS = [0xe86a6a, 0x4fb08a, 0xf0b040, 0x6a8ae8, 0xb06ae8, 0x40b8c8, 0xe88ab0, 0x8ab040], PEER_MAX = 7;
  const POSES = new Set(["idle", "walk", "sit", "lie", "wave", "cheer", "eat", "watch"]), peers = new Map(), emoTex = {};
  const nv = (v, a, b, d) => (Number.isFinite(+v) ? clamp(+v, a, b) : d || 0);
  function setPeer(id, st) {
    let p = peers.get(id);
    if (!p) {
      if (peers.size >= PEER_MAX) return;
      const P = makePerson({ hood: HOODS[hashStr(id) % HOODS.length] }); roof.add(P.g);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLabel(String(st.n || "이웃").slice(0, 12)), transparent: true, depthWrite: false })); tag.scale.set(1.2, .3, 1); tag.position.set(0, 1.75, 0); P.g.add(tag);
      const bub = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); bub.scale.set(.5, .5, 1); bub.visible = false; P.g.add(bub);
      P.g.position.set(nv(st.x, -RX + 1.1, RX - 1.1), 0, nv(st.z, -RZ + 1.1, RZ - .9)); p = { P, bub, bt: 0, tx: P.g.position.x, tz: P.g.position.z, ty: 0, pose: "idle", yaw: Math.PI, last: time }; peers.set(id, p);
      cb.peerCount && cb.peerCount(peers.size);
    }
    p.tx = nv(st.x, -RX + 1.1, RX - 1.1); p.tz = nv(st.z, -RZ + 1.1, RZ - .9); p.ty = nv(st.y, 0, 1); p.yaw = nv(st.yaw, -7, 7, Math.PI); p.pose = POSES.has(st.pose) ? st.pose : "idle"; p.P.seat = nv(st.seat, 0, .5); p.last = time;
  }
  function removePeer(id) { const p = peers.get(id); if (!p) return; roof.remove(p.P.g); peers.delete(id); cb.peerCount && cb.peerCount(peers.size); }
  function peerEmote(id, e) {
    const p = peers.get(id); if (!p || !EMO.includes(e)) return;
    p.bub.material.map = emoTex[e] || (emoTex[e] = texEmoji(e)); p.bub.material.needsUpdate = true; p.bub.visible = true; p.bt = 2.4; p.bub.position.set(0, 2.1, 0);
    if (e === "👋") p.wave = 1.6;
  }
  // ----- 고양이 -----
  const hearts = new THREE.Group(); roof.add(hearts); const heartList = [];
  const petDog = () => {   // 강아지: 신나서 폴짝 뛰고 꼬리를 세차게 흔들어요
    dog.mode = "happy"; dog.t = 2.6; dog.hop = 0; emote("🐶"); cb.dog && cb.dog();
    for (let i = 0; i < 4; i++) { const s_ = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEmoji(i % 2 ? "💛" : "💗"), transparent: true, depthWrite: false })); s_.scale.set(.22, .22, 1); s_.position.copy(dog.g.position).add(new THREE.Vector3(rnd(-.2, .2), .62, rnd(-.2, .2))); hearts.add(s_); heartList.push({ s: s_, t: -i * .22 }); }
    if (!target) walkTo(dog.g.position.x + .7, dog.g.position.z + .6, () => { me.yaw = Math.atan2(dog.g.position.x - me.g.position.x, dog.g.position.z - me.g.position.z); });
  };
  const petCat = () => {
    cat.mode = "purr"; cat.t = 3; emote("🐱"); cb.cat && cb.cat();
    for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEmoji("💗"), transparent: true, depthWrite: false })); s.scale.set(.24, .24, 1); s.position.copy(cat.g.position).add(new THREE.Vector3(rnd(-.2, .2), .6, rnd(-.2, .2))); hearts.add(s); heartList.push({ s, t: -i * .22 }); }
    if (!target) walkTo(cat.g.position.x - .7, cat.g.position.z + .6, () => { me.yaw = Math.atan2(cat.g.position.x - me.g.position.x, cat.g.position.z - me.g.position.z); });
  };

  // ----- 하늘 상태 적용 -----
  const S = { mode: "real", lat: 36.35, lon: 127.38, weather: { cloud: .15, rain: 0, fog: 0, wind: 1 }, a: null };
  const sunDirV = new THREE.Vector3(), moonDirV = new THREE.Vector3();
  function applySky() {
    let A = astro(new Date(), S.lat, S.lon), sunAlt = A.sun.alt, sunAz = A.sun.az, mAlt = A.moon.alt, mAz = A.moon.az, phase = A.phase, milky = .4, starBoost = 1;
    const mode = S.override || S.mode;
    if (mode === "twilight") { sunAlt = -.085; sunAz = Math.PI * 1.5; mAlt = .45; mAz = Math.PI * .85; phase = .35; milky = .2; }
    if (mode === "night") { sunAlt = -.7; mAlt = .55; mAz = Math.PI * 1.05; phase = .5; }
    if (mode === "dusk") { sunAlt = -.045; sunAz = Math.PI * 1.45; mAlt = .35; mAz = Math.PI * .6; phase = .2; }
    if (mode === "galaxy") { sunAlt = -.8; mAlt = -.5; milky = 1.25; starBoost = 1.5; }
    const p = skyAt(sunAlt), w = S.weather, cl = clamp(w.cloud, 0, 1);
    const set = (u, c) => u.value.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    set(skyU.uTop, p.top.map(v => v * (1 - cl * .25))); set(skyU.uMid, p.mid); set(skyU.uBot, p.bot); skyU.uMilky.value = milky * (1 - cl * .8) * (mode === "real" ? (sunAlt < -.2 ? 1 : 0) : 1);
    sunDirV.copy(dirOf(sunAlt, sunAz)); skyU.uSunDir.value.copy(sunDirV);
    const glow = clamp(1 - Math.abs(sunAlt + .02) / .18, 0, 1) * (1 - cl * .5); skyU.uSunCol.value.setRGB(1 * glow, .5 * glow, .22 * glow);
    skyU.uStars.value = p.stars * starBoost * (1 - cl * .85) * (1 - w.fog * .6) * starDim; skyU.uCity.value = p.night * (1 - cl * .3); skyU.uPhotoK.value = (mode === "twilight" || mode === "dusk") ? 1 : mode === "real" ? clamp((sunAlt + .22) * 6, 0, 1) * clamp(1 - sunAlt * 8, 0, 1) : 0; bayBoard.material.opacity = clamp((p.night - .25) * 3, 0, 1) * (1 - cl * .35); skyU.uCloud.value = cl; skyU.uWind.value = w.wind; skyU.uFog.value = w.fog;
    const cc = p.mid.map((v, j) => v * .55 + p.bot[j] * .35 + (p.night > .5 ? 14 : 30)); set(skyU.uCloudCol, cc.map(v => v * (1 - cl * .15)));
    const fogc = p.fog.map((v, j) => lerp(v, 150 + j * 10, w.fog * .55)); bldU.uFogColor.value.setRGB(fogc[0] / 255, fogc[1] / 255, fogc[2] / 255, THREE.SRGBColorSpace); scene.fog.color.copy(bldU.uFogColor.value);
    bldU.uFogD.value = .0011 * (1 + w.fog * 2.6 + w.rain * .8); scene.fog.density = bldU.uFogD.value * .95;
    bldU.uAmb.value.setRGB(...p.amb.map(v => v * (.45 + .55 * clamp(sunAlt * 3, 0, 1)))); bldU.uNight.value = p.night * (1 - w.rain * .1);
    const moonUp = mAlt > -.05, ml = dirOf(Math.max(mAlt, -.05), mAz);
    moon.visible = moonHalo.visible = moonUp && mode !== "galaxy"; hillMat.color.copy(bldU.uFogColor.value).multiplyScalar(.5); moon.position.copy(ml).multiplyScalar(1100); moonHalo.position.copy(ml).multiplyScalar(1090);
    moonU.uLight.value.set(Math.sin(phase * TAU), 0, -Math.cos(phase * TAU)); moonU.uAlpha.value = clamp(1 - cl * .7 - p.night * 0, 0, 1) * (p.night > .3 ? 1 : .5);
    moonHalo.material.opacity = .3 * p.night * (1 - cl * .7);
    const lightDir = sunAlt > -.08 ? sunDirV : ml; bldU.uLightDir.value.copy(lightDir);
    const moonLight = p.night * (.14 + .22 * Math.abs(Math.sin(phase * Math.PI))) * (moonUp ? 1 : .2), dayLight = clamp(sunAlt * 2.4 + .1, 0, 1);
    bldU.uLightCol.value.setRGB(moonLight * .42 + dayLight * .9, moonLight * .5 + dayLight * .85, moonLight * .8 + dayLight * .75);
    hemi.color.setRGB(p.amb[0] * 1.1 + .06, p.amb[1] * 1.1 + .07, p.amb[2] * 1.1 + .1); hemi.intensity = 1.0 + dayLight * 1.2; hemi.groundColor.setRGB(.08, .08, .12);
    dirL.color.copy(bldU.uLightCol.value).multiplyScalar(1.6); dirL.intensity = 1.1 + dayLight * 1.4; dirL.position.copy(lightDir).multiplyScalar(30);
    renderer.setClearColor(new THREE.Color().setRGB(p.bot[0] / 255, p.bot[1] / 255, p.bot[2] / 255, THREE.SRGBColorSpace));
    const nightK = p.night; lampLights.forEach(l => l.intensity = 9 + nightK * 16);
    S.a = { phase, sunAlt, moonUp, night: p.night };
    cb.sky && cb.sky({ phase, sunAlt, moonUp, night: p.night });
  }

  // ----- 비 -----
  const RN = 700, rainGeo = new THREE.BufferGeometry(), rp = new Float32Array(RN * 6); for (let i = 0; i < RN; i++) { const x = rnd(-14, 14), y = rnd(0, 18), z = rnd(-14, 14); rp.set([x, y, z, x, y - .5, z], i * 6); }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3)); const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaac4ff, transparent: true, opacity: .0, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);

  // ----- 카메라와 입력 -----
  let yaw = 0, lookUp = .22, yawT = 0, lookT = .22, camDist = 5.8, autoSpin = 0;
  const fPos = new THREE.Vector3(), fTgt = new THREE.Vector3(), aerPos = new THREE.Vector3(), aerTgt = new THREE.Vector3(), camPos = new THREE.Vector3(0, 2.4, 6), camTgt = new THREE.Vector3(0, 2, -20);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointers = new Map(); let dragD = 0, downAt = 0;
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragD = 0; downAt = performance.now(); });
  el.addEventListener("pointermove", e => { const p = pointers.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; dragD += Math.abs(dx) + Math.abs(dy);
    if (focus && focus !== "sky") return;
    if (dragD > 8) { autoSpin = 0; yawT -= dx * .0042; lookT = clamp(lookT + dy * .0035, -.04, .85); } });   // 좌우는 360도 끝없이
  const up = e => { const p = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (!p || e.type === "pointercancel") return; if (dragD < 9 && performance.now() - downAt < 600) tap(e.clientX, e.clientY); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", e => { e.preventDefault(); camDist = clamp(camDist + e.deltaY * .003, 3, 7); }, { passive: false });
  const personTargets = () => [me.g, cat.g, dog.g, ...neighbors.map(n => n.g)];
  function tap(cx, cy) {
    const r = el.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (focus) {   // 하는 동안은 그 동작만 눌러져요 (미니게임처럼)
      if (focus === "grill") { const hf = ray.intersectObjects(foodGroup.children, true)[0]; if (hf && hf.object.userData.foodRef) tapFood(hf.object.userData.foodRef, true); }
      else if (focus === "sky") { if (tapMeteor(cx, cy)) return; const si = nearestStar(ray.ray.direction, 4.5); if (si >= 0) countStar(si); }
      else if (focus === "lie" || focus === "tent") tapMeteor(cx, cy);
      return;
    }
    const hitF = ray.intersectObjects(foodGroup.children, true)[0]; if (hitF) { const f = hitF.object.userData.foodRef; if (f) { tapFood(f); return; } }
    const hitP = ray.intersectObjects(personTargets(), true)[0];
    if (hitP) { let o = hitP.object; while (o && o !== cat.g && o !== dog.g && o !== me.g && !neighbors.some(n => n.g === o)) o = o.parent;
      if (o === cat.g) { petCat(); return; } if (o === dog.g) { petDog(); return; } if (o === me.g) { waveT = 1.8; emote("👋"); return; }
      const n = neighbors.find(n => n.g === o); if (n) { n.waveT = 3; n.pose = "wave"; emote("👋"); cb.neighbor && cb.neighbor(); return; } }
    const hitI = ray.intersectObjects(items.map(i => i.g), true)[0];
    if (hitI && aer < .5) { let o = hitI.object; while (o && !o.userData.item) o = o.parent; const it = o && o.userData.item;
      if (it && removing) { removeItem(it); emote("🧹"); return; }
      if (it && !placing) {
        const acts = itemActions(it); if (!acts.length) return;
        if (acts.length === 1) { doAction(it, acts[0].id); return; }
        const v = it.g.position.clone(); v.y += 1.1; v.project(camera);
        if (cb.menu) cb.menu({ x: (v.x * .5 + .5) * r.width, y: (-v.y * .5 + .5) * r.height }, acts, aid => doAction(it, aid)); else doAction(it, acts[0].id);
        return; } }
    const d = ray.ray.direction;
    const pt = new THREE.Vector3(); const onFloor = d.y < -.01 && ray.ray.intersectPlane(floorPlane, pt) && Math.abs(pt.x) < 8 && Math.abs(pt.z) < 6;
    if (aer > .5) { aimShell(new THREE.Vector3(d.x, Math.max(d.y, .18), d.z).normalize()); cb.fire && cb.fire(); return; }
    if (onFloor && placing) { const it = addItem(placing, pt.x, pt.z, colorIdx++); if (it && placing === "chair") emote("🪑"); return; }
    if (onFloor && removing) return;
    if (onFloor) { standUp(); walkTo(pt.x, pt.z); return; }
    if (d.y > -.02) {   // 하늘: 별을 세거나, 불꽃을 쏨
      const si = counting ? nearestStar(d, 4.5) : -1;
      if (si >= 0) { countStar(si); return; }
      if (!counting) { aimShell(d.clone().normalize()); cb.fire && cb.fire(); } }
  }
  let counting = false;

  // ----- 키보드 (컴퓨터): WASD·방향키로 걷기, Shift 달리기, Q·E 둘러보기, R·F 위아래, 스페이스 불꽃 -----
  const keys = new Set(), KEYMAP = { arrowup: "w", arrowdown: "s", arrowleft: "a", arrowright: "d" };
  const typing = () => { const a = document.activeElement; return (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !!host.querySelector(".roof-modal:not([hidden])"); };
  window.addEventListener("keydown", e => {
    if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && focus) { setFocus(null); return; }
    let k = e.key.toLowerCase(); k = KEYMAP[k] || k;
    if ("wasdqerf ".includes(k) && k.length === 1) { e.preventDefault(); if (k === " ") { if (!e.repeat && aer < .5) { aimShell(new THREE.Vector3(Math.sin(yaw) * -.2 - Math.sin(yaw), .28, -Math.cos(yaw)).normalize()); cb.fire && cb.fire(); } return; } keys.add(k); }
    if (k === "shift") keys.add("shift");
  });
  window.addEventListener("keyup", e => { let k = e.key.toLowerCase(); k = KEYMAP[k] || k; keys.delete(k); if (k === "shift") keys.delete("shift"); });
  window.addEventListener("blur", () => keys.clear());
  // ----- 번짐(블룸): 불빛이 은은하게 번져서 사진 같은 야경이 돼요 (가볍게 쓰려면 화질 '가볍게'에서는 꺼요) -----
  const post = (() => {
    const HF = { type: THREE.HalfFloatType };
    const main = new THREE.WebGLRenderTarget(4, 4, Object.assign({ depthBuffer: true, samples: mobile ? 0 : 4 }, HF));
    const mk = () => new THREE.WebGLRenderTarget(4, 4, Object.assign({ depthBuffer: false }, HF)), a1 = mk(), b1 = mk(), a2 = mk(), b2 = mk();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), ps = new THREE.Scene(); ps.add(quad);
    const vs = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }";
    const U = () => ({ t: { value: null }, b1: { value: null }, b2: { value: null }, dir: { value: new THREE.Vector2() }, th: { value: .6 }, k: { value: .8 } });
    const mat = fs => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: "precision highp float; varying vec2 vUv; uniform sampler2D t,b1,b2; uniform vec2 dir; uniform float th,k;\n" + fs, depthTest: false, depthWrite: false, uniforms: U() });
    const bright = mat("void main(){ vec3 c = texture2D(t,vUv).rgb; float l = max(max(c.r,c.g),c.b); gl_FragColor = vec4(c*smoothstep(th,th+.45,l),1.); }");
    const blur = mat("void main(){ vec3 c = texture2D(t,vUv).rgb*.227; vec2 o1 = dir*1.3846, o2 = dir*3.2308; c += (texture2D(t,vUv+o1).rgb + texture2D(t,vUv-o1).rgb)*.3162 + (texture2D(t,vUv+o2).rgb + texture2D(t,vUv-o2).rgb)*.0703; gl_FragColor = vec4(c,1.); }");
    const comp = mat("void main(){ vec3 c = texture2D(t,vUv).rgb + (texture2D(b1,vUv).rgb*.75 + texture2D(b2,vUv).rgb*1.0)*k; gl_FragColor = vec4(c,1.);\n #include <colorspace_fragment>\n }");
    const pass = (m, from, to) => { m.uniforms.t.value = from.texture; quad.material = m; renderer.setRenderTarget(to); renderer.render(ps, cam); };
    return {
      size(w, h) { main.setSize(w, h); [[a1, b1, 4], [a2, b2, 8]].forEach(([a, b, d]) => { const ww = Math.max(2, Math.floor(w / d)), hh = Math.max(2, Math.floor(h / d)); a.setSize(ww, hh); b.setSize(ww, hh); }); },
      render(k) {
        renderer.setRenderTarget(main); renderer.render(scene, camera);
        bright.uniforms.th.value = .6; pass(bright, main, a1);
        blur.uniforms.dir.value.set(1 / a1.width, 0); pass(blur, a1, b1); blur.uniforms.dir.value.set(0, 1 / a1.height); pass(blur, b1, a1);
        bright.uniforms.th.value = -2; pass(bright, a1, a2);
        blur.uniforms.dir.value.set(1 / a2.width, 0); pass(blur, a2, b2); blur.uniforms.dir.value.set(0, 1 / a2.height); pass(blur, b2, a2);
        comp.uniforms.b1.value = a1.texture; comp.uniforms.b2.value = a2.texture; comp.uniforms.k.value = k;
        pass(comp, main, null);
      },
    };
  })();
  const bloomOn = () => quality !== "low";
  let glowK = (opt.glow ?? 40) / 100; const applyGlow = () => { addGlow.uniforms.uMul.value = .4 + glowK; };   // 빛번짐 정도 (설정에서 조절)
  applyGlow();
  const draw = () => { if (bloomOn()) post.render((.55 + .55 * bldU.uNight.value) * glowK * 1.6); else renderer.render(scene, camera); };

  // ----- 크기·품질 -----
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(280, Math.round(r.width)); H = Math.max(360, Math.round(r.height));
    const pr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : quality === "mid" ? 1.6 : 1.1);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false); el.style.width = W + "px"; el.style.height = H + "px";
    camera.aspect = W / H; camera.fov = W / H < .8 ? 72 : 62; camera.setViewOffset(W, H, 0, Math.round(H * .08), W, H); camera.updateProjectionMatrix();
    post.size(renderer.domElement.width, renderer.domElement.height);
    const sc = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)); addGlow.uniforms.uScale.value = sc; smokeMat.uniforms.uScale.value = sc; mirMat.uniforms.uScale.value = sc;
  }

  // ----- 반복 -----
  const mePos = me.g.position; let frameN = 0, slow = 0, fpsT = 0, fpsN = 0;
  const gcolArr = gcol.array, galArr = gal.array, gposArr = gpos.array;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, clock.getDelta()); time += dt; frameN++;
    skyU.uTime.value = time; bldU.uTime.value = time;
    // 아바타 이동
    let moving = false;
    if (seq) {
      seq.t += dt;
      if (seq.t >= 0 && !seq.started) { seq.started = true; seq.from = { x: mePos.x, z: mePos.z }; me.pose = seq.pose; me.seat = seq.seat; if (seq.yaw != null) me.yaw = seq.yaw; }
      if (seq.started) { const k = clamp(seq.t / seq.dur, 0, 1), e = k * k * (3 - 2 * k); mePos.x = lerp(seq.from.x, seq.to.x, e); mePos.z = lerp(seq.from.z, seq.to.z, e); if (k >= 1) { const dn = seq.done; seq = null; dn && dn(); } }
    }
    if (keys.has("q")) { yawT -= dt * 1.6; autoSpin = 0; } if (keys.has("e")) { yawT += dt * 1.6; autoSpin = 0; }
    if (autoSpin && !focus && aer < .5) yawT += dt * .09 * autoSpin;   // 천천히 둘러보기
    if (keys.has("r")) lookT = clamp(lookT + dt * .9, -.04, .95); if (keys.has("f")) lookT = clamp(lookT - dt * .9, -.04, .95);
    const kx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), kz = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
    if ((kx || kz) && aer < .5 && !focus) {
      if (me.pose === "sit" || me.pose === "lie") standUp(); target = null; afterWalk = null; sitSpot = null;
      const l = Math.hypot(kx, kz), fx0 = -Math.sin(yaw), fz0 = -Math.cos(yaw), rx0 = Math.cos(yaw), rz0 = -Math.sin(yaw);
      const vx = (rx0 * kx - fx0 * kz) / l, vz = (rz0 * kx - fz0 * kz) / l, sp = (keys.has("shift") ? 4.4 : 2.7) * dt;
      const q = pushOut({ x: mePos.x + vx * sp, z: mePos.z + vz * sp }); mePos.x = q.x; mePos.z = q.z; me.yaw = Math.atan2(vx, vz); moving = true; if (me.pose !== "eat") me.pose = "idle";
    }
    if (target && !moving && !seq) {
      const dx = target.x - mePos.x, dz = target.z - mePos.z, d = Math.hypot(dx, dz);
      if (d < .08) { mePos.x = target.x; mePos.z = target.z; target = null; const f = afterWalk; afterWalk = null; sitSpot = null; if (f) f(); else me.yaw = Math.PI; }
      else { const sp = Math.min(d, 2.5 * dt); mePos.x += dx / d * sp; mePos.z += dz / d * sp; me.yaw = Math.atan2(dx, dz); moving = true; if (me.pose !== "walk") me.pose = "idle"; }
      const q = pushOut({ x: mePos.x, z: mePos.z }); if (!sitSpot) { mePos.x = q.x; mePos.z = q.z; }
    }
    if (eatT > 0) { eatT -= dt; if (eatT <= 0) { me.pose = "idle"; me.yaw = Math.PI; if (focus === "table") setFocus(null); } }
    if (cheerT > 0) { cheerT -= dt; if (!moving && me.pose !== "sit" && me.pose !== "eat") me.pose = "cheer"; if (cheerT <= 0 && me.pose === "cheer") me.pose = "idle"; }
    else if (waveT > 0) { waveT -= dt; if (!moving && me.pose !== "sit") me.pose = "wave"; if (waveT <= 0 && me.pose === "wave") me.pose = "idle"; }
    else if (!moving && me.pose === "idle" && (rockets.length || fpActive > 80)) me.pose = "watch";
    else if (!moving && me.pose === "watch" && !rockets.length && fpActive < 30) me.pose = "idle";
    animPerson(me, dt, time, moving);
    netT -= dt; if (netT <= 0) { netT = .2; const ps = { x: +mePos.x.toFixed(2), z: +mePos.z.toFixed(2), y: +mePos.y.toFixed(2), yaw: +me.yaw.toFixed(2), pose: moving ? "walk" : me.pose, seat: +me.seat.toFixed(2) }, key = JSON.stringify(ps);
      if (key !== lastNet || time - lastNetT > 4) { lastNet = key; lastNetT = time; cb.moved && cb.moved(ps); } }
    const gone = []; peers.forEach((p, id) => {
      const g = p.P.g, dx = p.tx - g.position.x, dz = p.tz - g.position.z, d = Math.hypot(dx, dz), mv = d > .05 && p.pose !== "sit" && p.pose !== "lie";
      if (d > .02) { const sp = Math.min(d, 3.2 * dt); g.position.x += dx / d * sp; g.position.z += dz / d * sp; }
      g.position.y += (p.ty - g.position.y) * Math.min(1, dt * 8); if (mv && d > .25) p.P.yaw = Math.atan2(dx, dz); else if (!mv) p.P.yaw = p.yaw;
      if (p.wave > 0) { p.wave -= dt; p.P.pose = "wave"; } else p.P.pose = p.pose;
      animPerson(p.P, dt, time + p.P.ph, mv);
      if (p.bt > 0) { p.bt -= dt; p.bub.position.y = 2.1 + (2.4 - p.bt) * .1; p.bub.material.opacity = Math.min(1, p.bt * 2); if (p.bt <= 0) p.bub.visible = false; }
      if (time - p.last > 25) gone.push(id);
    }); gone.forEach(removePeer);
    if (bubbleT > 0) { bubbleT -= dt; bubble.position.y = 2.15 + (2.2 - bubbleT) * .12; bubble.material.opacity = Math.min(1, bubbleT * 2); if (bubbleT <= 0) bubble.visible = false; }
    // 이웃
    neighbors.forEach(n => { n.nextWave -= dt; if (n.waveT > 0) { n.waveT -= dt; if (n.waveT <= 0) { n.pose = n.base; n.yaw = Math.PI; } }
      else if (n.nextWave < 0) { n.nextWave = rnd(10, 26); n.pose = "wave"; n.waveT = 2.4; n.yaw = Math.atan2(camera.position.x - n.g.getWorldPosition(v3).x, camera.position.z - v3.z) ; }
      animPerson(n, dt, time + n.ph, false); });
    // 강아지: 나를 졸졸 따라오고(고양이 반대편), 앉아서 고개를 갸웃, 쓰다듬으면 폴짝
    { dog.t -= dt; const dd = Math.hypot(mePos.x - dog.g.position.x, mePos.z - dog.g.position.z);
      if (dog.mode === "happy") { dog.hop += dt; if (dog.t <= 0) dog.mode = "sit"; }
      else if (dog.mode !== "walk" && dd > 1.9 && Math.random() < dt * 1.4) { dog.mode = "walk"; dog.dest = pushOut({ x: mePos.x - rnd(.8, 1.3), z: mePos.z + rnd(.4, 1.2) }); }
      let moving_ = false;
      if (dog.mode === "walk") { const dx = dog.dest.x - dog.g.position.x, dz = dog.dest.z - dog.g.position.z, d = Math.hypot(dx, dz);
        if (d < .1) { dog.mode = "sit"; dog.yaw = Math.atan2(mePos.x - dog.g.position.x, mePos.z - dog.g.position.z); }
        else { const sp = Math.min(d, (d > 3 ? 3.2 : 2.2) * dt); dog.g.position.x += dx / d * sp; dog.g.position.z += dz / d * sp; dog.yaw = Math.atan2(dx, dz); moving_ = true; } }
      const tt = time + dog.ph;
      dog.g.position.y = moving_ ? Math.abs(Math.sin(tt * 13)) * .035 : dog.mode === "happy" ? Math.abs(Math.sin(dog.hop * 9)) * .16 : 0;
      dog.g.rotation.y += (((dog.yaw + (dog.mode === "happy" ? Math.sin(dog.hop * 4) * .9 : 0) - dog.g.rotation.y + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 7);
      dog.legs.forEach((L, i) => { L.rotation.x = moving_ ? Math.sin(tt * 13 + (i === 0 || i === 3 ? 0 : Math.PI)) * .7 : 0; });
      dog.tail.rotation.y = Math.sin(tt * (dog.mode === "happy" ? 22 : moving_ ? 14 : 6)) * (dog.mode === "happy" ? .7 : .4);
      dog.head.rotation.z = dog.mode === "sit" ? Math.sin(tt * .45) * .18 : 0;                    // 갸웃
      dog.head.rotation.x = dog.mode === "happy" ? -.15 : Math.sin(tt * .9) * .04;
      dog.ears.forEach((E, i) => { E.rotation.z = (i ? -1 : 1) * (moving_ || dog.mode === "happy" ? .25 + Math.sin(tt * 13) * .15 : .1); });
      dog.tongue.visible = dog.mode === "happy" || moving_ || (Math.sin(tt * .3) > .4);
      dog.body.scale.y = 1 + Math.sin(tt * (dog.tongue.visible ? 9 : 2)) * .015; }   // 헥헥
    // 고양이
    cat.t -= dt; const cd = Math.hypot(mePos.x - cat.g.position.x, mePos.z - cat.g.position.z);
    if (cat.mode === "purr") { if (cat.t <= 0) cat.mode = "sit"; }
    else if (cat.mode !== "walk" && cd > 2.6 && Math.random() < dt * .6) { cat.mode = "walk"; cat.dest = pushOut({ x: mePos.x + rnd(-1.4, 1.4), z: mePos.z + rnd(.3, 1.5) }); }
    if (cat.mode === "walk") { const dx = cat.dest.x - cat.g.position.x, dz = cat.dest.z - cat.g.position.z, d = Math.hypot(dx, dz); if (d < .1) cat.mode = "sit"; else { const s = Math.min(d, 1.5 * dt); cat.g.position.x += dx / d * s; cat.g.position.z += dz / d * s; cat.yaw = Math.atan2(dx, dz); cat.g.position.y = Math.abs(Math.sin(time * 9)) * .04; } } else cat.g.position.y = 0;
    cat.g.rotation.y += (((cat.yaw - cat.g.rotation.y + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 6);
    cat.tail.rotation.y = Math.sin(time * (cat.mode === "purr" ? 5 : 1.8)) * .5; cat.head.rotation.x = cat.mode === "purr" ? .15 : Math.sin(time * .8) * .04;
    cat.body.scale.y = 1.05 + Math.sin(time * (cat.mode === "purr" ? 6 : 1.5)) * .02;
    for (let i = heartList.length - 1; i >= 0; i--) { const h = heartList[i]; h.t += dt; if (h.t < 0) { h.s.visible = false; continue; } h.s.visible = true; h.s.position.y += dt * .5; h.s.material.opacity = Math.max(0, 1 - h.t / 1.6); if (h.t > 1.6) { hearts.remove(h.s); heartList.splice(i, 1); } }
    // 카메라
    yaw += (yawT - yaw) * Math.min(1, dt * 6); lookUp += (lookT - lookUp) * Math.min(1, dt * 6);
    const sitting = me.pose === "sit", lying = me.pose === "lie", cy = (lying ? 1.0 : sitting ? 1.7 : 2.25) + (reduced ? 0 : Math.sin(time * .5) * .02);
    if (lying) lookT = Math.max(lookT, .95);
    const bx = mePos.x, bz = mePos.z;
    const wantPos = new THREE.Vector3(clamp(bx + camDist * Math.sin(yaw), -RX + .4, RX - .4), cy, clamp(bz + camDist * Math.cos(yaw), -RZ - .2, RZ - 1.4));
    aer += ((view === "aerial" ? 1 : 0) - aer) * Math.min(1, dt * 1.1); const ae = aer * aer * (3 - 2 * aer), oa = time * .018 + yaw * .8;
    if (ae > .002) wantPos.lerp(aerPos.set(Math.sin(oa) * 34, 236, 190 + Math.cos(oa) * 8), ae);
    const mini = focus === "grill"; if (mini !== miniBg.m.visible) { miniBg.m.visible = miniBg.gl.visible = mini;
      roof.children.forEach(c => { if (mini) { c.userData.keep = c.visible; if (!(grillKids.includes(c) || c === foodGroup)) c.visible = false; } else if (c.userData.keep !== undefined) c.visible = c.userData.keep; });
      tagSpr.visible = !mini; neighbors.forEach(n => { n.g.visible = !mini; }); peers.forEach(pp => { pp.P.g.visible = !mini; }); }
    tagSpr.visible = !focus;
    if (snapCam) { fcs = focus ? 1 : 0; }
    fcs += ((focus ? 1 : 0) - fcs) * Math.min(1, dt * 2.4); const fe = fcs * fcs * (3 - 2 * fcs);
    if (fe > .002 && focus) {
      const g0 = focus === "grill" ? [GR.x, 3.05, GR.z + 1.25, GR.x, .95, GR.z] : focus === "table" && focusItem ? [focusItem.x + 1.7, 1.5, focusItem.z + 2.0, focusItem.x, .6, focusItem.z]
        : focus === "sky" ? [mePos.x, 1.3, mePos.z + 3.0, mePos.x + Math.sin(yaw) * 6, 26, mePos.z - 22] : [mePos.x, .85, mePos.z + 2.6, mePos.x, 24, mePos.z - 12];
      fPos.set(g0[0], g0[1], g0[2]); fTgt.set(g0[3], g0[4], g0[5]); wantPos.lerp(fPos, fe);
    }
    camPos.lerp(wantPos, snapCam ? 1 : Math.min(1, dt * (ae > .002 ? 1.7 : fe > .002 ? 3.2 : 4))); snapCam = false; camera.position.copy(camPos);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    camTgt.set(camPos.x + fx * 40, camPos.y + lookUp * 40 - .6, camPos.z + fz * 40);
    if (ae > .002) camTgt.lerp(aerTgt.set(Math.cos(oa) * 60, -6, -600), ae);
    if (fe > .002 && focus) camTgt.lerp(fTgt, fe);
    { const yd = Math.abs(((yawT % TAU) + TAU * 1.5) % TAU - Math.PI), dev = !focus && !autoSpin && (lookT > .5 || yd > .5); if (dev !== lookDev) { lookDev = dev; cb.look && cb.look(dev); } }
    camera.lookAt(camTgt);
    sky.position.copy(camera.position); moon.rotation.y = 0; updMeteors(dt); updPlane(dt, time);
    // 불판 불빛·연기
    const fl = 1 + Math.sin(time * 11) * .12 + Math.sin(time * 23) * .08; coalLight.intensity = (6 + 6 * bldU.uNight.value) * fl; coalsM.color.setRGB(1, .38 + .12 * Math.sin(time * 5), .12);
    if (!reduced && Math.random() < (.5 + foods.length * .7) * dt * 10) addSmoke(GR.x + rnd(-.5, .5), 1.1, GR.z + rnd(-.2, .2), rnd(-.08, .12), rnd(.35, .6), rnd(-.05, .05), mini ? rnd(.09, .16) : rnd(.22, .4), mini ? .07 : .12 + Math.min(.12, foods.length * .03), rnd(2.6, 4), mini ? [1, .72, .5] : [.82, .84, .9]);
    for (let i = 0; i < 160; i++) { const p = smoke[i]; if (p.l > 0) { p.l -= dt; p.x += (p.vx + Math.sin(time * .8 + i) * .05) * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
      fsg.attributes.position.setXYZ(i, p.x, p.y, p.z); const k = Math.max(0, p.l / (p.m || 1)); fsg.attributes.aSize.setX(i, p.l > 0 ? p.s * (1.8 - k) : 0); fsg.attributes.aAlpha.setX(i, p.l > 0 ? (p.a || .1) * k : 0); const t = p.t || [.8, .8, .9]; fsg.attributes.aCol.setXYZ(i, t[0], t[1], t[2]); }
    fsg.attributes.position.needsUpdate = fsg.attributes.aSize.needsUpdate = fsg.attributes.aAlpha.needsUpdate = fsg.attributes.aCol.needsUpdate = true; flameSm.position.set(0, 0, 0);
    items.forEach(it => { if (it.t === "tent" && it.parts) { const want = inTent === it ? .2 : 1, m = it.parts.body.material; m.transparent = true; m.opacity += (want - m.opacity) * Math.min(1, dt * 4); it.parts.glow.material.opacity = (inTent === it ? .9 : .42) * (it.lit ? 1 : 1); } });
    // 먹을거리
    const mg = focus === "grill"; if (mg) coalLight.intensity *= .3;
    foods.forEach(f => { f.c[f.down] += dt / 12; if (f.flip > 0) f.flip = Math.max(0, f.flip - dt * 2.4); const up = 1 - f.down, col = colorAt(f.kind, f.c[up]); f.m.color.setRGB(col[0], col[1], col[2]);
      const avg = (f.c[0] + f.c[1]) / 2, shr = 1 - .13 * clamp(avg, 0, 1.2); f.mesh.scale.set(shr, 1 + avg * (f.kind === "pork" ? .9 : .25), f.kind === "corn" ? 1 : shr);
      const mk = f.mesh.userData.marks; if (mk) mk.material.opacity = clamp((f.c[up] - .18) / .6, 0, .85);
      const gp = slotPos(f.slot); if (f.gauge) { f.gauge.gs.visible = mg; f.gauge.gs.position.set(gp.x, gp.y + .02, gp.z + .2); if (mg && frameN % 4 === 0) drawGauge(f.gauge.G, f.c[up], f.c[f.down]); }
      if (mg && f.flip <= 0 && f.c[up] > .06 && Math.random() < dt * (2.5 + 5 * Math.min(1, f.c[up]))) oilSpark(gp.x + rnd(-.1, .1), gp.y + .03, gp.z + rnd(-.04, .04));
      if (mg && Math.random() < dt * (1.5 + 2 * Math.min(1, f.c[up]))) addSmoke(gp.x + rnd(-.08, .08), gp.y + .05, gp.z, rnd(-.03, .03), rnd(.18, .3), 0, rnd(.06, .1), .1, rnd(1.2, 2), [1, .96, .9]);
      f.g.position.y = slotPos(f.slot).y + Math.sin(f.flip * Math.PI) * .35; f.g.rotation.x = f.flip * Math.PI; if (burnt(f) && Math.random() < dt * 8) addSmoke(f.g.position.x, 1.15, f.g.position.z, 0, .5, 0, .3, .2, 2, [.35, .35, .4]); });
    sparks.forEach(q => { if (q.l > 0) { q.l -= dt; q.vy -= 3.2 * dt; q.sp.position.x += q.vx * dt; q.sp.position.y += q.vy * dt; q.sp.position.z += q.vz * dt; q.sp.material.opacity = clamp(q.l * 3, 0, 1) * (mg ? 1 : 0); if (q.l <= 0) q.sp.visible = false; } });
    if (frameN % 20 === 0) foods.forEach(f => { if (ready(f) && !f.said) { f.said = true; cb.hint && cb.hint(FOOD[f.kind].name + "이(가) 다 익었어요. 눌러서 먹어요."); } });
    // 줄조명 반짝임, 반딧불, 도로
    for (let i = 0; i < nBulb; i++) rg.attributes.aAlpha.setX(i, .55 + .3 * Math.sin(time * 1.1 + i * .9) + (bldU.uNight.value < .3 ? -.4 : 0));
    for (let i = 0; i < FF; i++) { const f = ffs[i]; f.p += dt * f.s; rg.attributes.position.setXYZ(nBulb + i, f.x + Math.sin(f.p * 1.3) * .8, f.y + Math.sin(f.p * .9) * .3, f.z + Math.cos(f.p) * .8); rg.attributes.aAlpha.setX(nBulb + i, bldU.uNight.value > .5 ? Math.max(0, Math.sin(f.p * 2.1)) * .8 : 0); }
    rg.attributes.position.needsUpdate = rg.attributes.aAlpha.needsUpdate = true;
    cars.forEach(c => { c.s += c.v * dt; if (c.s > c.len / 2) c.s -= c.len; if (c.s < -c.len / 2) c.s += c.len; const o = c.i * 3; gposArr[o] = c.cx + c.ux * c.s; gposArr[o + 1] = c.y; gposArr[o + 2] = c.cz + c.uz * c.s; });
    beacons.forEach(b => { galArr[b.i] = b.ph ? .35 + .65 * Math.max(0, Math.sin(time * 1.5 + b.ph)) : .12 + .88 * Math.pow(Math.max(0, Math.sin(time * 1.2)), 6); });
    gpos.needsUpdate = gal.needsUpdate = true; glowPts.visible = bldU.uNight.value > .08;
    // 별똥별과 별 세기 효과
    for (let i = flare.length - 1; i >= 0; i--) { const f = flare[i]; f.t += dt; if (f.t > 2.2) flare.splice(i, 1); }
    // 멍하니 보는 야경: 가만히 두면 불꽃이 알아서 이어지고, 다리 조명 색이 천천히 바뀌어요
    if (aer > .85 && time > nextAuto) { nextAuto = time + rnd(2.2, 5.2); const r0 = Math.random(); autoShell(pick(KINDS), rnd(1.3, 1.9), true);
      if (r0 < .4) later(280, () => autoShell(pick(KINDS), rnd(1.2, 1.7), true)); if (r0 < .18) later(620, () => autoShell(pick(KINDS), rnd(1.2, 1.7), true));
      if (time > nextCascade && quality !== "low") { nextCascade = time + rnd(36, 62); cascadeT = 7; } }
    if (cascadeT > 0) { cascadeT -= dt; for (let j = 0; j < (quality === "high" ? 16 : 9); j++) { const p = bAt(.06 + j * .035, rnd(-6, 6)); spark(p.x, BY + 3, p.z, rnd(-4, 4), rnd(20, 36), rnd(-4, 4), [255, 205, 115], 2.6, rnd(1.3, 2.3), 1.1, 13, 2); } }
    crownIdx.forEach(b => { const c = tmpC.setHSL((b.h + time * .03) % 1, .8, .6); gcolArr[b.i * 3] = c.r; gcolArr[b.i * 3 + 1] = c.g; gcolArr[b.i * 3 + 2] = c.b; });
    if (aer > .05 || frameN % 4 === 0) bridgeLights.forEach(b => { const c = tmpC.setHSL((b.h + time * .035) % 1, .85, .56); gcolArr[b.i * 3] = c.r; gcolArr[b.i * 3 + 1] = c.g; gcolArr[b.i * 3 + 2] = c.b; }); gcol.needsUpdate = true;
    // 로켓
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.t += dt; r.y += r.v * dt; r.v *= Math.pow(.62, dt);
      for (let k = 0; k < 2; k++) spark(r.x + rnd(-.4, .4), r.y - rnd(0, 2), r.z + rnd(-.4, .4), rnd(-3, 3), rnd(-8, -2), rnd(-3, 3), [255, 190, 110], 1.6, rnd(.35, .7), 1.2, 4, 0);
      spark(r.x, r.y, r.z, 0, 0, 0, [255, 245, 220], 3.2, .12, 0, 0, 0);
      if (r.y >= r.ty || r.v < 14) { burst(new THREE.Vector3(r.x, r.y, r.z), r.kind, r.c, r.size); rockets.splice(i, 1); }
    }
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    // 입자
    let alive = 0; const step = frameN % 2 === 0;
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) { fal[i] = 0; continue; }
      alive++; const t0 = life[i] / maxL[i]; life[i] -= dt; const age = 1 - t0;
      const dk = Math.exp(-drag[i] * dt); vel[i * 3] *= dk; vel[i * 3 + 1] = vel[i * 3 + 1] * dk - grav[i] * dt; vel[i * 3 + 2] *= dk;
      fpos[i * 3] += vel[i * 3] * dt; fpos[i * 3 + 1] += vel[i * 3 + 1] * dt; fpos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const fl2 = flags[i];
      if (splitAt[i] > 0 && age >= splitAt[i]) { splitAt[i] = 0; const x = fpos[i * 3], y = fpos[i * 3 + 1], z = fpos[i * 3 + 2]; const cc = [Math.pow(base[i * 3], 1 / 2.2) * 255, Math.pow(base[i * 3 + 1], 1 / 2.2) * 255, Math.pow(base[i * 3 + 2], 1 / 2.2) * 255];
        for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + age; spark(x, y, z, vel[i * 3] * .3 + Math.cos(a) * 34, vel[i * 3 + 1] * .3 + rnd(-6, 6), vel[i * 3 + 2] * .3 + Math.sin(a) * 34, cc, 3, .9, 1.6, 8, 0); } life[i] = 0; fal[i] = 0; continue; }
      if (life[i] <= 0) { fal[i] = 0; continue; }
      if ((fl2 & 1) && step && alive < POOL * .7) spark(fpos[i * 3], fpos[i * 3 + 1], fpos[i * 3 + 2], 0, 0, 0, [Math.pow(base[i * 3], 1 / 2.2) * 255, Math.pow(base[i * 3 + 1], 1 / 2.2) * 255, Math.pow(base[i * 3 + 2], 1 / 2.2) * 255], sz0[i] * .55, rnd(.5, 1.0), 2, 3, 0);
      const hot = Math.min(1, age / .12), tw = (fl2 & 2) ? (.35 + Math.random() * .65) : 1;
      fcol[i * 3] = lerp(1, base[i * 3], hot); fcol[i * 3 + 1] = lerp(.97, base[i * 3 + 1], hot); fcol[i * 3 + 2] = lerp(.9, base[i * 3 + 2], hot);
      fal[i] = Math.pow(Math.max(0, t0), 1.25) * tw * (sz0[i] > 0 ? 1 : 0); fsz[i] = sz0[i] * (1 - age * .35) * (1.6 - hot * .6) * 1.5;
    }
    fpActive = alive; fg.attributes.position.needsUpdate = fg.attributes.aCol.needsUpdate = fg.attributes.aSize.needsUpdate = fg.attributes.aAlpha.needsUpdate = true;
    // 터지는 빛
    let fa = 0; flashCol.setRGB(0, 0, 0);
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; const k = Math.exp(-f.t * 2.6) * f.a * Math.min(1, f.t * 30); if (f.t > 2.2) { flashes.splice(i, 1); continue; } flashCol.r += f.c.r * k; flashCol.g += f.c.g * k; flashCol.b += f.c.b * k; fa += k; }
    bldU.uFlash.value.copy(flashCol).multiplyScalar(.16 / Math.max(1, flashCol.r, flashCol.g, flashCol.b)); const fm = Math.max(flashCol.r, flashCol.g, flashCol.b, 1); skyU.uFlashCol.value.copy(flashCol).multiplyScalar(1 / fm); skyU.uFlash.value = Math.min(.2, fa * .08);
    flashLight.color.copy(flashCol); flashLight.intensity = Math.min(70, fa * 55);
    // 풍등
    for (let i = lanterns.length - 1; i >= 0; i--) { const L = lanterns[i]; L.t += dt; const g = L.g; g.position.y += (.7 + L.t * .05) * dt; g.position.x += (L.vx + Math.sin(L.t * .7 + L.ph) * .25) * dt; g.position.z += L.vz * dt; g.rotation.y += dt * .2;
      const f = .85 + .15 * Math.sin(L.t * 6 + L.ph); L.gl.material.opacity = (L.t > L.life - 6 ? Math.max(0, (L.life - L.t) / 6) : 1) * .9 * f; g.children[0].material.opacity = 1;
      if (L.t > L.life) { roof.remove(g); lanterns.splice(i, 1); } }
    // 비
    const rr = S.weather.rain; rain.material.opacity = rr * .45; if (rr > .02) { rain.position.set(camera.position.x, camera.position.y - 6, camera.position.z); for (let i = 0; i < RN; i++) { let y = rp[i * 6 + 1] - dt * 16 * (.8 + rr); if (y < -2) y += 20; rp[i * 6 + 1] = y; rp[i * 6 + 4] = y - .5; } rainGeo.attributes.position.needsUpdate = true; }
    if (frameN % 600 === 1) applySky();
    draw();
    fpsT += dt; fpsN++; if (fpsT > 3) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; if (fps < 26 && quality !== "low") { quality = quality === "high" ? "mid" : "low"; resize(); cb.quality && cb.quality(quality); } }
  }
  let netT = 0, lastNet = "", lastNetT = 0, fpActive = 0, nextAuto = 0, nextCascade = 14, cascadeT = 0; const tmpC = new THREE.Color();

  // ----- 바깥에 내주는 것 -----
  // ----- 비행기: 가끔 하늘을 천천히 가로지르는 항공등 (흰 섬광 + 빨강·초록) -----
  const plane = { t: -rnd(6, 16), dur: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), side: new THREE.Vector3(),
    sp: [0xffffff, 0xff3a2a, 0x3aff6a].map(c => { const s_ = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s_.visible = false; scene.add(s_); return s_; }) };
  const updPlane = (dt, t) => {
    plane.t += dt; if (plane.t < 0) return;
    if (!plane.dur) { const ang = rnd(0, TAU), alt = rnd(240, 380), r = 1350, turn = rnd(-.5, .5);
      plane.a.set(Math.cos(ang) * r, alt, Math.sin(ang) * r - 250); plane.b.set(-Math.cos(ang + turn) * r, alt + rnd(-30, 30), -Math.sin(ang + turn) * r - 250); plane.dur = rnd(75, 120); plane.t = 0; }
    const k = plane.t / plane.dur; if (k >= 1) { plane.dur = 0; plane.t = -rnd(30, 70); plane.sp.forEach(s_ => { s_.visible = false; }); return; }
    plane.p.lerpVectors(plane.a, plane.b, k); plane.side.subVectors(plane.b, plane.a).normalize().cross(v3.set(0, 1, 0)).multiplyScalar(5);
    const strobe = (t % 1.3) < .07 ? 1 : 0, nav = .55 + .45 * Math.sin(t * 3), fade = Math.min(1, k * 10, (1 - k) * 10);
    [[plane.p, 9, strobe], [plane.p.clone().add(plane.side), 6, nav], [plane.p.clone().sub(plane.side), 6, nav]].forEach(([pp, sz, a], i) => { const s_ = plane.sp[i]; s_.visible = true; s_.position.copy(pp); s_.scale.set(sz, sz, 1); s_.material.opacity = a * fade * (.4 + .6 * bldU.uNight.value); });
  };
  // ----- 별똥별: 누워서 보다가 지나가는 별똥별을 눌러 잡아요 -----
  const MET_N = 9, metSp = Array.from({ length: MET_N }, (_, i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false })); sp.renderOrder = 20; sp.visible = false; scene.add(sp); return sp; });
  let meteor = null, meteorOn = false, meteorT = 1.5, meteorN = 0; const mDir = new THREE.Vector3(), mScr = new THREE.Vector3();
  const mAt = (az, el, out) => out.set(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(900).add(camera.position);
  const updMeteors = dt => {
    const sky_ = meteorOn && (focus === "lie" || focus === "tent" || focus === "sky");
    if (!meteor && sky_) { meteorT -= dt; if (meteorT <= 0) { meteorT = rnd(2.8, 5.5); const dir = Math.random() < .5 ? -1 : 1;
      meteor = { t: 0, life: rnd(1.5, 2.1), az: yaw + rnd(-.55, .55), el: rnd(.85, 1.3), daz: dir * rnd(.5, .9), del: -rnd(.18, .4), caught: false }; } }
    if (!meteor) { metSp.forEach(s => { s.visible = false; }); return; }
    const m = meteor; m.t += dt; const k = m.t / m.life;
    if (k >= 1 || !sky_) { meteor = null; metSp.forEach(s => { s.visible = false; }); return; }
    const fade = Math.min(1, k * 8) * Math.min(1, (1 - k) * 5);
    metSp.forEach((s, i) => { const kk = Math.max(0, k - i * .028); mAt(m.az + m.daz * kk, m.el + m.del * kk, s.position); s.visible = true;
      const sz = (i === 0 ? 26 : 22 * (1 - i / MET_N) + 2) * (m.caught ? 1.8 : 1); s.scale.set(sz, sz, 1); s.material.opacity = fade * (i === 0 ? 1 : .7 * (1 - i / MET_N)); s.material.color.setHex(m.caught ? 0xffe9a8 : 0xcfe0ff); });
  };
  const tapMeteor = (cx, cy) => {
    if (!meteor || meteor.caught) return false; const r = el.getBoundingClientRect(); mScr.copy(metSp[0].position).project(camera);
    const sx = (mScr.x * .5 + .5) * r.width + r.left, sy = (-mScr.y * .5 + .5) * r.height + r.top;
    if (mScr.z < 1 && Math.hypot(sx - cx, sy - cy) < 80) { meteor.caught = true; meteorN++; emote("🌠"); cb.meteor && cb.meteor(meteorN); return true; } return false;
  };
  const api = {
    el, resize, sitNearest, enterNearest,
    // 함께 있는 방: 방의 꾸미기를 통째로 바꿔 끼워요 (남이 꾸민 옥상을 같이 봐요)
    setLayout(list) { if (focus === "tent" || focus === "table") setFocus(null); standUp();
      items.slice().forEach(it => { roof.remove(it.g); if (it.obs) obstacles.splice(obstacles.indexOf(it.obs), 1); }); items.length = 0;
      const ok = Array.isArray(list) ? list.slice(0, 30).filter(i => i && LIM[i.t] && Number.isFinite(+i.x) && Number.isFinite(+i.z)).map(i => [i.t, +i.x, +i.z, (+i.c || 0) | 0]) : DEF_LAYOUT;
      ok.forEach(a => addItem(a[0], a[1], a[2], a[3], true)); },
    getLayout: () => itemList(), setMeteors(on) { meteorOn = !!on; if (!on) meteor = null; }, meteorCount: () => meteorN, addFood, fire: () => aimShell(new THREE.Vector3(rnd(-.42, .42), rnd(.14, .32), -1).normalize()), show: seed => show(seed),
    setSky(m) { S.mode = m; applySky(); }, setWeather(w) { Object.assign(S.weather, w); applySky(); },
    setPlace(lat, lon) { S.lat = lat; S.lon = lon; applySky(); },
    setPeer, removePeer, peerEmote, remoteShell, emote, peerCount: () => peers.size, EMO,
    setDeco(m) { placing = m && m !== "remove" ? m : null; removing = m === "remove"; return m; }, lie: lieDown,
    setView(v) { view = v; S.override = v === "aerial" ? "twilight" : null; applySky(); cb.view && cb.view(v); }, getView: () => view, itemCount: () => items.length,
    setFocus, getFocus: () => focus, resetView() { yawT = Math.round(yawT / TAU) * TAU; lookT = .22; autoSpin = 0; }, setSpin(on) { autoSpin = on ? 1 : 0; if (on) lookT = Math.min(lookT, .3); return !!autoSpin; }, getSpin: () => !!autoSpin,
    setCounting(on) { counting = on; starDim = on ? 1.5 : 1; applySky(); if (on) lookT = Math.max(lookT, .55); },
    setStars(arr) { counted = new Set(arr || []); paintStars(); paintLines(); sg.attributes.aSize.needsUpdate = sg.attributes.aCol.needsUpdate = sg.attributes.aAlpha.needsUpdate = true; },
    starCount: () => counted.size, wish(text) { standUp(); emote("🙏"); me.pose = "idle"; sendLantern(text); },
    wave() { waveT = 1.8; emote("👋"); }, stand() { standUp(); }, setQuality(q) { quality = q; resize(); }, setGlow(v) { glowK = clamp(v / 100, 0, 1); applyGlow(); },
    setReduced(v) { opt.reduced = v; }, kinds: KINDS,
    pause() { running = false; }, resume() { if (!running) { running = true; clock.getDelta(); frame(); } },
    snapshot() { draw(); return el; },
    dispose() { running = false; renderer.dispose(); el.remove(); },
  };
  updGlowStatic(); resize(); applySky();
  // 첫 화면: 가운데로 불꽃 몇 발을 가볍게 (소리 없이)
  later(1400, () => { if (!reduced) autoShell("peony", .9); });
  clock.start(); frame();
  new ResizeObserver(resize).observe(host);
  return api;
}
