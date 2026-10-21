import pytest

from djdex import molit

DISTRICTS = {"30200": "유성구"}

SAMPLE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
<body><items>
<item><aptDong></aptDong><aptNm>테스트아파트</aptNm><aptSeq>30200-1234</aptSeq><buildYear>2004</buildYear>
<cdealDay> </cdealDay><cdealType> </cdealType><dealAmount>    52,500</dealAmount><dealDay>7</dealDay>
<dealMonth>3</dealMonth><dealYear>2026</dealYear><dealingGbn>중개거래</dealingGbn><excluUseAr>84.97</excluUseAr>
<floor>12</floor><jibun>123</jibun><sggCd>30200</sggCd><umdNm>봉명동</umdNm></item>
<item><aptNm>테스트아파트</aptNm><aptSeq>30200-1234</aptSeq><buildYear>2004</buildYear>
<cdealType>O</cdealType><dealAmount>60,000</dealAmount><dealDay>9</dealDay><dealMonth>3</dealMonth>
<dealYear>2026</dealYear><dealingGbn>직거래</dealingGbn><excluUseAr>84.97</excluUseAr><floor>3</floor>
<jibun>123</jibun><sggCd>30200</sggCd><umdNm>봉명동</umdNm></item>
</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>2</totalCount></body></response>"""


def test_parse_response():
    items, total = molit.parse_response(SAMPLE)
    assert total == 2 and len(items) == 2
    assert items[0]["aptNm"] == "테스트아파트"


def test_parse_error_codes():
    with pytest.raises(molit.MolitError):
        molit.parse_response("<response><header><resultCode>03</resultCode>"
                             "<resultMsg>NO_DATA</resultMsg></header></response>")
    with pytest.raises(molit.MolitError, match="인증"):
        molit.parse_response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
                             "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
                             "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>")


def test_normalize():
    items, _ = molit.parse_response(SAMPLE)
    a, b = (molit.normalize(i, DISTRICTS) for i in items)
    assert a["price"] == 52500 and a["area"] == 84.97
    assert a["date"] == "2026-03-07" and a["gu"] == "유성구" and a["complex_id"] == "30200-1234"
    assert not a["cancelled"] and not a["direct"]
    assert b["cancelled"] and b["direct"]


def test_normalize_missing_fields_and_fallback_id():
    assert molit.normalize({"aptNm": "x"}, DISTRICTS) is None
    row = molit.normalize({"sggCd": "30200", "umdNm": "봉명동", "jibun": "1", "aptNm": "가",
                           "dealAmount": "10,000", "excluUseAr": "59.9",
                           "dealYear": "2020", "dealMonth": "1", "dealDay": "2"}, DISTRICTS)
    assert row["complex_id"] == "30200-봉명동-1-가"


def test_month_range():
    assert molit.month_range("202511", "202602") == ["202511", "202512", "202601", "202602"]


def test_presale_kind_and_id_linking():
    sale = molit.normalize({"sggCd": "30170", "umdNm": "탄방동", "jibun": "1", "aptNm": "둔산자이아이파크",
                            "aptSeq": "30170-999", "dealAmount": "90,000", "excluUseAr": "84.9",
                            "dealYear": "2026", "dealMonth": "9", "dealDay": "1"}, {"30170": "서구"})
    pre = [molit.normalize({"sggCd": "30170", "umdNm": "탄방동", "jibun": "1", "aptNm": "둔산 자이 아이파크",
                            "ownershipGbn": g, "dealAmount": "85,000", "excluUseAr": "84.9",
                            "dealYear": "2026", "dealMonth": "8", "dealDay": "3"}, {"30170": "서구"}, "분양권")
           for g in ("분", "입", "")]
    assert sale["kind"] == "매매"
    assert [p["kind"] for p in pre] == ["분양권", "입주권", "분양권"]
    rows = molit.link_ids([sale, *pre])
    # 띄어쓰기가 달라도 같은 동·같은 이름이면 매매 단지 일련번호로 합칩니다.
    assert {r["complex_id"] for r in rows} == {"30170-999"}


def test_collect_keeps_cached_recent_month_when_server_is_down(tmp_path, monkeypatch):
    import json
    import requests
    calls = []

    def fake(key, lawd, ym, endpoint, rows, session=None):
        calls.append(ym)
        if ym >= "202608":
            raise requests.ConnectTimeout("apis.data.go.kr timed out")
        return [{"n": ym}]

    monkeypatch.setattr(molit, "fetch_month", fake)
    cached = tmp_path / "30200" / "202608.json"
    cached.parent.mkdir(parents=True)
    cached.write_text(json.dumps([{"n": "old"}]))
    months = ["202606", "202607", "202608", "202609", "202610", "202611"]
    logs = []
    molit.collect("k", DISTRICTS, months, tmp_path, "e", 1000, refresh=set(months[-4:]), log=logs.append)
    assert json.loads(cached.read_text()) == [{"n": "old"}]  # 받아 둔 최근 달은 그대로
    assert (tmp_path / "30200" / "202607.json").exists() and not (tmp_path / "30200" / "202609.json").exists()
    assert calls == ["202606", "202607", "202608", "202609", "202610"]  # 세 번 연달아 실패하면 나머지는 시도 안 함
    assert any("받아 둔 자료 사용" in m for m in logs)


def test_collect_stops_when_an_old_month_cannot_be_fetched(tmp_path, monkeypatch):
    import requests

    def fake(*a, **k):
        raise requests.ConnectTimeout("timed out")

    monkeypatch.setattr(molit, "fetch_month", fake)
    with pytest.raises(requests.ConnectTimeout):  # 예전 달이 빠진 채로 만들면 수익률이 틀어지므로 멈춤
        molit.collect("k", DISTRICTS, ["202001", "202610"], tmp_path, "e", 1000, refresh={"202610"}, log=lambda m: None)
