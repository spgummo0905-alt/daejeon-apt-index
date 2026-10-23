"""건축물대장 전유공용면적으로 평형별 공급면적 구하기 ('97㎡(전용 77)'의 97).

API (공공데이터포털, 매매 실거래와 같은 인증키, 활용신청 필요)
- 국토교통부_건축HUB_건축물대장정보 서비스: BldRgstHubService/getBrExposPubuseAreaInfo
  지번(시군구·법정동 코드, 본번·부번)으로 그 땅의 모든 호(戶)의 전유·공용 면적 줄을 줍니다 (한 번에 100줄, 호마다 4~6줄).

공급면적 = 전유면적 + 주거공용면적(계단·복도·승강기홀·벽체 등). 공용 줄 가운데 지하주차장·관리사무소·경로당처럼
단지 전체가 함께 쓰는 기타공용은 용도 이름으로 빼고, 부속 건축물 줄도 뺍니다.
호마다 공급/전용이 1.1~1.7 안인 것만 믿고, 전용면적이 같은 호들의 가운데 값을 그 평형의 공급면적으로 씁니다.

지번은 실거래 원본(data/raw)의 sggCd·umdCd·bonbun·bubun 을 씁니다. 받은 결과는 data/bldg/<단지 일련번호>.json 에
호마다 [전용, [[용도 번호, 공용 면적], ...]] 로 줄여 두어, 빼는 용도 목록을 고쳐도 다시 받지 않고 다시 셀 수 있게 합니다.
"""
from __future__ import annotations

import json
import re
import statistics
import time
from datetime import date, timedelta
from pathlib import Path

import requests

from .kapt import _score, parse
from .molit import MolitError, portal_down, portal_result

URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo"
ROWS = 100            # 서버 최대
MAX_PAGES = 12        # 큰 단지는 대장 쪽을 이만큼만 고르게 골라 받음 (평형은 동·호마다 되풀이되어 몇 쪽이면 충분)
PAUSE = 0.2           # 쪽 사이 쉬는 시간 (빨리 부르면 빈 응답이 옴)
REFRESH_DAYS = 365    # 공급면적은 거의 안 바뀜
RETRY_EMPTY_DAYS = 60  # 못 찾은 지번(택지 블록 등)은 두 달 뒤 다시

# 주거공용이 아닌 공용 용도 (지하주차장·관리동·주민시설 등). 단지마다 이름이 제각각이라 넓게 잡습니다.
NOT_HOME = re.compile(r"주차|기계|전기|발전|관리|경비|커뮤니티|부대|복리|근린|판매|업무|노인|경로|어린이|보육|유치|주민|운동|"
                      r"피트니스|휘트니스|독서|문고|헬스|골프|수영|저수|물탱크|펌프|정화|쓰레기|분리수거|창고|휴게|공용시설|"
                      r"체육|상가|점포|사무|변전|방재|중앙감시|자전거")
HOME = re.compile(r"아파트|공동주택|주택|다세대|연립")
STOP = ("SERVICE_KEY_IS_NOT_REGISTERED", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS", "NO_OPENAPI_SERVICE",
        "SERVICE ACCESS DENIED", "(22)", "(30)", "(12)")


class Stop(Exception):
    """인증 키 미등록·하루 한도 초과·없는 서비스: 이번 실행에서는 더 부르지 않습니다."""


def targets(raw_dirs: list[Path]) -> dict[str, dict]:
    """실거래 원본에서 단지(aptSeq)마다 대장 조회 지번과 이름, 거래 수."""
    out: dict[str, dict] = {}
    for d in raw_dirs:
        if not d or not d.exists():
            continue
        for path in sorted(d.glob("*/*.json")):
            for it in json.loads(path.read_text(encoding="utf-8")):
                seq = (it.get("aptSeq") or "").strip()
                sgg, umd = str(it.get("sggCd") or "").strip(), str(it.get("umdCd") or "").strip()
                bon, bu = str(it.get("bonbun") or "").strip(), str(it.get("bubun") or "").strip()
                if not (seq and sgg and umd and bon.strip("0")):
                    continue
                t = out.setdefault(seq, {"q": {"sigunguCd": sgg, "bjdongCd": umd,
                                               "platGbCd": "1" if str(it.get("landCd") or "1").strip() == "2" else "0",
                                               "bun": bon.zfill(4), "ji": (bu or "0").zfill(4)},
                                         "name": (it.get("aptNm") or "").strip(), "n": 0})
                t["n"] += 1
    return out


