"""UX v4.8: 찾기에서 고른 조건을 지도·목록에서도 유지(읽기 전용). 저장 형식·키 불변, 규칙은 finder.js 와 같아야 함."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = lambda p: (ROOT / p).read_text(encoding="utf-8")


def _seg(s, a, b):
    i = s.index(a)
    return s[i:s.index(b, i)]


def test_shared_rules_are_identical_to_finder_js():
    f, c = R("static/finder.js"), R("static/findcond.js")
    for a, b in (("  const PY = [", "  const AGE = ["), ("  const AGE = [", "  const BUDGETS"), ("  const MUST = [", "  // 규제지역 집값"),
                 ("  const types = c =>", "  let ALL = [];"), ("  function km(a, b, c, d) {", "  const places = ")):
        seg = _seg(f, a, b)
        if a.startswith("  const types"):
            seg = seg[: seg.index("  function pass(c, s) {")]       # pass 는 findcond 안에서 해제 가능한 형태로 다시 씀
        assert seg.strip() in c, a                                  # 평형·연식·필수조건·거리·예산 규칙이 글자까지 같음
    for line in ("if (s.gus.length && !s.gus.includes(c.gu)) return false;",
                 "if ((s.py.length || s.budget) && !fit(c, s).length) return false;",
                 "if (age && age.years && !(c.y && c.y >= NOW - age.years)) return false;",
                 "if (s.stn && !(c.f.subway != null && c.f.subway <= s.stn)) return false;",
                 "if (s.sch && !(c.f.elementary != null && c.f.elementary <= s.sch)) return false;"):
        assert line in f and line in c


def test_findcond_is_read_only_and_never_writes_survey():
    c = R("static/findcond.js")
    assert 'DJ.load("survey"' in c
    for w in ("DJ.save", "localStorage", "setItem", "removeItem"):
        assert w not in c                                           # 저장 형식·키를 바꾸지 않음


def test_map_uses_condition_and_can_drop_without_touching_saved():
    m, t = R("static/map.js"), R("templates/map.html")
    assert "DJ.cond(d.complexes," in m and "cond.pass(c)" in m and "cond.drop(" in m and "cond.restore()" in m
    assert "DJ.save" not in m[m.index("function condBar"):m.index("function buildList")]
    assert "찾기에 저장한 조건은 그대로예요" in m and "찾기 조건 다시 적용" in m and "조건 바꾸기" in m
    assert "data-mp-cond" in t and "data-mp-zero" in t and "static/findcond.js" in t and "static/workplaces.js" in t
    assert t.index("static/findcond.js") < t.index('<script src="static/map.js')
    assert "찾기 조건 모두 풀고 보기" in m and "조건 풀면" in m          # 0곳이면 가장 많이 늘리는 조건 하나, 없으면 전부 풀기


def test_finder_links_to_map_and_site_passes_finder_cfg():
    assert "data-sv-map" in R("templates/finder.html") and 'mg.hidden = idle' in R("static/finder.js")
    assert 'finder_cfg=__import__("json").dumps(cfg.raw.get("finder"' in R("djdex/site.py")


def test_cond_css_touch_targets():
    c = R("static/style.css")
    seg = c[c.index("UX v4.8 · 찾기 조건"):]
    seg = seg[: seg.index("UX v3.3")] if "UX v3.3" in seg else seg
    assert seg.count("min-height: 44px") >= 2 and "min-height: 48px" in seg and "font-size: 13px" in seg
