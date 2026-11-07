
import { chromium } from '/home/spgummo0905/design-studio/qa/node_modules/@playwright/test/index.mjs'
import { chromePath } from '/home/spgummo0905/design-studio/qa/lib.mjs'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root=process.argv[2], pages=process.argv.slice(3)
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0].split('#')[0]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';if(!fs.existsSync(f)){r.statusCode=404;r.end();return}const e=path.extname(f);r.setHeader('content-type',{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[e]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(0)
const base='http://localhost:'+srv.address().port+'/'
const b=await chromium.launch({executablePath:chromePath()})
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
let bad=0,n=0
for(const w of [360,390,430]){ const ctx=await b.newContext({viewport:{width:w,height:800},isMobile:true,hasTouch:true,userAgent:UA}); const p=await ctx.newPage()
 for(const pg of pages){ await p.goto(base+pg); await p.waitForTimeout(900); const r=await p.evaluate(()=>({W:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth})); n++; if(r.sw>r.W+1){bad++;console.log('넘침',w,pg,JSON.stringify(r))} }
 await ctx.close()}
console.log('검사',n,'넘침',bad); await b.close();srv.close()
