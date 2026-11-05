-- 옥상 방문자 따로 세기를 모두 없앱니다 (옥상 화면과 다른 기록에는 영향 없음)
begin;
drop function if exists public.roof_only_stats(text);
drop function if exists public.roof_only_visit(text);
drop table if exists public.roof_only_visits;
drop table if exists public.roof_stats_key;
commit;
