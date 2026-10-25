-- 카카오 로그인 기록 보관함 (Supabase SQL Editor 에 통째로 붙여넣고 Run 한 번).
-- 여러 번 실행해도 됩니다. 사이트(static/sync.js)는 공개용 키로 이 표·함수만 씁니다.
--   user_kv   : 사람마다 기록 한 줄씩 (관심 단지, 최근 본, visit:<단지> …). 본인 줄만 읽고 지울 수 있음
--   sync_put  : 기록 저장. 더 새 것(고친 시각 t)만 덮어씀. 한 사람 3000줄·한 줄 200KB까지
--   delete_me : 계정과 기록 모두 삭제 (관심 화면 '계정과 저장된 기록 삭제')
--   ping      : 매일 밤 배포 때 불러 무료 프로젝트가 잠들지 않게

create table if not exists public.user_kv (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  k          text        not null check (char_length(k) between 1 and 80),
  v          jsonb       not null check (pg_column_size(v) <= 200000),
  t          bigint      not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);
create index if not exists user_kv_updated on public.user_kv (user_id, updated_at);

alter table public.user_kv enable row level security;
drop policy if exists "read own" on public.user_kv;
create policy "read own" on public.user_kv for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "delete own" on public.user_kv;
create policy "delete own" on public.user_kv for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_kv from anon, authenticated;
grant select, delete on public.user_kv to authenticated;

create or replace function public.sync_put(items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 300 then raise exception 'bad items'; end if;
  insert into public.user_kv (user_id, k, v, t)
  select uid, i->>'k', i->'v', (i->>'t')::bigint from jsonb_array_elements(items) i
  on conflict (user_id, k) do update set v = excluded.v, t = excluded.t, updated_at = now()
    where public.user_kv.t < excluded.t;
  if (select count(*) from public.user_kv where user_id = uid) > 3000 then raise exception 'too many rows'; end if;
end $$;

create or replace function public.delete_me()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end $$;

create or replace function public.ping()
returns int language sql stable as $$ select 1 $$;

revoke all on function public.sync_put(jsonb) from public, anon;
revoke all on function public.delete_me() from public, anon;
grant execute on function public.sync_put(jsonb) to authenticated;
grant execute on function public.delete_me() to authenticated;
grant execute on function public.ping() to anon, authenticated;
