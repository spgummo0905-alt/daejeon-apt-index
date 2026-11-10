# 위성 사진 '위에서 본 단지' (feat/satellite-proxy)
기준: main `93f75d8`. 브이월드 키가 도메인 제한이 없는 것으로 확인되어(다른 주소에서 요청해도 사진이 받아짐), 키를 사이트 코드에 넣지 않고 **Cloudflare Workers 대리 서버**를 거치게 했습니다.

## 구성
- `workers/satellite/` : 대리 서버(키는 Workers 시크릿 `VWORLD_KEY`에만). `GET /tile?lat&lng&z&dx&dy` → 위성 타일. jipgam.kr에서 온 요청만, 한국 안 좌표·확대 15~18·둘레 ±2칸만 허용. 사진은 저장하지 않고 그대로 전달(브라우저에만 1시간).
- `static/satellite.js` : 단지 둘레 3×3 타일을 받아 한 장처럼 표시. 페이지가 다 뜬 뒤 한가할 때 불러오고, 5장 미만이면 칸 전체를 지움(빈 칸·깨진 그림 없음).
- `templates/apt.html` : `satellite_url`이 설정된 경우에만 칸 생성. **출처 표기 "브이월드(국토교통부)"와 촬영 시점 주의 문구** 포함.
- `config.toml` : `satellite_url = ""` (기본 꺼짐).

## 켜는 방법 (사용자가 할 일)
1. Cloudflare 가입 후 `workers/satellite/README.md` 순서대로 배포하고 키를 **본인 터미널에서** `wrangler secret put VWORLD_KEY`로 입력
2. 나온 workers.dev 주소를 알려 주면 `config.toml`의 `satellite_url`에 넣고 배포

## 검증
Worker 시험 7개(출처 제한·좌표·확대 범위·키 비노출·옆 타일 범위), UI 시험 3개, 로컬 임시 서버로 실제 타일 9장 표시 확인(390px 화면에서 이음새 없이 한 장처럼 보이고 가운데 위치 점·출처 문구 읽힘). Node 113 / Python 360.
NOT_TESTED: 실제 Cloudflare 배포, 운영 사이트에서의 표시, 실제 폰, 속도(Lighthouse), 브이월드 일일 한도.
알려진 한계: 대리 서버 없이 켜면 칸이 지워짐(기본 꺼짐이라 영향 없음). 위성 사진은 촬영 시점이 달라 지금 모습과 다를 수 있음.

사용자 승인 전 병합·배포하지 않았습니다.

## 추가(켜기)
- Cloudflare Workers는 브이월드가 520으로 거절해 쓸 수 없음을 운영에서 확인(4가지 방식 모두 실패, 같은 키로 이 컴퓨터에서 직접 요청은 성공).
- Supabase 함수 `satellite`(서울 리전)로 옮겨 허용 주소 200·다른 주소 403·범위 밖 400·옆 타일 200을 확인했고, `config.toml`의 `satellite_url`에 그 주소를 넣어 켬.
- 사진 칸 화면 확인은 데모 단지(가짜 좌표)로 했기 때문에 숲이 나옴. 실제 단지는 운영에서 확인 필요.
