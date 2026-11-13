window.__go=async()=>{
window.confirm=()=>true; window.alert=()=>{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SPEC=(await (await fetch('https://raw.githubusercontent.com/spgummo0905-alt/daejeon-apt-index/'+window.__SHA+'/side/y27.json')).json())[window.__KEY].t;
const map=JSON.parse(localStorage.getItem('__imgmap')||'{}');
let html=SPEC.html.trim().replace(/\{\{IMG:([a-z0-9-]+)\|([^}]*)\}\}/g,(m,n,cap)=>map[n]&&map[n]!=='FAIL'?`<p>${map[n]}</p><p style="text-align:center;color:#777;font-size:14px">▲ ${cap}</p>`:'');
// 1) 해당 임시저장 글 열기 (있으면)
if(SPEC.draft){ const c=[...document.querySelectorAll('a.action')].find(e=>e.innerText.trim()==='임시저장').parentElement; [...c.querySelectorAll('a,button')].find(e=>/^\d+$/.test(e.innerText.trim()))?.click(); await sleep(1200);
  const it=[...document.querySelectorAll('a,button,li,div,span')].filter(e=>e.children.length<=2 && new RegExp(SPEC.draft).test(e.innerText||'')); if(it.length){ it[it.length-1].click(); await sleep(2500);} }
await sleep(3500);
// 2) 기본모드에서 본문
const hb=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.innerText.trim().startsWith('HTML')); if(hb){ hb.click(); await sleep(300); document.getElementById('editor-mode-kakao')?.click(); await sleep(900); }
const ed=tinymce.activeEditor; ed.setContent(html); ed.fire('change'); ed.fire('input'); ed.save(); ed.setDirty(true); await sleep(400);
// 3) 제목
const t=document.getElementById('post-title-inp'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,SPEC.title); t.dispatchEvent(new Event('input',{bubbles:true}));
// 4) 태그: 기존 삭제 후 새로
for(let k=0;k<20;k++){ const del=[...document.querySelectorAll('button,a')].find(b=>/태그 삭제/.test(b.innerText||b.getAttribute('aria-label')||'')); if(!del) break; del.click(); await sleep(80); }
const ti=document.getElementById('tagText'); const si=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
for(const tag of SPEC.tags){ ti.focus(); si.call(ti,tag); ti.dispatchEvent(new Event('input',{bubbles:true})); for(const ty of ['keydown','keypress','keyup']) ti.dispatchEvent(new KeyboardEvent(ty,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})); await sleep(120); }
// 5) 카테고리
if(!document.body.innerText.split('본문2')[0].includes(SPEC.cat)){ [...document.querySelectorAll('button')].find(x=>x.innerText.startsWith('카테고리'))?.click(); await sleep(400); const opt=[...document.querySelectorAll('div,li,span')].filter(e=>e.children.length<=1 && e.innerText?.trim()===SPEC.cat); opt[opt.length-1]?.click(); await sleep(300); }
const catOk=document.body.innerText.split('본문2')[0].includes(SPEC.cat);
const nimg=(ed.getContent().match(/\[##_Image/g)||[]).length, ntag=[...document.querySelectorAll('[class*=tag] span')].filter(e=>e.innerText.startsWith('#')&&e.innerText.length>1).length;
if(!catOk || ed.getContent().length<1500 || !/<script/i.test(ed.getContent()) || ntag<5) return ['STOP', catOk, ed.getContent().length, ntag, nimg];
await sleep(1500);
const probe=html.replace(/<[^>]+>/g,'').slice(0,30);
for(let k=0;k<3 && !ed.getBody().innerText.includes(probe.slice(0,20));k++){ ed.setContent(html); ed.fire('change'); ed.fire('input'); ed.save(); ed.setDirty(true); await sleep(1500); }
if(!ed.getBody().innerText.includes(probe.slice(0,20))) return ['STOP body not kept'];
// 6) 발행 레이어
[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='완료').click(); await sleep(1500);
(document.querySelector('label[for="open20"]')||document.getElementById('open20')).click(); await sleep(400);
const u=document.getElementById('urlPublish'); if(u){ si.call(u,SPEC.slug); u.dispatchEvent(new Event('input',{bubbles:true})); u.dispatchEvent(new Event('change',{bubbles:true})); }
let when='now';
if(SPEC.day){ [...document.querySelectorAll('button.btn_date')].find(b=>b.innerText.trim()==='예약').click(); await sleep(500);
  document.querySelector('button.btn_reserve').click(); await sleep(500);
  for(let k=0;k<3;k++){ const cal=document.querySelector('.tbl_calendar'); const box=cal.closest('div[class*=calendar],div[class*=layer],div')?.parentElement||document; const head=box.innerText.slice(0,40); if(head.includes(SPEC.month+'월')||head.includes('.'+String(SPEC.month).padStart(2,'0'))||head.includes('. '+SPEC.month)) break; const nx=[...box.querySelectorAll('button,a')].find(b=>/next|다음/i.test(b.className+' '+(b.getAttribute('aria-label')||'')+' '+b.innerText)); if(!nx) return ['STOP no next btn', head]; nx.click(); await sleep(500);}

  [...document.querySelectorAll('.tbl_calendar button.btn_day')].find(b=>b.innerText.trim()===String(SPEC.day) && !b.disabled).click(); await sleep(400);
  for(const [id,v] of [['dateHour',SPEC.hour],['dateMinute',SPEC.minute]]){ const e=document.getElementById(id); si.call(e,String(v)); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); e.dispatchEvent(new Event('blur',{bubbles:true})); }
  await sleep(300); when=document.querySelector('button.btn_reserve').innerText+' '+document.getElementById('dateHour').value+':'+document.getElementById('dateMinute').value; }
const pub=[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim()).filter(x=>/발행|예약/.test(x));
return ['READY', t.value, ed.getContent().length, 'script '+(/<script/i.test(ed.getContent())), 'tag '+ntag, document.getElementById('open20').checked, u?.value, when, pub];
};
