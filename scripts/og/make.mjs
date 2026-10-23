// 링크 미리보기 이미지(1200×630)를 지역마다 만듭니다: static/og/{daejeon,sejong,seoul}.jpg
// 준비: 이 폴더에 Pretendard 글꼴(PretendardVariable.ttf, npm 의 pretendard 패키지 dist/public/variable/)을 두고
//   npm i playwright && node scripts/og/make.mjs
// 그다음 PNG 를 JPG(품질 88)로 바꿔 static/og/ 에 넣습니다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [r, f] of [['대전', 'daejeon'], ['세종', 'sejong'], ['서울', 'seoul']]) {
  await p.goto('file://' + path.join(dir, 'og.html') + '?r=' + encodeURIComponent(r));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(dir, `og-${f}.png`) });
}
await b.close();
