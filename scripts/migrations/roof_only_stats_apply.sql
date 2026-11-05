-- 옥상 방문자 수를 따로 세는 장치 (화면에는 아무것도 안 보임, 열쇠를 가진 운영자만 합계를 읽음)
-- 담는 것: 날짜 + 브라우저마다 하루만 쓰는 무작위 번호 (이름·위치·기록 없음), 30일 지나면 지움
-- 되돌리기: roof_only_stats_rollback.sql
create table if not exists public.roof_only_visits (
  d date not null,
  vid text not null,
  primary key (d, vid)
);
alter table public.roof_only_visits enable row level security;   -- 직접 읽고 쓰기는 막고 아래 함수로만

create table if not exists public.roof_stats_key (h text primary key);   -- 열쇠의 해시(복원 불가)만 둠
alter table public.roof_stats_key enable row level security;
insert into public.roof_stats_key (h) values ('__ROOF_STATS_KEY_HASH__') on conflict do nothing;

create or replace function public.roof_only_visit(vid text)
returns void language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if vid is null or length(vid) < 4 or length(vid) > 24 then return; end if;
  insert into public.roof_only_visits(d, vid) values (today, vid) on conflict do nothing;
  delete from public.roof_only_visits where d < today - 30;
end $$;
revoke all on function public.roof_only_visit(text) from public;
grant execute on function public.roof_only_visit(text) to anon, authenticated;

-- 최근 날짜별 옥상 방문 브라우저 수. 열쇠가 맞지 않으면 아무것도 돌려주지 않음
create or replace function public.roof_only_stats(k text)
returns table (d date, n integer) language plpgsql stable security definer set search_path = '' as $$
begin
  if k is null or length(k) < 20 or not exists (
    select 1 from public.roof_stats_key s where s.h = encode(sha256(convert_to(k, 'utf8')), 'hex')) then
    return;
  end if;
  return query select v.d, count(*)::integer from public.roof_only_visits v group by v.d order by v.d desc;
end $$;
revoke all on function public.roof_only_stats(text) from public;
grant execute on function public.roof_only_stats(text) to anon, authenticated;
