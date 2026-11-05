-- 현장 사진 저장소를 비공개로 옮기는 2단계 중 "버킷 닫기" (운영에 아직 적용하지 않음. 순서와 확인은 docs/사진-저장소-감사.md)
-- 적용 전에 반드시: (1) 사진 보기 코드가 서명 주소를 쓰는 배포가 먼저 나가 있을 것, (2) 아래 확인 쿼리의 숫자를 적어 둘 것
-- 되돌리기: scripts/migrations/photos_private_rollback.sql
\echo '적용 전 확인: 사진 수와 비공개 여부'
select count(*) as photos from storage.objects where bucket_id = 'photos';
select id, public from storage.buckets where id = 'photos';

begin;
update storage.buckets set public = false where id = 'photos';
-- 객체는 하나도 옮기거나 지우지 않습니다. 주소 규칙(<회원>/<단지>/<무작위>.jpg)도 그대로입니다.
-- 이 문장이 바꾸는 것은 "누구나 주소만 알면 열림" 하나뿐입니다.
select id, public from storage.buckets where id = 'photos';
-- 사진 수가 위와 같은지 확인한 뒤 commit; 다르면 rollback;
commit;
