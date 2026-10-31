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

-- ===== 관리자·회원 등급 (관리자 화면 admin.html) =====
-- 역할: owner(운영자) > admin(관리자) > staff(스태프, 보기만) > member(회원). 운영자 지정은 db-setup 실행 때 owner_uid 로.
-- 등급(plan): 지금은 'free'(기본)·'plus'(플러스) 자리만. 결제를 붙이면 subscriptions 를 결제사 알림이 채우고,
-- 그때까지는 관리자가 기간을 정해 직접 줄 수 있음(베타·지인). 한도(현장 사진 수 등)는 plans.features 에서.
-- 권한 확인은 모두 아래 함수 안에서(security definer). 표는 본인 줄·공개 줄만 읽기.
create table if not exists public.members (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  role       text        not null default 'member' check (role in ('owner', 'admin', 'staff', 'member')),
  plan       text        not null default 'free',
  plan_until timestamptz,
  note       text        check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "member read own" on public.members;
create policy "member read own" on public.members for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;

create table if not exists public.plans (
  id       text    primary key check (id ~ '^[a-z0-9_]{2,20}$'),
  name     text    not null,
  price    int     not null default 0,          -- 한 달 원 (0 = 무료·미정)
  features jsonb   not null default '{}'::jsonb, -- {"photos": 300, ...}
  active   boolean not null default true,
  sort     int     not null default 0
);
insert into public.plans (id, name, price, features, sort) values
  ('free', '기본', 0, '{"photos": 300}'::jsonb, 0),
  ('plus', '플러스', 0, '{"photos": 3000}'::jsonb, 1)
on conflict (id) do nothing;
alter table public.plans enable row level security;
drop policy if exists "plans read" on public.plans;
create policy "plans read" on public.plans for select to anon, authenticated using (active);
revoke all on public.plans from anon, authenticated;
grant select on public.plans to anon, authenticated;

-- 결제(구독) 자리: 결제사를 붙이면 그쪽 알림(웹훅)을 받는 서버 함수가 이 표와 members.plan 을 고침
create table if not exists public.subscriptions (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  plan         text        not null references public.plans (id),
  status       text        not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  provider     text,
  provider_ref text,
  period_end   timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "subs read own" on public.subscriptions;
create policy "subs read own" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- 사이트 설정: public 인 줄은 누구나 읽음 (공지, 기능 켜고 끄기)
create table if not exists public.app_settings (
  key        text        primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  value      jsonb       not null,
  public     boolean     not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_settings (key, value, public) values
  ('notice', '{"on": false, "text": "", "link": ""}'::jsonb, true),
  ('features', '{"photos": true, "share": true, "membership": false}'::jsonb, true)
on conflict (key) do nothing;
alter table public.app_settings enable row level security;
drop policy if exists "settings read public" on public.app_settings;
create policy "settings read public" on public.app_settings for select to anon, authenticated using (public);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

-- 관리 기록 (누가 언제 무엇을 바꿨는지). 정책 없음: 함수로만
create table if not exists public.admin_log (
  id     bigint      generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  uuid,
  action text        not null,
  target text,
  detail jsonb
);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.members where user_id = auth.uid()), 'member');
$$;
create or replace function public.role_rank(r text)
returns int language sql immutable set search_path = '' as $$
  select case r when 'owner' then 3 when 'admin' then 2 when 'staff' then 1 else 0 end;
$$;
-- 기간이 지난 등급은 기본으로
create or replace function public.plan_of(p text, until timestamptz)
returns text language sql stable set search_path = '' as $$
  select case when until is not null and until < now() then 'free' else coalesce(p, 'free') end;
$$;

-- 내 회원 정보 (처음 부르면 회원 줄을 만듦): 역할·등급·등급 한도
create or replace function public.my_member()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); m public.members; pl text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.members (user_id) values (uid) on conflict (user_id) do nothing;
  select * into m from public.members where user_id = uid;
  pl := public.plan_of(m.plan, m.plan_until);
  return jsonb_build_object('id', uid, 'role', m.role, 'plan', pl, 'until', m.plan_until,
    'plan_name', (select name from public.plans where id = pl),
    'features', coalesce((select features from public.plans where id = pl), '{}'::jsonb));
end $$;

-- 현장 사진 한도: 등급의 photos (없으면 300장)
create or replace function public.photo_quota_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) < coalesce((select (p.features->>'photos')::int from public.members m
                              join public.plans p on p.id = public.plan_of(m.plan, m.plan_until)
                              where m.user_id = auth.uid()), 300)
  from storage.objects
  where bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text;
$$;

