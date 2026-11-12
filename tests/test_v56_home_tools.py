"""v5.6 홈 임장 도구 구간: 설명을 한 줄로 줄임(기능·링크·로그인 조건은 그대로)."""
import pathlib, re
H = (pathlib.Path(__file__).resolve().parent.parent / "templates/intro.html").read_text(encoding="utf8")
SEG = H[H.index('id="it-tools"'):H.index('class="it-login"')]


def test_tool_descriptions_are_short_and_links_kept():
    descs = re.findall(r'<span class="it-tool-t"><b>[^<]*</b><span>([^<]*)', SEG)
    assert len(descs) == 7
    assert all(len(d) <= 34 for d in descs), [d for d in descs if len(d) > 34]
    for href in ("my.html#course", "my.html#notes", "my.html#my-favs", "me.html#share"):
        assert href in SEG


def test_account_only_tools_stay_behind_account_flag():
    assert SEG.count("{% if account %}") >= 2 and "현장 사진 · 로그인 후" in SEG and "가족과 함께 보기 · 로그인 후" in SEG
