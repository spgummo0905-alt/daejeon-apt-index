window.__bg=async(key)=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const base='https://raw.githubusercontent.com/spgummo0905-alt/daejeon-apt-index/BASE/side/';
const spec=(await (await fetch(base+'blogger.json')).json()).find(s=>s.key===key);
const fr=[...document.querySelectorAll('iframe.editable')].find(f=>f.offsetParent!==null)||document.querySelector('iframe.editable');
const doc=fr.contentDocument, body=doc.body;
const names=[...spec.html.matchAll(/\{\{IMG:([^|]+)\|/g)].map(m=>m[1]);
const urls={};
for(const n of names){
  const before=body.querySelectorAll('img').length;
  const blob=await (await fetch(base+n+'.jpg')).blob();
  const dt=new DataTransfer(); dt.items.add(new File([blob],n+'.jpg',{type:'image/jpeg'}));
  body.focus();
  const r=doc.createRange(); r.selectNodeContents(body); r.collapse(false); const s=doc.getSelection(); s.removeAllRanges(); s.addRange(r);
  body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  for(let i=0;i<40;i++){ await sleep(700); const im=[...body.querySelectorAll('img')]; const last=im[im.length-1]; if(im.length>before && last && /googleusercontent|bp\.blogspot/.test(last.src)){ urls[n]=last.src.replace(/\/s\d+(-[a-z]+)?\//,'/s1600/').replace(/=w\d+-h\d+[^/]*$/,'=s1600'); break; } }
  if(!urls[n]) return 'FAIL '+n;
}
const html=spec.html.replace(/\{\{IMG:([^|]+)\|([^}]*)\}\}/g,(m,n,c)=>`<div class="separator" style="clear:both;text-align:center;"><img src="${urls[n]}" alt="${c.replace(/"/g,'&quot;')}" style="max-width:100%;height:auto;" /></div><p style="text-align:center;color:#777;font-size:14px;">${c}</p>`);
body.innerHTML=html;
body.dispatchEvent(new Event('input',{bubbles:true}));
const t=document.querySelector('input[aria-label="제목"], input[placeholder="제목"]');
if(t){t.focus();t.select();document.execCommand('insertText',false,spec.title);}
return 'OK '+Object.keys(urls).length+' imgs; title='+(t?'set':'MISSING');
};
'bg loaded';
