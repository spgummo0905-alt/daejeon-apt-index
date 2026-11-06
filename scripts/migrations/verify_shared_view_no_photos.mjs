// shared_view 사진 제거 SQL 을 실제 Postgres 엔진(PGlite, WASM)으로 확인합니다. 운영 DB 에는 접속하지 않습니다.
// 쓰는 법(임시 폴더에서만 설치, 저장소에는 의존성 추가 없음):
//   mkdir /tmp/pg && cd /tmp/pg && npm init -y && npm install @electric-sql/pglite
//   (supabase_setup.sql 에서 user_kv 표 줄 9~26 과 공유 줄 56~105 를 real_part1.sql, real_part2.sql 로 잘라 두기)
//   node verify_shared_view_no_photos.mjs <real_part*.sql 폴더>/.. <저장소 경로>

import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
const S = process.argv[2], W = process.argv[3]
const rd = f => fs.readFileSync(f, 'utf8')
const db = new PGlite()
const ok = (n, v, x = '') => console.log(v ? '통과' : '실패', n, x)
// 운영과 같은 최소 환경: auth.users, auth.uid(), 역할 anon/authenticated
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create role anon; create role authenticated;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
`)
await db.exec(rd(S + '/pg/real_part1.sql'))     // 운영 SQL 그대로: user_kv
await db.exec(rd(S + '/pg/real_part2.sql'))     // 운영 SQL 그대로: shares, share_create/get/revoke, shared_view
const U = '11111111-1111-1111-1111-111111111111'
await db.exec(`insert into auth.users values ('${U}', '{"nickname":"시험"}')`)
const photo = '["' + U + '/DEMO-0001/aaaaaaaaaaaaaaaaaaaaaaaa.jpg","2026-11-05"]'
const visit = `{"c":[true,false],"x":{"a":true},"m":"메모 내용","q":[[34,10,98000,"2026-11-05"]],"d":"2026-11-05","p":[${photo}],"future":"secret","extra":{"k":1}}`
await db.exec(`insert into public.user_kv (user_id,k,v,t) values ('${U}','favs','["DEMO-0001"]',1),('${U}','course','{"list":["DEMO-0001","DEMO-0002"],"mode":"walk"}',1),('${U}','visit:DEMO-0001','${visit}',1),('${U}','visit:DEMO-0002','{"m":"두번째"}',1),('${U}','visit:BROKEN','"문자열"',1),('${U}','other','{"secret":1}',1)`)
await db.exec(`set test.uid = '${U}'`)
const tok = (await db.query(`select public.share_create() t`)).rows[0].t
await db.exec(`set test.uid = ''`)
const view = async () => (await db.query(`select public.shared_view('${tok}') v`)).rows[0].v
// 1) 지금 운영 함수(변경 전)
let v = await view()
const has = o => JSON.stringify(o)
ok('[변경 전] 공유 응답에 사진 목록(p)이 들어 있음 = 문제 재현', has(v).includes('"p"') && has(v).includes(U + '/DEMO-0001/'), '회원 id가 경로에 포함: ' + has(v).includes(U))
// 2) 새 SQL 적용
await db.exec(rd(W + '/scripts/migrations/shared_view_no_photos_apply.sql'))
v = await view()
const vis = v.data['visit:DEMO-0001']
ok('[변경 후] 사진 목록(p)이 응답에 없음', !('p' in vis), Object.keys(vis).join(','))
ok('[변경 후] 회원 id·사진 경로 문자열이 응답 어디에도 없음', !has(v).includes(U) && !has(v).includes('.jpg') && !has(v).includes('aaaaaaaa'))
ok('[변경 후] 체크·메모·호가·다녀온 날은 그대로', has(vis.c) === '[true,false]' && vis.m === '메모 내용' && vis.q[0][2] === 98000 && vis.d === '2026-11-05' && vis.x.a === true)
ok('[변경 후] 허용 목록 밖 키(future, extra)도 안 나감', !('future' in vis) && !('extra' in vis))
ok('[변경 후] 관심 단지·코스는 그대로', has(v.data.favs) === '["DEMO-0001"]' && v.data.course.list.length === 2 && v.data.course.mode === 'walk')
ok('[변경 후] 두 번째 방문 기록·깨진 기록(문자열)도 오류 없이 처리', v.data['visit:DEMO-0002'].m === '두번째' && has(v.data['visit:BROKEN']) === '{}')
ok('[변경 후] 공유 대상이 아닌 키(other)는 안 나감', !('other' in v.data))
ok('[변경 후] 이름·시작일은 그대로', v.name === '시험' && !!v.since)
// 3) 링크 취소 후
await db.exec(`set test.uid = '${U}'`); await db.exec(`select public.share_revoke()`); await db.exec(`set test.uid = ''`)
const after = (await db.query(`select public.shared_view('${tok}') v`)).rows[0].v
ok('링크를 취소하면 같은 주소로 아무것도 안 나옴(null)', after === null)
// 4) 새 링크를 만들면 옛 주소는 계속 막힘
await db.exec(`set test.uid = '${U}'`); const tok2 = (await db.query(`select public.share_create() t`)).rows[0].t; await db.exec(`set test.uid = ''`)
const old = (await db.query(`select public.shared_view('${tok}') v`)).rows[0].v
ok('새 링크를 만들면 옛 링크는 계속 막힘, 새 링크는 열림', old === null && tok2 !== tok && (await db.query(`select public.shared_view('${tok2}') v`)).rows[0].v !== null)
// 5) 권한: 로그인 없는 역할(anon)이 표를 직접 읽거나 다른 함수를 부를 수 없음, shared_view 는 부를 수 있음
await db.exec(`set role anon`)
let direct = 'ok'; try { await db.query(`select * from public.user_kv`) } catch (e) { direct = '막힘' }
let shr = 'ok'; try { await db.query(`select * from public.shares`) } catch (e) { shr = '막힘' }
let cr = 'ok'; try { await db.query(`select public.share_create()`) } catch (e) { cr = '막힘' }
const viaFn = (await db.query(`select public.shared_view('${tok2}') v`)).rows[0].v
await db.exec(`reset role`)
ok('로그인 없는 사람은 기록 표·공유 표를 직접 못 읽고 링크를 새로 못 만듦', direct === '막힘' && shr === '막힘' && cr === '막힘', `user_kv ${direct}, shares ${shr}, share_create ${cr}`)
ok('로그인 없는 사람도 올바른 링크로는 shared_view 가 동작(권한 유지)', viaFn && viaFn.name === '시험')
// 6) 되돌리기 SQL 이 동작하고 옛 동작으로 돌아감
await db.exec(rd(W + '/scripts/migrations/shared_view_no_photos_rollback.sql'))
const rb = (await db.query(`select public.shared_view('${tok2}') v`)).rows[0].v
ok('되돌리기 SQL 적용 시 옛 동작(사진 목록 다시 나감)으로 돌아감 = 되돌리기 확인', JSON.stringify(rb).includes('"p"'))
// 7) 적용을 두 번 해도 안전(멱등)
await db.exec(rd(W + '/scripts/migrations/shared_view_no_photos_apply.sql')); await db.exec(rd(W + '/scripts/migrations/shared_view_no_photos_apply.sql'))
ok('적용 SQL 을 두 번 실행해도 오류 없음, 결과 같음', !JSON.stringify((await db.query(`select public.shared_view('${tok2}') v`)).rows[0].v).includes('"p"'))
