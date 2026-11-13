window.__go=async()=>{
window.confirm=()=>true; window.alert=()=>{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SPEC={"html": "\n<p><b>국장과 미장 종목을 매일 공개 데이터로 거르고 정해 둔 규칙 안에서만 아주 작은 금액으로 사고파는 개인 연구용 봇을 만들고 있습니다. 이 글은 수익 자랑이 아닙니다. 돈이 걸린 코드를 혼자 운영하면 어디서 깨지는지 적은 기록입니다.</b></p>\n<p style=\"color:#777;font-size:13px\">투자 권유가 아닙니다. 개인 연구 기록이며 매매 판단과 책임은 각자에게 있습니다.</p>\n{{IMG:bot-flow|봇이 하루를 도는 순서. 낮에는 국장, 밤에는 미장을 봅니다.}}\n<h2>어떤 봇인가</h2>\n<table border=\"1\" cellpadding=\"8\" style=\"border-collapse:collapse;width:100%\">\n<tr><th>항목</th><th>내용</th></tr>\n<tr><td>대상</td><td>코스피·코스닥, 나스닥·S&amp;P500</td></tr>\n<tr><td>데이터</td><td>공개 시세(FinanceDataReader, yfinance), 금리·고용(FRED), 공시(DART)</td></tr>\n<tr><td>운영</td><td>맥에서 평일 08:30 낮 세션, 22:00 밤 세션 자동 실행</td></tr>\n<tr><td>규모</td><td>파이썬 약 41만 줄, 모듈 276개, 테스트 파일 170개</td></tr>\n<tr><td>확인</td><td>텔레그램으로 휴대폰에서 상태를 봄</td></tr>\n</table>\n<h2>코드보다 안전장치를 더 많이 썼습니다</h2>\n<p>처음엔 종목 고르는 로직이 제일 중요할 줄 알았습니다. 해 보니 시간 대부분을 '사고 나면 어떻게 멈추나'에 썼습니다. 실제 주문이 나가려면 세 가지가 동시에 열려야 합니다. 실행할 때 붙이는 실거래 옵션, 설정의 실거래 스위치, 계좌 연결. 하나라도 빠지면 모의로만 돕니다.</p>\n<p>그다음이 하락장 차단기입니다. 하루 손실 한도만 두면 하락장에서 매일 한도까지 잃고 다음 날 리셋되는 일이 반복됩니다. 그래서 최근 일주일 손실 속도가 빠르면 수량을 줄이고 손절이 연달아 나오면 매수를 멈춥니다. 멈춘 건 시간이 풀어 주지 않고 사람이 원인을 한 줄 적어야 풀립니다.</p>\n{{IMG:bot-code|하락장 차단기 파일 맨 위 설명. 시장을 예측하지 않고 내 장부를 보게 했습니다.}}\n<h2>실제로 깨졌던 순간들</h2>\n<ul>\n<li><b>밤 세션이 이틀 동안 통째로 안 돌았다.</b> '08:50이 지났으면 건너뛴다'는 규칙이 밤 22:00 회차에도 오늘 08:50 기준으로 걸렸습니다. 테스트가 새벽 시각만 넣어 보고 22:00은 한 번도 안 재 본 게 구멍이었습니다.</li>\n<li><b>윈도우에서 맥으로 옮기자 기록 폴더가 가짜로 생겼다.</b> 설정에 남은 윈도우 경로가 맥에서는 상대경로로 읽혀 작업 폴더 안에 같은 이름의 빈 폴더가 생겼고 봇은 빈 장부를 보고 있었습니다. 한도가 없다며 멈춘 덕에 발견했습니다.</li>\n</ul>\n<p>둘 다 수익률과는 상관없는 문제입니다. 혼자 돌리는 자동화에서 무서운 건 틀린 판단보다 아무도 모르게 안 도는 것이었습니다.</p>\n<h2>지금 생각하는 것</h2>\n<p>숫자가 좋아 보이는 백테스트보다, 매일 아침 기록이 제대로 남았는지 확인하는 습관이 더 중요했습니다. 다음 글에서는 백테스트 결과를 믿지 않게 된 과정을 적어 보겠습니다.</p>\n", "title": "퇴근 후 만든 개인 주식 연구 봇, 41만 줄 쓰고 배운 것 (파이썬 사이드 프로젝트)", "slug": "personal-stock-research-bot-side-project", "tags": ["사이드프로젝트", "파이썬", "자동매매", "주식봇", "백테스트", "개인개발", "회고"], "day": 18, "hour": "10", "minute": "30"};
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