def _call(s: requests.Session, key: str, q: dict, page: int) -> tuple[list[dict], int]:
    params = {"serviceKey": key, **q, "numOfRows": ROWS, "pageNo": page, "_type": "json"}
    tries = 6   # 빈 응답·503 은 잠깐 몰릴 때 나와서 1·2·4·8·16초 쉬며 다시
    if portal_down():
        raise Stop("공공데이터포털 연결 안 됨")
    for attempt in range(tries):
        try:
            r = s.get(URL, params=params, timeout=(10, 60))
            if r.status_code == 403:   # 활용신청 승인 전이거나 승인한 키가 아직 안 켜짐: 더 불러도 소용없음
                raise Stop("403 Forbidden (활용신청 승인 전이거나 키가 아직 안 켜짐)")
            if r.status_code == 429 and attempt:   # 한 번 쉬고도 또 429 면 하루 한도: 오늘은 그만
                raise Stop("429 Too Many Requests (하루 호출 한도)")
            if r.status_code >= 400:
                parse(r.text)   # 포털 게이트웨이 오류는 본문에 이유가 있어 그것을 남깁니다
                r.raise_for_status()
            got = parse(r.text)
            portal_result(None)
            return got
        except MolitError as e:
            msg = str(e)
            if any(k in msg for k in STOP) and "PER_SECOND" not in msg:
                raise Stop(msg) from e
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
        except requests.RequestException as e:
            if isinstance(e, (requests.ConnectionError, requests.ConnectTimeout)):
                portal_result(e)
                if portal_down():
                    raise Stop("공공데이터포털 연결 안 됨") from e
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
    return [], 0


def _shrink(rows: list[dict], name: str) -> dict:
    """대장 줄들을 호마다 [전용, [[용도 번호, 공용 면적], ...]] 로 줄입니다."""
    names = sorted({(r.get("bldNm") or "").strip() for r in rows} - {""})
    if len(names) > 1 and name:   # 한 지번에 단지가 여럿이면 이름이 닮은 줄만
        keep = {n for n in names if _score(n, name) >= 1}
        if keep:
            rows = [r for r in rows if (r.get("bldNm") or "").strip() in keep]
    purp: list[str] = []
    units: dict[tuple, dict] = {}
    for r in rows:
        try:
            area = float(str(r.get("area") or "0").replace(",", ""))
        except ValueError:
            continue
        if area <= 0:
            continue
        u = units.setdefault(((r.get("dongNm") or "").strip(), (r.get("hoNm") or "").strip()), {"ex": [], "pub": []})
        text = f"{(r.get('mainPurpsCdNm') or '').strip()}|{(r.get('etcPurps') or '').strip()}"
        if str(r.get("exposPubuseGbCd") or "").strip() == "1":
            u["ex"].append((area, bool(HOME.search(text))))
        else:
            p = f"{text}|{'1' if str(r.get('mainAtchGbCd') or '').strip() == '1' else '0'}"
            if p not in purp:
                purp.append(p)
            u["pub"].append([purp.index(p), round(area, 4)])
    out = []
    for u in units.values():
        home = [a for a, h in u["ex"] if h]
        ex = sum(home) if home else sum(a for a, _ in u["ex"])
        if ex > 0:
            out.append([round(ex, 2), u["pub"]])
    return {"names": names, "p": purp, "u": out}


