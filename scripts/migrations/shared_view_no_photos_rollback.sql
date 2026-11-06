-- shared_view 를 사진 정보를 뺀 버전에서 이전 버전(방문 기록을 통째로 돌려줌)으로 되돌립니다.
-- 주의: 되돌리면 공유 응답에 사진 경로(회원 id 포함)가 다시 나갑니다. 문제가 있을 때만.
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
