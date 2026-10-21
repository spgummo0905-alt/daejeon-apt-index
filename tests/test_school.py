"""학교알리미 응답 파싱과 단지별 학군 값 계산 (실제 API에 닿지 않음)."""
import json

import pandas as pd
import pytest

from djdex import location, school


def test_records_from_any_list_key():
    assert school._records({"resultCode": "success", "list": [{"SCHUL_CODE": "A"}]}) == [{"SCHUL_CODE": "A"}]
    assert school._records({"resultCode": "fail", "resultMsg": "인증키 오류"}) == []


def test_fetch_params():
    seen = {}

    class S:
        def get(self, url, params, timeout):
            seen.update(params)
            return type("R", (), {"raise_for_status": lambda self: None,
                                  "json": lambda self: {"list": [{"SCHUL_CODE": "A"}]}})()
    rows = school.fetch("KEY", "10", "30", "30170", 2025, session=S())
    assert rows == [{"SCHUL_CODE": "A"}]
    assert seen == {"apiKey": "KEY", "apiType": "10", "sidoCode": "30", "schulKndCode": "03",
                    "sggCode": "30170", "pbanYr": "2025"}


def _write(tmp_path):
    basic = [{"SCHUL_CODE": "A", "SCHUL_NM": "대전둔산중학교", "LTTUD": "36.3500", "LGTUD": "127.3800"},
             {"SCHUL_CODE": "B", "SCHUL_NM": "삼천중학교", "LTTUD": "36.3600", "LGTUD": "127.4000"},
             {"SCHUL_CODE": "C", "SCHUL_NM": "폐교중학교", "LTTUD": "36.3", "LGTUD": "127.3", "ABSCH_YN": "Y"}]
    (tmp_path / "0_now.json").write_text(json.dumps(basic, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "10_2025.json").write_text(json.dumps([
        {"SCHUL_CODE": "A", "MVIN_SUM": "60", "MVT_SUM": "20", "STDNT_SUM": "800"},
        {"SCHUL_CODE": "B", "MVIN_SUM": "10", "MVT_SUM": "30", "STDNT_SUM": "400"}]), encoding="utf-8")
    (tmp_path / "10_2024.json").write_text(json.dumps([
        {"SCHUL_CODE": "A", "MVIN_SUM": "40", "MVT_SUM": "20", "STDNT_SUM": "800"},
        {"SCHUL_CODE": "B", "MVIN_SUM": "10", "MVT_SUM": "30", "STDNT_SUM": "400"}]), encoding="utf-8")


def test_load_net_in_rate(tmp_path):
    _write(tmp_path)
    sch = school.load(tmp_path, {}, "대전")
    assert list(sch.index) == ["A", "B"]  # 폐교 제외
    assert sch.at["A", "name"] == "둔산중" and sch.at["B", "name"] == "삼천중"
    # A: 2년 합 (60-20 + 40-20) / (800 + 800) = 3.75%
    assert sch.at["A", "net_in"] == pytest.approx(3.75) and sch.at["A", "years"] == 2
    assert sch.at["A", "students"] == 800
    assert sch.at["B", "net_in"] == pytest.approx(-5.0)


def test_for_complexes_weights_nearby_schools(tmp_path):
    _write(tmp_path)
    sch = school.load(tmp_path, {}, "대전")
    geo = {"near_a": (36.3501, 127.3801), "far": (36.20, 127.60), "nogeo": None}
    out = school.for_complexes(geo, sch, radius=1500, k=3)
    # near_a: A만 1.5km 안 → A 값 그대로 / far: 반경 안에 없어 가장 가까운 한 곳
    assert out.at["near_a", "school_mid"] == pytest.approx(3.75)
    assert out.at["near_a", "school_mid_names"].startswith("둔산중 +3.8%")
    assert "far" in out.index and "nogeo" not in out.index


def test_score_skips_factor_without_any_data():
    poi = pd.DataFrame({"academy": [1, 2, 3], "school_mid": [None, None, None]}, index=list("abc"))
    factors = [{"key": "academy", "kind": "count", "weight": 0.5},
               {"key": "school_mid", "kind": "value", "weight": 0.5}]
    sc = location.score(poi, factors)
    # 학군 값이 없으면 학원 수만으로 0~100
    assert sc.loc["c", "location_score"] == pytest.approx(100) and sc.loc["a", "location_score"] == pytest.approx(0)


def test_load_uses_latest_years_only(tmp_path):
    _write(tmp_path)
    (tmp_path / "10_2023.json").write_text(json.dumps([
        {"SCHUL_CODE": "A", "MVIN_SUM": "0", "MVT_SUM": "800", "STDNT_SUM": "800"}]), encoding="utf-8")
    sch = school.load(tmp_path, {"years": 2}, "대전")
    assert sch.at["A", "net_in"] == pytest.approx(3.75)  # 2023년은 빠짐


def test_load_drops_special_and_small_schools(tmp_path):
    _write(tmp_path)
    basic = json.loads((tmp_path / "0_now.json").read_text(encoding="utf-8"))
    basic += [{"SCHUL_CODE": "S", "SCHUL_NM": "대전체육중학교", "LTTUD": "36.35", "LGTUD": "127.38"},
              {"SCHUL_CODE": "T", "SCHUL_NM": "기성중학교", "LTTUD": "36.25", "LGTUD": "127.30"}]
    (tmp_path / "0_now.json").write_text(json.dumps(basic, ensure_ascii=False), encoding="utf-8")
    moves = json.loads((tmp_path / "10_2025.json").read_text(encoding="utf-8"))
    moves += [{"SCHUL_CODE": "S", "MVIN_SUM": "30", "MVT_SUM": "0", "STDNT_SUM": "400"},
              {"SCHUL_CODE": "T", "MVIN_SUM": "10", "MVT_SUM": "0", "STDNT_SUM": "90"}]
    (tmp_path / "10_2025.json").write_text(json.dumps(moves), encoding="utf-8")
    sch = school.load(tmp_path, {"min_students": 300}, "대전")
    assert "S" not in sch.index and "T" not in sch.index and "A" in sch.index


def test_load_drops_new_schools_and_caps(tmp_path):
    _write(tmp_path)
    basic = json.loads((tmp_path / "0_now.json").read_text(encoding="utf-8"))
    basic.append({"SCHUL_CODE": "N", "SCHUL_NM": "산울중학교", "LTTUD": "36.47", "LGTUD": "127.25"})
    (tmp_path / "0_now.json").write_text(json.dumps(basic, ensure_ascii=False), encoding="utf-8")
    m25 = json.loads((tmp_path / "10_2025.json").read_text(encoding="utf-8"))
    m25 += [{"SCHUL_CODE": "N", "MVIN_SUM": "300", "MVT_SUM": "0", "STDNT_SUM": "500"}]  # 2025년만 있는 새 학교
    m25[0] = {"SCHUL_CODE": "A", "MVIN_SUM": "400", "MVT_SUM": "0", "STDNT_SUM": "800"}
    (tmp_path / "10_2025.json").write_text(json.dumps(m25), encoding="utf-8")
    sch = school.load(tmp_path, {"years": 2, "cap": 10}, "대전")
    assert "N" not in sch.index
    assert sch.at["A", "net_in"] == 10  # (400 + 20) / 1600 = 26% → 10%로 자름


def test_load_advance_rate_over_years_and_name_matching(tmp_path):
    _write(tmp_path)
    csv = tmp_path / "30.csv"
    csv.write_text("year,school,graduates,science,foreign_intl,autonomous,gifted\n"
                   "2023,대전둔산중학교,200,2,3,10,1\n"
                   "2024,둔산중학교,200,1,2,7,0\n"
                   "2024,삼천중,40,0,1,1,0\n"     # 졸업자가 적어(50명 미만) 뺌
                   "2024,없는중학교,300,5,5,5,0\n", encoding="utf-8")
    adv = school.load_advance(csv, tmp_path, {}, "대전")
    assert list(adv.index) == ["A"]
    assert adv.at["A", "adv"] == pytest.approx((2 + 3 + 10 + 1 + 1 + 2 + 7) / 400 * 100)  # 2년 합산 6.5%
    out = school.for_complexes({"x": (36.3501, 127.3801)}, adv, col="adv", key="school_adv", fmt=lambda v: f"{v:.1f}%")
    assert out.at["x", "school_adv"] == pytest.approx(6.5) and out.at["x", "school_adv_names"] == "둔산중 6.5%"
    assert school.load_advance(tmp_path / "none.csv", tmp_path, {}, "대전").empty  # 파일이 없으면 빈 표
