import json

from djdex import kapt

JSON_LIST = json.dumps({"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
                                     "body": {"items": [{"kaptCode": "A1", "kaptName": "테스트 아파트", "as3": "봉명동", "as4": None},
                                                        {"kaptCode": "A2", "kaptName": "새단지", "as3": "봉명동"}],
                                              "totalCount": "2", "numOfRows": "10", "pageNo": "1"}}})
XML_ONE = """<response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>
<body><item><kaptCode>A1</kaptCode><kaptdaCnt>1,240</kaptdaCnt><kaptDongCnt>12</kaptDongCnt></item></body></response>"""


def test_parse_json_and_xml():
    items, total = kapt.parse(JSON_LIST)
    assert total == 2 and items[0]["kaptCode"] == "A1" and items[0]["as4"] == ""
    items, total = kapt.parse(XML_ONE)
    assert total == 1 and items[0]["kaptdaCnt"] == "1,240"
    one, _ = kapt.parse(json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"item": {"kaptCode": "A9"}}}}))
    assert one == [{"kaptCode": "A9"}]


def test_summarize():
    s = kapt.summarize({"kaptCode": "A1", "kaptdaCnt": "1240", "kaptDongCnt": "12", "kaptdPcnt": "140",
                        "kaptdPcntu": "1,300", "kaptUsedate": "20040315", "codeHeatNm": "지역난방", "kaptdEcnt": "0"})
    assert s["hh"] == 1240 and s["park"] == 1440 and s["ppu"] == 1.16 and s["use"] == "2004.03"
    assert "elev" not in s and s["heat"] == "지역난방"


def test_load_and_match(tmp_path):
    (tmp_path / "list").mkdir()
    (tmp_path / "info").mkdir()
    (tmp_path / "list" / "30200.json").write_text(json.dumps([
        {"kaptCode": "A1", "kaptName": "테스트 아파트", "as3": "봉명동"},
        {"kaptCode": "A2", "kaptName": "새단지", "as3": "봉명동"},
        {"kaptCode": "A3", "kaptName": "조치원e편한", "as3": "조치원읍", "as4": "죽림리"},
    ], ensure_ascii=False), encoding="utf-8")
    for code, addr, hh in [("A1", "대전광역시 유성구 봉명동 123 테스트아파트", 1240),
                           ("A2", "대전광역시 유성구 봉명동 555-1 새단지", 300),
                           ("A3", "세종특별자치시 조치원읍 죽림리 77 조치원e편한", 500)]:
        (tmp_path / "info" / f"{code}.json").write_text(json.dumps({"kaptAddr": addr, "kaptdaCnt": str(hh)}), encoding="utf-8")
    kl = kapt.load(tmp_path, {"30200": "유성구"})
    assert [k["jibun"] for k in kl] == ["123", "555-1", "77"] and kl[2]["dong"] == "조치원읍 죽림리"
    cx = [{"complex_id": "c1", "gu": "유성구", "dong": "봉명동", "jibun": "123", "name": "테스트아파트"},     # 지번
          {"complex_id": "c2", "gu": "유성구", "dong": "봉명동", "jibun": "555", "name": "새단지(2차)"},     # 본번
          {"complex_id": "c3", "gu": "유성구", "dong": "봉명동", "jibun": "999", "name": "새단지"},           # 이름
          {"complex_id": "c4", "gu": "유성구", "dong": "봉명동", "jibun": "1", "name": "없는단지"}]
    m = kapt.match(cx, kl)
    assert m["c1"]["hh"] == 1240 and m["c2"]["code"] == "A2" and m["c3"]["code"] == "A2" and "c4" not in m


def test_gateway_error_reason():
    import pytest
    from djdex.molit import MolitError
    xml = ("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
           "<returnAuthMsg>NO_OPENAPI_SERVICE_ERROR</returnAuthMsg><returnReasonCode>12</returnReasonCode>"
           "</cmmMsgHeader></OpenAPI_ServiceResponse>")
    with pytest.raises(MolitError, match="NO_OPENAPI_SERVICE_ERROR"):
        kapt.parse(xml)


def test_match_by_coordinates_and_log():
    kl = [{"gu": "유성구", "dong": "봉명동", "jibun": "77", "key": "한빛", "ll": [36.35, 127.35], "code": "K1", "name": "한빛", "hh": 900},
          {"gu": "유성구", "dong": "봉명동", "jibun": "88", "key": "먼곳", "ll": [36.40, 127.40], "code": "K2", "name": "먼곳", "hh": 300}]
    cx = [{"complex_id": "c1", "gu": "유성구", "dong": "봉명동", "jibun": "12", "name": "한빛마을"},       # 지번 다름, 이름은 같은 동에 한빛 하나 → 이름
          {"complex_id": "c2", "gu": "유성구", "dong": "봉명동", "jibun": "13", "name": "다른이름"}]       # 좌표 30m → 좌표
    geo = {"c1": [36.35, 127.35], "c2": [36.4002, 127.4001]}   # c2 는 '먼곳' 주소에서 약 25m
    lines = []
    m = kapt.match(cx, kl, geo, log=lines.append)
    assert m["c1"]["code"] == "K1" and m["c2"]["code"] == "K2"
    assert lines[0].startswith("단지 정보 잇기: 지번 0곳, 이름 1곳, 좌표 1곳")


def test_coordinate_match_needs_name_beyond_60m():
    kl = [{"gu": "유성구", "dong": "봉명동", "jibun": "77", "key": "한빛", "ll": [36.35, 127.35], "code": "K1", "name": "한빛", "hh": 900}]
    far = [36.35 + 100 / 111_000, 127.35]   # 100m
    cx = [{"complex_id": "c1", "gu": "유성구", "dong": "궁동", "jibun": "1", "name": "전혀다름"}]
    assert kapt.match(cx, kl, {"c1": far}) == {}
    cx[0]["name"] = "한빛타운"
    assert kapt.match(cx, kl, {"c1": far})["c1"]["code"] == "K1"


def test_plain_addr():
    assert kapt._plain_addr("대전광역시 서구 둔산동 920 크로바아파트") == "대전광역시 서구 둔산동 920"
    assert kapt._plain_addr("세종특별자치시 조치원읍 죽림리 77, 조치원e편한") == "세종특별자치시 조치원읍 죽림리 77"
    assert kapt._plain_addr("주소 없음") == ""


def test_num_reads_decimal_strings():
    # V5 응답은 숫자를 '1272.0'처럼 줍니다. 12720 으로 읽으면 세대수가 10배가 됨
    assert kapt._num("1272.0") == 1272 and kapt._num("1,272") == 1272 and kapt._num("1272") == 1272
    assert kapt._num("") is None and kapt._num(None) is None and kapt._num("약 30대") == 30
    s = kapt.summarize({"kaptCode": "A1", "kaptdaCnt": "1100.0", "kaptdPcnt": "200.0", "kaptdPcntu": "1120.0", "kaptDongCnt": "12.0"})
    assert s["hh"] == 1100 and s["park"] == 1320 and s["dongs"] == 12 and s["ppu"] == 1.2
