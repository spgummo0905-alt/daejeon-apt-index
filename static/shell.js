// 앱 셸 동작 (휴대폰 하단 탭이 보이는 화면). 계산·기록은 건드리지 않는다.
//  1) 하단 탭으로 다른 화면에 갔다가 같은 탭으로 돌아오면 보던 위치로 (브라우저 '뒤로'는 원래도 위치를 기억함)
//  2) 지금 있는 탭을 다시 누르면 맨 위로 (앱에서 흔한 동작)
//  3) 키보드가 올라오면 하단 탭을 잠시 숨겨 입력칸을 가리지 않게
// 저장은 이 탭(세션)에서만: sessionStorage. 닫으면 사라진다.
(function () {
  "use strict";
  var KEY = "dj-scroll:", FLAG = "dj-tabnav";
  var norm = function (p) { return String(p || "").replace(/index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "") || "/"; };
  var me = norm(location.pathname);
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 저장 불가면 기능만 꺼짐 */ } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* */ } },
  };

  // 위치 저장 (스크롤이 멈춘 뒤 한 번)
  var t = 0;
  addEventListener("scroll", function () {
    clearTimeout(t);
    t = setTimeout(function () { store.set(KEY + me, String(Math.round(scrollY))); }, 120);
  }, { passive: true });

  // 하단 탭 누름
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".tabbar a[data-tab]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    var to; try { to = norm(new URL(a.href, location.href).pathname); } catch (err) { return; }
    if (to === me) {            // 지금 보는 탭: 맨 위로
      e.preventDefault();
      var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
      store.del(KEY + me);
      return;
    }
    store.set(KEY + me, String(Math.round(scrollY)));
    store.set(FLAG, to);
  }, true);

  // 탭으로 막 도착했으면 저장해 둔 위치로
  if (store.get(FLAG) === me && !location.hash) {
    store.del(FLAG);
    var y = parseInt(store.get(KEY + me) || "0", 10);
    if (y > 0) {
      var go = function () { scrollTo(0, y); };
      var tries = 0;
      var tick = function () {
        if (document.documentElement.scrollHeight >= y + innerHeight || tries++ > 12) go(); else setTimeout(tick, 80);
      };
      if (document.readyState === "complete") tick(); else addEventListener("load", tick, { once: true });
    }
  } else if (store.get(FLAG)) {
    store.del(FLAG);
  }

  // 키보드: 화면 높이(눈에 보이는 부분)가 크게 줄고 입력칸에 커서가 있을 때
  var vv = window.visualViewport;
  if (vv) {
    var check = function () {
      var ae = document.activeElement, typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== "range" && ae.type !== "checkbox" && ae.type !== "radio";
      var shrunk = innerHeight - vv.height > 140;
      document.documentElement.classList.toggle("kb-open", !!(typing && shrunk));
    };
    vv.addEventListener("resize", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", function () { setTimeout(check, 50); });
  }
})();
