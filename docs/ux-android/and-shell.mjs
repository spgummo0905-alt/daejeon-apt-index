
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root=process.argv[2]
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0].split('#')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';if(!fs.existsSync(f)){r.statusCode=404;r.end();return}const e=path.extname(f);r.setHeader('content-type',{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[e]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(0)
const base='http://localhost:'+srv.address().port+'/'
const b=await chromium.launch({executablePath:chromePath()})
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
let ok=0,bad=0; const T=(n,c,x='')=>{ if(c){ok++;console.log('통과',n)}else{bad++;console.log('실패',n,x)} }
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:UA,serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)))
const tab=t=>p.evaluate(t=>document.querySelector('.tabbar a[data-tab="'+t+'"]').click(),t).then(()=>p.waitForLoadState('load')).then(()=>p.waitForTimeout(900))
await p.goto(base+'rank.html'); await p.waitForTimeout(1200)
await p.evaluate(()=>scrollTo(0,900)); await p.waitForTimeout(400)
await tab('my'); T('다른 탭(나의 집감)으로 이동',p.url().includes('my.html'))
await p.evaluate(()=>scrollTo(0,300)); await p.waitForTimeout(400)
await tab('rank'); const y=await p.evaluate(()=>scrollY); T('탭으로 돌아오면 보던 위치(900)로 복원',Math.abs(y-900)<40,'y='+y)
// 현재 탭 다시 누르면 맨 위
await tab('rank'); await p.waitForTimeout(600); T('지금 탭을 다시 누르면 맨 위로',await p.evaluate(()=>scrollY)<5, 'y='+await p.evaluate(()=>scrollY))
T('그때 새 화면으로 이동하지 않음(같은 화면)',p.url().includes('rank.html'))
// 주소 해시가 있으면 위치 복원 안 함
await p.goto(base+'rank.html'); await p.evaluate(()=>scrollTo(0,800)); await p.waitForTimeout(400); await tab('finder')
await p.goto(base+'rank.html'); await p.waitForTimeout(900); T('주소 직접 열기(탭 아님)는 복원 안 함',await p.evaluate(()=>scrollY)<5)
// 더블탭 확대 방지·핀치 허용
const cfg=await p.evaluate(()=>({ta:getComputedStyle(document.documentElement).touchAction,vp:document.querySelector('meta[name=viewport]').content,tsa:getComputedStyle(document.documentElement).webkitTextSizeAdjust}))
T('더블탭 확대만 막고 핀치 확대는 허용(manipulation, user-scalable 없음)',cfg.ta==='manipulation'&&!/user-scalable|maximum-scale/.test(cfg.vp),JSON.stringify(cfg))
T('글자 자동 확대 고정 100%',cfg.tsa==='100%',cfg.tsa)
// 키보드: 입력칸 포커스 + visualViewport 줄어듦 흉내
await p.goto(base+'index.html?skip=1'); await p.waitForTimeout(1000)
const inp=await p.evaluate(()=>{const i=[...document.querySelectorAll('input[type=search],input[type=text]')].find(e=>e.offsetParent&&e.getBoundingClientRect().width>0);if(!i)return null;i.focus();return i.type})
if(inp){ await p.evaluate(()=>{const vv=window.visualViewport;Object.defineProperty(window,'innerHeight',{value:844,configurable:true});Object.defineProperty(vv,'height',{value:480,configurable:true});vv.dispatchEvent(new Event('resize'))}); await p.waitForTimeout(200)
  T('키보드 열림 흉내 → 하단 탭 숨김',await p.evaluate(()=>getComputedStyle(document.querySelector('.tabbar')).display==='none'))
  await p.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{value:844,configurable:true});window.visualViewport.dispatchEvent(new Event('resize'));document.activeElement.blur()}); await p.waitForTimeout(300)
  T('키보드 닫힘 → 하단 탭 다시 보임',await p.evaluate(()=>getComputedStyle(document.querySelector('.tabbar')).display!=='none'))
} else T('입력칸 찾기(찾기 화면)',false,'입력칸 없음')
T('스크립트 오류 없음',errs.length===0,JSON.stringify(errs))
console.log('합계 통과',ok,'실패',bad)
await b.close();srv.close()
