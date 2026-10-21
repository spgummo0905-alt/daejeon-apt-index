// 단지 이미지 만들기: 단지 페이지를 옮긴 화면형과 수집 카드(5:7) 모양 카드형 PNG를 브라우저에서 그려
// 미리보기 → 저장·공유.
// 서버로 아무것도 보내지 않습니다.
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

  // ---------- 화면형: 단지 페이지 첫 화면을 옮긴 세로 이미지 (사람들이 캡처해 돌리는 모양) ----------
  const SW = 540, SS = 2; // 화면 폭 540에 2배로 그려 1080px

  function palette() {
    const dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    const css = getComputedStyle(document.documentElement);
    const v = (k, fb) => (css.getPropertyValue(k) || "").trim() || fb;
    return {
      dark,
      bg: dark ? "#111110" : "#f4f3ef", surface: dark ? "#1d1d1b" : "#ffffff",
      border: dark ? "rgba(255,255,255,.10)" : "rgba(11,11,11,.10)",
      text: dark ? "#f0efec" : "#14171f", text2: dark ? "#c3c2b7" : "#52514e", muted: dark ? "#9a998f" : "#75736d",
      track: dark ? "#2a2a27" : "#efeee9", bar: dark ? "#3987e5" : "#2a78d6",
      pos: dark ? "#fb923c" : "#c2410c", neg: dark ? "#7aa7ff" : "#1d4ed8", high: "#d93f3e",
      grade: g => v("--g-" + g, "#6d7a8c"), gradeInk: g => v("--g-" + g + "-ink", "#ffffff"),
    };
  }

  // 단지 페이지에서 글자로 이미 보이는 값들(주소 줄, 순위, 최근 거래)을 그대로 가져옵니다.
  function pageInfo() {
    const q = sel => document.querySelector(sel);
    const text = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
    const trades = [];
    document.querySelectorAll(".rd-list li").forEach(li => trades.push({
      date: text(li.querySelector(".rd-date")), spec: text(li.querySelector(".rd-spec")),
      high: !!li.querySelector(".badge-high"), tag: text(li.querySelector(".rd-tag")),
      price: text(li.querySelector(".rd-price")), struck: li.classList.contains("struck"),
    }));
    if (!trades.length) {
      document.querySelectorAll("table.trades tbody tr").forEach(tr => {
        const td = tr.querySelectorAll("td");
        if (td.length < 4) return;
        trades.push({ date: text(td[0]).slice(2), spec: text(td[1]).replace(/\.\d+㎡/, "㎡") + (text(td[2]) !== "-" ? " · " + text(td[2]) + "층" : ""),
                      high: false, tag: text(td[4]), price: text(td[3]), struck: tr.classList.contains("struck") });
      });
    }
    return { sub: text(q(".apt-head .apt-title .muted")), rank: text(q(".gauge-box > .muted")), trades: trades.slice(0, 4) };
  }

  function wrap(ctx, text, maxW, maxLines) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const keep = lines.slice(0, maxLines);
      let last = keep[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
      keep[maxLines - 1] = last + "…";
      return keep;
    }
    return lines;
  }

  function drawScreen(c, data) {
    const P = palette(), info = pageInfo();
    const pad = 26, inner = SW - pad * 2;
    const meas = document.createElement("canvas").getContext("2d");
    meas.font = `800 25px ${FONT}`;
    const nameLines = wrap(meas, c.n, inner - 74, 2);
    const stats = data.stats || [];
    const tradesH = info.trades.length ? 58 + info.trades.length * 40 : 0;
    const H2 = Math.round(84 + 30 + Math.max(60, nameLines.length * 33 + 26) + 4 + 160 + 22 + (92 + stats.length * 34 + 44) + (tradesH ? 18 + tradesH : 0) + 78);
    const cv = document.createElement("canvas");
    cv.width = SW * SS; cv.height = H2 * SS;
    const ctx = cv.getContext("2d");
    ctx.scale(SS, SS);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, SW, H2);
    ctx.textBaseline = "alphabetic";
    const T = (str, x, y, font, color, align) => { ctx.font = `${font} ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.fillText(str, x, y); };
    const badge = (x, y, size, g, radius, fs) => {
      rr(ctx, x, y, size, size, radius); ctx.fillStyle = P.grade(g); ctx.fill();
      T(g === "-" ? "?" : g, x + size / 2, y + size / 2 + fs * 0.36, `900 ${fs}px`, P.gradeInk(g), "center");
    };

    // 머리: 사이트 이름, 기준일
    let y = 30;
    rr(ctx, pad, y, 30, 30, 9); ctx.fillStyle = grad(ctx, pad, y, pad + 30, y + 30, ["#2a78d6", "#13294b"]); ctx.fill();
    T("D", pad + 15, y + 21, "900 16px", "#ffffff", "center");
    T((data.region || "") + " 아파트 지수", pad + 42, y + 21, "800 18px", P.text);
    T((data.updated || data.asof || "") + " 기준", SW - pad, y + 20, "600 12px", P.muted, "right");
    y += 30 + 24;

    // 주소와 이름
    T(DJ.place(c), pad, y + 14, "600 13px", P.muted);
    y += 30;
    badge(pad, y, 60, c.g, 15, 30);
    nameLines.forEach((ln, k) => T(ln, pad + 74, y + 26 + k * 33, "800 25px", P.text));
    ctx.font = `500 13px ${FONT}`;
    T(fitText(ctx, info.sub, inner - 74, 13, 500), pad + 74, y + 26 + (nameLines.length - 1) * 33 + 26, "500 13px", P.muted);
    y += Math.max(60, nameLines.length * 33 + 26) + 4;

    // 게이지 + 핵심 숫자
    const gx = pad + 86, gy = y + 102, gr = 74;
    ctx.lineCap = "round"; ctx.lineWidth = 15;
    ctx.strokeStyle = P.track; ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI, 0); ctx.stroke();
    if (c.i != null) {
      ctx.strokeStyle = P.grade(c.g);
      ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI, Math.PI + Math.PI * Math.max(0.01, Math.min(1, c.i / 100))); ctx.stroke();
    }
    T(c.i == null ? "-" : String(c.i), gx, gy - 12, "900 46px", P.text, "center");
    T("/ 100", gx, gy + 8, "600 12px", P.muted, "center");
    T(info.rank, gx, gy + 40, "600 13px", P.text2, "center");
    const facts = [
      ["84㎡ 환산가", c.pt || "-", P.text],
      ["10년 연평균", c.c10 == null ? "-" : (c.c10 > 0 ? "+" : "") + c.c10 + "%", c.c10 > 0 ? P.pos : c.c10 < 0 ? P.neg : P.text],
      ["최근 거래", c.lp ? c.lp + (c.ld ? " · " + c.ld.slice(2) : "") : "-", P.text],
    ];
    const fx = pad + 200;
    facts.forEach(([k, val, color], i) => {
      const fy = y + 30 + i * 46;
      T(k, fx, fy, "600 12px", P.muted);
      ctx.font = `800 19px ${FONT}`;
      T(fitText(ctx, val, SW - pad - fx, 19, 800), fx, fy + 22, "800 19px", color);
    });
    y += 160 + 22;

    // 항목별 점수 카드
    const ch = 92 + stats.length * 34 + 44;
    rr(ctx, pad, y, inner, ch, 22); ctx.fillStyle = P.surface; ctx.fill();
    ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; ctx.stroke();
    badge(pad + 20, y + 20, 48, c.g, 12, 24);
    ctx.font = `800 17px ${FONT}`;
    T(fitText(ctx, c.n, inner - 170, 17, 800), pad + 80, y + 40, "800 17px", P.text);
    T((TIER[c.g] || TIER.D).name + " 등급 · 항목별 점수 (" + (data.region || "") + " 단지 중 백분위)", pad + 80, y + 60, "500 11.5px", P.muted);
    T(c.i == null ? "-" : String(c.i), SW - pad - 20, y + 58, "900 38px", P.bar, "right");
    let sy = y + 104;
    stats.forEach((st, k) => {
      const val = c.st[k];
      T(st.n, pad + 22, sy, "700 14px", P.text);
      const bx = pad + 100, bw = inner - 100 - 64, top = sy - 10;
      rr(ctx, bx, top, bw, 9, 4.5); ctx.fillStyle = P.track; ctx.fill();
      if (val != null) { rr(ctx, bx, top, Math.max(9, bw * val / 100), 9, 4.5); ctx.fillStyle = P.bar; ctx.fill(); }
      T(val == null ? "-" : String(val), SW - pad - 22, sy + 1, "800 15px", P.text, "right");
      sy += 34;
    });
    T(DJ.place(c) + (c.y ? " · " + c.y + "년" : ""), pad + 22, y + ch - 22, "500 13px", P.text2);
    T("84㎡ " + (c.pt || "-"), SW - pad - 22, y + ch - 22, "600 13px", P.text2, "right");
    y += ch;

    // 최근 실거래
    if (tradesH) {
      y += 18;
      rr(ctx, pad, y, inner, tradesH, 22); ctx.fillStyle = P.surface; ctx.fill();
      ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; ctx.stroke();
      T("최근 실거래", pad + 20, y + 34, "800 16px", P.text);
      info.trades.forEach((t, k) => {
        const ry = y + 70 + k * 40;
        if (k) { ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad + 20, ry - 25); ctx.lineTo(SW - pad - 20, ry - 25); ctx.stroke(); }
        T(t.date, pad + 20, ry, "500 13.5px", P.muted);
        T(t.spec, pad + 96, ry, "600 13.5px", t.struck ? P.muted : P.text);
        let px = SW - pad - 20;
        ctx.font = `800 16px ${FONT}`;
        T(t.price, px, ry + 1, "800 16px", t.struck ? P.muted : P.text, "right");
        px -= ctx.measureText(t.price).width + 10;
        const tag = t.high ? "신고가" : t.tag;
        if (tag) {
          ctx.font = `700 11px ${FONT}`;
          const tw = ctx.measureText(tag).width + 14;
          rr(ctx, px - tw, ry - 15, tw, 20, 10); ctx.fillStyle = t.high ? P.high : P.track; ctx.fill();
          T(tag, px - tw / 2, ry - 1, "700 11px", t.high ? "#ffffff" : P.text2, "center");
        }
      });
      y += tradesH;
    }

    // 바닥: 주소와 안내
    const fy = H2 - 30;
    const url = (data.url || location.origin + location.pathname.replace(/apt\/.*$/, "")).replace(/^https?:\/\//, "").replace(/\/$/, "");
    T(url, pad, fy, "700 12.5px", P.text2);
    T("국토부 실거래 기준 · 참고용", SW - pad, fy, "500 12px", P.muted, "right");
    return cv;
  }

  // ---------- 미리보기 창 ----------
  // 카카오톡·네이버 앱 같은 앱 안 브라우저는 내려받기(blob 주소)를 처리하지 못해 '지원하지 않는 형식'이 뜹니다.
  // 카카오톡은 기본 브라우저로 이 페이지를 다시 열고(?card=1 이면 카드 창을 바로 띄움), 다른 앱은 안내만 합니다.
  const UA = navigator.userAgent || "";
  const KAKAO = /KAKAOTALK/i.test(UA);
  const IN_APP = KAKAO || /NAVER\(inapp|Instagram|FBAN|FBAV|\bLine\/|DaumApps|everytimeApp|; wv\)/i.test(UA);
  function externalUrl(mode) {
    const u = new URL(location.href);
    u.hash = "";
    u.searchParams.set("card", mode);
    return "kakaotalk://web/openExternal?url=" + encodeURIComponent(u.toString());
  }

  const MODES = [["screen", "화면형", "단지화면"], ["card", "카드형", "단지카드"]];

  async function render(mode, c, data) {
    const cv = mode === "card" ? draw(c, data) : drawScreen(c, data);
    const blob = await new Promise(res => cv.toBlob(res, "image/png"));
    return { blob, url: URL.createObjectURL(blob) };
  }

  async function modal(c, data, mode) {
    const { el } = DJ;
    const back = el("div", "card-modal");
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-label", c.n + " 이미지로 저장");
    const box = el("div", "card-modal-box");
    const tabs = el("div", "shot-tabs");
    tabs.setAttribute("role", "tablist");
    const shot = el("div", "card-shot");
    const img = new Image();
    shot.append(img);
    const actions = el("div", "row-actions center-actions");
    const save = el("a", "btn primary");
    actions.append(save);
    const sh = el("button", "btn", "카카오톡 등으로 보내기");
    sh.type = "button";
    const close = el("button", "btn", "닫기"); close.type = "button";
    const hint = el("p", "muted small center", KAKAO
      ? "카카오톡 안에서는 이미지를 내려받을 수 없어 기본 브라우저로 이 페이지를 열어 드립니다. 열리면 저장 창이 바로 뜹니다."
      : IN_APP
        ? "앱 안 브라우저에서는 저장이 안 될 수 있습니다. 오른쪽 위 메뉴에서 '다른 브라우저로 열기'를 누른 뒤 저장해 주세요."
        : "휴대폰에서 저장이 안 되면 이미지를 길게 눌러 '사진에 저장'을 고르세요.");
    box.append(tabs, shot, actions, hint);
    back.append(box);
    let cur = null, file = null;

    async function show(m) {
      tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.mode === m ? "true" : "false"));
      shot.className = "card-shot " + (m === "card" ? "g-" + c.g : "screen");
      if (m === "card") shot.setAttribute("data-holo", ""); else shot.removeAttribute("data-holo");
      const next = await render(m, c, data);
      if (cur) URL.revokeObjectURL(cur.url);
      cur = next;
      const label = MODES.find(x => x[0] === m);
      img.src = cur.url; img.alt = c.n + " " + label[1] + " 이미지";
      file = c.n.replace(/[\\/:*?"<>|\s]+/g, "_") + "_" + label[2] + ".png";
      if (KAKAO) { save.textContent = "브라우저에서 열어 저장"; save.href = externalUrl(m); save.removeAttribute("download"); }
      else { save.textContent = "이미지 저장"; save.href = cur.url; save.download = file; }
      const f = new File([cur.blob], file, { type: "image/png" });
      sh.hidden = !(navigator.canShare && navigator.canShare({ files: [f] }));
      sh.onclick = () => navigator.share({ files: [f], title: c.n }).catch(() => {});
    }
    MODES.forEach(([m, label]) => {
      const b = el("button", "shot-tab", label);
      b.type = "button"; b.dataset.mode = m; b.setAttribute("role", "tab");
      b.addEventListener("click", () => show(m));
      tabs.append(b);
    });
    actions.append(sh, close);
    function done() { back.remove(); if (cur) URL.revokeObjectURL(cur.url); document.removeEventListener("keydown", esc); }
    function esc(e) { if (e.key === "Escape") done(); }
    close.addEventListener("click", done);
    back.addEventListener("click", e => { if (e.target === back) done(); });
    document.addEventListener("keydown", esc);
    document.body.append(back);
    await show(mode);
    save.focus();
  }

  DJ.drawCard = draw; // 테스트·다른 페이지에서 쓰도록

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector("[data-card-download]");
    const apt = document.querySelector("[data-apt]");
    if (!btn || !apt) return;
    // 카카오톡에서 '브라우저에서 열어 저장'으로 넘어온 경우: 저장 창을 그 모양으로 바로 띄웁니다.
    let mode = "screen";
    const asked = new URLSearchParams(location.search).get("card");
    if (!IN_APP && asked) {
      mode = asked === "card" ? "card" : "screen";
      history.replaceState(null, "", location.pathname + location.hash); // 새로고침하면 다시 뜨지 않게
      setTimeout(() => btn.click(), 300);
    }
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const [data] = await Promise.all([DJ.data(), document.fonts ? document.fonts.ready : null]);
        const c = data.bySlug[apt.dataset.apt];
        if (!c) { DJ.toast("이미지를 만들 수 없습니다", "이 단지는 점수 정보가 없습니다"); return; }
        await modal(c, data, mode);
        mode = "screen";
      } catch (e) {
        DJ.toast("이미지를 만들지 못했습니다", "잠시 후 다시 눌러 주세요");
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
