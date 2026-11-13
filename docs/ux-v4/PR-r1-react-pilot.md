# React 전환 R1 · 격리 파일럿 기반 (react/r1-pilot-base)
승인: 사장님 'r1시작'(2026-11-13). **병합은 별도 승인 전까지 하지 않음.** 운영 사이트와 연결되지 않는 변경입니다.
## 만든 것
- `frontend/react-pilot/`: React 19.3.1 + TypeScript + Vite 8(버전 고정, `--ignore-scripts` 설치). 운영 배포(Pages)와 별개의 빌드.
- 읽기 전용 컴포넌트 3개: `GradeBadge`(글자+색, 미산정 표시), `StateNotice`(운영과 같은 저장 상태 문구 4종), `MiniCard`(실거래/추정 분리, 없는 값은 "자료 없음"). 시험용 가짜 단지 3개(이름에 "시험").
- 색은 운영 CSS와 같은 값만 사용. `noindex`로 검색 차단.
- 문서: `docs/architecture/react-transition/` 00_inventory(R0 감사), 01 ADR, 03_benchmarks(실측), 04_rollback.
## 지킨 것
운영 파일(static/templates/djdex/.github/tests/scripts/config) 변경 0개. 저장소·네트워크·`DJ`·서비스워커를 쓰지 않음 -> 시험이 코드 줄을 검사해 강제.
## 확인
- 파일럿: 타입 검사 오류 0, Vitest 16개 통과(컴포넌트 11 + 격리 규칙 5), 빌드 성공.
- 실제 화면(빌드 결과, 390·360·1280): 가로 넘침 0, 오류 0, 카드 3·안내 4, 버튼·링크·입력 0개, localStorage·쿠키 0, 요청은 페이지·JS·CSS 3개뿐.
- 기존 시험: Node 116 / Python 490 그대로 통과.
## 실측 (03_benchmarks.md)
빌드 JS 216.4KB(gzip 67.3KB) + CSS 0.8KB(gzip 0.4KB) = gzip 67.8KB. 운영 단지 상세 스크립트 합계(약 99KB, R0 측정)와 견주면 React 런타임만으로 약 2/3가 추가됨. R0 보고서의 "40~50KB" 추정은 틀렸음(정정함).
## 알려진 한계 / NOT_TESTED
실제 폰 로딩 시간·메모리·Lighthouse, 서울·세종·청주 데이터, 실제 complexes.json 연결(R3), 시각 회귀 골든 캡처.
## GO/NO-GO (다음 단계)
- R2(승인된 UI와 값 패리티 캡처)로 가려면 먼저 성능 예산을 사장님이 정해야 함. 지금 실측은 운영 페이지에 싣기에는 무거움. 파일럿 안에서만 하면 위험 없음.
## 롤백: 병합 커밋 되돌리기 또는 두 폴더 삭제. 운영 영향 없음.
