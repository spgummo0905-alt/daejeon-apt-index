# 롤백
R1은 운영에 연결되지 않으므로 운영 롤백이 필요 없음.
- 되돌리기: 이 PR의 병합 커밋을 되돌리거나 `frontend/react-pilot/`와 `docs/architecture/react-transition/`을 삭제.
- 운영 영향 확인: 병합 전후로 `site-demo` 출력과 운영 배포 파일이 같아야 함(이 폴더는 빌드 입력에 없음).
