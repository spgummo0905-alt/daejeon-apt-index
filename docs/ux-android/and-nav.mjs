
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root=process.argv[2], tag=process.argv[3], standalone=process.argv[4]==='app'
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0].split('#')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';if(!fs.existsSync(f)){r.statusCode=404;r.end();return}const e=path.extname(f);r.setHeader('content-type',{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[e]||'application/octet-stream');r.setHeader('cache-control','max-age=600');setTimeout(()=>r.end(fs.readFileSync(f)),40)}).listen(0)
const base='http://localhost:'+srv.address().port+'/'
const b=await chromium.launch({executablePath:chromePath(),args:['--enable-features=BackForwardCache']})
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const res=[]
for(let run=0;run<5;run++){
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:UA,serviceWorkers:'block'}); const p=await ctx.newPage()
 const cd=await ctx.newCDPSession(p); await cd.send('Emulation.setCPUThrottlingRate',{rate:4})
 if(standalone) await p.addInitScript(()=>{try{sessionStorage.setItem('dj-app','1')}catch(e){}})
 await p.addInitScript(()=>{window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch(e){}})
 await p.goto(base+'index.html?skip=1'); await p.waitForTimeout(1500)
 const tabs=['finder','projects','rank','my']; const row={}
 for(const t of tabs){
  const t0=Date.now()
  const nav=p.waitForEvent('framenavigated',{timeout:15000}).catch(()=>{})
  await p.evaluate(t=>document.querySelector('.tabbar a[data-tab="'+t+'"]').click(),t)
  await nav
  await p.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0,null,{timeout:15000}).catch(()=>{})
  const m=await p.evaluate(()=>({fcp:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||-1),cls:+(window.__cls||0).toFixed(3),dcl:Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)}))
  row[t]={ms:Date.now()-t0,...m}
  await p.waitForTimeout(500)
 }
 res.push(row); await ctx.close()}
const avg=k=>Math.round(res.reduce((a,r)=>a+Object.values(r).reduce((s,x)=>s+x[k],0)/4,0)/res.length)
console.log(tag,'탭 4번 이동 평균: 클릭→페이지 로드 완료',avg('ms'),'ms | 첫 그림 FCP(이동한 쪽 기준)',avg('fcp'),'ms | DOM 준비',avg('dcl'),'ms | 레이아웃 이동',(res.reduce((a,r)=>a+Object.values(r).reduce((s,x)=>s+x.cls,0)/4,0)/res.length).toFixed(3))
// 뒤로가기: 이전 화면이 즉시 복원되는가(bfcache) + 스크롤 위치
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:UA,serviceWorkers:'block'}); const p=await ctx.newPage()
await p.goto(base+'rank.html'); await p.waitForTimeout(1500); await p.evaluate(()=>scrollTo(0,900)); await p.waitForTimeout(300)
const y0=await p.evaluate(()=>scrollY)
await p.evaluate(()=>document.querySelector('.tabbar a[data-tab="my"]').click()); await p.waitForLoadState('load'); await p.waitForTimeout(800)
await p.goBack(); await p.waitForTimeout(1500)
const y1=await p.evaluate(()=>scrollY)
console.log(tag,'뒤로가기 후 스크롤 위치',y0,'→',y1)
// 탭 다시 누르기: 이전 스크롤 유지?
await p.evaluate(()=>document.querySelector('.tabbar a[data-tab="finder"]').click()); await p.waitForLoadState('load'); await p.waitForTimeout(800)
await p.evaluate(()=>scrollTo(0,700)); await p.waitForTimeout(300)
await p.evaluate(()=>document.querySelector('.tabbar a[data-tab="my"]').click()); await p.waitForLoadState('load'); await p.waitForTimeout(800)
await p.evaluate(()=>document.querySelector('.tabbar a[data-tab="finder"]').click()); await p.waitForLoadState('load'); await p.waitForTimeout(1500)
console.log(tag,'다른 탭 갔다가 찾기 탭을 다시 눌렀을 때 스크롤',700,'→',await p.evaluate(()=>scrollY))
await b.close();srv.close()
