
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root=process.argv[2], STATE=process.argv[3]||'C'
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';if(!fs.existsSync(f)){r.statusCode=404;r.end();return}const e=path.extname(f);r.setHeader('content-type',{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[e]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(0)
const base='http://localhost:'+srv.address().port+'/'
const b=await chromium.launch({executablePath:chromePath()})
const iso=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
const P=(pl)=>JSON.stringify({version:1,id:'p1',name:'우리집 후보',goal:'역세권',region:'대전',slugs:['DEMO-0001','DEMO-0002','DEMO-0003'],archived:false,created:1,updated:2,planned:pl})
const V=(slug)=>JSON.stringify({version:1,id:'v-'+slug,region:'대전',slug,projectId:'p1',date:iso(-1),period:'',memo:'다녀옴',created:Date.now(),checks:null})
const seed={A:{},B:{'djdex:survey':JSON.stringify({step:2,budget:60000,bmode:'total'})},
 C:{'djdex:project:p1':P(iso(3)),'djdex:favs':'["DEMO-0001","DEMO-0002"]'},
 D1:{'djdex:project:p1':P(''),'djdex:favs':'["DEMO-0001"]','djdex:visitlog:v-DEMO-0001':V('DEMO-0001')},
 D2:{'djdex:favs':'["DEMO-0001"]','djdex:visitlog:v-DEMO-0001':JSON.stringify({version:1,id:'v-DEMO-0001',region:'대전',slug:'DEMO-0001',projectId:'',date:iso(-1),period:'',memo:'다녀옴',created:Date.now(),checks:null})}}[STATE]
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
await ctx.addInitScript(([s,st])=>{ if(!sessionStorage.getItem('__seeded')){ for(const k in s) localStorage.setItem(k,s[k]); sessionStorage.setItem('__seeded','1') } window.__printed=0; window.print=()=>{window.__printed++}; window.open=(u)=>{window.__opened=u;return null} },[seed,STATE])
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,80))); p.on('dialog',d=>d.accept())
let clicks=0,navs=0; p.on('framenavigated',f=>{if(f===p.mainFrame())navs++})
const tap=async(loc,label)=>{ try{ await loc.first().click({timeout:4000}); clicks++; await p.waitForTimeout(500); return true }catch(e){ results.push({경로:cur,단계:label,결과:'못 누름',이유:String(e.message).split('\n')[0].slice(0,80)}); return false } }
const results=[]; let cur=''
const path_=async(name,fn)=>{ cur=name; const c0=clicks,n0=navs,t0=Date.now(); let ok=false,note=''; try{ const r=await fn(); ok=r&&r.ok; note=(r&&r.note)||'' }catch(e){ note='예외: '+String(e.message).split('\n')[0].slice(0,90) } results.push({경로:name,달성:ok?'예':'아니오',클릭:clicks-c0,화면이동:navs-n0,초:+((Date.now()-t0)/1000).toFixed(1),메모:note}) }
const stored=()=>p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('djdex'))o[k.replace(/^djdex[:@\w-]*:/,'')]=localStorage.getItem(k).length}return o})

// (1) 인트로/지역 → 홈
await path_('1 인트로·지역→홈',async()=>{ await p.goto(base+'index.html'); await p.waitForTimeout(1500); const u=p.url().split('/').pop().split('?')[0]
  if(/intro/.test(u)){ const ok=await tap(p.locator('a.gate-btn, .intro-cta a, a:has-text("궁금한 아파트 찾기")'),'궁금한 아파트 찾기'); await p.waitForTimeout(900); return {ok:ok&&!/intro/.test(p.url()),note:'인트로(처음 온 사람) → 시작 버튼 → '+p.url().split('/').pop().slice(0,24)} }
  return {ok:/index|\/$/.test(p.url()),note:'인트로 없이 바로 홈(기록 있는 사람)'} })
// (2a) 검색
await path_('2a 검색→상세',async()=>{ await p.goto(base+'index.html?stay'); await p.waitForTimeout(1000); const inp=p.locator('.hero-search input:visible').first(); await inp.fill('데모단지 02'); clicks++; await p.waitForTimeout(700)
  const hit=p.locator('.ac-wrap a, .ac-list a, [role=option], .ac-item').first(); const n=await hit.count(); if(!n) return {ok:false,note:'자동완성 결과가 안 보임'}
  await tap(hit,'검색 결과'); await p.waitForTimeout(1200); return {ok:/apt\/DEMO/.test(p.url()),note:p.url().split('/').pop()} })