def pick_pages(pages: int, most: int = MAX_PAGES) -> list[int]:
    """받을 쪽 번호. 쪽이 많으면 처음부터 끝까지 고르게 most 쪽만 (1쪽은 늘 받음)."""
    if pages <= most:
        return list(range(1, pages + 1))
    return sorted({1 + round(i * (pages - 1) / (most - 1)) for i in range(most)})


def collect(key: str, raw_dirs: list[Path], root: Path, budget: int = 4500, log=print,
            time_limit: float | None = None) -> None:
    """거래가 많은 단지부터, 아직 없거나 오래된 것만 받습니다. budget 은 이번 실행의 호출 수 한도,
    time_limit 초가 지나면 멈추고 나머지는 다음 실행 때 받습니다."""
    t0 = time.monotonic()
    root.mkdir(parents=True, exist_ok=True)
    tg = targets(raw_dirs)
    today = date.today()
    todo = []
    for seq, t in tg.items():
        p = root / f"{seq}.json"
        if p.exists():
            got = json.loads(p.read_text(encoding="utf-8"))
            days = REFRESH_DAYS if got.get("u") else RETRY_EMPTY_DAYS
            if got.get("_at", "") >= (today - timedelta(days=days)).isoformat():
                continue
        todo.append((-t["n"], seq))
    todo.sort()
    s = requests.Session()
    used = done = 0
    for *_, seq in todo:
        t = tg[seq]
        if used + 1 > budget or (time_limit and time.monotonic() - t0 > time_limit):
            break
        try:
            rows, total = _call(s, key, t["q"], 1)
            used += 1
            pick = pick_pages(-(-total // ROWS) if total else 1)
            if used + len(pick) - 1 > budget:   # 이 단지를 다 못 받으면 다음 실행으로 (반쯤 받은 것은 안 씀)
                break
            for page in pick[1:]:
                time.sleep(PAUSE)
                more, _ = _call(s, key, t["q"], page)
                used += 1
                rows += more
        except Stop as e:
            log(f"::warning::[공급면적] 건축물대장 조회를 멈춤(활용신청 승인 전이거나 하루 한도): {e}")
            break
        except (requests.RequestException, MolitError) as e:
            log(f"::warning::[공급면적] {t['name']} 받기 실패: {e}")
            continue
        entry = {"_at": today.isoformat(), "q": t["q"], "name": t["name"], "total": total, "pages": len(pick),
                 **_shrink(rows, t["name"])}
        (root / f"{seq}.json").write_text(json.dumps(entry, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        done += 1
        time.sleep(PAUSE)
    have = len(list(root.glob("*.json")))
    log(f"공급면적(건축물대장): 대상 단지 {len(tg):,}곳, 이번에 {done:,}곳 받음 (호출 {used:,}번), 받아 둔 곳 {have:,}곳")


def summarize(entry: dict) -> list[list[float]]:
    """호마다 공급 = 전용 + 주거공용, 공급/전용 1.1~1.7 만 믿고 전용면적별 가운데 값: [[전용, 공급], ...]."""
    keep = [not NOT_HOME.search(p) and not p.endswith("|1") for p in entry.get("p", [])]
    by_ex: dict[float, list[float]] = {}
    for ex, pubs in entry.get("u", []):
        sup = ex + sum(a for i, a in pubs if i < len(keep) and keep[i])
        if 1.1 <= sup / ex <= 1.7:
            by_ex.setdefault(round(ex, 2), []).append(sup)
    return [[ex, round(statistics.median(v), 2)] for ex, v in sorted(by_ex.items())]


def load(root: Path) -> dict[str, list[list[float]]]:
    """받아 둔 대장 결과 → 단지(aptSeq)별 [[전용, 공급], ...]. 공급면적을 구하지 못한 단지는 빠집니다."""
    out = {}
    if not root.exists():
        return out
    for p in root.glob("*.json"):
        pairs = summarize(json.loads(p.read_text(encoding="utf-8")))
        if pairs:
            out[p.stem] = pairs
    return out
