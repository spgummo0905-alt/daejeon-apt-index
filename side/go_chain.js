window.__go=async()=>{
window.confirm=()=>true; window.alert=()=>{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SPEC={"html": "<p><b>주식 지표 페이지에서 제가 가장 공들인 부분은 '리스크 전이 체인'입니다. 금리가 오르면 성장주가 눌리고, 그다음 기술주가 빠지고, 결국 변동성이 커지는 흐름처럼 한 가지 충격이 번지는 순서를 단계로 나눠 두고, 오늘 몇 단계까지 켜졌는지 숫자로 보여 줍니다. 화면은 모두 가상의 데모 데이터입니다.</b></p>\n<p style=\"color:#777;font-size:13px\">투자 권유가 아닙니다. 아래 기준값은 설계 판단이며 앞으로의 움직임을 보장하지 않습니다.</p>\n<p>시장 뉴스를 보면 \"금리 급등에 기술주 약세\" 같은 문장이 매일 나옵니다. 그런데 오늘이 그 이야기의 첫 단계인지, 이미 끝물인지는 말해 주지 않습니다. 그래서 그 흐름을 4단계로 쪼개고 단계마다 켜지는 기준을 숫자로 정했습니다.</p>\n{{IMG:chain-us|미국 '달러·금리 경로'. 4단계 중 2단계(성장주 밸류에이션 압박)만 켜진 날의 화면입니다.}}\n<h2>체인 두 가지</h2>\n<table border=\"1\" cellpadding=\"8\" style=\"border-collapse:collapse;width:100%\">\n<tr><th>단계</th><th>미국: 달러·금리 경로</th><th>한국: 유가·환율 경로</th></tr>\n<tr><td>1</td><td>미 10년물 +5bp 이상 또는 달러지수 +0.5% 이상</td><td>WTI +2.5% 이상 또는 원/달러 +0.7% 이상</td></tr>\n<tr><td>2</td><td>나스닥 −1% 이하 또는 S&amp;P보다 0.5%p 이상 약함</td><td>국내 변동성 지수 20 이상 또는 하루 +10%</td></tr>\n<tr><td>3</td><td>미국 정보기술 업종 평균 −1% 이하</td><td>코스피 −1% 또는 코스닥 −1.5% 이하</td></tr>\n<tr><td>4</td><td>VIX 20 이상 또는 하루 +10%</td><td>상승 종목 비율 35% 이하</td></tr>\n</table>\n<h2>단계마다 보여 주는 것</h2>\n<ul>\n<li><b>상태</b>: 근거 하나라도 기준을 넘으면 활성, 다 못 넘으면 비활성, 값이 비면 미확정.</li>\n<li><b>강도</b>: 기준을 얼마나 넘었는지. 1배 이상 약, 1.5배 중, 2배 강.</li>\n<li><b>방향</b>: 가장 센 근거 지표가 어제보다 올랐는지 내렸는지.</li>\n<li><b>근거</b>: 어떤 지표가 얼마였고 기준이 얼마였는지 카드 안에 그대로 적습니다.</li>\n</ul>\n<p>맨 위 동그라미 네 개가 한 줄 요약입니다. 몇 단계가 켜졌는지, 1단계부터 이어서 켜졌는지를 한눈에 봅니다. 1→2→3이 차례로 켜지는 날과 2단계만 홀로 켜진 날은 의미가 전혀 다르기 때문입니다.</p>\n<h2>리스크 매트릭스: 지금 수준은 어디쯤</h2>\n{{IMG:matrix|체인 아래 리스크 매트릭스. 달러·환율·유가 같은 항목이 낮음·주의·높음 중 어디인지 칸으로 보여 줍니다.}}\n<p>체인이 '하루 동안 무엇이 움직였나'라면 매트릭스는 '지금 수준이 얼마나 높은가'입니다. 미 10년물 금리가 4.5% 이상이면 주의, 5% 이상이면 높음처럼 항목 8개를 세 칸으로 나눴습니다.</p>\n<h2>만들면서 지킨 원칙</h2>\n<ul>\n<li><b>문장을 지어내지 않는다.</b> 같은 숫자가 들어오면 항상 같은 결과가 나오게 규칙으로만 계산합니다.</li>\n<li><b>기준값은 한 곳에서만.</b> 화면·API·테스트가 같은 규칙 표를 읽습니다. 결과를 보고 기준을 바꾸지 않았습니다.</li>\n<li><b>사실과 추정을 구분.</b> 지수·환율처럼 확인된 값은 '사실', 규칙으로 계산한 체인·매트릭스는 '추정' 라벨을 답니다.</li>\n<li><b>한 칸이 비어도 나머지는 보인다.</b> 데이터를 못 받은 단계는 '미확정'으로 남고 다른 단계는 그대로 계산됩니다.</li>\n</ul>\n<p>체인은 예측 도구가 아니라 아침마다 같은 순서로 시장을 점검하는 체크리스트에 가깝습니다. 감으로 \"오늘 분위기 안 좋네\"라고 넘기던 것을 단계 번호로 말할 수 있게 된 게 가장 큰 변화였습니다.</p>", "title": "금리→기술주→변동성, 리스크가 번지는 순서를 4단계로 보는 '리스크 전이 체인' 만들기", "slug": "risk-transfer-chain-market-dashboard", "tags": ["사이드프로젝트", "리스크체인", "시장지표", "주식대시보드", "금리", "VIX", "파이썬"], "day": 24, "hour": "10", "minute": "30"};
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
