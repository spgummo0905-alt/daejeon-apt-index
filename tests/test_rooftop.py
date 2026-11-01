

def test_presale_links_to_renamed_complex():
    from djdex.molit import link_ids
    R = lambda k, n, d, cid, j="": {"kind": k, "name": n, "gu": "흥덕구", "dong": d, "complex_id": cid, "jibun": j}
    rows = link_ids([R("매매", "청주테크노폴리스신영지웰푸르지오", "문암동", "S1", "213"), R("분양권", "청주테크노폴리스 지웰푸르지오", "문암동", "P1"),
                     R("매매", "우방아이유쉘1단지", "송절동", "S3"), R("매매", "우방아이유쉘2단지", "송절동", "S4"), R("분양권", "우방 아이유쉘 2단지", "송절동", "P4"),
                     R("분양권", "해링턴 플레이스 테크노폴리스", "송절동", "P6")])
    assert [r["complex_id"] for r in rows] == ["S1", "S1", "S3", "S4", "S4", "P6"]   # 이름이 조금 바뀐 같은 아파트는 합치고, 1·2단지와 다른 단지는 그대로
