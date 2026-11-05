-- 비공개로 옮긴 뒤 사진이 안 보이는 문제가 생기면 즉시 되돌립니다 (객체는 그대로라 데이터 손실 없음)
begin;
update storage.buckets set public = true where id = 'photos';
select id, public from storage.buckets where id = 'photos';
select count(*) as photos from storage.objects where bucket_id = 'photos';
commit;