-- 한눈에 (스태프 이상)
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.role_rank(public.my_role()) < 1 then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active7', (select count(distinct user_id) from public.user_kv where updated_at > now() - interval '7 days'),
    'active30', (select count(distinct user_id) from public.user_kv where updated_at > now() - interval '30 days'),
    'shares', (select count(*) from public.shares),
    'photos', (select count(*) from storage.objects where bucket_id = 'photos'),
    'roles', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (select role, count(*) n from public.members group by role) x),
    'plans', (select coalesce(jsonb_object_agg(p, n), '{}'::jsonb) from
               (select public.plan_of(plan, plan_until) p, count(*) n from public.members group by 1) y),
    'recent', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
       select coalesce(raw_user_meta_data->>'nickname', raw_user_meta_data->>'name', '카카오 회원') as name, created_at
       from auth.users order by created_at desc limit 6) r));
end $$;

-- 회원 목록 (스태프 이상): 닉네임·가입·최근 로그인·최근 기록·역할·등급
create or replace function public.admin_members(q text default '', lim int default 50, off int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.role_rank(public.my_role()) < 1 then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(r) from (
    select u.id, coalesce(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'name', '카카오 회원') as name,
           u.created_at, u.last_sign_in_at,
           (select max(k.updated_at) from public.user_kv k where k.user_id = u.id) as active_at,
           (select count(*) from public.user_kv k where k.user_id = u.id and k.k like 'visit:%') as notes,
           coalesce(m.role, 'member') as role, coalesce(m.plan, 'free') as plan, m.plan_until, m.note
    from auth.users u left join public.members m on m.user_id = u.id
    where coalesce(q, '') = '' or coalesce(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'name', '') ilike '%' || q || '%'
          or u.id::text like q || '%'
    order by u.created_at desc limit least(greatest(lim, 1), 200) offset greatest(off, 0)) r), '[]'::jsonb);
end $$;

-- 역할·등급 바꾸기 (관리자 이상). 운영자·관리자를 주거나 빼는 건 운영자만, 마지막 운영자는 못 뺌
create or replace function public.admin_set_member(uid uuid, new_role text, new_plan text, until timestamptz default null, memo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := public.my_role(); cur text;
begin
  if public.role_rank(me) < 2 then raise exception 'forbidden' using errcode = '42501'; end if;
  if new_role not in ('owner', 'admin', 'staff', 'member') then raise exception 'bad role'; end if;
  if not exists (select 1 from public.plans where id = new_plan) then raise exception 'bad plan'; end if;
  cur := coalesce((select role from public.members where user_id = uid), 'member');
  if (public.role_rank(new_role) >= 2 or public.role_rank(cur) >= 2) and me <> 'owner' and new_role <> cur then
    raise exception 'owner only' using errcode = '42501'; end if;
  if cur = 'owner' and new_role <> 'owner' and (select count(*) from public.members where role = 'owner') <= 1 then
    raise exception 'last owner'; end if;
  insert into public.members (user_id, role, plan, plan_until, note, updated_at) values (uid, new_role, new_plan, until, memo, now())
  on conflict (user_id) do update set role = excluded.role, plan = excluded.plan, plan_until = excluded.plan_until,
    note = excluded.note, updated_at = now();
  insert into public.admin_log (actor, action, target, detail)
  values (auth.uid(), 'member', uid::text, jsonb_build_object('role', new_role, 'plan', new_plan, 'until', until, 'from', cur));
end $$;

-- 사이트 설정 바꾸기 (관리자 이상)
create or replace function public.admin_set_setting(k text, v jsonb, pub boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.role_rank(public.my_role()) < 2 then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.app_settings (key, value, public, updated_at, updated_by) values (k, v, pub, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, public = excluded.public, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_log (actor, action, target, detail) values (auth.uid(), 'setting', k, v);
end $$;

-- 등급 고치기·더하기 (운영자)
create or replace function public.admin_set_plan(pid text, pname text, pprice int, pfeatures jsonb, pactive boolean default true, psort int default 0)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() <> 'owner' then raise exception 'owner only' using errcode = '42501'; end if;
  if pid = 'free' and not pactive then raise exception 'free plan stays'; end if;
  insert into public.plans (id, name, price, features, active, sort) values (pid, pname, greatest(pprice, 0), pfeatures, pactive, psort)
  on conflict (id) do update set name = excluded.name, price = excluded.price, features = excluded.features,
    active = excluded.active, sort = excluded.sort;
  insert into public.admin_log (actor, action, target, detail)
  values (auth.uid(), 'plan', pid, jsonb_build_object('name', pname, 'price', pprice, 'features', pfeatures, 'active', pactive));
end $$;

-- 등급 목록 (관리자 화면: 꺼 둔 것까지)
create or replace function public.admin_plans()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.role_rank(public.my_role()) < 1 then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(p order by p.sort, p.id) from public.plans p), '[]'::jsonb);
end $$;

-- 관리 기록 (관리자 이상)
create or replace function public.admin_logs(lim int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.role_rank(public.my_role()) < 2 then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(r) from (
    select l.at, l.action, l.target, l.detail,
           coalesce(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'name', '알 수 없음') as actor,
           (select coalesce(t.raw_user_meta_data->>'nickname', t.raw_user_meta_data->>'name') from auth.users t
             where l.action = 'member' and t.id::text = l.target) as target_name
    from public.admin_log l left join auth.users u on u.id = l.actor
    order by l.at desc limit least(greatest(lim, 1), 200)) r), '[]'::jsonb);
