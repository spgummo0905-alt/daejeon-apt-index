
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import fs from 'node:fs'
const base='https://www.jipgam.kr/', N=+process.env.N||5, SLOW=process.env.SLOW==='1'
const specs=process.argv.slice(2)   // page,width,scheme,state
const b=await chromium.launch({executablePath:chromePath()})
const d=new Date(); const today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
const P=JSON.stringify({version:1,id:'p1',name:'시험 프로젝트',goal:'',region:'대전',slugs:['30110-1069','30140-1126','30170-98'],archived:false,created:1,updated:2,planned:''})
const V=JSON.stringify({version:1,id:'v-t1',region:'대전',slug:'30110-1069',projectId:'p1',date:today,period:'',memo:'시험',created:Date.now(),checks:null})
const out=[]
for(const spec of specs){ const [pg,w,scheme,state]=spec.split(','); const runs=[]
 for(let i=0;i<N;i++){
  const ctx=await b.newContext({viewport:{width:+w,height:+w>800?800:844},isMobile:+w<800,hasTouch:+w<800,colorScheme:scheme,reducedMotion:'reduce'})
  await ctx.addInitScript(()=>{window.__s=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__s.push({v:+e.value.toFixed(3),src:e.sources.map(s=>((s.node&&s.node.className&&s.node.className.baseVal===undefined?s.node.className:'')||(s.node&&s.node.nodeName)||'').toString().slice(0,20)+':'+Math.round(s.previousRect.y)+'→'+Math.round(s.currentRect.y)).join('|')})}).observe({type:'layout-shift',buffered:true})})
  if(state==='returning') await ctx.addInitScript(([P,V])=>{if(!sessionStorage.getItem('__s')){localStorage.setItem('djdex:project:p1',P);localStorage.setItem('djdex:visitlog:v-t1',V);localStorage.setItem('djdex:favs','["30110-1069","30140-1126"]');sessionStorage.setItem('__s','1')}},[P,V])
  const p=await ctx.newPage()
  if(SLOW){ const c=await ctx.newCDPSession(p); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:400*1024/8*8,uploadThroughput:200*1024,connectionType:'cellular3g'}); await c.send('Emulation.setCPUThrottlingRate',{rate:4}) }
  await p.goto(base+pg+'?stay',{waitUntil:'load',timeout:90000}); await p.waitForTimeout(SLOW?6000:3500)
  runs.push(await p.evaluate(()=>window.__s)); await ctx.close() }
 const tot=runs.map(r=>+r.reduce((a,x)=>a+x.v,0).toFixed(3)); const bad=runs.filter(r=>r.reduce((a,x)=>a+x.v,0)>0.02)
 const line={spec,slow:SLOW,runs:tot,최대:Math.max(...tot),기준초과:bad.length,원인:bad[0]?JSON.stringify(bad[0]).slice(0,260):''}
 console.log(JSON.stringify(line)); fs.appendFileSync(process.env.OUT,JSON.stringify(line)+'\n') }
await b.close()
