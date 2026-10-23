"""공동주택 관리비(공용관리비): 단지별 한 달 공용관리비 합계와 ㎡당 금액.

API (공공데이터포털, 매매 실거래와 같은 인증키, 활용신청 필요)
- 국토교통부_공동주택관리비(공용관리비)정보제공서비스: AptCmnuseManageCostServiceV3/<항목별 오퍼레이션>
  kaptCode + searchDate(YYYYMM). 합계를 주는 오퍼레이션이 없어 17개 항목(인건비·청소비·경비비 등)을 따로 받아 더합니다.
  공개는 보통 두세 달 늦고, 아직 없는 달은 값이 모두 비어 있는 항목으로 옵니다.

개별사용료(난방·전기·수도 등)는 집마다 쓰는 양에 따라 달라 단지 비교에서 뺐습니다 (K-apt 의 관리비 비교도 공용관리비 기준).
받은 원본은 data/kapt/fee/<단지코드>/<YYYYMM>.json 에 오퍼레이션별로 둡니다.
"""
from __future__ import annotations

import json
import re
import time
from datetime import date
from pathlib import Path

import requests

from .bldg import STOP, Stop
from .kapt import _num, parse
from .molit import MolitError, portal_down, portal_result

BASE = "https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3/"
OPS = ["getHsmpLaborCostInfoV3", "getHsmpOfcrkCostInfoV3", "getHsmpTaxdueInfoV3", "getHsmpClothingCostInfoV3",
       "getHsmpEduTraingCostInfoV3", "getHsmpVhcleMntncCostInfoV3", "getHsmpEtcCostInfoV3", "getHsmpCleaningCostInfoV3",
       "getHsmpGuardCostInfoV3", "getHsmpDisinfectionCostInfoV3", "getHsmpElevatorMntncCostInfoV3",
       "getHsmpHomeNetworkMntncCostInfoV3", "getHsmpRepairsCostInfoV3", "getHsmpFacilityMntncCostInfoV3",
       "getHsmpSafetyCheckUpCostInfoV3", "getHsmpDisasterPreventionCostInfoV3", "getHsmpConsignManageFeeInfoV3"]
PROBE = 12   # 공개 달을 찾을 때 볼 단지 수
PROBE_OPS = ("getHsmpLaborCostInfoV3", "getHsmpCleaningCostInfoV3")   # 인건비가 비어 있는 단지도 있어 청소비도 함께 봄
LAST = {"text": ""}   # 마지막 응답 앞부분 (공개 달을 못 찾았을 때 무엇이 왔는지 로그로)
# 금액이 아닌 항목 (단지 코드·이름·날짜 등)
NOT_MONEY = re.compile(r"(code|name|nm|date|ym|cd)$|^kapt|^search", re.I)


def _months_back(n: int) -> str:
    y, m = date.today().year, date.today().month - n
    while m <= 0:
        y, m = y - 1, m + 12
    return f"{y:04d}{m:02d}"


def _call(s: requests.Session, key: str, op: str, code: str, ym: str) -> dict:
    params = {"serviceKey": key, "kaptCode": code, "searchDate": ym, "_type": "json"}
    if portal_down():
        raise Stop("공공데이터포털 연결 안 됨")
    for attempt in range(4):
        try:
            r = s.get(BASE + op, params=params, timeout=(10, 30))
            LAST["text"] = r.text[:300]
            if r.status_code == 403:
                raise Stop("403 Forbidden (활용신청 승인 전이거나 키가 아직 안 켜짐)")
            if r.status_code == 429 and attempt:   # 한 번 쉬고도 또 429 면 하루 한도: 오늘은 그만
                raise Stop("429 Too Many Requests (하루 호출 한도)")
            if r.status_code >= 400:
                parse(r.text)
                r.raise_for_status()
            items, _ = parse(r.text)
            portal_result(None)
            return items[0] if items else {}
        except MolitError as e:
            msg = str(e)
            if "PER_SECOND" in msg and attempt < 3:
                time.sleep(1.5)
                continue
            if any(k in msg for k in STOP):
                raise Stop(msg) from e
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
        except requests.RequestException as e:
            if isinstance(e, (requests.ConnectionError, requests.ConnectTimeout)):
                portal_result(e)
                if portal_down():
                    raise Stop("공공데이터포털 연결 안 됨") from e
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return {}


def money(item: dict) -> int:
    """한 오퍼레이션 응답에서 금액 항목만 더함."""
    return sum(_num(v) or 0 for k, v in item.items() if not NOT_MONEY.search(k))


