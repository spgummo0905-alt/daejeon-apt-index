# 위성 사진 대리 서버 (Supabase Edge Function `satellite`) — 현재 사용 중
브이월드가 Cloudflare 서버(Workers)의 요청을 거절(520)해서, 서울(ap-northeast-2)에서 도는 Supabase 함수로 옮겼습니다.
- 올리는 법: Supabase > Edge Functions > `satellite` 에 `index.ts` 전체를 붙여 넣고 **Verify JWT 끄기**. 시크릿 `VWORLD_KEY` 추가(본인 화면에서만 입력).
- `GET /functions/v1/satellite/tile?lat&lng&z&dx&dy`. jipgam.kr 요청만, 한국 좌표·확대 15~18·둘레 ±2칸만. 사진은 저장하지 않음.
- DB·표·로그인·SQL은 쓰지 않습니다. 지우면 사이트는 위성 칸만 사라집니다(`config.toml`의 `satellite_url`을 비우면 꺼짐).
- `workers/satellite/`(Cloudflare 버전)는 브이월드가 거절해 쓰지 않습니다. 참고용으로만 둡니다.
