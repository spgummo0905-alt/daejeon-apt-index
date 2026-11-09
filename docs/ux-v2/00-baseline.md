# UX v2 — 00 기준선 (Baseline)
작성: 2026-11-09 · 코드 변경 없음(문서만) · 병합·배포 안 함

## 1. 기준 SHA
- 이 작업의 기준: `main` **`b2b0b382981e47915e674c9b9e07a9f8b509a2dc`** (= PR #335 병합 커밋 `b2b0b38`).
- 지시서가 분석한 기준은 `c92d0a8b…`(#333 병합 직후)입니다. 그 뒤에 **#335(C5-W2)가 병합**되어 아래가 이미 바뀌었습니다(`git diff c92d0a8..origin/main -- templates static`: 6개 파일, +150/-39).
  - `templates/_card.html`, `static/housecard.js`, `static/cardgen.js`, `static/app.js`, `static/style.css`, `templates/cards.html`
- 열려 있는 PR: **#334**(홈 '전체 랭킹 보기' 겹침 수정, 검수 대기, 이 브랜치 아래에 없음), #325(WebGL 실험 Draft), #295(Android 셸 Draft). 병합 완료: #331·#332·#333·#335.
- CI: main `b2b0b38` push 검사 성공(실행 42616339856). 마지막 운영 배포는 `c92d0a8`(실행 42607589795). **#335는 병합만 되었고 운영에는 아직 배포되지 않았습니다.**
- 시험(마지막 전체 실행, #335 브랜치): Node 106 통과 / Python 301 통과. 이 기준선 브랜치에서는 코드가 같아 다시 돌리지 않았습니다.
- 환경: WSL(Ubuntu), 저장소 `.venv`(PowerShell·Windows 명령은 그대로 쓰지 않고 같은 의미의 bash로 대체). `PYTHONUTF8` 불필요(리눅스는 UTF-8 기본).

## 2. 지시서와 현재 코드가 어긋나는 곳 (먼저 바로잡을 것)
| 지시서의 가정 | 실제(이 SHA) | 영향 |
|---|---|---|
| `cards.js`의 앨범은 아직 구형 `DJ.miniCard` | 함수 이름은 그대로지만 **#335로 `DJ.hc.collect`(남색 금속 수집 카드)를 앞·뒷면에 씀**. 옛 모양은 `housecard.js`가 없을 때만 | PR 02·10은 '이행'이 아니라 **남은 차이를 정리**하는 일 |
| 일조 중복 링크 숨김(#333) 유지 | `a.pv-link { display:none }`(≤719px)로 있음 | 되돌리지 말 것(지시서와 일치) |
| `aptCta()`에 observer 이미 있음 | 있음(`static/app.js` `aptCta`, 행동 줄이 보이면 `.apt-cta.off`) | 새로 만들지 말고 경계값만 보완 |
| PR #331~333 병합 완료 | 맞음. 단 **#334 열림, #335 병합** | 본문의 '승인 대기' 문구가 남은 PR이 있음 |
| 홈 카드 줄 | 홈 오른쪽 덱은 모바일용 가로 넘김을 PC에도 그대로 씀(PC에서 오른쪽 카드가 잘려 보임, 링크 3개 중복) | PR 03에서 PC 배치 별도 처리 |

## 3. 화면 ↔ 파일 ↔ PR 대응 (읽어서 확인한 범위)
| PR | 화면 | 주 파일 | 현재 동작(코드로 확인) | 시안이 새로 요구하는 것 |
|---|---|---|---|---|
| 01 | 앱 셸 | `base.html`, `style.css`, `app.js` | 하단 5탭(`.tabbar`, ≤719px 고정), 토스트(`DJ.toast`) | 공통 시트(`dialog`), 공통 모션 토큰, 취소 토스트 → **신규 기능** |
| 02 | 카드 | `_card.html`, `housecard.js`, `cardgen.js` | S 금·A 백금·B 청·C 슬레이트·D 중성. `DJ.drawArt`, `DJ.hc.collect` | 기울기·미산정 별도 상태 → 일부 신규 |
| 03 | 홈 | `index.html`, `home.js`, `housecard.js` | 이어서 볼 집·수집 덱·검색·카드첩 링크 | 질문형 검색·이어보기 한 장 → 배치 변경 |
| 04 | 찾기 | `finder.html`, `finder.js`, `fit.js`, `workplaces.js` | 즉시 결과 수·설문 저장(`survey`)·직장 위치·대출 계산 | 4묶음 화면, 완료 전 '먼저 보기' → **화면 재배치(계산 변경 금지)** |
| 05 | 지도 | `map.html`, `map.js`, `kmap.js` | 카카오 지도+핀 시트(미니 카드), 점 지도 대체 | 핀↔카드 연결 강조, 지도/목록 전환 유지 |
| 06 | 상세 | `apt.html`, `cardgen.js`, `app.js:aptCta` | #332 통합 신분증, 행동 줄(관심·비교·일조/입지·현장 체크·공유), 숨은 코스 버튼 | 근거 시트화·탭 → 단순 표시 변경 위주 |
| 07 | 일조 | `preview.html/js/css` | 동·층·날짜·시각, 건물 선택 | 직접 조작·rAF 합치기. **계산 파일 변경 금지** |
| 08 | 비교 | `compare.html`, `compare.js` | C3 카드 줄·먼저 볼 차이·표 | 표 정리, 2/3~4곳 규칙 |
| 09 | 임장 | `projects.*`, `course.*`, `field.js`, `visit-log-ui.js` | 프로젝트·코스·현장 모드·기록 | 저장 상태 구분, 순서 편집 위/아래 버튼 → **신규 UI** |
| 10 | MY·카드첩 | `my.html`, `cards.html`, `my.js`, `cards.js` | #331 MY 내 카드첩, #335 앨범 수집 카드 | 임장 기록 뒷면 연결, 필터 |

## 4. 반드시 보존할 데이터·계산 (코드에서 확인)
- 저장 계층: `DJ.records.get/put`(`static/records.js`), 앱 쪽 래퍼 `DJ.load/DJ.save`. 저장 때마다 시각 `djdex-t`에 기록, 카카오 로그인 시 `sync.js`가 기기 간 병합. 이 기기에만 남기는 키: `kmap`, `seed`, `watchN`(`DJ.LOCAL_ONLY`).
- 회원/비회원 이름 공간: 로그인 시 `djdex@<사용자id>:<키>`, 아니면 `djdex:<키>`(페이지 안 인라인 스크립트와 `records.js` 기준). **이 접두사 규칙을 바꾸지 않습니다.**
- 코드에서 읽은 키(실제 저장소 키 이름): `favs`, `recent`, `album`, `course`, `survey`, `watch`, `seen`, `acts`, `days`, `badges`, `prefs`, `pay`, `roof`, `seed`, `kmap`, `visit:<단지>`. (`projects` 계열은 `project-store.js`가 따로 관리하므로 PR 09 착수 때 별도로 열어 확인합니다 — **이번 기준선에서는 미확인**.)
- 계산·자료: `static/shadow.js`, `preview-calc.js`, `preview-iso.js`, `data/preview/**`, `fit.js`의 `pass/fit/works/maxPrice`, 가격 환산(`price_ref`, 84㎡ 기준), 점수 산출, 좌표, 사진 공개 범위.
- URL/딥링크: `apt/<slug>.html`, `compare.html?s=|a=|b=`, `finder.html?…#results`, `preview.html#c=&d=&f=&date=&t=`, `my.html#course` 등.

## 5. '새 기능'과 '단순 표시 변경' 구분
- **단순 표시 변경**(데이터·계산 그대로): 홈 구조·PC 배치, 찾기 4묶음 화면, 상세 근거 표시 위치, 비교 표 정리, MY/카드첩 배치.
- **새 동작(구현해야 하는 것)**: 공통 시트(포커스 트랩·Esc·복귀), 취소 가능한 토스트(3.5초), 담기 직후 개수·버튼 동기, 카드 기울기(정밀 포인터만), 방문 도장 애니메이션 1회, 코스 순서 위/아래 버튼, 저장 상태 3종(임시/동기화 완료/실패)과 재시도.
- **시안의 숫자·지도·일조 시간·한가람/한우리 값은 설명용**이며 운영에 넣지 않습니다.

## 6. 이번 단계에서 하지 않은 것 (NOT_TESTED / 미확인)
- 화면별 현재 Before 캡처(360·375·390·412·430·768·1280)와 상태별 캡처 — **아직 찍지 않음**(PR마다 같은 상태로 Before/After 첨부 예정).
- 4지역(대전·세종·청주·서울) 데모 빌드와 `djdex landing` — 이 단계에서는 **돌리지 않음**(PR 01 착수 때 확인).
- `projects.*`/`project-store.js` 저장 키 목록, 지도 SDK 실패 경로, 공유 PNG 실제 재생성(#335 때 확인한 결과만 있음).
- 실제 폰, TalkBack/VoiceOver, 운영 Lighthouse, 5명 사용자 과업 관찰: 하지 않음.
- 위의 미확인 항목은 해당 PR 본문에 결과로 채웁니다. 기준선 숫자를 개선 결과인 것처럼 쓰지 않습니다.

## 7. 제안하는 진행 순서와 주의
1. **#334 처리 결정**(홈 겹침, 작은 수정)을 먼저. PC 홈 덱(가로 넘김·링크 3개)은 PR 03에서 같이 정리할지 #334에 포함할지 결정 필요.
2. PR 01 → 02 → … 순서로 stacked Draft. 공유 `style.css` 충돌이 크므로 병렬 브랜치 금지.
3. PR 02·10은 #335 결과를 기준으로 **남은 차이(미산정 별도 상태, 앨범 필터, 기울기)** 만 다룹니다.
4. 각 PR은 Draft로 올리고 URL·검증 결과를 보고한 뒤 **사용자 승인 전 병합·배포·workflow_dispatch 하지 않습니다**.
