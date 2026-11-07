
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root=process.argv[2]
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';if(!fs.existsSync(f)){r.statusCode=404;r.end();return}const e=path.extname(f);r.setHeader('content-type',{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[e]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(0)
const base='http://localhost:'+srv.address().port+'/'
// ---- 가짜 계정 저장소 (Supabase user_kv 흉내; 실제 서버가 아님) ----
const KV=new Map(); let tick=0; const LOG=[]
const nowIso=()=>new Date(Date.parse('2026-11-07T00:00:00Z')+(++tick)*1000).toISOString()
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
async function mock(route){ const req=route.request(), u=new URL(req.url())
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:CORS})
  const json=(o,s=200)=>route.fulfill({status:s,headers:{...CORS,'content-type':'application/json'},body:JSON.stringify(o)})
  if(u.pathname==='/rest/v1/user_kv'){ const gt=(u.searchParams.get('updated_at')||'').replace(/^gt\./,''); return json([...KV.values()].filter(r=>!gt||r.updated_at>gt).sort((a,b)=>a.updated_at<b.updated_at?-1:1)) }
  if(u.pathname==='/rest/v1/rpc/sync_put'){ const items=JSON.parse(req.postData()).items; for(const i of items){ const cur=KV.get(i.k); if(!cur||cur.t<i.t){ KV.set(i.k,{k:i.k,v:i.v,t:i.t,updated_at:nowIso()}); LOG.push('PUT '+i.k) } else LOG.push('거절(더 오래됨) '+i.k) } return json(null,204) }
  if(u.pathname==='/rest/v1/rpc/my_member') return json({},200)
  if(u.pathname==='/rest/v1/app_settings') return json([])
  return json({},200) }
const b=await chromium.launch({executablePath:chromePath()})
const UID='11111111-1111-1111-1111-111111111111'
const iso=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
const PRJ={version:1,id:'p1',name:'우리집 후보',goal:'역세권',region:'대전',slugs:['DEMO-0001','DEMO-0002','DEMO-0003'],archived:false,created:1,updated:2,planned:''}
async function device(name,seedProject){
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
  await ctx.route('https://mock.supabase.test/**',mock)
  await ctx.addInitScript(([uid,P])=>{ if(sessionStorage.getItem('__seed'))return; sessionStorage.setItem('__seed','1')
    localStorage.setItem('djdex-auth',JSON.stringify({at:'x',rt:'y',exp:Math.floor(Date.now()/1000)+36000,user:{id:uid,name:'시험 회원',img:''}}))
    localStorage.setItem('djdex-records-v2','true')
    localStorage.setItem('djdex@'+uid+':_sync',JSON.stringify({uid,since:'',sent:{}}))
    if(P){ localStorage.setItem('djdex@'+uid+':project:p1',JSON.stringify(P)); localStorage.setItem('djdex@'+uid+':_times',JSON.stringify({'project:p1':1})) } },[UID,seedProject])
  const p=await ctx.newPage(); p.on('dialog',d=>d.accept()); const errs=[]; p.on('pageerror',e=>errs.push(name+': '+String(e).slice(0,80))); p.errs=errs
  p.dev=name; return p }
