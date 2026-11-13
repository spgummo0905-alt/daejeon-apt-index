window.__go=async()=>{
window.confirm=()=>true; window.alert=()=>{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SPEC={"html": "<p><b>유도를 배우고 싶은데 동네에 어떤 도장이 있는지, 어린이반이나 체험 수업이 있는지 한 번에 알기 어렵다는 데서 출발한 사이드 프로젝트입니다. 서울 유도 체육관을 지도와 카드로 모아 보는 '도장지도' 시안을 만들었습니다. 화면 속 체육관 이름·사진·연락처는 모두 가상의 샘플입니다.</b></p>\n<p>유도장을 찾으려고 지도 앱에 '유도'를 치면 태권도장, 주짓수, 합기도가 섞여 나옵니다. 겨우 찾아도 어린이반이 있는지, 성인이 처음 가도 되는지는 전화해 봐야 압니다. 부모님이든 운동을 새로 시작하려는 직장인이든 첫 질문은 비슷한데 답이 흩어져 있었습니다.</p>\n{{IMG:judo-home|첫 화면. '체육관 찾기'와 '유도가 처음이에요' 두 갈래로 시작합니다.}}\n<h2>누구를 위한 앱인가</h2>\n<table border=\"1\" cellpadding=\"8\" style=\"border-collapse:collapse;width:100%\">\n<tr><th>이런 분</th><th>도장지도에서 보는 것</th></tr>\n<tr><td>아이에게 운동을 시키려는 부모</td><td>어린이반이 있는 곳, 몇 살부터 받는지</td></tr>\n<tr><td>퇴근 후 운동을 시작하려는 직장인</td><td>저녁·새벽·주말반, 체험 수업 여부</td></tr>\n<tr><td>여성 전용 시간이 필요한 분</td><td>여성반을 따로 여는 곳</td></tr>\n<tr><td>대회를 준비하는 학생</td><td>선수반이 있는 도장</td></tr>\n</table>\n<h2>체육관 찾기: 지도와 카드를 한 화면에</h2>\n{{IMG:judo-find|권역을 동북권으로 고르자 3곳만 남고 지도에서도 그 권역이 칠해집니다.}}\n<p>서울을 서울시가 쓰는 5개 생활권(도심·동북·서북·서남·동남)으로 나누고, 대상(어린이·성인·여성·체험·선수반)을 겹쳐서 고르게 했습니다. 카드에 마우스를 올리면 지도의 핀이 커지고, 핀을 누르면 해당 카드로 스크롤됩니다. 카드 구조는 집감에서 쓰던 미니 카드를 그대로 가져왔습니다. 사진, 지역, 대상 배지, 한 줄 소개 순서입니다.</p>\n<h2>유도가 처음인 사람을 위한 안내</h2>\n{{IMG:judo-learn|'유도 알아보기'. 준비물, 첫 수업 흐름, 기본 용어를 쉬운 말로 풀었습니다.}}\n<p>도장 목록만 있으면 처음인 사람은 여전히 망설입니다. 그래서 첫날 무엇을 입고 가는지, 수업이 어떻게 흘러가는지, 전화로 무엇을 물어보면 되는지를 따로 정리했습니다. 낙법, 메치기, 한판 같은 용어와 업어치기·안다리후리기 같은 대표 기술도 한 줄씩 설명합니다. 실제 서비스 전에는 지도자 감수를 받을 계획입니다.</p>\n<h2>시안에서 정한 원칙</h2>\n<ul>\n<li><b>로그인 없이 본다.</b> 도장을 찾는 단계에서 가입을 요구하지 않습니다.</li>\n<li><b>가짜를 진짜처럼 보이지 않게.</b> 샘플 데이터에는 모든 카드에 '샘플' 표시를 붙였고 화면 맨 위에도 시안임을 적었습니다.</li>\n<li><b>다음 단계는 관장님 등록.</b> 도장 정보는 결국 관장님이 직접 넣고 고쳐야 정확해서, 등록 기능은 다음 단계로 남겨 두었습니다.</li>\n</ul>\n<p>집감이 '집을 보는 순서'를 정리했다면 도장지도는 '운동을 시작하는 순서'를 정리해 보는 실험입니다. 유도장을 운영하시거나 다니시는 분이라면 어떤 정보가 꼭 있어야 하는지 댓글로 알려 주세요.</p>", "title": "서울 유도장 찾기 어렵길래 '도장지도' 앱을 기획해 봤습니다 (사이드 프로젝트 시안)", "slug": "seoul-judo-gym-map-side-project", "tags": ["사이드프로젝트", "유도", "유도장", "서울유도", "체육관찾기", "앱기획", "도장지도"], "day": 22, "hour": "10", "minute": "30"};
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
if(!document.body.innerText.split('본문2')[0].includes('사이드 프로젝트')){ [...document.querySelectorAll('button')].find(x=>x.innerText.startsWith('카테고리'))?.click(); await sleep(400); const opt=[...document.querySelectorAll('div,li,span')].filter(e=>e.children.length<=1 && e.innerText?.trim()==='사이드 프로젝트'); opt[opt.length-1]?.click(); await sleep(300); }
const catOk=document.body.innerText.split('본문2')[0].includes('사이드 프로젝트');
const nimg=(ed.getContent().match(/\[##_Image/g)||[]).length, ntag=[...document.querySelectorAll('[class*=tag] span')].filter(e=>e.innerText.startsWith('#')&&e.innerText.length>1).length;
if(!catOk || ed.getContent().length<1500 || ntag<5) return ['STOP', catOk, ed.getContent().length, ntag, nimg];
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
  [...document.querySelectorAll('.tbl_calendar button.btn_day')].find(b=>b.innerText.trim()===String(SPEC.day) && !b.disabled).click(); await sleep(400);
  for(const [id,v] of [['dateHour',SPEC.hour],['dateMinute',SPEC.minute]]){ const e=document.getElementById(id); si.call(e,String(v)); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); e.dispatchEvent(new Event('blur',{bubbles:true})); }
  await sleep(300); when=document.querySelector('button.btn_reserve').innerText+' '+document.getElementById('dateHour').value+':'+document.getElementById('dateMinute').value; }
const pub=[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim()).filter(x=>/발행|예약/.test(x));
return ['READY', t.value, ed.getContent().length, 'img '+nimg, 'tag '+ntag, document.getElementById('open20').checked, u?.value, when, pub];
};
