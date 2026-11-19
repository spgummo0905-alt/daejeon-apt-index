"""J1: 순위 화면 이름을 중립으로: '오른 곳 1등'처럼 수익을 암시하지 않고 '변동률' 기준임을 밝힘. 기간·기준·값 계산은 그대로."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
S = (R / "djdex/site.py").read_text(encoding="utf8")
H = (R / "templates/rank.html").read_text(encoding="utf8")

def test_up_down_tabs_and_titles_name_the_basis_neutrally_and_keep_period_note():
    for k in ('"tab": "변동 · 오른 곳", "title": "1년 전과 비교해 가격이 오른 단지 (변동률 순)"', '"tab": "변동 · 내린 곳", "title": "1년 전과 비교해 가격이 내린 단지 (변동률 순)"'): assert k in S, k
    assert S.count("최근 6개월 ㎡당 중간 가격을 1년 전 같은 기간과 비교 (두 기간 모두 거래 3건 이상)") == 2
    assert '"key": "up"' in S and '"key": "down"' in S                       # 키·탭 개수는 그대로

def test_index_section_uses_variation_not_return_wording_and_values_unchanged():
    assert "<h2>지수·변동률 순위</h2>" in H and 'aria-label="지수·변동률 순위 종류"' in H and "수익률" not in H.split("{# 지수")[0] + H[H.index('id="top"'):]
    assert '"tab": "변동률 TOP"' in S and "연평균 가격 변동률 상위 5곳" in S
    assert 'fmt_pct(r[k])' in S and 'f"{v * 100:+.1f}%"' in S               # 값 계산은 그대로