end $$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.my_member() from public, anon;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_members(text, int, int) from public, anon;
revoke all on function public.admin_set_member(uuid, text, text, timestamptz, text) from public, anon;
revoke all on function public.admin_set_setting(text, jsonb, boolean) from public, anon;
revoke all on function public.admin_set_plan(text, text, int, jsonb, boolean, int) from public, anon;
revoke all on function public.admin_plans() from public, anon;
revoke all on function public.admin_logs(int) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_member() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_members(text, int, int) to authenticated;
grant execute on function public.admin_set_member(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.admin_set_setting(text, jsonb, boolean) to authenticated;
grant execute on function public.admin_set_plan(text, text, int, jsonb, boolean, int) to authenticated;
grant execute on function public.admin_plans() to authenticated;
grant execute on function public.admin_logs(int) to authenticated;

-- ===== 관심 단지 새 소식 알림 (웹 푸시, scripts/push_send.py 가 매일 배포 뒤 보냄) =====
--   push_subs  : 알림을 켠 기기 (회원당 10대까지). 본인은 함수로만 넣고 뺌
--   push_state : 회원별로 마지막에 알린 관심 단지 상태 (보내는 쪽만 씀)
--   push_keys  : 알림 키 한 쌍. 공개 키만 push_key() 로 읽고, 비공개 키는 보내는 쪽(secret 키)만
create table if not exists public.push_subs (
  endpoint   text        primary key check (char_length(endpoint) between 10 and 1000),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  p256dh     text        not null check (char_length(p256dh) <= 200),
  auth       text        not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);
create table if not exists public.push_state (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  seen       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.push_keys (
  id         int         primary key default 1 check (id = 1),
  pub        text        not null,
  priv       text        not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
alter table public.push_state enable row level security;
alter table public.push_keys enable row level security;
revoke all on public.push_subs, public.push_state, public.push_keys from anon, authenticated;
-- 보내는 쪽(secret 키 = service_role)이 쓰는 표. 새 프로젝트는 표를 만들어도 자동으로 열리지 않아 직접 엶
grant select, insert, update, delete on public.push_subs, public.push_state, public.push_keys to service_role;
grant select on public.user_kv to service_role;

create or replace function public.push_key()
returns text language sql stable security definer set search_path = '' as $$
  select pub from public.push_keys where id = 1
$$;

create or replace function public.push_sub_put(ep text, pk text, ak text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if ep !~ '^https://' or char_length(ep) > 1000 or char_length(pk) > 200 or char_length(ak) > 100 then raise exception 'bad endpoint'; end if;
  insert into public.push_subs (endpoint, user_id, p256dh, auth) values (ep, uid, pk, ak)
  on conflict on constraint push_subs_pkey do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth;
  if (select count(*) from public.push_subs s where s.user_id = uid) > 10 then
    delete from public.push_subs s where s.endpoint = (select s2.endpoint from public.push_subs s2 where s2.user_id = uid
      order by s2.created_at limit 1);
  end if;
end $$;

create or replace function public.push_sub_del(ep text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.push_subs s where s.endpoint = ep and s.user_id = auth.uid();
end $$;

-- 이 기기가 알림을 받고 있는지 (내 정보 화면의 스위치 상태)
create or replace function public.push_sub_has(ep text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_subs s where s.endpoint = ep and s.user_id = auth.uid())
$$;

revoke all on function public.push_key() from public;
revoke all on function public.push_sub_put(text, text, text) from public, anon;
revoke all on function public.push_sub_del(text) from public, anon;
revoke all on function public.push_sub_has(text) from public, anon;
grant execute on function public.push_key() to anon, authenticated;
grant execute on function public.push_sub_put(text, text, text) to authenticated;
grant execute on function public.push_sub_del(text) to authenticated;
grant execute on function public.push_sub_has(text) to authenticated;

-- ===== 옥상: 오늘 다녀간 사람 수 (브라우저마다 하루 하나의 무작위 번호만, 이름·위치 없음, 7일 지나면 지움) =====
create table if not exists public.roof_visits (
  d date not null,
  vid text not null,
  primary key (d, vid)
);
alter table public.roof_visits enable row level security;   -- 직접 읽고 쓰기는 막고 아래 함수로만
create or replace function public.roof_visit(vid text)
returns integer language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date; n integer;
begin
  if vid is null or length(vid) < 4 or length(vid) > 24 then return null; end if;
  insert into public.roof_visits(d, vid) values (today, vid) on conflict do nothing;
  delete from public.roof_visits where d < today - 7;
  select count(*) into n from public.roof_visits where d = today;
  return n;
end $$;
revoke all on function public.roof_visit(text) from public;
grant execute on function public.roof_visit(text) to anon, authenticated;
