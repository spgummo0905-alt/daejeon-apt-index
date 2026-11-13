// 빌드 결과(dist)의 자바스크립트·CSS 크기를 원본/압축(gzip) 으로 출력. 성능 예산 확인용.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
const dir = new URL("../dist/assets/", import.meta.url).pathname;
let raw = 0, gz = 0;
for (const f of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f)) continue;
  const b = readFileSync(join(dir, f)); raw += b.length; gz += gzipSync(b).length;
  console.log(f.padEnd(34), (b.length / 1024).toFixed(1) + "KB", "gzip", (gzipSync(b).length / 1024).toFixed(1) + "KB");
}
console.log("합계", (raw / 1024).toFixed(1) + "KB", "gzip", (gz / 1024).toFixed(1) + "KB");
