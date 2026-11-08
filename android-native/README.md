# 집감 네이티브 셸 시제품 (실험용, 운영 앱 아님)

운영 앱(`android/`, TWA, `kr.jipgam.app`)은 **건드리지 않는다.** 이 폴더는 별도 시제품이다.

- 패키지 `kr.jipgam.shell.dev`, 서명은 Android 기본 debug 키만 사용(운영 업로드 키·비밀번호 없음). 같은 기기에 운영 앱과 나란히 설치된다.
- Kotlin + Jetpack Compose. 화면·기능·데이터는 사이트(WebView)를 그대로 사용.
- 네이티브로 얹은 것: 하단 탭(웹의 하단 탭은 숨김), 바텀시트(지역 바꾸기·새로고침·맨 위로·브라우저로 열기), Android 뒤로 가기(시트 → 탭 안 이전 화면 → 홈 탭 → 종료), 햅틱(탭 이동·시트·지역 선택), 상태바·내비게이션바(edge-to-edge, 밝게/다크 자동), 키보드가 올라오면 탭 숨김, 탭 전환 페이드.
- 확대: 두 손가락 확대(접근성)는 막지 않음.
- 로그인/기록 호환: WebView 의 localStorage·쿠키에 저장(TWA 의 크롬 저장소와는 **별도 저장소**라, 같은 계정이어도 이 기기의 로컬 기록(비회원 관심 단지 등)은 이어지지 않는다. 카카오 로그인 후 계정 동기화로만 공유). 실기기 검증 전.

## 빌드 (개발 환경: `~/android-dev`, JDK 17 · Gradle 8.9 · SDK 35 · AGP 8.7.3, 기존 GitHub Actions 와 동일)
```
. ~/android-dev/env.sh
cd android-native && echo "sdk.dir=$ANDROID_HOME" > local.properties && gradle --no-daemon assembleDebug
```
결과: `app/build/outputs/apk/debug/app-debug.apk` (약 8.7MB)

## 검증 상태
- 빌드: 성공(NOT_TESTED: 실행). 에뮬레이터: KVM 권한 필요(미실행). 실기기: NOT_TESTED.
