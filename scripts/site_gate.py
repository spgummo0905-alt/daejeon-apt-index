"""배포 관문: 만든 사이트(폴더)에 필수 자료가 빠졌으면 배포하지 않고 실패로 멈춥니다.

사용: python scripts/site_gate.py site            (배포 직전, build.yml)
      SITE_GATE_MIN_DAEJEON=1 ... 으로 기준을 바꿀 수 있습니다(시험·소규모 빌드용).

- 대전(맨 앞 주소의 기준 지역)은 필수: 하나라도 모자라면 실패(종료 코드 1)
- 세종·청주·서울은 선택: 폴더가 아예 없으면 경고만, 폴더가 있는데 깨졌으면 실패
  (실패해도 다른 지역은 배포한다는 기존 약속은 유지: 깨진 지역 폴더를 지우지는 않고, 깨진 채 올리지 않도록 멈춘다)
- 점검 항목: 첫 화면, 단지 자료(complexes.json) 개수와 필수 칸, 단지 페이지 수, sitemap, 서비스 워커
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# 알려진 단지 수(대전 571, 세종 198, 청주 440, 서울 3,274)의 절반 안팎. 이보다 적으면 수집이 중간에 끊긴 것으로 봅니다.
MINIMUM = {"daejeon": 300, "sejong": 100, "cheongju": 200, "seoul": 1500}
REQUIRED = {"daejeon"}
FIELDS = ("s", "n", "gu", "g")          # complexes.json 의 단지마다 있어야 하는 칸: 번호, 이름, 구, 등급
APT_RATIO = 0.9                          # 단지 자료 대비 단지 페이지 비율


def _min(region: str) -> int:
    return int(os.environ.get(f"SITE_GATE_MIN_{region.upper()}", MINIMUM[region]))


def check_region(root: Path, region: str) -> list[tuple[str, str]]:
    """(수준, 메시지) 목록. 수준은 'error' 또는 'warn'."""
    d = root / region
    out: list[tuple[str, str]] = []
    if not d.is_dir():
        return [("error" if region in REQUIRED else "warn", f"{region}: 폴더가 없습니다")]
    if not (d / "index.html").is_file() or (d / "index.html").stat().st_size < 2000:
        out.append(("error", f"{region}: 첫 화면(index.html)이 없거나 비어 있습니다"))
    cj = d / "complexes.json"
    rows: list = []
    if not cj.is_file():
        out.append(("error", f"{region}: complexes.json 이 없습니다"))
    else:
        try:
            data = json.loads(cj.read_text(encoding="utf-8"))
            rows = data.get("complexes") or []
        except (ValueError, AttributeError):
            out.append(("error", f"{region}: complexes.json 을 읽을 수 없습니다"))
        else:
            need = _min(region)
            if len(rows) < need:
                out.append(("error", f"{region}: 단지 자료 {len(rows)}곳 (최소 {need}곳 필요): 수집이 중간에 끊겼을 수 있어요"))
            bad = sum(1 for c in rows if not all(c.get(k) not in (None, "") for k in FIELDS))
            if rows and bad / len(rows) > 0.02:
                out.append(("error", f"{region}: 필수 칸(번호·이름·구·등급)이 빠진 단지가 {bad}곳 ({bad * 100 // len(rows)}%)"))
    apts = list((d / "apt").glob("*.html")) if (d / "apt").is_dir() else []
    if rows and len(apts) < len(rows) * APT_RATIO:
        out.append(("error", f"{region}: 단지 페이지 {len(apts)}개 / 단지 자료 {len(rows)}곳 (90% 이상이어야 해요)"))
    sm = d / "sitemap.xml"
    if not sm.is_file():
        out.append(("error", f"{region}: sitemap.xml 이 없습니다"))
    elif rows and len(re.findall(r"<loc>", sm.read_text(encoding="utf-8"))) < len(rows) * APT_RATIO:
        out.append(("error", f"{region}: sitemap 의 주소 수가 단지 수보다 한참 적습니다"))
    if not (d / "sw.js").is_file():
        out.append(("warn", f"{region}: 서비스 워커(sw.js)가 없습니다. 오프라인 기능이 빠집니다"))
    elif "__VERSION__" in (d / "sw.js").read_text(encoding="utf-8"):
        out.append(("error", f"{region}: sw.js 의 버전 자리표시자(__VERSION__)가 채워지지 않았습니다"))
    return out


def check_root(root: Path) -> list[tuple[str, str]]:
    out = []
    for name in ("index.html", "robots.txt", "sitemap.xml"):
        if not (root / name).is_file():
            out.append(("error", f"맨 앞: {name} 이 없습니다"))
    return out


def run(root: Path) -> tuple[list[tuple[str, str]], list[str]]:
    results = check_root(root)
    done = []
    for region in MINIMUM:
        r = check_region(root, region)
        results += r
        if not any(lv == "error" for lv, _ in r) and (root / region).is_dir():
            done.append(region)
    return results, done


def main(argv: list[str]) -> int:
    root = Path(argv[1] if len(argv) > 1 else "site")
    results, done = run(root)
    for lv, msg in results:
        print(f"::{'error' if lv == 'error' else 'warning'}::{msg}")
    errors = [m for lv, m in results if lv == "error"]
    print(f"배포 관문: 통과한 지역 {', '.join(done) or '없음'} / 오류 {len(errors)}건 / 경고 {len(results) - len(errors)}건")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