def _filled(item: dict) -> bool:
    return any(_num(v) for k, v in item.items() if not NOT_MONEY.search(k))


def codes(kapt_root: Path, districts: dict[str, str]) -> list[str]:
    out = []
    for sgg in districts:
        p = kapt_root / "list" / f"{sgg}.json"
        if p.exists():
            out += [it["kaptCode"] for it in json.loads(p.read_text(encoding="utf-8")) if it.get("kaptCode")]
    return out


def collect(key: str, kapt_root: Path, districts: dict[str, str], budget: int = 2400, log=print,
            time_limit: float | None = None) -> None:
    """가장 최근 공개된 달 하나를 단지마다 받습니다 (17번씩). 이미 그 달을 받은 단지는 건너뜀.
    time_limit 초가 지나면 멈추고 나머지는 다음 실행 때 받습니다."""
    t0 = time.monotonic()
    cs = codes(kapt_root, districts)
    if not cs:
        return
    root = kapt_root / "fee"
    s = requests.Session()
    used = 0
    # 최근 공개 달 찾기: 두 달 전부터 다섯 달 전까지, 목록에서 고르게 뽑은 몇 단지의 인건비로.
    # 한 단지만 보면 그 단지가 공개를 안 했거나 인건비가 비어 있을 때 달을 못 찾습니다 (대전에서 그랬음)
    probe = cs[:: max(1, len(cs) // PROBE)][:PROBE]
    ym = None
    try:
        for back in range(2, 6):
            for c in probe:
                for op in PROBE_OPS:
                    used += 1
                    if _filled(_call(s, key, op, c, _months_back(back))):
                        ym = _months_back(back)
                        break
                if ym:
                    break
            if ym:
                break
    except Stop as e:
        log(f"::warning::[관리비] 조회를 멈춤(활용신청 승인 전이거나 하루 한도): {e}")
        return
    if not ym:
        sample = re.sub(r"\s+", " ", LAST["text"])
        if key:
            sample = sample.replace(key, "***")   # 응답에 키가 섞여 오는 일은 없지만 혹시 몰라 가림
        log(f"::warning::[관리비] 최근 다섯 달 안에 공개된 달을 찾지 못했습니다 (단지 {len(probe)}곳 × {len(PROBE_OPS)}항목, "
            f"마지막 응답: {sample[:240]!r})")
        return
    done = 0
    for c in cs:
        path = root / c / f"{ym}.json"
        if path.exists():
            continue
        if used + len(OPS) > budget or (time_limit and time.monotonic() - t0 > time_limit):
            break
        got = {}
        try:
            for op in OPS:
                got[op] = _call(s, key, op, c, ym)
                used += 1
                time.sleep(0.05)
        except Stop as e:
            log(f"::warning::[관리비] 조회를 멈춤(활용신청 승인 전이거나 하루 한도): {e}")
            break
        except (requests.RequestException, MolitError) as e:
            log(f"::warning::[관리비] {c} 받기 실패: {e}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(got, ensure_ascii=False), encoding="utf-8")
        done += 1
    have = sum(1 for c in cs if (root / c / f"{ym}.json").exists())
    log(f"관리비(공용관리비) {ym}: 단지 {len(cs):,}곳 중 {have:,}곳 받아 둠, 이번에 {done:,}곳 (호출 {used:,}번)")


def load(kapt_root: Path) -> dict[str, dict]:
    """단지코드 → {ym, total(원), ops: {오퍼레이션: 금액}} (가장 최근 달)."""
    out = {}
    root = kapt_root / "fee"
    if not root.exists():
        return out
    for d in root.iterdir():
        files = sorted(d.glob("*.json"))
        if not files:
            continue
        got = json.loads(files[-1].read_text(encoding="utf-8"))
        ops = {op: money(it) for op, it in got.items()}
        if any(ops.values()):
            out[d.name] = {"ym": files[-1].stem, "total": sum(ops.values()), "ops": ops}
    return out


def log_fields(kapt_root: Path, log=print) -> None:
    """빌드 로그: 오퍼레이션마다 응답 항목 이름과 금액으로 더한 항목 (화면에 쓰기 전에 구조 확인용)."""
    root = kapt_root / "fee"
    files = sorted(root.glob("*/*.json")) if root.exists() else []
    if not files:
        return
    got = json.loads(files[0].read_text(encoding="utf-8"))
    for op, it in got.items():
        keys = sorted(it)
        log(f"[관리비 항목] {op}: 더함 {[k for k in keys if not NOT_MONEY.search(k)]} · 뺌 {[k for k in keys if NOT_MONEY.search(k)]}")
