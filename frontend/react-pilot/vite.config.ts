import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 운영 사이트와 완전히 분리된 파일럿 빌드. 결과물은 이 폴더의 dist/ 에만 생기고 운영 배포(Pages)에는 포함되지 않습니다.
// base "./" : 어느 경로에 올려도(비공개 /lab 등) 상대 경로로 동작.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"], setupFiles: ["tests/setup.ts"] },
});
