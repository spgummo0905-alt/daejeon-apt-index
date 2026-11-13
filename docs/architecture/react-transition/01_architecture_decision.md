# ADR-001 · React 파일럿은 격리 폴더에서 읽기 전용으로만 (R1)
상태: 승인됨(사장님 'r1시작', 2026-11-13). 범위: R1만. R2 이후는 별도 승인.

## 결정
- 위치: `frontend/react-pilot/` (React 19.3.1 + TypeScript + Vite 8, 버전 고정, `--ignore-scripts`로 설치).
- 운영 사이트와 섞지 않음: 운영 파일(`static/`, `templates/`, `djdex/`, 서비스워커, `.github/workflows`)은 수정하지 않음. 파일럿 결과물(`dist/`)은 git에 올리지 않고 운영 배포(Pages)에도 포함되지 않음.
- 쓰기 금지: 파일럿 코드는 localStorage·sessionStorage·쿠키·IndexedDB·네트워크·`DJ` 전역·서비스워커를 쓰지 않음. 시험(`tests/isolation.test.ts`)이 코드 줄을 검사해 강제함(주석 제외, 검사 자체가 눈먼지 않는지 점검 포함).
- 색: 운영 CSS와 같은 값만 사용(`src/tokens/tokens.ts`). 임의 hex 금지를 시험이 검사.
- 검색 노출 차단: `index.html`에 noindex.
- 데이터: R1은 가짜 시험 자료(이름에 "시험")만 사용. 실제 complexes.json 연결은 R3.

## 하지 않는 것
SPA 라우터, 운영 페이지 교체, 저장 형식 변경, 홈·필터·임장 기능 재구현, 카드 수집 기능, SEO·PWA 재구축, #392·#325·#295 영향.

## 중지 조건 (하나라도 해당하면 즉시 중단)
숫자·기록 변경, 운영 파일 수정 필요, 저장 이중 실행, 성능 후퇴, SEO 영향.
