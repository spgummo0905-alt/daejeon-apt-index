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
