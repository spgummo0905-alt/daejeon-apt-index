// 공유 시트 (임장 코스·단지 비교·가족과 함께 보기). 단지 카드 공유(cardgen.js)와 같은 모양으로,
// 받는 사람이 카카오톡에서 무엇을 보게 될지(그림 카드·제목·단추) 미리 보여 주고 바로 보냅니다.
//  · 카카오톡: 이 화면에서 그린 그림 카드를 카카오 서버에 올려 피드 메시지로 (단추 두 개: '코스 보기'처럼 받은 것 열기, '나도 써 보기')
//    SDK·업로드가 안 되면 사이트 대표 그림, 그것도 안 되면 휴대폰 공유 창 → 링크 복사
//  · 링크 복사: 글과 링크를 함께 (카톡에 붙여 넣으면 링크 미리보기도 뜸)
//  · 그림 저장, 다른 앱
// 받는 사람이 '이게 뭐지?' 하지 않고 써 보고 싶게: 그림 카드에 내용을 한눈에, 단추로 바로 열고, 사이트 소개로도 이어지게.
(function () {
  const { el } = DJ;
  const KEY = document.body.dataset.kakao || "";
  const UA = navigator.userAgent || "";
  const IN_APP = DJ.inApp ? DJ.inApp() : /KAKAOTALK|NAVER\(inapp|; wv\)/i.test(UA);
  const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const BASE = location.origin + location.pathname.replace(/[^/]*$/, "") + (window.DJ_ROOT || "");
  const REGION = document.body.dataset.region || "";
  const W = 1200, H = 630;   // 링크 미리보기 그림 크기 (카카오톡·메신저 공통)

  // ---------- 카카오 SDK (누를 때 바로 되게 시트를 열 때 미리) ----------
  let kakaoReady = null;
  function loadKakao() {
    if (!KEY) return Promise.resolve(false);
    if (!kakaoReady) kakaoReady = new Promise(res => {
      if (window.Kakao && Kakao.Share) { try { if (!Kakao.isInitialized()) Kakao.init(KEY); res(true); } catch (e) { res(false); } return; }
      const s = document.createElement("script");
      s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
      s.crossOrigin = "anonymous";
      s.onload = () => { try { if (!Kakao.isInitialized()) Kakao.init(KEY); res(true); } catch (e) { res(false); } };
      s.onerror = () => res(false);
      document.head.append(s);
    });
    return kakaoReady;
  }

  // ---------- 그림 도우미 ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }
  // 글자가 maxW 안에 들어가게 (작게 줄이다 안 되면 말줄임)
  function fit(ctx, text, maxW, size, weight, min) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 1; } while (ctx.measureText(text).width > maxW && s > (min || 18));
    if (ctx.measureText(text).width > maxW) {
      while (text.length > 2 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
      text += "…";
    }
    return text;
  }
  const GRADE = {
    S: [["#fff1bf", "#d9b55a", "#a37b22", "#f0d68a"], "#2a1d02"], A: [["#f4f6f9", "#aab3bf", "#e4e8ee"], "#1d2430"],
    B: [["#5d9be0", "#2f6fbd"], "#fff"], C: [["#8e9aac", "#5f6b7d"], "#fff"], D: [["#4a5262", "#2f3542"], "#f0efec"],
  };
  function badge(ctx, g, x, y, s) {
    const [cols, ink] = GRADE[g] || GRADE.D;
    rr(ctx, x, y, s, s, s * 0.24);
    ctx.fillStyle = grad(ctx, x, y, x + s, y + s, cols.length > 1 ? cols : [cols[0], cols[0]]);
    ctx.fill();
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(s * 0.52)}px ${FONT}`;
    ctx.fillText(g && g !== "-" ? g : "–", x + s / 2, y + s / 2 + 2);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  // 바탕: 짙은 남색 + 금색 빛, 점 무늬, 아래 브랜드 줄
  function canvas(kicker) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = grad(ctx, 0, 0, W, H, ["#0a1428", "#13264a", "#0c1830"]);
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.86, 40, 10, W * 0.86, 40, 520);
    glow.addColorStop(0, "rgba(227,185,85,.28)"); glow.addColorStop(1, "rgba(227,185,85,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.05)";
    for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) ctx.fillRect(x, y, 1.6, 1.6);
    // 브랜드
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(0, H - 76, W, 1);
    rr(ctx, 56, H - 56, 34, 34, 9); ctx.fillStyle = grad(ctx, 56, H - 56, 90, H - 22, ["#1d3a6b", "#0f2140"]); ctx.fill();
    ctx.fillStyle = "#e3b955"; ctx.font = `900 20px ${FONT}`; ctx.textAlign = "center"; ctx.fillText("D", 73, H - 32);
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(244,246,251,.92)"; ctx.font = `800 24px ${FONT}`;
    ctx.fillText(`집감 · ${REGION}`, 102, H - 30);
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(244,246,251,.6)"; ctx.font = `600 20px ${FONT}`;
    ctx.fillText("실거래가·입지로 매긴 S~D 등급 카드", W - 56, H - 31);
    ctx.textAlign = "left";
    if (kicker) { ctx.fillStyle = "#e3b955"; ctx.font = `800 26px ${FONT}`; ctx.fillText(kicker, 56, 80); }
    return [cv, ctx];
  }

  // ---------- 그림 1: 임장 코스 (지도 위 번호 핀과 점선 동선 + 단지 목록) ----------
  function courseArt({ stops, mode, move, total }) {
    const [cv, ctx] = canvas("");
    // 왼쪽 지도 판
    const mx = 48, my = 48, mw = 560, mh = 470;
    rr(ctx, mx, my, mw, mh, 28); ctx.fillStyle = "rgba(4,10,24,.55)"; ctx.fill();
    ctx.save(); rr(ctx, mx, my, mw, mh, 28); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let x = mx; x < mx + mw; x += 28) { ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mh); ctx.stroke(); }
    for (let y = my; y < my + mh; y += 28) { ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + mw, y); ctx.stroke(); }
    const cos = Math.cos(stops[0].la * Math.PI / 180), P = 70;
    const xs = stops.map(c => c.ln * cos), ys = stops.map(c => c.la);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((mw - 2 * P) / Math.max(x1 - x0, 1e-6), (mh - 2 * P) / Math.max(y1 - y0, 1e-6));
    const ox = mx + (mw - (x1 - x0) * k) / 2, oy = my + (mh - (y1 - y0) * k) / 2;
    const pt = c => [ox + (c.ln * cos - x0) * k, my + mh - (oy - my + (c.la - y0) * k)];
    ctx.strokeStyle = "#e3b955"; ctx.lineWidth = 5; ctx.setLineDash([2, 14]); ctx.lineCap = "round";
    ctx.beginPath(); stops.forEach((c, i) => { const [x, y] = pt(c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    ctx.setLineDash([]);
    stops.forEach((c, i) => {
      const [x, y] = pt(c);
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fillStyle = grad(ctx, x - 24, y - 24, x + 24, y + 24, ["#fff0b8", "#e1b24c"]); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = "#0b1630"; ctx.stroke();
      ctx.fillStyle = "#241703"; ctx.font = `900 24px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, y + 1);
      ctx.textBaseline = "alphabetic";
      const nm = fit(ctx, c.n, 170, 21, 800, 16);
      const right = x > mx + mw - 190;
      ctx.textAlign = right ? "right" : "left";
      const tx = right ? x - 32 : x + 32, ty = y + 8;
      ctx.lineWidth = 6; ctx.strokeStyle = "rgba(4,10,24,.85)"; ctx.strokeText(nm, tx, ty);
      ctx.fillStyle = "#f4f6fb"; ctx.fillText(nm, tx, ty);
    });
    ctx.restore();
    ctx.textAlign = "left";
    // 오른쪽 글
    const rx = 656, rw = W - rx - 56;
    ctx.fillStyle = "#e3b955"; ctx.font = `800 26px ${FONT}`; ctx.fillText("임장 코스", rx, 96);
    ctx.fillStyle = "#fff"; ctx.font = `850 50px ${FONT}`; ctx.fillText(`${stops.length}곳 둘러보기`, rx, 158);
    ctx.fillStyle = "rgba(244,246,251,.82)"; ctx.font = `700 26px ${FONT}`;
    ctx.fillText(fit(ctx, `${mode} 약 ${move} · 총 ${total}`, rw, 26, 700), rx, 202);
    const shown = stops.slice(0, stops.length > 5 ? 4 : 5);
    shown.forEach((c, i) => {
      const y = 262 + i * 52;
      ctx.beginPath(); ctx.arc(rx + 16, y - 9, 16, 0, Math.PI * 2); ctx.fillStyle = "rgba(227,185,85,.18)"; ctx.fill();
      ctx.fillStyle = "#e3b955"; ctx.font = `900 18px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(String(i + 1), rx + 16, y - 3);
      ctx.textAlign = "left"; ctx.fillStyle = "#f4f6fb";
      ctx.fillText(fit(ctx, c.n, rw - 48, 26, 800), rx + 46, y);
    });
    if (stops.length > shown.length) {
      ctx.fillStyle = "rgba(244,246,251,.6)"; ctx.font = `700 22px ${FONT}`;
      ctx.fillText(`외 ${stops.length - shown.length}곳`, rx + 46, 262 + shown.length * 52);
    }
    return cv;
  }

  // ---------- 그림 2: 단지 비교 (등급 카드 나란히 + 한 줄 결론) ----------
  function compareArt({ cs, wins, verdict }) {
    const [cv, ctx] = canvas("단지 비교");
    const n = cs.length, gap = 22, cw = (W - 112 - gap * (n - 1)) / n, top = 112, ch = 360;
    const best = Math.max(...wins);
    cs.forEach((c, i) => {
      const x = 56 + i * (cw + gap);
      rr(ctx, x, top, cw, ch, 26);
      ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fill();
      ctx.lineWidth = wins[i] === best && best > 0 ? 3 : 1.5;
      ctx.strokeStyle = wins[i] === best && best > 0 ? "rgba(227,185,85,.9)" : "rgba(255,255,255,.14)"; ctx.stroke();
      badge(ctx, c.g, x + 24, top + 24, 64);
      if (wins[i] === best && best > 0 && n > 1) {
        ctx.font = `800 18px ${FONT}`;
        const t = "더 앞섬", tw = ctx.measureText(t).width + 24;
        rr(ctx, x + cw - tw - 20, top + 30, tw, 34, 17); ctx.fillStyle = "#e3b955"; ctx.fill();
        ctx.fillStyle = "#241703"; ctx.fillText(t, x + cw - tw - 8, top + 53);
      }
      ctx.fillStyle = "#fff";
      ctx.fillText(fit(ctx, c.n, cw - 48, n > 3 ? 26 : 30, 850), x + 24, top + 138);
      ctx.fillStyle = "rgba(244,246,251,.6)";
      ctx.fillText(fit(ctx, DJ.place(c), cw - 48, 20, 600), x + 24, top + 172);
      ctx.fillStyle = "rgba(244,246,251,.6)"; ctx.font = `700 20px ${FONT}`; ctx.fillText("종합 지수", x + 24, top + 232);
      ctx.fillStyle = c.g === "S" ? "#f0cf74" : "#fff"; ctx.font = `850 ${n > 3 ? 52 : 60}px ${FONT}`;
      ctx.fillText(c.i == null ? "-" : String(c.i), x + 24, top + 292);
      ctx.fillStyle = "rgba(244,246,251,.85)";
      ctx.fillText(fit(ctx, (c.pt ? "84㎡ " + c.pt : "") + (wins[i] ? `  ·  ${wins[i]}개 항목 우세` : ""), cw - 48, 21, 700, 15), x + 24, top + 334);
    });
    ctx.fillStyle = "#f4f6fb";
    ctx.fillText(fit(ctx, verdict, W - 112, 28, 800), 56, top + ch + 64);
    return cv;
  }

  // ---------- 그림 3: 가족과 함께 보기 (누구의 기록인지, 모은 수, 단지 몇 곳) ----------
  function familyArt({ name, counts, list }) {
    const [cv, ctx] = canvas("함께 보는 임장 기록");
    ctx.fillStyle = "#fff";
    ctx.fillText(fit(ctx, name ? `${name}님의 임장 기록` : "우리 집 임장 기록", 620, 56, 850), 56, 152);
    ctx.fillStyle = "rgba(244,246,251,.78)"; ctx.font = `600 24px ${FONT}`;
    ctx.fillText("관심 단지와 현장에서 적은 체크·호가·메모를 함께 봐요", 56, 198);
    let x = 56;
    counts.filter(([, v]) => v).forEach(([k, v]) => {
      const t = `${k} ${v}`;
      ctx.font = `800 24px ${FONT}`;
      const w = ctx.measureText(t).width + 36;
      rr(ctx, x, 236, w, 50, 25); ctx.fillStyle = "rgba(227,185,85,.14)"; ctx.fill();
      ctx.strokeStyle = "rgba(227,185,85,.5)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#f0cf74"; ctx.fillText(t, x + 18, 270);
      x += w + 12;
    });
    list.slice(0, 3).forEach((c, i) => {
      const y = 320 + i * 72;
      rr(ctx, 56, y, 620, 60, 18); ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fill();
      badge(ctx, c.g, 68, y + 10, 40);
      ctx.fillStyle = "#fff"; ctx.fillText(fit(ctx, c.n, 330, 25, 800), 124, y + 39);
      ctx.fillStyle = "rgba(244,246,251,.6)"; ctx.textAlign = "right";
      ctx.fillText(fit(ctx, (c.pt ? c.pt + " · " : "") + DJ.place(c), 200, 19, 600), 660, y + 38);
      ctx.textAlign = "left";
    });
    // 오른쪽: 메모 쪽지
    const px = 740, py = 112, pw = 400, ph = 400;
    ctx.save(); ctx.translate(px + pw / 2, py + ph / 2); ctx.rotate(-0.04);
    rr(ctx, -pw / 2, -ph / 2, pw, ph, 22); ctx.fillStyle = "#fbf6e6"; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 30; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#b88a2a"; ctx.font = `800 22px ${FONT}`; ctx.fillText("임장 노트", -pw / 2 + 32, -ph / 2 + 54);
    ["✓ 역까지 걸어서 확인", "✓ 밤 주차 자리 보기", "✓ 부동산 호가 묻기"].forEach((t, i) => {
      ctx.fillStyle = "#2b2b2b"; ctx.font = `700 24px ${FONT}`; ctx.fillText(t, -pw / 2 + 32, -ph / 2 + 112 + i * 52);
    });
    ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-pw / 2 + 32, 70 + i * 44); ctx.lineTo(pw / 2 - 32, 70 + i * 44); ctx.stroke(); }
    ctx.restore();
    return cv;
  }

  async function glyphs(text) {
    if (!document.fonts || !document.fonts.load) return;
    await Promise.all([600, 700, 800, 900].map(w => document.fonts.load(`${w} 20px "Pretendard Variable"`, text).catch(() => null)));
  }
  DJ.shareArt = { course: courseArt, compare: compareArt, family: familyArt };

  // ---------- 시트 ----------
  let sheet = null, back = null, cur = null, last = null;
  function act(cls, label, icon) {
    const b = el("button", "sheet-act");
    b.type = "button"; b.dataset.act = cls;
    const i = el("i", cls === "kakao" ? "kakao" : "");
    i.innerHTML = `<svg class="ic"><use href="#${icon}"/></svg>`;
    b.append(i, el("span", "", label));
    return b;
  }
  function build() {
    back = el("div", "sheet-back"); back.hidden = true;
    sheet = el("div", "sheet ss"); sheet.hidden = true;
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-labelledby", "ss-title");
    const h = el("h3", ""); h.id = "ss-title";
    // 받는 사람에게 보일 모습 (카카오톡 메시지 모양)
    const msg = el("div", "ss-msg");
    const pic = el("div", "ss-pic"), img = el("img"); img.alt = ""; img.hidden = true;
    pic.append(img, el("span", "ss-ph"));
    const body = el("div", "ss-body");
    body.append(el("b", "ss-t"), el("span", "ss-d"));
    const btns = el("div", "ss-btns");
    btns.append(el("span", "ss-b1"), el("span", "ss-b2", "나도 써 보기"));
    msg.append(pic, body, btns);
    const acts = el("div", "sheet-acts");
    acts.append(act("kakao", "카카오톡", "i-chat"), act("link", "링크 복사", "i-link"), act("save", "그림 저장", "i-download"), act("more", "다른 앱", "i-more"));
    const hint = el("p", "sheet-hint"); hint.hidden = true;
    const close = el("button", "btn sheet-close", "닫기"); close.type = "button";
    sheet.append(el("div", "sheet-grab"), h, el("p", "muted ss-sub", "받는 사람에게는 이렇게 보여요"), msg, acts, hint, close);
    document.body.append(back, sheet);
    back.addEventListener("click", hide);
    close.addEventListener("click", hide);
    sheet.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
    acts.querySelector('[data-act="kakao"]').addEventListener("click", kakao);
    acts.querySelector('[data-act="link"]').addEventListener("click", copy);
    acts.querySelector('[data-act="save"]').addEventListener("click", saveImg);
    acts.querySelector('[data-act="more"]').addEventListener("click", more);
  }
  const $ = s => sheet.querySelector(s);
  function say(t) { const h = $(".sheet-hint"); h.textContent = t || ""; h.hidden = !t; }
  function hide() {
    if (!sheet || sheet.hidden) return;
    back.classList.remove("on"); sheet.classList.remove("on");
    setTimeout(() => { back.hidden = true; sheet.hidden = true; }, DJ.calm ? 0 : 220);
    if (last) last.focus({ preventScroll: true });
  }

  // o: {head, title, desc, url, button, art: () => canvas, og, file, copy}
  DJ.shareSheet = function (o) {
    if (!sheet) build();
    last = document.activeElement;
    cur = Object.assign({ blob: null, kakaoImg: null, ready: null }, o);
    $("#ss-title").textContent = o.head;
    $(".ss-t").textContent = o.title;
    $(".ss-d").textContent = o.desc;
    $(".ss-b1").textContent = o.button;
    const img = $(".ss-pic img");
    img.hidden = true; $(".ss-ph").hidden = false;
    $('[data-act="more"]').hidden = !navigator.share;
    $('[data-act="save"]').setAttribute("aria-disabled", "true");
    say("");
    back.hidden = false; sheet.hidden = false;
    requestAnimationFrame(() => { back.classList.add("on"); sheet.classList.add("on"); });
    $('[data-act="kakao"]').focus({ preventScroll: true });
    if (KEY) loadKakao();
    // 그림 카드 그리기 → 미리보기 → 카카오 서버에 미리 올려 두기 (누를 때 기다리지 않게)
    const me = cur;
    me.ready = glyphs(o.title + o.desc + (o.glyphs || "") + REGION + "집감 · 실거래가·입지로 매긴 S~D 등급 카드 임장 코스 단지 비교 함께 보는 기록 노트 곳 개 항목 우세 앞섬 종합 지수 외 둘러보기 약 총 걸어서 차로 역까지 확인 밤 주차 자리 보기 부동산 호가 묻기 관심 사진 장 님의 우리 집 현장에서 적은 체크·메모를 함께 봐요")
      .then(() => o.art())
      .then(cv => new Promise(res => cv.toBlob(b => res(b), "image/png")))
      .then(blob => {
        if (cur !== me || !blob) return;
        me.blob = blob;
        img.src = URL.createObjectURL(blob); img.hidden = false; $(".ss-ph").hidden = true;
        $('[data-act="save"]').removeAttribute("aria-disabled");
        if (KEY) loadKakao().then(ok => {
          if (!ok || !Kakao.Share || !Kakao.Share.uploadImage) return;
          return Kakao.Share.uploadImage({ file: [new File([blob], o.file || "share.png", { type: "image/png" })] })
            .then(r => { if (r && r.infos && r.infos.original) me.kakaoImg = r.infos.original; });
        }).catch(() => {});
      }).catch(() => { $(".ss-ph").hidden = true; });
  };

  function kakao() {
    const o = cur, link = { mobileWebUrl: o.url, webUrl: o.url }, home = { mobileWebUrl: BASE + "index.html", webUrl: BASE + "index.html" };
    if (window.Kakao && Kakao.Share && Kakao.isInitialized && Kakao.isInitialized()) {
      try {
        const im = o.kakaoImg || { url: o.og, width: W, height: H };
        Kakao.Share.sendDefault({ objectType: "feed",
          content: { title: o.title, description: o.desc, imageUrl: im.url, imageWidth: im.width || W, imageHeight: im.height || H, link },
          buttons: [{ title: o.button, link }, { title: "나도 써 보기", link: home }] });
        return;
      } catch (e) { /* 아래 다른 방법으로 */ }
    }
    if (navigator.share && !IN_APP) { more(); return; }
    copy();
    say("카카오톡 대화창에 붙여 넣어 보내 주세요.");
  }
  function copy() {
    const o = cur;
    DJ.copy((o.copy || `${o.title}\n${o.desc}`) + "\n" + o.url).then(ok => {
      if (ok) DJ.toast("글과 링크를 복사했어요", "카카오톡에 붙여 넣으면 링크 미리보기도 함께 떠요");
      else DJ.copyBox(o.url);
    });
  }
  function more() {
    const o = cur;
    navigator.share({ title: o.title, text: o.copy || o.desc, url: o.url }).catch(e => { if (!e || e.name !== "AbortError") copy(); });
  }
  // 그림 저장: 일반 브라우저는 내려받기, 아이폰·앱 안 브라우저는 크게 띄워 길게 눌러 저장
  function saveImg() {
    const o = cur;
    if (!o.blob) return;
    const f = new File([o.blob], o.file || "share.png", { type: "image/png" });
    if ((IOS || IN_APP) && navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f] }).catch(() => {});
      return;
    }
    if (IOS || IN_APP) {
      const v = el("div", "ss-view"), im = el("img"), x = el("button", "btn", "닫기");
      im.src = URL.createObjectURL(o.blob); im.alt = o.title; x.type = "button";
      v.append(el("p", "", "그림을 길게 눌러 저장해 주세요"), im, x);
      x.addEventListener("click", () => v.remove());
      document.body.append(v);
      return;
    }
    const a = el("a");
    a.href = URL.createObjectURL(o.blob); a.download = o.file || "share.png"; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    DJ.toast("그림을 저장했어요", "다운로드 폴더에 들어갔어요");
  }
})();
