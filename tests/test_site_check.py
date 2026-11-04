"""사이트 점검(scripts/site_check.py)의 실패 판정: 필수 자료가 빠지면 종료 코드 1, 이어 받는 중인 칸은 경고만"""
import importlib.util
from pathlib import Path

import pytest
import requests

SPEC = importlib.util.spec_from_file_location("site_check", Path(__file__).resolve().parent.parent / "scripts" / "site_check.py")
sc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sc)


def healthy(n=571):
    out = {"상태": 200, "단지 자료": n, "단지 페이지": n, "카드첩 화면": True, "임장 후보 코드": True, "동·역·조건 검색 코드": True,
           "이용약관": True, "임장 코스": True, "역 검색 연결": True, "메인에 오늘의 카드 없음": True,
           "단지 예시": {"상태": 200, **{k: True for k in sc.MARKS}},
           "반영": {"열린 단지 페이지": f"{n} / {n}", **{k: n for k in sc.FILLED}}}
    out |= {k: True for k in sc.COMMON}
    return out


def test_healthy_region_has_no_failures():
    bad, warn = sc.judge("대전", healthy())
    assert bad == [] and warn == []


def test_unreachable_or_error_status_fails():
    assert sc.judge("대전", {"상태": 503})[0] and sc.judge("대전", {"상태": 404})[0]


def test_truncated_or_unreadable_complexes_fail():
    out = healthy(); out["단지 자료"] = 120
    assert any("최소 300곳" in m for m in sc.judge("대전", out)[0])
    out = healthy(); del out["단지 자료"]
    assert any("complexes.json" in m for m in sc.judge("대전", out)[0])


def test_missing_apartment_pages_fail():
    out = healthy(); out["단지 페이지"] = 200
    assert any("sitemap" in m for m in sc.judge("대전", out)[0])
    out = healthy(); out["반영"]["열린 단지 페이지"] = "400 / 571"
    assert any("400 / 571" in m for m in sc.judge("대전", out)[0])


def test_missing_screen_parts_fail():
    for key in ("카드첩 화면", "이용약관", "임장 코스", "지도 가격 거르기", "위쪽 검색 버튼"):
        out = healthy(); out[key] = False
        assert any(key in m for m in sc.judge("대전", out)[0]), key
    out = healthy(); out["단지 예시"]["평형별 시세"] = False
    assert any("평형별 시세" in m for m in sc.judge("대전", out)[0])
    out = healthy(); out["메인에 오늘의 카드 없음"] = False
    assert sc.judge("대전", out)[0]


def test_daejeon_empty_core_fields_fail_but_slow_fields_only_warn():
    out = healthy(); out["반영"]["단지 정보(세대수·주차)"] = 0
    assert any("단지 정보" in m for m in sc.judge("대전", out)[0])
    out = healthy(); out["반영"]["관리비"] = 0     # 이어 받는 중일 수 있음
    bad, warn = sc.judge("대전", out)
    assert bad == [] and any("관리비" in m for m in warn)
    out = healthy(198); out["반영"]["단지 정보(세대수·주차)"] = 0
    bad, warn = sc.judge("세종", out)           # 세종은 이어 받는 중일 수 있어 경고
    assert bad == [] and warn


def test_workflow_fails_job_on_check_failure():
    wf = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "site-check.yml").read_text(encoding="utf-8")
    assert "scripts/site_check.py" in wf and "continue-on-error" not in wf and "|| true" not in wf


class _Resp:
    def __init__(self, status, text=""):
        self.status_code, self.text, self.ok, self.content = status, text, 200 <= status < 300, text.encode()
        self.encoding = "utf-8"

    def json(self):
        return {}


def _fake_session(monkeypatch, handler):
    class S:
        def __init__(self):
            self.headers, self.hooks = {}, {"response": []}

        def get(self, url, **kw):
            return handler(url)
    monkeypatch.setattr(sc.requests, "Session", S)
    monkeypatch.setenv("SITE_CHECK_REGIONS", "대전")


def test_main_exits_nonzero_when_site_is_down(monkeypatch, capsys):
    _fake_session(monkeypatch, lambda url: _Resp(503))
    with pytest.raises(SystemExit) as e:
        sc.main()
    assert e.value.code == 1
    assert "::error::대전: 첫 화면이 열리지 않습니다" in capsys.readouterr().out


def test_main_exits_nonzero_when_connection_fails(monkeypatch, capsys):
    def boom(url):
        raise requests.ConnectionError("dns")
    _fake_session(monkeypatch, boom)
    with pytest.raises(SystemExit) as e:
        sc.main()
    assert e.value.code == 1
    assert "연결 실패" in capsys.readouterr().out


def test_main_exits_nonzero_when_page_loads_but_data_is_missing(monkeypatch):
    _fake_session(monkeypatch, lambda url: _Resp(200, "<html><title>x</title></html>") if not url.endswith(".json") else _Resp(404))
    with pytest.raises(SystemExit) as e:
        sc.main()
    assert e.value.code == 1
