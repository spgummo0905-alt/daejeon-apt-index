
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
const out=process.argv[2], base=process.argv[3], hash=process.argv[4]
const b=await chromium.launch({executablePath:chromePath()})
const res={}
for(const [w,h,m] of [[390,844,true],[820,1180,false],[1280,800,false]]){
 const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:m,hasTouch:m,reducedMotion:'reduce'}); const p=await ctx.newPage()
 await p.goto(base+'preview.html'+hash); await p.waitForTimeout(3500)
 const r=await p.evaluate(()=>{
  const top=id=>{const e=document.getElementById(id);if(!e||e.offsetParent===null)return null;const r=e.getBoundingClientRect();return {y:Math.round(r.top+scrollY),h:Math.round(r.height)}}
  const ids=['cx','dong','floor','date','result','tower','cmp','plan','timebar','field','evidence'];
  const pos={};ids.forEach(i=>pos[i]=top(i))
  const big=document.querySelector('#result .big');const br=big.getBoundingClientRect()
  const inter=[...document.querySelectorAll('.pv button,.pv input,.pv a,.pv summary')].filter(e=>e.offsetParent!==null)
  const resTop=document.getElementById('result').getBoundingClientRect().top+scrollY
  const before=inter.filter(e=>e.getBoundingClientRect().top+scrollY<resTop).length
  return {docH:document.documentElement.scrollHeight,vh:innerHeight,bigY:Math.round(br.top+scrollY),bigText:big.textContent,pos,controlsBeforeResult:before,cards:document.querySelectorAll('.pv .card').length,planY:pos.plan&&pos.plan.y}
 })
 res[w]=r
 await p.screenshot({path:`${out}/before-${w}-first.png`})
 await p.screenshot({path:`${out}/before-${w}-full.png`,fullPage:true})
 if(w===390){ // CPU 4배 느리게 + 함수별 시간
  const c2=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const q=await c2.newPage(); const cd=await c2.newCDPSession(q)
  await cd.send('Emulation.setCPUThrottlingRate',{rate:4}); await cd.send('Profiler.enable'); await cd.send('Profiler.start')
  const t0=Date.now(); await q.goto(base+'preview.html'+hash); await q.waitForFunction(()=>!document.getElementById('pv-tool').hidden,null,{timeout:20000}); const t1=Date.now()
  const prof=(await cd.send('Profiler.stop')).profile; const self={}
  const dt=prof.timeDeltas; const idx={}; prof.nodes.forEach(n=>idx[n.id]=n)
  prof.samples.forEach((id,i)=>{const n=idx[id];const k=(n.callFrame.functionName||'(익명)')+' '+(n.callFrame.url.split('/').pop()||'')+':'+n.callFrame.lineNumber;self[k]=(self[k]||0)+(dt[i]||0)/1000})
  res.profile4x={toolShownMs:t1-t0,top:Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>k+' '+v.toFixed(0)+'ms')}
  // 조작 반응: 층 슬라이더 한 칸 움직일 때 걸리는 시간(4배 느림)
  const ms=await q.evaluate(()=>{const f=document.getElementById('floor');const t=performance.now();for(let i=0;i<5;i++){f.value=String(+f.value%+f.max+1);f.dispatchEvent(new Event('input',{bubbles:true}))}return (performance.now()-t)/5})
  res.profile4x.floorInputMs=+ms.toFixed(1)
  await c2.close()
 }
 await ctx.close()}
console.log(JSON.stringify(res,null,1))
await b.close()
