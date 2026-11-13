window.__go=async()=>{
window.confirm=()=>true; window.alert=()=>{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SPEC={"html": "<p><b>개인 주식 연구 봇을 만들면서 지표를 매일 한 화면에서 보려고 웹 분석 페이지도 따로 만들었습니다. 지수·환율·금리·VIX부터 섹터 히트맵, 거래량 급증 종목, 종목별 캔들 차트까지 한 번에 보입니다. 아래 화면은 모두 가상의 데모 데이터입니다.</b></p>\n<p style=\"color:#777;font-size:13px\">투자 권유가 아닙니다. 화면의 종목명과 숫자는 가상의 데모 데이터입니다.</p>\n<p>봇이 아침에 브리핑을 보내 줘도 숫자만 보면 감이 잘 안 왔습니다. 오늘 시장이 어떤 분위기인지, 어느 섹터에 돈이 몰렸는지는 그림으로 봐야 빨리 읽힙니다. 그래서 봇과는 완전히 떨어진 읽기 전용 웹을 하나 더 만들었습니다.</p>\n{{IMG:w-top|첫 화면 맨 위 '시황 보드'. 코스피·S&P500·나스닥·환율·미국 10년물 금리·VIX가 한 줄로 나옵니다.}}\n<h2>첫 화면에서 보이는 것</h2>\n<table border=\"1\" cellpadding=\"8\" style=\"border-collapse:collapse;width:100%\">\n<tr><th>구역</th><th>보여 주는 것</th><th>왜 넣었나</th></tr>\n<tr><td>시황 보드</td><td>지수 6개와 리스크 국면 표시</td><td>아침에 3초 안에 분위기 파악</td></tr>\n<tr><td>시장 요약</td><td>상승·하락 종목 비율, 52주 고점·저점 종목 수</td><td>지수만 오르고 대부분 내린 날을 잡으려고</td></tr>\n<tr><td>섹터 히트맵</td><td>섹터별 등락률과 거래량 변화</td><td>돈이 어디로 몰렸는지</td></tr>\n<tr><td>Market Movers</td><td>상승·하락·거래대금·변동성 상위</td><td>오늘 튄 종목 확인</td></tr>\n<tr><td>거래량 급증·신고가</td><td>20일 평균 대비 거래량, 52주 범위 위치</td><td>막 움직이기 시작한 종목 후보</td></tr>\n</table>\n{{IMG:w-heat|섹터 히트맵. 칸 색은 등락률, 칸 안의 작은 글씨는 평소보다 거래량이 얼마나 늘었는지입니다.}}\n<p>히트맵에서 신경 쓴 건 색만으로 정보를 전하지 않는 것입니다. 빨강·파랑을 구분하기 어려운 사람도 읽을 수 있게 칸마다 ▲▼ 기호와 숫자를 같이 적었습니다.</p>\n<h2>종목 하나를 열면</h2>\n{{IMG:w-stock|종목 페이지 윗부분. 1일부터 1년까지 기간별 수익률이 한 줄로 나옵니다.}}\n<p>종목 페이지는 기간별 수익률, 캔들 차트, 핵심 지표 순서입니다. 차트에는 20일·60일·120일·200일 이동평균선을 켜고 끌 수 있고, 선 모양(실선·점선)으로도 구분됩니다.</p>\n{{IMG:w-stock2|1년 캔들 차트와 거래량. 차트 아래에 '마지막 종가가 각 이동평균선 위에 있는지'를 문장으로 풀어 줍니다.}}\n<p>차트 아래 문장 요약은 제가 제일 좋아하는 부분입니다. \"1년 동안 44.91% 올랐고, 종가가 20일선·60일선 위에 있다\"처럼 차트를 말로 다시 적어 줍니다. 차트를 읽기 어려운 날에도 한 줄이면 위치가 파악됩니다.</p>\n<h2>스크리너와 용어 사전</h2>\n{{IMG:w-screener|조건 스크리너. 시장·섹터·등락률·거래량 같은 조건으로 종목을 거릅니다.}}\n<p>조건으로 종목을 거르는 스크리너와 PER·ROE 같은 용어를 쉬운 말로 풀어 둔 용어 사전도 있습니다. 결과 화면은 링크로 공유할 수 있습니다.</p>\n<h2>만들면서 지킨 원칙</h2>\n<ul>\n<li><b>매매 코드와 완전히 분리.</b> 이 웹은 봇의 모듈·설정 파일·증권사 연결 코드를 가져다 쓰지 않습니다. 테스트가 그걸 직접 검사합니다.</li>\n<li><b>읽기 전용.</b> 화면에서 주문이나 설정 변경은 할 수 없습니다.</li>\n<li><b>데이터 출처와 기준 시각을 모든 칸에.</b> 지연 데이터인지, 언제 기준인지를 숫자 옆에 붙였습니다.</li>\n<li><b>테스트 762개.</b> 모든 화면 렌더링, 보안 헤더, 입력 검증, 모바일 접근성까지 검사합니다.</li>\n</ul>\n<p>봇이 판단을 하고, 이 페이지는 그 판단을 사람이 눈으로 확인하는 창 역할을 합니다. 숫자만 쌓아 두면 결국 안 보게 되더라고요.</p>", "title": "주식 지표를 한 화면에: 개인용 시장 분석 웹페이지 만든 과정 (FastAPI 사이드 프로젝트)", "slug": "stock-indicator-dashboard-web-side-project", "tags": ["사이드프로젝트", "주식대시보드", "섹터히트맵", "FastAPI", "파이썬", "시장지표", "개인개발"], "day": 20, "hour": "10", "minute": "30"};
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
