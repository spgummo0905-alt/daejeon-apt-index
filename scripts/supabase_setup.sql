-- 카카오 로그인 기록 보관함 (Supabase SQL Editor 에 통째로 붙여넣고 Run 한 번).
-- 여러 번 실행해도 됩니다. 사이트(static/sync.js)는 공개용 키로 이 표·함수만 씁니다.
--   user_kv   : 사람마다 기록 한 줄씩 (관심 단지, 최근 본, visit:<단지> …). 본인 줄만 읽고 지울 수 있음
--   sync_put  : 기록 저장. 더 새 것(고친 시각 t)만 덮어씀. 한 사람 3000줄·한 줄 200KB까지
--   delete_me : 계정과 기록 모두 삭제 (관심 화면 '계정과 저장된 기록 삭제')
--   ping      : 매일 밤 배포 때 불러 무료 프로젝트가 잠들지 않게
--   shares·shared_view : 가족과 함께 보기 공유 링크 / storage photos : 현장 사진

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

-- ===== 가족과 함께 보기: 공유 링크 (관심 화면 '함께 보기') =====
-- 한 사람에 링크 하나. 링크를 아는 사람은 관심 단지·임장 코스·임장 노트(사진 포함)를 볼 수 있고, 끊으면 바로 막힘.
create table if not exists public.shares (
  token      text        primary key check (char_length(token) >= 24),
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shares enable row level security;   -- 정책 없음: 아래 함수로만
revoke all on public.shares from anon, authenticated;

create or replace function public.share_create()
returns text language plpgsql security definer set search_path = '' as $$
declare tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.shares where user_id = auth.uid();
  insert into public.shares (token, user_id) values (tok, auth.uid());
  return tok;
end $$;

create or replace function public.share_get()
returns text language sql stable security definer set search_path = '' as $$
  select token from public.shares where user_id = auth.uid();
$$;

create or replace function public.share_revoke()
returns void language sql security definer set search_path = '' as $$
  delete from public.shares where user_id = auth.uid();
$$;

-- 링크로 보는 쪽 (로그인 없이): 닉네임과 관심 단지·코스·임장 노트만
create or replace function public.shared_view(t text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', coalesce(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '카카오 회원'),
    'since', s.created_at,
    'data', coalesce((select jsonb_object_agg(k.k, k.v) from public.user_kv k
                      where k.user_id = s.user_id and (k.k in ('favs', 'course') or k.k like 'visit:%')), '{}'::jsonb))
  from public.shares s join auth.users u on u.id = s.user_id
  where s.token = t;
$$;

revoke all on function public.share_create() from public, anon;
revoke all on function public.share_get() from public, anon;
revoke all on function public.share_revoke() from public, anon;
grant execute on function public.share_create() to authenticated;
grant execute on function public.share_get() to authenticated;
grant execute on function public.share_revoke() to authenticated;
grant execute on function public.shared_view(text) to anon, authenticated;

-- ===== 현장 사진: Storage 'photos' (사진 주소를 아는 사람만 볼 수 있음, 올리기·지우기는 본인 폴더만) =====
-- 경로: <사용자 id>/<단지>/<무작위>.jpg. 사이트가 1280px JPEG 로 줄여 올리고(위치 정보 없음), 한 장 1MB·한 사람 300장까지.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.photo_quota_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) < 300 from storage.objects
  where bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text;
$$;
revoke all on function public.photo_quota_ok() from public, anon;
grant execute on function public.photo_quota_ok() to authenticated;

drop policy if exists "photos insert own" on storage.objects;
create policy "photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text and public.photo_quota_ok());
drop policy if exists "photos select own" on storage.objects;
create policy "photos select own" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "photos delete own" on storage.objects;
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
