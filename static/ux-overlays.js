// UX v2 공통 시트·메뉴 (PR 01). 시트 = 진짜 <dialog>(showModal): 뒷배경 자동 비활성(inert), Esc, 포커스 가둠, 닫으면 눌렀던 곳으로 포커스 복귀.
// 메뉴 = 적은 선택지(정렬·보기)를 누른 자리에 여는 작은 메뉴. 복합 입력·근거는 시트. 한 번에 하나만 열리고, 기존 팝업(지역·검색·내 기록·최근 본)과 겹치지 않게 먼저 닫습니다.
(function () {
  "use strict";
  const DJ = window.DJ;
  if (!DJ || DJ.sheet) return;
  const el = DJ.el || ((t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; });
  const calm = () => !!DJ.calm;
  const MS = (DJ.motion && DJ.motion.sheet) || 300;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  // 이미 열려 있는 기존 팝업을 닫고 눌렀던 단추의 aria-expanded 도 되돌림
  function closeLegacyPopups() {
    ["rg-pop", "hs-pop", "acct-pop", "rcd-pop"].forEach(id => {
      const p = document.getElementById(id);
      if (!p || p.hidden) return;
      p.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (!p.hidden) p.hidden = true;
      document.querySelectorAll('[aria-controls="' + id + '"]').forEach(b => b.setAttribute("aria-expanded", "false"));
    });
  }

  // ---------- 시트 ----------
  let cur = null, uid = 0;
  const sheet = {
    // opts: { title, content(Node|string), onClose(reason), returnFocus(Element), label(선택, 닫기 단추 이름) }
    open(opts) {
      opts = opts || {};
      if (cur) cur.close("replace", true);
      menu.close(true);
      closeLegacyPopups();
      const trigger = opts.returnFocus || document.activeElement;
      const d = el("dialog", "ux-sheet"), tid = "ux-sheet-t" + (++uid);
      d.setAttribute("aria-labelledby", tid);
      const head = el("div", "ux-sheet-head");
      const h = el("h2", "", opts.title || "알림"); h.id = tid;
      const x = el("button", "ux-sheet-x"); x.type = "button"; x.setAttribute("aria-label", opts.label || "닫기"); x.textContent = "✕";
      head.append(h, x);
      const body = el("div", "ux-sheet-body");
      if (opts.content instanceof Node) body.append(opts.content); else if (opts.content != null) body.textContent = String(opts.content);
      d.append(el("span", "ux-sheet-grab"), head, body);
      document.body.append(d);
      document.documentElement.classList.add("ux-lock");
      if (d.showModal) d.showModal(); else { d.setAttribute("open", ""); d.setAttribute("aria-modal", "true"); }
      requestAnimationFrame(() => d.classList.add("on"));
      let done = false;
      const api = {
        el: d, body,
        close(reason, instant) {
          if (done) return; done = true; cur = null;
          const finish = () => {
            if (d.close) { try { d.close(); } catch (e) { /* 이미 닫힘 */ } }
            d.remove();
            document.documentElement.classList.remove("ux-lock");
            if (trigger && trigger.isConnected && trigger.focus && reason !== "replace") trigger.focus({ preventScroll: true });   // 닫으면 누르던 곳으로 돌아감
            if (opts.onClose) opts.onClose(reason || "close");
          };
          d.classList.remove("on");
          if (instant || calm()) finish(); else setTimeout(finish, MS);
        },
      };
      x.addEventListener("click", () => api.close("button"));
      d.addEventListener("cancel", e => { e.preventDefault(); api.close("esc"); });             // Esc
      d.addEventListener("click", e => { if (e.target === d) api.close("backdrop"); });          // 바깥(배경) 누르기
      // Tab·Shift+Tab 은 시트 안에서만 돎 (브라우저 주소창으로 새지 않게)
      d.addEventListener("keydown", e => {
        if (e.key !== "Tab") return;
        const f = [...d.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null || n === document.activeElement);
        if (!f.length) { e.preventDefault(); return; }
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === a || !d.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && (document.activeElement === z || !d.contains(document.activeElement))) { e.preventDefault(); a.focus(); }
      });
      const first = body.querySelector("[autofocus]") || body.querySelector(FOCUSABLE) || x;
      first.focus({ preventScroll: true });
      cur = api;
      return api;
    },
    close(reason) { if (cur) cur.close(reason || "api"); },
    get isOpen() { return !!cur; },
  };

  // ---------- 맥락 메뉴 ----------
  let mcur = null;
  const menu = {
    // items: [{ label, value, selected }], opts: { onPick(value, item), label(메뉴 이름) }
    open(anchor, items, opts) {
      opts = opts || {};
      if (mcur && mcur.anchor === anchor) { menu.close(); return null; }   // 같은 단추를 다시 누르면 닫기
      menu.close(true);
      if (cur) cur.close("replace", true);
      closeLegacyPopups();
      const m = el("div", "ux-menu"); m.setAttribute("role", "menu");
      if (opts.label) m.setAttribute("aria-label", opts.label);
      const btns = items.map(it => {
        const b = el("button", "ux-menu-item"); b.type = "button"; b.setAttribute("role", "menuitemradio");
        b.setAttribute("aria-checked", String(!!it.selected)); b.dataset.value = it.value;
        b.append(el("span", "", it.label), el("i", "ux-menu-check", it.selected ? "✓" : ""));
        b.addEventListener("click", () => { menu.close(true); anchor.focus({ preventScroll: true }); if (opts.onPick) opts.onPick(it.value, it); });
        m.append(b); return b;
      });
      document.body.append(m);
      anchor.setAttribute("aria-haspopup", "menu"); anchor.setAttribute("aria-expanded", "true");
      // 누른 자리 바로 아래(공간이 모자라면 위)에, 화면 가장자리 8px 안쪽으로
      m.style.minWidth = Math.max(160, Math.round(anchor.getBoundingClientRect().width)) + "px";
      const place = () => {
        const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight, w = m.offsetWidth, h = m.offsetHeight;
        if (r.bottom < 0 || r.top > vh) return false;                       // 누른 버튼이 화면 밖으로 나가면 닫음
        m.style.left = Math.max(8, Math.min(vw - w - 8, r.left)) + "px";
        m.style.top = (r.bottom + 6 + h > vh - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6) + "px";
        return true;
      };
      place();
      requestAnimationFrame(() => m.classList.add("on"));
      const off = e => { if (!m.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) menu.close(); };
      const key = e => {
        const i = btns.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); menu.close(true); anchor.focus({ preventScroll: true }); }
        else if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
        else if (e.key === "Home") { e.preventDefault(); btns[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); btns[btns.length - 1].focus(); }
        else if (e.key === "Tab") menu.close(true);
      };
      document.addEventListener("pointerdown", off, true);
      m.addEventListener("keydown", key);
      mcur = { anchor, el: m, off, place };
      (btns.find(b => b.getAttribute("aria-checked") === "true") || btns[0]).focus({ preventScroll: true });
      return m;
    },
    close() {
      if (!mcur) return;
      document.removeEventListener("pointerdown", mcur.off, true);
      mcur.anchor.setAttribute("aria-expanded", "false");
      mcur.el.remove(); mcur = null;
    },
    get isOpen() { return !!mcur; },
  };
  // 스크롤·크기 변경: 메뉴는 누른 버튼을 따라가고, 버튼이 화면 밖으로 나가면 닫음 (부드러운 스크롤 도중 열려도 바로 닫히지 않게)
  const follow = () => { if (mcur && !mcur.place()) menu.close(); };
  addEventListener("resize", follow);
  addEventListener("scroll", follow, { passive: true });

  DJ.sheet = sheet; DJ.menu = menu;
})();
