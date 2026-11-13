"""v6.2 REL-C: 같은 단지 메모를 두 기기가 따로 고쳤을 때 양쪽 보존 + 연결이 돌아오면 자동 재전송. 서버 표·SQL·저장 키는 그대로."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def test_merge_check_only_for_dirty_visit_records_and_uses_existing_merge_rule():
    s = R("static/sync.js")
    i, j = s.index("async function mergeConflicts()"), s.index("async function pull()")
    seg = s[i:j]
    assert 'k.startsWith("visit:")' in seg and "m.sent[k] !== (t[k] || 1)" in seg      # 아직 못 보낸 방문 기록만
    assert "m.sent[r.k] === r.t" in seg                                                  # 서버가 그대로면 충돌 아님
    assert "R.mergeVisit(mine, r.v)" in seg                                              # 처음 이을 때와 같은 합치기 규칙
    assert "user_kv?select=k,v,t&k=in." in seg
    assert "DJ.save" not in seg and "sync_put" not in seg and "rpc" not in seg          # 저장 형식·서버 함수는 그대로


def test_merge_runs_before_push_and_online_resend_reuses_existing_sync():
    s = R("static/sync.js")
    assert s.index("await mergeConflicts()") < s.index("await push();", s.index("await mergeConflicts()"))
    assert 'addEventListener("online", () => { if (S.user && S.state === "error") sync(false); });' in s


def test_server_sql_and_record_keys_untouched_by_this_change():
    sql = R("scripts/supabase_setup.sql")
    assert "where public.user_kv.t < excluded.t" in sql                                  # 서버 규칙 그대로
    assert "LOCAL_ONLY = [\"kmap\", \"seed\", \"watchN\"]" in R("static/app.js")


def test_open_memo_box_follows_merged_text_and_toast_wording():
    f, s = R("static/field.js"), R("static/sync.js")
    assert 'document.addEventListener("dj:merged"' in f and '"visit:" + slug' in f
    assert "다른 기기에서 고친 메모와 합쳤어요" in s and "필요 없는 줄은 지워도 돼요" in s


def test_merge_check_format_rejection_does_not_block_saving():
    s = R("static/sync.js")
    assert "[400, 404, 406, 422].includes(e.status)" in s and "try { mg = await mergeConflicts(); }" in s
