window.__go=async()=>{
window.confirm=()=>true; window.alert=()=>{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SPEC={"html": "\n<p><b>집감 안에는 '별빛옥상'이라는 작은 3D 공간이 있습니다. 도시 야경이 보이는 옥탑에 올라가 불꽃을 쏘고 고기를 굽고 소원을 적어 풍등으로 날리는 곳입니다. 그림 파일 하나 없이 전부 코드로 그렸습니다.</b></p>\n<p>아파트 임장을 돕는 서비스를 만들다가 옥상을 왜 만들었냐는 질문을 몇 번 받았습니다. 대답은 단순합니다. 집을 보러 다니는 일은 생각보다 지칩니다. 숫자를 보고 동네를 걷고 가족과 의견을 맞추다 보면 하루가 갑니다. 그런 날 잠깐 올라가서 바람 쐬고 내려올 곳이 하나쯤 있으면 좋겠다고 생각했습니다.</p>\n{{IMG:roof-a|들어가면 지금 시각과 함께 “잠깐 쉬어 가요”가 먼저 뜹니다.}}\n<h2>옥상에서 할 수 있는 것</h2>\n<table border=\"1\" cellpadding=\"8\" style=\"border-collapse:collapse;width:100%\">\n<tr><th>메뉴</th><th>하는 일</th></tr>\n<tr><td>불꽃</td><td>하늘을 누르면 터집니다. 종류가 열 가지예요</td></tr>\n<tr><td>굽기</td><td>삼겹살, 새우·버섯·옥수수 모둠을 구워요</td></tr>\n<tr><td>쉬기</td><td>별똥별 보기, 숨 고르기, 별 세기, 소원 빌기</td></tr>\n<tr><td>소원</td><td>36자까지 적으면 풍등이 되어 하늘로 올라가요</td></tr>\n<tr><td>함께</td><td>같은 서버 사람들과 모닥불·주크박스를 같이 써요</td></tr>\n</table>\n{{IMG:roof-d|불꽃을 세 번 쏘면 오늘의 미션이 하나 끝납니다. 미션은 매일 바뀌어요.}}\n<h2>그림 파일 없이 코드로만 그린 이유</h2>\n<p>옥상 장면은 three.js로 만들었고 장면 파일 하나가 1,900줄쯤 됩니다. 하늘 색은 지금 시각의 해 높이에 맞춰 바뀌고 달 모양과 날씨도 실제 값을 받아서 반영합니다. 도시의 건물 수백 채는 한 번에 그리는 방식(인스턴싱)이라 휴대폰에서도 버틸 만합니다.</p>\n{{IMG:roof-code|장면 파일 맨 위 주석. 하늘·도시·불꽃을 어떻게 나눴는지 적어 뒀어요.}}\n<p>이미지를 쓰지 않은 건 가볍게 하려는 이유가 제일 컸습니다. 집감은 휴대폰으로 임장 다니면서 여는 서비스라, 옥상 하나 때문에 페이지가 무거워지면 본업이 망가집니다.</p>\n<h2>같이 있지만 말은 안 하는 공간</h2>\n<p>여러 사람이 동시에 들어오면 1서버부터 차례로 한 옥상에 모입니다. 대화창은 일부러 안 넣었고 이모지로만 인사할 수 있어요. 닉네임과 위치는 저장하지 않습니다. 모르는 사람과 같은 야경을 보는 정도의 거리감이 맞다고 봤습니다.</p>\n<h2>만들면서 정한 원칙</h2>\n<ul>\n<li>미션은 못 해도 괜찮다. 쉬러 온 곳이니까.</li>\n<li>소리는 처음부터 켜지 않는다. '조용히 올라가기'를 따로 둔다.</li>\n<li>본업(임장 도구)보다 무거워지지 않는다.</li>\n</ul>\n<p>직접 올라가 보기: <a href=\"https://www.jipgam.kr/daejeon/rooftop\">집감 별빛옥상</a></p>\n", "title": "집 보러 다니다 지친 사람을 위한 옥상, 웹에 3D로 만들어 봤습니다 (three.js)", "slug": "jipgam-rooftop-threejs-side-project", "tags": ["사이드프로젝트", "threejs", "웹3D", "메타버스", "집감", "옥상", "개인개발"], "day": 16, "hour": "10", "minute": "30"};
const map=JSON.parse(localStorage.getItem('__imgmap')||'{}');
let html=SPEC.html.replace(/\{\{IMG:([a-z0-9-]+)\|([^}]*)\}\}/g,(m,n,cap)=>map[n]&&map[n]!=='FAIL'?`<p>${map[n]}</p><p style="text-align:center;color:#777;font-size:14px">▲ ${cap}</p>`:'');
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
