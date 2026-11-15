"""C3 보강: 저장 완료 체크는 '이 기기와 내 계정에 저장됐어요.'(실제로 저장이 끝남)일 때만. 첫 임장 핀 안내는 방문 기록이 없을 때만."""
import pathlib, re
R = pathlib.Path(__file__).resolve().parent.parent
FIELD = (R / "static/field.js").read_text(encoding="utf8")
CSS = (R / "static/style.css").read_text(encoding="utf8")
MY = (R / "static/my.js").read_text(encoding="utf8")
HTML = (R / "templates/my.html").read_text(encoding="utf8")
def _paint():
    return FIELD[FIELD.index("function paintSave()"):FIELD.index("retryBtn.hidden = !bad;")]
def test_check_only_on_fully_saved_sentence():
    s = _paint()
    assert s.count("ok = true") == 1
    assert re.search(r'else \{ t = "이 기기와 내 계정에 저장됐어요\."; ok = true; \}', s)
    assert 'saveEl.classList.toggle("ok", ok)' in s
def test_failure_state_never_gets_ok():
    s = _paint()
    bad_line = s[s.index('s === "error"'):s.index("else if (pending")]
    assert "ok = true" not in bad_line and "bad = true" in bad_line
def test_check_css_is_only_for_ok_and_has_no_motion():
    start = CSS.index("/* C3 저장 완료 체크")
    end = CSS.find("/* C5 완료 카드", start)   # 뒤에 붙는 완료 카드 블록은 test_v64_c5_done_card 가 따로 검사
    block = CSS[start:end if end != -1 else len(CSS)]
    assert ".fm-save.ok::before" in block and "animation" not in block
    urls = re.findall(r"url\(([^)]*)\)", block)
    assert urls and all(u.strip("\"'").startswith("data:image/svg+xml") for u in urls)   # 외부 파일 없이 직접 박은 그림만
    assert "http" not in block.replace("http://www.w3.org", "")
def test_pin_empty_shows_only_without_records():
    assert 'id="visit-empty"' in HTML and "data-visit-empty hidden" in HTML and 'class="il-art" aria-hidden="true"' in HTML
    assert "첫 임장을 기록해 보세요" in HTML
    assert "vEmpty.hidden = !!groups.size" in MY