// (2b) 조건으로 찾기
await path_('2b 조건찾기→결과',async()=>{ await p.goto(base+'finder.html?stay'); await p.waitForTimeout(1500); let q=0
  for(let g=0;g<12;g++){ const label=(await p.locator('[data-sv-next]').innerText()).trim(); const stepTxt=(await p.locator('[data-sv-q]').innerText()).slice(0,12); q++
    if(/질문 2/.test(stepTxt)){ const o=p.locator('[data-sv-q] button.sv-opt').first(); if(await o.count()) await tap(o,'지역 선택') }
    await tap(p.locator('[data-sv-next]'),'다음'); if(label==='결과 보기') break }
  await p.waitForTimeout(900); const info=await p.evaluate(()=>({n:document.querySelector('[data-sv-n]')?.textContent,cards:[...document.querySelectorAll('#results a')].filter(a=>/apt\//.test(a.getAttribute('href')||'')).length,none:/아직 선택한 조건이 없/.test(document.getElementById('results').innerText)}))
  return {ok:info.cards>0,note:`질문 ${q}단계 · 결과 ${info.n}곳 · 카드 ${info.cards}개`+(info.none?' · 조건 없음 안내':'')} })
// (3) 상세: 가격·면적·근거
await path_('3 상세 이해',async()=>{ await p.goto(base+'apt/DEMO-0001.html?stay'); await p.waitForTimeout(1500); const t=await p.evaluate(()=>({real:!!document.querySelector('.pb-real strong'),est:!!document.querySelector('.pb-est'),area:!!document.querySelector('.pb-area'),asof:!!document.querySelector('.pb-asof'),h1:document.querySelectorAll('h1').length}));
  return {ok:t.real&&t.est&&t.area&&t.asof&&t.h1===1,note:JSON.stringify(t)} })
// (4) 관심 저장·비교
await path_('4 관심저장→비교',async()=>{ await p.goto(base+'apt/DEMO-0003.html?stay'); await p.waitForTimeout(1200); const before=await p.locator('[data-fav]').first().getAttribute('aria-pressed'); await tap(p.locator('[data-fav]'),'관심'); const after=await p.locator('[data-fav]').first().getAttribute('aria-pressed')
  await tap(p.locator('a.icon-btn').filter({hasText:'비교'}),'비교'); await p.waitForTimeout(1500); const cols=await p.locator('#cmp-table th, .cmp-col, [data-cmp-col], table thead th').count(); return {ok:after==='true'&&/compare/.test(p.url()),note:`관심 ${before}→${after}, 비교 화면 ${p.url().split('/').pop().slice(0,40)}, 열 ${cols}`} })
// (5) 프로젝트 후보 추가·예정일
await path_('5 프로젝트 후보·예정일',async()=>{ await p.goto(base+'projects.html?stay'); await p.waitForTimeout(1800)
  if(!(await p.locator('[data-pj-title]:visible').count())){ const nm=p.locator('[data-pj-create] input:visible').first(); if(await nm.count()){ await nm.fill('시험 프로젝트'); clicks++; await tap(p.locator('[data-pj-create] button[type=submit]:visible'),'프로젝트 만들기'); await p.waitForTimeout(800) } }
  const more=p.locator('summary').filter({hasText:'후보 더 찾기'}).first(); if(await more.count()&&!(await p.locator('#pj-search:visible').count())) await tap(more,'후보 더 찾기 펼치기')
  const inp=p.locator('#pj-search:visible').first(); let added='검색칸 안 보임'
  if(await inp.count()){ await inp.fill('데모단지 05'); clicks++; await p.waitForTimeout(700); const add=p.locator('[data-pj-results] button:visible').filter({hasText:'후보로 담기'}).first(); if(await add.count()){ await tap(add,'후보로 담기'); added='담음' } else added='담기 버튼 없음' }
  const d=p.locator('#pj-plan-date'); let plan='예정일 칸 없음'; if(await d.count()){ await d.fill(iso(5)); clicks++; await tap(p.locator('[data-pj-plan-save]'),'예정일 저장'); plan=(await p.locator('[data-pj-plan-state]').innerText()).replace(/\s+/g,' ').trim() }
  const cnt=await p.evaluate(()=>{const o=JSON.parse(localStorage.getItem('djdex:project:p1')||'null')||Object.keys(localStorage).filter(k=>/project:/.test(k)).map(k=>JSON.parse(localStorage.getItem(k)))[0];return o&&o.slugs?o.slugs.length:-1})
  return {ok:cnt>=1&&/예정/.test(plan)&&added==='담음',note:`저장된 후보 ${cnt}곳 · ${added} · ${plan.slice(0,40)}`} })
// (6) 현장 체크·방문 기록
await path_('6 현장체크·방문기록',async()=>{ await p.goto(base+'apt/DEMO-0002.html?stay'); await p.waitForTimeout(1200); const open=p.locator('.pb-check').first(); if(!(await open.count())) return {ok:false,note:'확인할 점 버튼 없음'}; await tap(open,'확인할 점'); await p.waitForTimeout(600)
  const sheet=await p.evaluate(()=>{const s=document.getElementById('field-sheet');return s&&!s.hidden}); const box=p.locator('#field-sheet input[type=checkbox]').first(); let checked=false; if(await box.count()){ await tap(box,'체크'); checked=await box.isChecked() }
  const memo=p.locator('#field-sheet textarea').first(); let memoed=false; if(await memo.count()){ await memo.fill('주차 불편'); clicks++; memoed=true }
  const save=p.locator('#field-sheet button').filter({hasText:/저장|기록|완료|다녀/}).first(); let saved='저장 버튼 못 찾음'; if(await save.count()){ await tap(save,'저장'); saved='눌렀음' }
  const keys=await p.evaluate(()=>Object.keys(localStorage).filter(k=>/visit/.test(k)).length); return {ok:sheet&&checked&&keys>0,note:`시트 ${sheet}, 체크 ${checked}, 메모 ${memoed}, ${saved}, 방문 관련 저장 ${keys}건`} })
// (7) 보고서·공유
await path_('7 보고서·공유',async()=>{ await p.goto(base+'projects.html?stay'); await p.waitForTimeout(1800); const rep=p.locator('[data-pj-report]:visible'); if(!(await rep.count())) return {ok:false,note:'보고서 버튼 없음'}; await tap(rep,'한 장 정리'); await p.waitForTimeout(1200)
  const pr=await p.evaluate(()=>({printed:window.__printed,hasReportDom:!!document.querySelector('.pj-report, #pj-report, [data-report-sheet]'),text:(document.querySelector('.pj-report,#pj-report,[data-report-sheet]')||{}).innerText||''}))
  const leak=/photo|사진|data:image|blob:|서명|전화|010-/.test(pr.text); return {ok:(pr.printed>0||pr.hasReportDom),note:`인쇄창 ${pr.printed}, 보고서 영역 ${pr.hasReportDom}, 글자 ${pr.text.length}자, 사진·전화 흔적 ${leak?'있음':'없음'}`} })
// (8) 뒤로·새로고침·메뉴
await path_('8 뒤로·새로고침·복귀',async()=>{ await p.goto(base+'projects.html?stay'); await p.waitForTimeout(1500); const s0=await stored(); await p.goto(base+'index.html?stay'); await p.waitForTimeout(800); await p.goBack(); await p.waitForTimeout(1200); await p.reload(); await p.waitForTimeout(1500); const s1=await stored(); const t=await p.locator('[data-pj-title]').innerText().catch(()=> '(없음)')
  const same=Object.keys(s0).every(k=>k in s1); return {ok:same&&!!t.trim(),note:`저장 항목 ${Object.keys(s0).length}→${Object.keys(s1).length}, 프로젝트 제목 "${t.trim().slice(0,14)}"`} })

console.log('STATE',STATE,JSON.stringify({오류:errs.slice(0,3)}))
for(const r of results) console.log(JSON.stringify(r))
await b.close();srv.close()
