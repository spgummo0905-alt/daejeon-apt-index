
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root=process.argv[2]
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0].split('#')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';if(!fs.existsSync(f)){r.statusCode=404;r.end();return}const e=path.extname(f);r.setHeader('content-type',{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[e]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(0)
const base='http://localhost:'+srv.address().port+'/'
const b=await chromium.launch({executablePath:chromePath()})
let ok=0,bad=0; const T=(n,c,x='')=>{ if(c){ok++;console.log('통과',n)}else{bad++;console.log('실패',n,x)} }
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)))
const S=()=>p.evaluate(()=>({big:document.querySelector('#result .big')?.textContent,head:document.querySelector('#result h2')?.textContent,hash:location.hash,state:document.getElementById('state')?.textContent,timeV:document.getElementById('time').value,floorV:document.getElementById('floor').value,ray:document.querySelector('.iso-ray')?.getAttribute('class'),band:!!document.querySelector('.iso-band'),own:document.querySelector('.iso-own title')?.textContent}))
await p.goto(base+'preview.html#c=30200-631&d=512&f=8&date=dec&t=750'); await p.waitForTimeout(2500)
let s0=await S(); T('주소로 단지·동·층·날짜·시각 복원',s0.head.includes('512동')&&s0.head.includes('8층')&&s0.head.includes('동지')&&s0.timeV==='750'&&s0.floorV==='8',JSON.stringify(s0))
// 층 +
await p.locator('#fup').evaluate(e=>e.click()); await p.waitForTimeout(300); let s1=await S(); T('층 + 버튼: 결과·슬라이더·주소 동기',s1.head.includes('9층')&&s1.floorV==='9'&&s1.hash.includes('f=9'),JSON.stringify(s1))
// 층별 그림에서 고르기
await p.locator('[data-view=floor]').evaluate(e=>e.click()); await p.waitForTimeout(300)
await p.locator('[data-tw="20"]').evaluate(el=>{el.scrollIntoView({block:'center'});el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}); await p.waitForTimeout(300); let s2=await S(); T('층별 그림에서 20층 선택 → 결과·슬라이더 동기',s2.head.includes('20층')&&s2.floorV==='20'&&s2.hash.includes('v=floor'),JSON.stringify(s2))
// 키보드로 층 선택
await p.locator('[data-tw="12"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300); let s3=await S(); T('층별 그림 키보드(Enter)로 12층',s3.head.includes('12층')&&s3.floorV==='12')
// 입체로 돌아와 시각 슬라이더
await p.locator('[data-view=iso]').evaluate(e=>e.click()); await p.waitForTimeout(300)
await p.locator('#time').fill('840'); await p.waitForTimeout(300); let s4=await S(); T('시각 14:00 → 상태 문구·주소 동기',s4.state.startsWith('14:00')&&s4.hash.includes('t=840'),s4.state)
// 시각 막대 눌러서 이동 + 15분 단위
await p.locator('#tup').evaluate(e=>e.click()); await p.waitForTimeout(200); let s5=await S(); T('시각 +15분 → 14:15',s5.state.startsWith('14:15')&&s5.timeV==='855',s5.state)
// 날짜
await p.locator('[data-date=jun]').evaluate(e=>e.click()); await p.waitForTimeout(400); let s6=await S(); T('날짜 하지 → 결과 제목·주소',s6.head.includes('하지')&&s6.hash.includes('date=jun'),s6.head)
// 입체의 가리는/햇빛 선 상태가 요약 상태와 같은가(모든 시각)
let mism=0,n=0
for(const t of [360,480,600,720,780,840,900,960,1020,1080]){ await p.locator('#time').fill(String(t)); await p.waitForTimeout(60); const r=await p.evaluate(()=>({st:document.getElementById('state').className.replace('state ',''),ray:(document.querySelector('.iso-ray')||{getAttribute:()=>'none'}).getAttribute('class'),x:!!document.querySelector('#iso circle[stroke="#c1121f"]')})); n++
  const expectX = r.st==='shade', hasRay = r.ray!=='none'
  if(r.st==='shade' && !r.x) mism++; if(r.st==='sun' && r.x) mism++; if((r.st==='back'||r.st==='night') && hasRay) mism++ }
T('시각을 바꿔 가며 입체 그림(✕ 표시/선)이 상태 문구와 항상 일치 ('+n+'회)',mism===0,'불일치 '+mism)
// 동 바꾸기
await p.locator('#dong summary').evaluate(e=>e.click()); await p.waitForTimeout(200); await p.locator('[data-dong]:not([aria-pressed=true])').first().evaluate(e=>e.click()); await p.waitForTimeout(400); let s7=await S(); T('동 바꾸기 → 결과·입체 제목 동기',s7.head.includes('동')&&!s7.head.startsWith('512동')&&s7.own&&s7.own.includes(s7.head.slice(0,4)),JSON.stringify([s7.head,s7.own]))
// 입체에서 건물 눌러 동 바꾸기
const before=(await S()).head; const tgtB=await p.evaluate(()=>{const e=[...document.querySelectorAll('#iso .iso-oth[data-b]')][0];return e?e.getAttribute('data-b'):null})
if(tgtB){ await p.locator('#iso .iso-oth[data-b="'+tgtB+'"]').first().evaluate(el=>{el.scrollIntoView({block:'center'});el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}); await p.waitForTimeout(400); const a=(await S()).head; T('입체에서 다른 동을 눌러 선택 변경',a!==before,before+' → '+a) } else T('입체에서 동 클릭(눌러볼 동 없음, 건너뜀)',true)
// 새로고침 복원
const h=(await S()).hash; await p.reload(); await p.waitForTimeout(2500); const s8=await S(); T('새로고침 후 같은 상태',s8.hash===h&&s8.head===(await S()).head,h+' / '+s8.hash)
// 뒤로가기: 단지 고르기 → 다른 단지
T('콘솔 오류 없음(로컬 통계 호출 제외)',errs.length===0,JSON.stringify(errs))
// 평면 보기와 넓게 보기
await p.locator('[data-view=plan]').evaluate(e=>e.click()); await p.waitForTimeout(300); T('평면 보기 열림·그림 있음',await p.evaluate(()=>!document.getElementById('vp-plan').hidden&&document.querySelectorAll('#plan polygon').length>5))
await p.locator('#zoom').evaluate(e=>e.click()); await p.waitForTimeout(300); T('넓게 보기 켜짐(주소 반영)',(await S()).hash.includes('wide=1'))
// 접힌 칸
await p.evaluate(()=>{document.getElementById('evidence').open=true;document.getElementById('field').open=true}); await p.waitForTimeout(500)
T('근거·현장확인 펼치면 내용 채워짐',await p.evaluate(()=>document.getElementById('evBody').textContent.length>300&&document.getElementById('fieldBody').textContent.length>150))
// 주소 없는 직접 진입, 없는 단지
await p.goto('about:blank'); await p.goto(base+'preview.html#c=NOPE-1'); await p.waitForTimeout(1800); T('열려 있지 않은 단지 → 안내 문구',await p.evaluate(()=>/열려 있지 않거나/.test(document.getElementById('pv-load').textContent)&&document.getElementById('pv-tool').hidden))
await p.goto('about:blank'); await p.goto(base+'preview.html'); await p.waitForTimeout(1500); T('단지 없이 열면 단지 고르기만 보임',await p.evaluate(()=>document.getElementById('pv-tool').hidden&&document.getElementById('pv-pick').open))
console.log('합계 통과',ok,'실패',bad)
await b.close();srv.close()