const read=p=>p.evaluate(u=>{const r=localStorage.getItem('djdex@'+u+':project:p1');return r?JSON.parse(r):null},UID)
const cloud=()=>{const r=KV.get('project:p1');return r?r.v:null}
const open=async(p)=>{ await p.goto(base+'projects.html?stay'); await p.waitForTimeout(2500) }
const setDate=async(p,d)=>{ await p.locator('#pj-plan-date').fill(d); await p.locator('[data-pj-plan-save]').click(); await p.waitForTimeout(2600) }
const results=[]; const rec=(단계,ok,메모)=>{results.push({단계,ok,메모}); console.log(JSON.stringify({단계,결과:ok?'통과':'실패',메모}))}
const A=await device('기기A',PRJ), B=await device('기기B',null)
await open(A); await open(B)
let a=await read(A),bb=await read(B); rec('0 시작',!!a&&a.planned==='','A 프로젝트 있음, 날짜 없음(B는 A가 올린 것을 열면서 이미 받았을 수 있음: 프로젝트 '+(bb?'있음':'없음')+')')
// 1 A에서 설정
await setDate(A,iso(3)); rec('1 A 설정→서버',cloud()&&cloud().planned===iso(3),`서버 planned=${cloud()&&cloud().planned}`)
// 2 B 동기화(새로 열기)
await open(B); bb=await read(B); rec('2 B가 받음',!!bb&&bb.planned===iso(3)&&bb.slugs.length===3,`B planned=${bb&&bb.planned}, 후보 ${bb&&bb.slugs.length}곳`)
const bUI=await B.locator('[data-pj-plan-state]').innerText().catch(()=>'(없음)'); rec('2b B 화면 문구',/예정/.test(bUI),bUI.replace(/\s+/g,' ').slice(0,40))
// 3 B에서 변경
await setDate(B,iso(8)); rec('3 B 변경→서버',cloud().planned===iso(8),`서버 planned=${cloud().planned}`)
await open(A); a=await read(A); rec('3b A가 받음',a.planned===iso(8)&&a.slugs.length===3,`A planned=${a.planned}`)
// 4 A에서 취소
await A.locator('[data-pj-plan-clear]').click(); await A.waitForTimeout(2600)
rec('4 A 취소→서버',cloud().planned==='' && cloud().slugs.length===3,`서버 planned="${cloud().planned}", 후보 ${cloud().slugs.length}곳`)
await open(B); bb=await read(B); const bUI2=await B.locator('[data-pj-plan-state]').innerText().catch(()=>''); rec('4b B가 받음(취소 반영)',bb.planned===''&&bb.slugs.length===3,`B planned="${bb.planned}" · 화면 "${bUI2.replace(/\s+/g,' ').slice(0,30)}"`)
// 5 복구: B에서 다시 설정 + 보관/복원
await setDate(B,iso(5)); await open(A); a=await read(A); rec('5 복구(B 재설정)→A',a.planned===iso(5),`A planned=${a.planned}`)
// 6 보관·복원 후에도 유지
await A.evaluate(u=>{const k='djdex@'+u+':project:p1';const p=JSON.parse(localStorage.getItem(k));return p},UID)
const arch=A.locator('button:has-text("프로젝트 보관하기")'); if(await arch.count()){ await arch.first().click(); await A.waitForTimeout(2600) }
const afterArch=cloud(); rec('6 보관→서버',afterArch&&afterArch.archived===true&&afterArch.planned===iso(5),`서버 archived=${afterArch&&afterArch.archived}, planned=${afterArch&&afterArch.planned}`)
await open(B); bb=await read(B); rec('6b B에도 보관 반영, 날짜 유지',bb.archived===true&&bb.planned===iso(5),`B archived=${bb.archived}, planned=${bb.planned}`)
// 6c 복원: A에서 '다시 시작하기'
await open(A); await A.locator('[data-pj-toggle]').click(); await A.waitForTimeout(2600)
const rs=cloud(); rec('6c 복원(다시 시작하기)→서버',rs.archived===false&&rs.planned===iso(5)&&rs.slugs.length===3,`서버 archived=${rs.archived}, planned=${rs.planned}, 후보 ${rs.slugs.length}곳`)
// 7 동시 수정(둘 다 오프라인에서): A는 후보 1곳 빼기, B는 날짜 변경 → 나중 쓴 쪽이 통째로 이김
await A.context().setOffline(true); await B.context().setOffline(true)
// 보관 해제 먼저(양쪽에서 같은 상태로 시작하도록 온라인에서)
await A.context().setOffline(false); await B.context().setOffline(false)
await open(A); await open(B)
await A.context().setOffline(true); await B.context().setOffline(true)
const rm=A.locator('button:has-text("빼기")').first(); const hadRm=await rm.count()
if(hadRm){ await rm.click(); await A.waitForTimeout(800) }
await setDate(B,iso(9))
const a7=await read(A), b7=await read(B); console.log('   [오프라인] A 후보',a7.slugs.length,'곳 날짜',a7.planned,'| B 후보',b7.slugs.length,'곳 날짜',b7.planned)
await A.context().setOffline(false); await B.context().setOffline(false)
await open(A); await open(B); await open(A)
const a8=await read(A), b8=await read(B), c8=cloud()
const lost=(a8.slugs.length<3||b8.slugs.length<3)
rec('7 오프라인 동시 수정 후 결과',true,`서버 후보 ${c8.slugs.length}곳·날짜 ${c8.planned} | A ${a8.slugs.length}곳·${a8.planned} | B ${b8.slugs.length}곳·${b8.planned} | 한쪽 변경이 사라졌나: ${lost?'예(후보 빼기 또는 날짜 중 하나가 덮임)':'아니오'} | 두 기기 일치: ${JSON.stringify(a8)===JSON.stringify(b8)}`)
console.log('서버 기록 로그(마지막 12):',JSON.stringify(LOG.slice(-12)))
console.log('페이지 오류:',JSON.stringify([...A.errs,...B.errs].slice(0,4)))
await b.close();srv.close()
