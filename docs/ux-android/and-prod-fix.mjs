
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import fs from 'node:fs'
const css=fs.readFileSync(process.argv[2],'utf8')
const b=await chromium.launch({executablePath:chromePath()})
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const apts=['daejeon/apt/30200-631.html','daejeon/apt/30140-1.html','sejong/apt/36110-421.html','cheongju/apt/'+process.argv[3]+'.html']
for(const patched of [false,true]){ let bad=0,n=0,list=[]
 for(const w of [360,390,430]){ const ctx=await b.newContext({viewport:{width:w,height:800},isMobile:true,hasTouch:true,userAgent:UA}); const p=await ctx.newPage()
  if(patched) await p.route(/\/static\/style\.css/,r=>r.fulfill({status:200,contentType:'text/css',body:css}))
  for(const pg of apts){ await p.goto('https://www.jipgam.kr/'+pg).catch(()=>{}); await p.waitForTimeout(1500); const r=await p.evaluate(()=>({W:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth})); n++; if(r.sw>r.W+1){bad++;list.push(w+' '+pg.split('/').pop()+' '+r.sw+'>'+r.W)} }
  await ctx.close()}
 console.log(patched?'고친 CSS 적용:':'지금 운영:', '검사',n,'넘침',bad,list.join(' | ')) }
await b.close()
