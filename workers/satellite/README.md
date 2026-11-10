# 집감 위성 사진 대리 서버 (Cloudflare Workers)

브이월드 키를 사이트 코드에 노출하지 않고 위성 사진을 보여 주기 위한 작은 서버입니다.
- `GET /tile?lat=36.35&lng=127.38&z=17` → 그 좌표의 위성 사진 타일(JPEG)
- `https://www.jipgam.kr` 에서 온 요청만 응답, 한국 안의 좌표·확대 15~18만 허용
- 사진은 저장하지 않고 그대로 전달(브라우저에만 1시간 보관). 화면에는 "브이월드" 출처 표기를 붙입니다.

## 배포 방법 (처음 한 번, 약 10분)
1. https://dash.cloudflare.com 가입(무료) → 로그인
2. 컴퓨터에서 이 폴더로 이동해 `npx wrangler login` (브라우저가 열리면 허용)
3. `npx wrangler deploy` → 끝나면 `https://jipgam-satellite.<계정이름>.workers.dev` 주소가 나옵니다
4. `npx wrangler secret put VWORLD_KEY` → 안내가 나오면 **본인 터미널에서** 브이월드 키를 붙여 넣기 (채팅에 붙여 넣지 마세요)
5. 나온 주소(workers.dev)만 알려 주세요. 키가 아니라 주소만입니다.

## 비용·한도
무료 요금제는 하루 10만 요청까지입니다. 넘으면 사진만 멈추고 사이트는 정상입니다.
