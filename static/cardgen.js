// 단지 카드: 메인 카드의 그림을 그리고, 공유 시트에서 수집 카드(5:7) 모양 PNG를 만들어 저장·공유합니다.
// 이미지는 브라우저에서 만들고 서버로 보내지 않습니다.
(function () {
  const W = 750, H = 1050, SCALE = 1.4;

  // 등급별 색: 테두리 금속, 안쪽 바탕, 글자, 막대, 그림 하늘
  const TIER = {
    S: { name: "최상위", frame: ["#fff3c4", "#d9b55a", "#8a6a12", "#f5dd92", "#b8912f"], inner: ["#0e1b2f", "#1a3354", "#0b1525"],
         ink: "#f6f0e1", sub: "rgba(246,240,225,.7)", bar: ["#a37b22", "#e8c66c", "#fff1bf"], sky: ["#0b1830", "#2b4f80", "#e9c46a"], stars: 5, holo: 0.55 },
    A: { name: "우수", frame: ["#ffffff", "#c9d0db", "#6b7480", "#f2f4f7", "#9aa4b2"], inner: ["#1b2028", "#2c333e", "#171b22"],
         ink: "#eef1f6", sub: "rgba(238,241,246,.7)", bar: ["#6b7480", "#c9d0db", "#ffffff"], sky: ["#151b26", "#3a4a63", "#b8c4d6"], stars: 4, holo: 0.38 },
    B: { name: "양호", frame: ["#cfe2fb", "#2f6fb8", "#174a85", "#9ec5f4", "#2f6fb8"], inner: ["#0f2a4d", "#1b4a80", "#0e2442"],
         ink: "#f2f7ff", sub: "rgba(242,247,255,.7)", bar: ["#2a78d6", "#6da7ec", "#cde2fb"], sky: ["#0f2a4d", "#3c78bf", "#9ec5f4"], stars: 3, holo: 0.18 },
    C: { name: "보통", frame: ["#e5e9ef", "#6d7a8c", "#465263", "#b6c0cd", "#6d7a8c"], inner: ["#26303c", "#3b4757", "#222a35"],
         ink: "#f1f3f6", sub: "rgba(241,243,246,.7)", bar: ["#6d7a8c", "#9aa6b6", "#d5dbe3"], sky: ["#222a35", "#4f5d70", "#aab5c3"], stars: 2, holo: 0.1 },
    D: { name: "아쉬움", frame: ["#f4f5f7", "#b9c0ca", "#8a929e", "#e3e6ea", "#b9c0ca"], inner: ["#f4f5f7", "#e6e9ee", "#f7f8fa"],
         ink: "#1d232c", sub: "rgba(29,35,44,.65)", bar: ["#8a929e", "#b9c0ca", "#dfe3e8"], sky: ["#c9d3df", "#e6ecf3", "#fbfcfd"], stars: 1, holo: 0.08 },
  };
  TIER["-"] = TIER.D;
  const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

  // 단지 ID로 정해지는 난수: 같은 단지는 늘 같은 그림
  function seeded(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 글자가 maxW 안에 들어가도록 크기를 줄입니다
  function fitText(ctx, text, maxW, size, weight) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 1; } while (ctx.measureText(text).width > maxW && s > 16);
    if (ctx.measureText(text).width > maxW) {
      while (text.length > 2 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
      text += "…";
    }
    return text;
  }

  function skyline(ctx, x, y, w, h, t, rand, c) {
    ctx.save();
    rr(ctx, x, y, w, h, 18); ctx.clip();
    ctx.fillStyle = grad(ctx, 0, y, 0, y + h, t.sky);
    ctx.fillRect(x, y, w, h);
    // 해(또는 달)
    const sx = x + w * (0.65 + rand() * 0.2), sy = y + h * 0.3;
    const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    sun.addColorStop(0, "rgba(255,244,214,.95)"); sun.addColorStop(0.35, "rgba(255,226,150,.45)"); sun.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
    // 먼 산
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.62);
    for (let k = 0; k <= 8; k++) ctx.lineTo(x + w * k / 8, y + h * (0.5 + rand() * 0.14));
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    // 뒷줄, 앞줄 아파트
    [[0.55, "rgba(10,18,32,.45)", 0.35], [0.82, "rgba(8,14,26,.85)", 0.55]].forEach(([base, color, maxH], layer) => {
      let bx = x - 10;
      while (bx < x + w) {
        const bw = 46 + rand() * 50, bh = h * (0.18 + rand() * maxH);
        const top = y + h * base + (layer ? h * 0.18 : 0) - bh;
        ctx.fillStyle = color;
        ctx.fillRect(bx, top, bw, y + h - top);
        if (layer) {
          // 창문 불빛
          for (let wy = top + 12; wy < y + h - 14; wy += 16) {
            for (let wx = bx + 8; wx < bx + bw - 10; wx += 13) {
              if (rand() < 0.42) {
                ctx.fillStyle = rand() < 0.5 ? "rgba(255,226,150,.85)" : "rgba(255,244,214,.6)";
                ctx.fillRect(wx, wy, 6, 8);
              }
            }
          }
        }
        bx += bw + 4 + rand() * 10;
      }
    });
    // 동 이름 표지
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.font = `800 64px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(c.d, x + 22, y + 74);
    ctx.restore();
  }

  function holo(ctx, x, y, w, h, t, rand) {
    if (!t.holo) return;
    ctx.save();
    rr(ctx, x, y, w, h, 26); ctx.clip();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = t.holo;
    ctx.fillStyle = grad(ctx, x, y, x + w, y + h, ["rgba(255,0,128,0)", "rgba(255,120,200,.35)", "rgba(255,230,120,.45)",
      "rgba(120,255,200,.35)", "rgba(120,180,255,.45)", "rgba(200,140,255,.35)", "rgba(255,0,128,0)"]);
    ctx.fillRect(x, y, w, h);
    // 비스듬한 반사 띠
    ctx.globalAlpha = t.holo * 0.6;
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 260 + rand() * 60;
      ctx.fillStyle = grad(ctx, x + off, y, x + off + 220, y + h, ["rgba(255,255,255,0)", "rgba(255,255,255,.35)", "rgba(255,255,255,0)"]);
      ctx.beginPath();
      ctx.moveTo(x + off, y); ctx.lineTo(x + off + 90, y); ctx.lineTo(x + off + 90 + h * 0.5, y + h); ctx.lineTo(x + off + h * 0.5, y + h);
      ctx.fill();
    }
    ctx.restore();
    if (t.stars >= 4) {
      // 반짝이
      ctx.save();
      for (let k = 0; k < (t.stars === 5 ? 46 : 26); k++) {
        const px = x + rand() * w, py = y + rand() * h, r = 0.8 + rand() * 2.2;
        ctx.fillStyle = `rgba(255,${240 + Math.floor(rand() * 15)},${200 + Math.floor(rand() * 55)},${0.35 + rand() * 0.5})`;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        if (rand() < 0.18) { // 십자 빛
          ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py); ctx.moveTo(px, py - 7); ctx.lineTo(px, py + 7); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function draw(c, data) {
    const t = TIER[c.g] || TIER.D;
    const rand = seeded(c.s);
    const cv = document.createElement("canvas");
    cv.width = W * SCALE; cv.height = H * SCALE;
    const ctx = cv.getContext("2d");
    ctx.scale(SCALE, SCALE);

    // 테두리(금속)와 안쪽 바탕
    rr(ctx, 0, 0, W, H, 40);
    ctx.fillStyle = grad(ctx, 0, 0, W, H, t.frame); ctx.fill();
    rr(ctx, 6, 6, W - 12, H - 12, 36);
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.stroke();
    rr(ctx, 22, 22, W - 44, H - 44, 28);
    ctx.fillStyle = grad(ctx, 0, 22, W, H, t.inner); ctx.fill();

    // 머리: 등급 문장, 이름, 지수
    const ex = 74, ey = 84;
    ctx.save();
    ctx.beginPath(); ctx.arc(ex, ey, 36, 0, Math.PI * 2);
    ctx.fillStyle = grad(ctx, ex - 36, ey - 36, ex + 36, ey + 36, t.frame); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = c.g === "S" || c.g === "A" || c.g === "D" || c.g === "-" ? "#1a1406" : "#ffffff";
    ctx.font = `900 38px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(c.g === "-" ? "?" : c.g, ex, ey + 2);
    ctx.restore();

    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillStyle = t.ink;
    const name = fitText(ctx, c.n, 430, 44, 800);
    ctx.fillText(name, 126, 82);
    ctx.fillStyle = t.sub; ctx.font = `500 20px ${FONT}`;
    ctx.fillText((data.region || "대전") + " " + DJ.place(c), 128, 114);

    ctx.textAlign = "right";
    ctx.fillStyle = t.sub; ctx.font = `600 18px ${FONT}`;
    ctx.fillText("종합 지수", W - 54, 62);
    ctx.font = `900 64px ${FONT}`;
    ctx.fillStyle = c.g === "S" ? grad(ctx, 0, 70, 0, 124, ["#fff3c4", "#d4af52", "#a37b22"])
                  : c.g === "A" ? grad(ctx, 0, 70, 0, 124, ["#ffffff", "#c9d0db", "#8b95a7"]) : t.ink;
    ctx.fillText(c.i == null ? "-" : String(c.i), W - 50, 122);

    // 그림
    const ax = 50, ay = 146, aw = W - 100, ah = 370;
    skyline(ctx, ax, ay, aw, ah, t, rand, c);
    rr(ctx, ax, ay, aw, ah, 18);
    ctx.lineWidth = 5; ctx.strokeStyle = grad(ctx, ax, ay, ax + aw, ay + ah, t.frame); ctx.stroke();

    // 정보 띠
    const by = ay + ah + 18;
    rr(ctx, 70, by, W - 140, 44, 22);
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = t.ink; ctx.textAlign = "center"; ctx.font = `600 20px ${FONT}`;
    const info = [t.name + " 등급", c.y ? c.y + "년 준공" : null, c.stn ? c.stn + (c.f.subway != null ? " " + c.f.subway + "m" : "") : null]
      .filter(Boolean).join("  ·  ");
    ctx.fillText(info, W / 2, by + 29);

    // 항목별 점수
    let sy = by + 92;
    const stats = data.stats || [];
    const step = Math.min(56, Math.floor(280 / Math.max(1, stats.length)));  // 항목이 늘어도 같은 높이 안에
    stats.forEach((st, k) => {
      const v = c.st[k];
      ctx.textAlign = "left"; ctx.fillStyle = t.ink; ctx.font = `700 26px ${FONT}`;
      ctx.fillText(st.n, 64, sy);
      const bx = 196, bw = 420, bh = 16, top = sy - 17;
      rr(ctx, bx, top, bw, bh, 8); ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fill();
      if (c.g === "D" || c.g === "-") { rr(ctx, bx, top, bw, bh, 8); ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.fill(); }
      if (v != null) {
        rr(ctx, bx, top, Math.max(bh, bw * v / 100), bh, 8);
        ctx.fillStyle = grad(ctx, bx, 0, bx + bw, 0, t.bar); ctx.fill();
      }
      ctx.textAlign = "right"; ctx.font = `800 28px ${FONT}`; ctx.fillStyle = t.ink;
      ctx.fillText(v == null ? "-" : String(v), W - 62, sy + 2);
      sy += step;
    });

    // 아래 세 칸: 가격 · 10년 수익률 · 전고점 대비
    const cy = sy + 6;
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(56, cy - 26); ctx.lineTo(W - 56, cy - 26); ctx.stroke();
    const cells = [
      ["84㎡ 환산", c.pt || "-"],
      ["10년 연평균", c.c10 == null ? (c.c5 == null ? "-" : (c.c5 > 0 ? "+" : "") + c.c5 + "% (5년)") : (c.c10 > 0 ? "+" : "") + c.c10 + "%"],
      ["전고점 대비", c.dd == null ? "-" : (c.dd > 0 ? "+" : "") + Math.round(c.dd) + "%"],
    ];
    cells.forEach(([label, value], k) => {
      const cx = 56 + (W - 112) * (k + 0.5) / 3;
      ctx.textAlign = "center";
      ctx.fillStyle = t.sub; ctx.font = `600 17px ${FONT}`; ctx.fillText(label, cx, cy + 4);
      ctx.fillStyle = t.ink; ctx.font = `800 30px ${FONT}`; ctx.fillText(value, cx, cy + 42);
    });

    // 바닥: 번호, 희귀도, 출처
    const fy = H - 52;
    ctx.textAlign = "left"; ctx.fillStyle = t.sub; ctx.font = `700 17px ${FONT}`;
    ctx.fillText(c.rk ? "No." + String(c.rk).padStart(3, "0") + " / " + data.complexes.length : "No.---", 56, fy);
    ctx.textAlign = "center"; ctx.font = `900 22px ${FONT}`;
    ctx.fillStyle = c.g === "S" ? "#e8c66c" : c.g === "A" ? "#dfe5ee" : t.ink;
    ctx.fillText("◆".repeat(t.stars) + "◇".repeat(5 - t.stars), W / 2, fy + 1);
    ctx.textAlign = "right"; ctx.fillStyle = t.sub; ctx.font = `600 15px ${FONT}`;
    ctx.fillText((data.asof || "") + " 실거래 기준", W - 56, fy - 10);
    ctx.fillText((data.region || "대전") + " 아파트 지수", W - 56, fy + 10);

    holo(ctx, 22, 22, W - 44, H - 44, t, rand);
    return cv;
  }

  // ---------- 메인 카드의 그림: 이미지로 저장하는 카드와 같은 그림 ----------
  function drawArt(cv, c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = 650, h = 330;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    skyline(ctx, 0, 0, w, h, TIER[c.g] || TIER.D, seeded(c.s), c);
  }

  // ---------- 공유 시트: 카카오톡, 링크 복사, 이미지 저장, 다른 앱 ----------
  // 다른 창으로 넘기지 않고 그 자리에서 끝나게, 브라우저에 맞춰 저장 방법을 고릅니다.
  //  · 일반 브라우저(안드로이드·PC): 바로 내려받기
  //  · 아이폰, 파일 공유가 되는 앱 안 브라우저: 휴대폰 공유 창 → '이미지 저장'(사진 앱)
  //  · 카카오톡·네이버 앱 같은 앱 안 브라우저: 내려받기(blob 주소)를 못 해서, 카드를 크게 띄워 길게 눌러 저장
  //    (카카오 서버에 올린 https 주소로 띄우면 앱의 '이미지 저장' 메뉴가 잘 동작). 기본 브라우저로 열기는 마지막 수단으로만.
  const UA = navigator.userAgent || "";
  const KAKAO = /KAKAOTALK/i.test(UA);
  const IN_APP = KAKAO || /NAVER\(inapp|Instagram|FBAN|FBAV|\bLine\/|DaumApps|everytimeApp|BAND\/|KAKAOSTORY|TikTok|musical_ly|; wv\)/i.test(UA);
  const pageUrl = () => { const u = new URL(location.href); u.hash = ""; u.searchParams.delete("card"); return u.toString(); };
  function externalUrl() {
    const u = new URL(pageUrl());
    u.searchParams.set("card", "1");
    return "kakaotalk://web/openExternal?url=" + encodeURIComponent(u.toString());
  }

  let kakaoReady = null;
  function loadKakao(key) {
    if (!key) return Promise.resolve(false);
    if (!kakaoReady) {
      kakaoReady = new Promise(res => {
        const s = document.createElement("script");
        s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => { try { if (!Kakao.isInitialized()) Kakao.init(key); res(true); } catch (e) { res(false); } };
        s.onerror = () => res(false);
        document.head.append(s);
      });
    }
    return kakaoReady;
  }


  function setupSheet(slug, opener) {
    const sheet = document.getElementById("share-sheet");
    if (!sheet) return null;
    const back = document.querySelector(".sheet-back");
    const hint = sheet.querySelector("[data-sheet-hint]");
    const save = sheet.querySelector('[data-act="save"]');
    const more = sheet.querySelector('[data-act="more"]');
    const title = sheet.dataset.title, text = sheet.dataset.text;
    let image = null, last = null, preparing = null, kakaoImg = null, kakaoUp = null;
    more.hidden = !navigator.share;
    const say = msg => { hint.textContent = msg; hint.hidden = !msg; };
    // 휴대폰 공유 창으로 이미지 파일을 넘길 수 있는지 (넘기면 '사진에 저장'·메신저로 이미지가 그대로 갑니다)
    const cardFile = () => image ? new File([image.blob], image.file, { type: "image/png" }) : null;
    const canShareFile = f => !!(f && navigator.canShare && navigator.canShare({ files: [f] }));
    // 아이폰은 파일로 내려받으면 사진 앱이 아니라 '파일'에 들어가서, 공유 창의 '이미지 저장'으로 보냅니다
    const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const ANDROID = /Android/i.test(navigator.userAgent);
    const saveLabel = save && save.querySelector("span");
    if (saveLabel) saveLabel.textContent = "만드는 중";

    function prepare() {
      if (!preparing) preparing = build();
      return preparing;
    }
    // 카카오톡 피드 메시지에 넣을 카드 이미지를 카카오 서버에 미리 올려 둡니다 (누를 때 바로 보내지게)
    function uploadKakao() {
      if (!kakaoUp) kakaoUp = prepare().then(() => loadKakao(sheet.dataset.kakaoKey)).then(async ok => {
        if (!ok || !image || !Kakao.Share.uploadImage) return null;
        const res = await Kakao.Share.uploadImage({ file: [kakaoFile()] });
        kakaoImg = res && res.infos && res.infos.original ? res.infos.original : null;
        return kakaoImg;
      }).catch(() => null);
      return kakaoUp;
    }
    // 카카오톡 미리보기는 가로:세로 3:4 까지만 그대로 보여줘 (카드는 5:7) 양옆을 바탕색으로 채운 판을 올립니다
    let kakaoBlobFile = null;
    function kakaoFile() { return kakaoBlobFile || cardFile(); }

    async function build() {
      if (image || !save) return;
      try {
        const [data] = await Promise.all([DJ.data(), document.fonts ? document.fonts.ready : null]);
        const c = data.bySlug[slug];
        if (!c) throw new Error("no card");
        await glyphs(JSON.stringify(c) + (data.region || "") + "아파트 지수 등급 점 위 상위 하위 억 만 원 년 평 ㎡");
        const cv = draw(c, data);
        const blob = await new Promise(res => cv.toBlob(res, "image/png"));
        image = { blob, url: URL.createObjectURL(blob), file: c.n.replace(/[\\/:*?"<>|\s]+/g, "_") + "_단지카드.png" };
        const pad = document.createElement("canvas");
        pad.width = Math.round(cv.height * 3 / 4); pad.height = cv.height;
        const pc = pad.getContext("2d");
        const edge = cv.getContext("2d").getImageData(3, Math.round(cv.height / 2), 1, 1).data;  // 카드 가장자리 색으로 채움
        pc.fillStyle = edge[3] > 200 ? `rgb(${edge[0]},${edge[1]},${edge[2]})` : "#f3f2ee";
        pc.fillRect(0, 0, pad.width, pad.height);
        pc.drawImage(cv, Math.round((pad.width - cv.width) / 2), 0);
        const padBlob = await new Promise(res => pad.toBlob(res, "image/jpeg", 0.9));  // 올리기 빠르게 JPG로
        if (padBlob) kakaoBlobFile = new File([padBlob], image.file.replace(/\.png$/, ".jpg"), { type: "image/jpeg" });
        const thumb = sheet.querySelector("[data-sheet-thumb]");
        thumb.src = image.url; thumb.hidden = false;
        sheet.querySelector(".sheet-thumb-ph").hidden = true;
        sheet.querySelector("[data-sheet-info]").textContent = cv.width + "×" + cv.height + " 카드 이미지";
        save.removeAttribute("aria-disabled");
        saveLabel.textContent = "이미지 저장";
      } catch (e) {
        sheet.querySelector("[data-sheet-info]").textContent = "카드 이미지를 만들지 못했어요";
        if (saveLabel) saveLabel.textContent = "이미지 저장";
      }
    }
    // 앱 안 브라우저에서 길게 눌러 저장할 원본 이미지를 카카오 서버에 올려 https 주소를 받습니다
    let saveUp = null;
    function uploadSave() {
      if (!saveUp) saveUp = loadKakao(sheet.dataset.kakaoKey).then(async ok => {
        if (!ok || !image || !Kakao.Share.uploadImage) return null;
        const res = await Kakao.Share.uploadImage({ file: [cardFile()] });
        return res && res.infos && res.infos.original ? res.infos.original.url : null;
      }).catch(() => null);
      return saveUp;
    }
    const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });

    // 카드 크게 보기 (길게 눌러 저장)
    let viewer = null;
    function showViewer() {
      if (!viewer) {
        const back = DJ.el("div", "viewer-back"), box = DJ.el("div", "viewer");
        box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "카드 이미지 저장");
        const img = DJ.el("img"); img.alt = title + " 카드 이미지";
        const sub = DJ.el("p", "viewer-sub");
        const close = DJ.el("button", "btn", "닫기"); close.type = "button";
        box.append(img, DJ.el("p", "viewer-hint", "이미지를 길게 눌러 저장하세요"), sub, close);
        const hide = () => { back.classList.remove("on"); back.hidden = true; box.hidden = true; document.removeEventListener("keydown", escV); };
        const escV = e => { if (e.key === "Escape") hide(); };
        back.onclick = hide; close.onclick = hide;
        document.body.append(back, box);
        viewer = { back, box, img, sub, hide, escV };
      }
      const v = viewer;
      v.sub.replaceChildren(document.createTextNode(IOS ? "'사진 앱에 저장'을 고르면 사진 앱에 들어가요."
        : "'이미지 저장'을 고르면 휴대폰 갤러리에 들어가요."));
      if (KAKAO) {   // 정말 안 될 때만 쓰는 마지막 방법
        const a = DJ.el("a", "", "그래도 안 되면 기본 브라우저로 열기");
        a.href = externalUrl();
        v.sub.append(DJ.el("br"), a);
      } else if (IN_APP) {
        v.sub.append(DJ.el("br"), document.createTextNode("그래도 안 되면 오른쪽 위 메뉴의 '다른 브라우저로 열기'를 써 주세요."));
      }
      v.img.src = image.url;
      toDataUrl(image.blob).then(d => { if (d && !v.img.src.startsWith("https:")) v.img.src = d; });
      if (sheet.dataset.kakaoKey) uploadSave().then(u => { if (u) v.img.src = u; });
      v.back.hidden = false; v.box.hidden = false;
      requestAnimationFrame(() => v.back.classList.add("on"));
      document.addEventListener("keydown", v.escV);
      v.box.querySelector("button").focus();
    }

    // 이미지 저장: 브라우저에 맞춰 자동으로
    function saveImage() {
      const f = cardFile();
      if ((IOS || IN_APP) && canShareFile(f)) {   // 휴대폰 공유 창 → '이미지 저장'
        navigator.share({ files: [f] }).catch(e => { if (!e || e.name !== "AbortError") showViewer(); });
        return;
      }
      if (IN_APP || IOS) { showViewer(); return; }
      const a = document.createElement("a");
      a.href = image.url; a.download = image.file; a.hidden = true;
      document.body.append(a); a.click(); a.remove();
      DJ.toast("카드 이미지를 저장했어요", ANDROID ? "갤러리의 '다운로드' 앨범에서 볼 수 있어요" : "다운로드 폴더에 들어갔어요");
    }

    function open() {
      last = document.activeElement;
      back.hidden = false; sheet.hidden = false;
      requestAnimationFrame(() => { back.classList.add("on"); sheet.classList.add("on"); });
      say(IN_APP && save && !navigator.share ? "'이미지 저장'을 누르면 카드를 크게 띄워 드려요. 길게 눌러 저장하면 돼요." : "");
      document.addEventListener("keydown", esc);
      sheet.querySelector(".sheet-act").focus();
      prepare();
      if (!IN_APP || KAKAO) kakaoReadyState();
    }
    // 카드 이미지가 카카오에 올라갈 때까지 카카오톡 버튼은 '이미지 준비 중' (먼저 누르면 글만 가던 문제)
    const kakaoBtn = sheet.querySelector('[data-act="kakao"]'), kakaoLabel = kakaoBtn.querySelector("span");
    function kakaoReadyState() {
      if (!save || !sheet.dataset.kakaoKey || kakaoImg) return uploadKakao();
      kakaoBtn.setAttribute("aria-busy", "true");
      kakaoLabel.textContent = "이미지 준비 중";
      const done = () => { kakaoBtn.removeAttribute("aria-busy"); kakaoLabel.textContent = "카카오톡"; };
      Promise.race([uploadKakao(), new Promise(r => setTimeout(r, 12000))]).then(done, done);
    }
    function close() {
      back.classList.remove("on"); sheet.classList.remove("on");
      setTimeout(() => { back.hidden = true; sheet.hidden = true; }, DJ.calm ? 0 : 220);
      document.removeEventListener("keydown", esc);
      if (last) last.focus();
    }
    function esc(e) { if (e.key === "Escape") close(); }
    document.querySelectorAll("[data-sheet-close]").forEach(b => b.addEventListener("click", close));

    sheet.querySelector('[data-act="kakao"]').addEventListener("click", async () => {
      const url = pageUrl(), link = { mobileWebUrl: url, webUrl: url };
      if (await loadKakao(sheet.dataset.kakaoKey)) {
        try {
          // 카드 이미지가 올라가 있으면 이미지가 보이는 피드 메시지, 아니면 글 메시지
          const img = kakaoImg || (save ? await Promise.race([uploadKakao(), new Promise(r => setTimeout(() => r(null), 1500))]) : null);
          if (img && img.url) {
            Kakao.Share.sendDefault({ objectType: "feed",
              content: { title, description: text, imageUrl: img.url, imageWidth: img.width, imageHeight: img.height, link },
              buttons: [{ title: "점수 보기", link }] });
          } else {
            Kakao.Share.sendDefault({ objectType: "text", text: title + "\n" + text, buttonTitle: "점수 보기", link });
          }
          return;
        } catch (e) { /* 아래 대체 방법으로 */ }
      }
      if (navigator.share) { shareWithImage(url); return; }
      if (await DJ.copy(url)) DJ.toast("링크를 복사했어요", "카카오톡 대화창에 붙여 넣어 보내세요");
      else DJ.copyBox(url);
    });
    sheet.querySelector('[data-act="link"]').addEventListener("click", () => DJ.copyLink(pageUrl()));
    // 다른 앱으로: 카드 이미지 파일과 글(링크 포함)을 함께. 이미지를 못 넘기는 브라우저는 글과 링크만
    function shareWithImage(url) {
      const f = cardFile();
      const data = canShareFile(f) ? { files: [f], title, text: title + "\n" + text + "\n" + url } : { title, text, url };
      return navigator.share(data).catch(e => { if (!e || e.name !== "AbortError") DJ.copyLink(url); });
    }
    if (save) save.addEventListener("click", e => {
      e.preventDefault();
      if (image) saveImage();
    });
    more.addEventListener("click", () => shareWithImage(pageUrl()));
    opener.addEventListener("click", open);
    return open;
  }

  // 프리텐다드는 페이지에 나온 글자 묶음만 내려받아서, 카드에만 쓰는 글자는 그리기 전에 미리 받아 둡니다
  // (안 그러면 그 글자만 다른 글꼴로 그려짐). 실패해도 대체 글꼴로 그립니다.
  function glyphs(text) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([500, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 20px "Pretendard Variable"`, text).catch(() => null)))
      .then(() => null, () => null);
  }

  DJ.drawCard = draw; // 테스트·다른 페이지에서 쓰도록

  document.addEventListener("DOMContentLoaded", () => {
    const card = document.querySelector(".mc[data-apt]");
    if (!card) return;
    const c = { s: card.dataset.apt, g: card.dataset.grade, d: card.dataset.dong };
    card.querySelectorAll("canvas[data-art]").forEach(cv => {
      const paint = () => drawArt(cv, c);
      if (document.fonts) document.fonts.ready.then(() => glyphs(c.d || "")).then(paint); else paint(); // 동 이름 글꼴이 들어온 뒤 그리기
    });
    // 최근 실거래: 그림 위 아이콘을 누르면 카드 안에서 펼침
    const toggle = card.querySelector("[data-deals-toggle]"), deals = document.getElementById("mc-deals");
    if (toggle && deals) toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", on ? "true" : "false");
      deals.hidden = !on;
    });
    // 배지가 한 줄에 다 안 들어가면 촘촘하게 (단위·날짜 줄을 접음)
    const row = card.querySelector(".mc-badges");
    const fit = () => {
      if (!row) return;
      const over = () => [...row.children].reduce((w, x) => w + x.scrollWidth, 0) + 6 * (row.children.length - 1) > row.clientWidth;
      row.classList.remove("tight", "tighter");
      if (over()) row.classList.add("tight");
      if (over()) row.classList.add("tighter");   // 아주 좁은 화면: 아이콘만
    };
    fit();
    window.addEventListener("resize", fit);
    if (document.fonts) document.fonts.ready.then(fit);
    // 그림 위 배지: 누르면 설명 말풍선 (다시 누르거나 바깥을 누르면 닫힘)
    const tip = card.querySelector("[data-mc-tip]");
    let tipFor = null;
    const closeTip = () => { if (tipFor) tipFor.setAttribute("aria-expanded", "false"); tipFor = null; if (tip) tip.hidden = true; };
    card.querySelectorAll("[data-badge]").forEach(b => {
      b.setAttribute("aria-expanded", "false");
      b.addEventListener("click", e => {
        e.stopPropagation();
        if (tipFor === b) return closeTip();
        closeTip();
        const t = document.createElement("b");
        t.textContent = b.dataset.title || "";
        tip.replaceChildren(t, document.createTextNode(b.dataset.desc || ""));
        tip.classList.toggle("top", b.classList.contains("mc-rank"));
        tip.hidden = false;
        b.setAttribute("aria-expanded", "true");
        tipFor = b;
      });
    });
    document.addEventListener("click", () => { if (tipFor) closeTip(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeTip(); });
    const sumMore = document.querySelector("[data-sum-more]");
    if (sumMore) sumMore.addEventListener("click", () => { sumMore.closest("[data-sum]").classList.add("open"); sumMore.setAttribute("aria-expanded", "true"); });
    // 항목 설명: 줄을 누르면 펼침
    card.querySelectorAll("[data-stat]").forEach(li => {
      const flip = () => li.setAttribute("aria-expanded", li.getAttribute("aria-expanded") === "true" ? "false" : "true");
      li.addEventListener("click", flip);
      li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    });
    const opener = document.querySelector("[data-share-sheet]");
    const open = opener && setupSheet(c.s, opener);
    // 카카오톡에서 '이미지 저장'으로 넘어온 경우: 공유 창을 바로 띄웁니다.
    if (open && !IN_APP && new URLSearchParams(location.search).get("card")) {
      history.replaceState(null, "", location.pathname + location.hash); // 새로고침하면 다시 뜨지 않게
      setTimeout(open, 300);
    }
  });
})();
