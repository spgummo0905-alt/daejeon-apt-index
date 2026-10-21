from djdex import heatmap, site


def _pts():
    # 둔산동 근처 세 동, 동마다 단지 네 곳
    base = {("서구", "둔산동"): (36.351, 127.378), ("서구", "탄방동"): (36.343, 127.388), ("서구", "월평동"): (36.360, 127.366)}
    return {k: [(lat + 0.002 * i, lng + 0.002 * (i % 2)) for i in range(4)] for k, (lat, lng) in base.items()}


def test_build_draws_each_dong_inside_its_district():
    dist = heatmap.load_districts({"30170": "서구"})
    m = heatmap.build(_pts(), dist)
    assert set(m["regions"]) == set(_pts())
    for r in m["regions"].values():
        assert r["d"].startswith("M") and r["d"].endswith("Z")
        assert 0 <= r["x"] <= m["w"] and 0 <= r["y"] <= m["h"]
    assert [d["name"] for d in m["districts"]] == ["서구"]


def test_build_without_districts_and_too_few_points():
    assert heatmap.build(_pts(), None)["districts"] == []
    assert heatmap.build({("서구", "둔산동"): [(36.35, 127.38)]}, None) is None


def test_place_area_and_groups():
    assert site.place({"gu": "서구", "dong": "둔산동"}) == "서구 둔산동"
    assert site.place({"gu": "도담동", "dong": "도담동"}) == "도담동"
    assert str(site.area_name("조치원읍 죽림리")) == '<span class="area-sub">조치원읍</span>죽림리'
    assert str(site.area_name("도담동")) == "도담동"
    groups = site._area_groups(["도담동", "조치원읍 교리", "아름동", "부강면 부강리", "조치원읍 남리"], {"도담동": 3})
    assert [g["label"] for g in groups] == ["동 지역", "부강면", "조치원읍"]
    assert [i["label"] for i in groups[0]["items"]] == ["도담동", "아름동"]
    assert groups[2]["items"][0] == {"value": "조치원읍 교리", "label": "교리", "n": 0}
    # 절반보다 아래는 '상위 92%' 대신 '하위 8%'
    assert [site.share(v) for v in (3.2, 50, 72, 92, 99.9, None)] == ["상위 3%", "상위 50%", "하위 28%", "하위 8%", "하위 1%", "-"]


def test_mark_highs_by_area_band():
    import pandas as pd
    t = lambda d, a, p, **k: dict(date=pd.Timestamp(d), area=a, price=p, kind="매매", cancelled=False, **k)
    tr = [t("2024-01-01", 84.9, 50000), t("2024-02-01", 59.9, 40000), t("2024-03-01", 84.7, 52000),
          t("2024-04-01", 84.9, 51000), t("2024-05-01", 84.9, 60000, ) | {"cancelled": True}, t("2024-06-01", 59.8, 41000)]
    site._mark_highs(tr)
    assert [x["high"] for x in tr] == [False, False, True, False, False, True]


def test_area_types_group_neighbouring_sizes():
    tr = [{"area": a} for a in (59.9, 60.2, 59.8, 84.97, 84.5, 114.7)]
    types = site._area_types(tr)
    assert types == [{"key": "59", "n": 3, "py": 24}, {"key": "84", "n": 2, "py": 34}, {"key": "114", "n": 1, "py": 45}]  # 59·60㎡는 한 묶음
    assert [site.pyeong(a) for a in (59.9, 84.97, 74.8, 101.5, None)] == [24, 34, 30, 40, None]  # 흔히 부르는 평형
    assert [t["akey"] for t in tr] == ["59", "59", "59", "84", "84", "114"]


def test_mark_highs_skips_direct_when_excluded():
    import pandas as pd
    t = lambda d, p, **k: dict(date=pd.Timestamp(d), area=84.9, price=p, kind="매매", cancelled=False, direct=False) | k
    tr = [t("2024-01-01", 50000), t("2024-02-01", 51000), t("2024-03-01", 90000, direct=True), t("2024-04-01", 52000)]
    site._mark_highs(tr, skip_direct=True)
    assert [x["high"] for x in tr] == [False, True, False, True]  # 직거래는 신고가도 아니고 기준선도 아님


def test_location_groups_and_group_score():
    import pandas as pd
    from djdex import config
    cfg = config.load()
    groups = site._loc_groups(cfg)
    assert [g["label"] for g in groups] == ["교통", "학군", "생활"]
    assert [f["key"] for f in groups[1]["factors"]] == ["school_adv", "school_mid", "hub", "academy_math"]  # 학교 + 학원
    assert sum(len(g["factors"]) for g in groups) == len(cfg.location_factors)  # 빠진 항목 없음
    t = pd.DataFrame({"school_mid_pct": [80.0, None], "hub_pct": [40.0, 60.0], "academy_math_pct": [20.0, 30.0]})
    s = site._group_score(t, groups[1]["factors"])  # 가중치 0.10 : 0.25 : 0.10
    assert round(s[0], 1) == round((80 * .1 + 40 * .25 + 20 * .1) / .45, 1)
    assert round(s[1], 1) == round((60 * .25 + 30 * .1) / .35, 1)  # 값 없는 항목은 빼고


def test_location_groups_hide_factor_without_data():
    import pandas as pd
    from djdex import config
    cfg = config.load()
    t = pd.DataFrame({f["key"] + "_pct": [50.0] for f in cfg.location_factors if f["key"] != "school_adv"})
    t["school_adv_pct"] = float("nan")  # 진학률 공시 파일을 아직 넣지 않음
    edu = next(g for g in site._loc_groups(cfg, t) if g["key"] == "edu")
    assert "school_adv" not in [f["key"] for f in edu["factors"]]
