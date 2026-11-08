// 일조 3D 시제품 묶기: node build.mjs  → ../../static/preview-gl.js (직접 고치지 말고 src/gl.js 를 고친다)
import { build } from 'esbuild'
await build({ entryPoints: ['src/gl.js'], bundle: true, minify: true, format: 'iife', target: ['es2019'], outfile: '../../static/preview-gl.js', legalComments: 'none',
  banner: { js: '/* 집감 일조 3D 시제품(WebGL). three.js r187 (MIT, https://threejs.org) 포함. scripts/gl 에서 만든 파일 - 직접 고치지 마세요. */' } })
console.log('ok')
