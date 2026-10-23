import json

import pytest

from djdex import bldg
from djdex.molit import MolitError


def _row(dong, ho, gb, area, main="공동주택", etc="아파트", atch="0", name="열매마을7단지"):
    return {"dongNm": dong, "hoNm": ho, "exposPubuseGbCd": gb, "area": str(area), "mainPurpsCdNm": main,
            "etcPurps": etc, "mainAtchGbCd": atch, "bldNm": name}


def test_supply_from_register_rows():
    rows = []
    for ho in ("101", "102", "201"):   # 전용 77.04: 계단실·벽체 19.9 → 공급 96.94, 지하주차장·관리동은 빼기
        rows += [_row("702동", ho, "1", 77.04), _row("702동", ho, "2", 12.4, etc="계단실,복도"),
                 _row("702동", ho, "2", 7.5, etc="벽체"), _row("702동", ho, "2", 30.2, etc="지하주차장"),
                 _row("702동", ho, "2", 3.1, main="제1종근린생활시설", etc="관리사무소"),
                 _row("702동", ho, "2", 2.0, etc="계단실", atch="1")]   # 부속 건축물
    rows += [_row("704동", "301", "1", 84.9), _row("704동", "301", "1", 2.1, main="기타", etc="대피소"),
             _row("704동", "301", "2", 27.5, etc="주거공용")]
    rows += [_row("705동", "101", "1", 59.9), _row("705동", "101", "2", 2.0, etc="공용")]   # 1.03배: 믿지 않음
    e = bldg._shrink(rows, "열매7단지현대")
    assert sorted(u[0] for u in e["u"]) == [59.9, 77.04, 77.04, 77.04, 84.9]   # 대피소 전유는 전용에서 빼기
    assert bldg.summarize(e) == [[77.04, 96.94], [84.9, 112.4]]


def test_shrink_keeps_matching_complex_on_shared_lot():
    rows = [_row("1동", "101", "1", 84.9, name="한빛아파트"), _row("1동", "101", "2", 25, etc="계단실", name="한빛아파트"),
            _row("1동", "101", "1", 59.9, name="샘머리아파트"), _row("1동", "101", "2", 20, etc="계단실", name="샘머리아파트")]
    assert [u[0] for u in bldg._shrink(rows, "한빛")["u"]] == [84.9]


def test_targets_from_raw_and_load(tmp_path):
    raw = tmp_path / "raw" / "30170"
    raw.mkdir(parents=True)
    raw.joinpath("202401.json").write_text(json.dumps([
        {"aptSeq": "30170-1", "sggCd": "30170", "umdCd": "11200", "bonbun": "0380", "bubun": "0000", "landCd": "1", "aptNm": "A"},
        {"aptSeq": "30170-1", "sggCd": "30170", "umdCd": "11200", "bonbun": "0380", "bubun": "0000", "landCd": "1", "aptNm": "A"},
        {"aptSeq": "30170-2", "sggCd": "30170", "umdCd": "11200", "bonbun": "0000", "bubun": "0000", "aptNm": "블록"},
    ]), encoding="utf-8")
    tg = bldg.targets([tmp_path / "raw"])
    assert list(tg) == ["30170-1"] and tg["30170-1"]["n"] == 2   # 본번 0000(택지 블록)은 지번으로 못 찾아 빼기
    assert tg["30170-1"]["q"] == {"sigunguCd": "30170", "bjdongCd": "11200", "platGbCd": "0", "bun": "0380", "ji": "0000"}
    root = tmp_path / "bldg"
    root.mkdir()
    root.joinpath("30170-1.json").write_text(json.dumps({"p": ["공동주택|계단실|0"], "u": [[84.9, [[0, 27.5]]]]}), encoding="utf-8")
    root.joinpath("30170-9.json").write_text(json.dumps({"p": [], "u": []}), encoding="utf-8")
    assert bldg.load(root) == {"30170-1": [[84.9, 112.4]]}


class _Resp:
    def __init__(self, text, status=200):
        self.text, self.status_code = text, status

    def raise_for_status(self):
        raise AssertionError("not reached")


class _Sess:
    def __init__(self, text):
        self.text = text

    def get(self, *a, **k):
        return _Resp(self.text)


def test_call_stops_on_unregistered_key():
    xml = ("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
           "<returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>")
    with pytest.raises(bldg.Stop):
        bldg._call(_Sess(xml), "k", {}, 1)
    ok = json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": {"area": "84.9"}}, "totalCount": 1}}})
    assert bldg._call(_Sess(ok), "k", {}, 1) == ([{"area": "84.9"}], 1)


def test_call_stops_on_http_403_and_retries_empty(monkeypatch):
    monkeypatch.setattr(bldg.time, "sleep", lambda *_: None)

    class Seq:
        def __init__(self, resps):
            self.resps = resps

        def get(self, *a, **k):
            return self.resps.pop(0)

    with pytest.raises(bldg.Stop):
        bldg._call(Seq([_Resp("", 403)]), "k", {}, 1)
    ok = json.dumps({"response": {"header": {"resultCode": "00"}, "body": {"items": {"item": [{"area": "1"}]}, "totalCount": 1}}})
    assert bldg._call(Seq([_Resp(""), _Resp(""), _Resp(ok)]), "k", {}, 2) == ([{"area": "1"}], 1)   # 빈 응답은 다시
