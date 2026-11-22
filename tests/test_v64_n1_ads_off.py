"""N1: 스토어 출시 동안 광고 끔. 스토어 신고('광고 없음')와 사이트 문구('광고 없음')가 실제와 같아야 한다. 다시 켜기는 설정값 하나(adsense_client)."""
import pathlib, tomllib
R = pathlib.Path(__file__).resolve().parent.parent
CFG = tomllib.loads((R / "config.toml").read_text(encoding="utf8"))

def test_adsense_client_is_empty_in_every_region_config():
    for f in ("config.toml", "config.sejong.toml", "config.seoul.toml", "config.cheongju.toml"):
        c = tomllib.loads((R / f).read_text(encoding="utf8"))
        assert c.get("site", {}).get("adsense_client", "") == "", f

def test_restore_number_is_kept_as_a_comment_and_footer_still_says_no_ads():
    assert "ca-pub-9082842625119087" in (R / "config.toml").read_text(encoding="utf8")
    assert "광고 없음" in (R / "templates/base.html").read_text(encoding="utf8")

def test_ads_txt_is_only_written_when_a_client_is_set():
    src = (R / "djdex/landing.py").read_text(encoding="utf8")
    assert 'if client.startswith("ca-pub-"):' in src
