
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
const b=await chromium.launch({executablePath:chromePath()})
const pages=['index.html?skip=1','finder.html','projects.html','my.html','rank.html','compare.html','preview.html#c=30200-631','intro.html','apt/30200-631.html']
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const rows=[]
for(const w of [360,390,430]){
 const ctx=await b.newContext({viewport:{width:w,height:800},isMobile:true,hasTouch:true,userAgent:UA,deviceScaleFactor:3}); const p=await ctx.newPage()
 for(const pg of pages){
  await p.goto('https://www.jipgam.kr/daejeon/'+pg).catch(()=>{}); await p.waitForTimeout(1800)
  const r=await p.evaluate(()=>{const W=document.documentElement.clientWidth;const sw=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth);const off=[];document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width>0&&r.right>W+1&&getComputedStyle(e).position!=='fixed'){let c=e,clipped=false;while(c&&c!==document.body){const o=getComputedStyle(c);if(['hidden','auto','scroll','clip'].includes(o.overflowX)&&c!==e){clipped=true;break}c=c.parentElement}if(!clipped)off.push((e.tagName+'.'+String(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)).slice(0,34)+' right='+Math.round(r.right))}});
   const vp=document.querySelector('meta[name=viewport]')?.content;return {W,sw,over:sw>W+1,vp,off:off.slice(0,3),zoomOutPossible:visualViewport.scale,tsa:getComputedStyle(document.body).webkitTextSizeAdjust||getComputedStyle(document.body).textSizeAdjust}})
  rows.push({w,pg,...r}); if(r.over||r.off.length) console.log('!!',w,pg,JSON.stringify(r))
 }
 await ctx.close()}
console.log('점검',rows.length,'| 가로 넘침 있음',rows.filter(r=>r.over).length,'| 뷰포트',[...new Set(rows.map(r=>r.vp))].join(' / '),'| 글자자동확대 설정',[...new Set(rows.map(r=>r.tsa))].join(','))
await b.close()
