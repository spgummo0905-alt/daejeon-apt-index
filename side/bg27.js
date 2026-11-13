window.__bg27=async(key)=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sp=(await (await fetch('https://raw.githubusercontent.com/spgummo0905-alt/daejeon-apt-index/'+window.__SHA+'/side/y27.json')).json())[key].b;
window.__SP=sp;
let fr; for(let i=0;i<20&&!fr;i++){ fr=[...document.querySelectorAll('iframe.editable')].find(f=>f.offsetParent!==null); if(!fr) await sleep(500);}
if(!fr) return 'NO EDITOR';
const body=fr.contentDocument.body; body.innerHTML=sp.html; body.dispatchEvent(new Event('input',{bubbles:true}));
const t=document.querySelector('input[aria-label="제목"], input[placeholder="제목"]');
t.focus(); t.select(); document.execCommand('insertText',false,sp.title);
await sleep(500);
return 'OK '+body.innerHTML.length+' scripts='+body.querySelectorAll('script').length+' title='+t.value;
};
'bg27';
