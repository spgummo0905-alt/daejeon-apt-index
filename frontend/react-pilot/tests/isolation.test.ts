// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] => readdirSync(d).flatMap((f: string) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const ROOT = process.cwd();   // 시험은 파일럿 폴더(frontend/react-pilot)에서 실행
const SRC = walk(join(ROOT, "src")).filter(f => /\.(ts|tsx)$/.test(f));
// 설명 주석은 빼고 실제 코드만 검사(주석에 규칙 설명이 있어도 걸리지 않게)
export const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const all = SRC.map(f => [f, stripComments(readFileSync(f, "utf8"))] as const);

describe("pilot isolation (R1 rules)", () => {
  it("never reads or writes browser storage, cookies, IndexedDB or the network", () => {
    const banned = /localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|DJ\.|window\.DJ|supabase/i;
    for (const [f, t] of all) expect(banned.test(t), f).toBe(false);
  });
  it("does not register a service worker or touch production paths", () => {
    for (const [f, t] of all) {
      expect(/serviceWorker/.test(t), f).toBe(false);
      expect(/\.\.\/\.\.\/\.\.\/(static|templates|djdex)/.test(t), f).toBe(false);
    }
  });
  it("uses no hex colors outside the approved tokens", () => {
    const ok = new Set(["#0F3D33", "#F7F4EC", "#0B1F1A", "#13795b", "#6fd1ae", "#aeada3", "#b8912f", "#8b95a7", "#2f6fb8", "#66738a", "#b9c0ca"].map(s => s.toLowerCase()));
    for (const [f, t] of all.filter(([f]) => !f.endsWith("tokens.ts"))) {
      for (const m of t.match(/#[0-9a-fA-F]{6}\b/g) ?? []) expect(ok.has(m.toLowerCase()), f + " " + m).toBe(true);
    }
  });
  it("index.html blocks search engines", () => {
    const h = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(h).toContain("noindex");
  });

  it("the check itself catches real storage/network code (guard against a blind test)", () => {
    const banned = /localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|DJ\.|window\.DJ|supabase/i;
    for (const bad of ['localStorage.setItem("a","b")', 'fetch("/x")', 'window.DJ.save("k", 1)', 'document.cookie = "a=1"'])
      expect(banned.test(stripComments(bad))).toBe(true);
    expect(banned.test(stripComments("// localStorage 는 쓰지 않음\n/* fetch( 금지 */ const a = 1;"))).toBe(false);
  });
});
