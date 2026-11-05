"""사진 저장소 감사(scripts/photos_audit.py): 공개·비공개 판정이 맞고, 전환 스크립트가 데이터를 건드리지 않는다"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("photos_audit", ROOT / "scripts" / "photos_audit.py")
pa = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pa)

OBJ = '{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}'
BKT = '{"statusCode":"404","error":"Bucket not found","message":"Bucket not found","code":"NoSuchBucket"}'


def test_public_bucket_is_detected_by_contrasting_with_a_missing_bucket():
    assert pa.classify_public_probe(OBJ, BKT) == "public"      # 운영의 현재 상태
    assert pa.classify_public_probe(BKT, BKT) == "private"     # 닫은 뒤
    assert pa.classify_public_probe("<html>502</html>", BKT) == "unknown"


def test_anonymous_listing_classification():
    assert pa.classify_list(200, "[]") == ("empty", 0)
    assert pa.classify_list(200, '[{"name":"x"}]') == ("listable", 1)
    assert pa.classify_list(403, '{"error":"Unauthorized"}')[0] == "blocked"
    assert pa.classify_list(200, "<html>")[0] == "unknown"


def test_audit_exit_codes(monkeypatch):
    seen = {"public": (OBJ, "[]"), "private": (BKT, "[]"), "listable": (OBJ, '[{"name":"x"}]')}
    for name, (photos_reply, listing) in seen.items():
        def fake(url, key, method="GET", body=None, _p=photos_reply, _l=listing):
            if "/public/photos/" in url:
                return 400, _p
            if "/public/__nobucket__/" in url:
                return 400, BKT
            return 200, _l
        monkeypatch.setattr(pa, "_call", fake)
        code = pa.main(["x", "https://a.supabase.co", "sb_publishable_k"])
        assert code == {"public": 2, "private": 0, "listable": 1}[name], name


def test_migration_only_flips_the_public_flag_and_never_deletes_objects():
    apply = (ROOT / "scripts" / "migrations" / "photos_private_apply.sql").read_text(encoding="utf-8").lower()
    rollback = (ROOT / "scripts" / "migrations" / "photos_private_rollback.sql").read_text(encoding="utf-8").lower()
    for sql in (apply, rollback):
        assert "delete from" not in sql and "drop " not in sql and "truncate" not in sql
        assert "update storage.buckets set public =" in sql and "where id = 'photos'" in sql and "begin;" in sql
    assert "public = false" in apply and "public = true" in rollback


def test_setup_sql_no_longer_resets_the_bucket_to_public_on_rerun():
    sql = (ROOT / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    block = sql[sql.index("insert into storage.buckets"):sql.index("create or replace function public.photo_quota_ok")]
    assert "set public = excluded.public" not in block
    assert "file_size_limit = excluded.file_size_limit" in block
