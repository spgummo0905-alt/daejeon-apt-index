-- 가족 공유(shared_view) 응답에서 현장 사진 정보를 뺍니다 (운영에 아직 적용하지 않음)
-- 왜: 사진 저장소를 비공개로 닫았지만 shared_view 는 방문 기록(visit:*)을 통째로 돌려줘서, 그 안의 사진 목록 p
--     ([[경로, 찍은 날]], 경로 = <회원 id>/<단지>/<난수>.jpg)가 로그인 없는 사람에게도 나갔습니다. 회원 id 노출 포함.
-- 무엇: 방문 기록은 체크(c, x)·메모(m)·호가(q)·다녀온 날(d)만 돌려줍니다. 허용 목록 방식이라 앞으로 방문 기록에 키가 늘어도 자동으로 새지 않습니다.
-- 영향: 관심 단지(favs)·코스(course)와 위 4가지는 그대로. share.js 는 사진 키가 없어도 정상 동작(사진 칸은 이 변경과 함께 제거).
--       함수 시그니처와 권한(anon 실행)은 그대로라 기존 호출(rpc/shared_view)에 영향 없음. 되돌리기: shared_view_no_photos_rollback.sql
create or replace function public.shared_view(t text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', coalesce(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '카카오 회원'),
    'since', s.created_at,
    'data', coalesce((select jsonb_object_agg(k.k,
        case when k.k like 'visit:%' then
          case when jsonb_typeof(k.v) = 'object' then
            coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(k.v) e where e.key in ('c', 'x', 'm', 'q', 'd')), '{}'::jsonb)
          else '{}'::jsonb end
        else k.v end)
      from public.user_kv k
      where k.user_id = s.user_id and (k.k in ('favs', 'course') or k.k like 'visit:%')), '{}'::jsonb))
  from public.shares s join auth.users u on u.id = s.user_id
  where s.token = t;
$$;
