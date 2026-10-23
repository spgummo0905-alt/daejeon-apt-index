"""공동주택관리정보시스템(K-apt) 단지 정보: 세대수·동수·주차·승강기 등.

API (공공데이터포털, 매매 실거래와 같은 인증키)
- 국토교통부_공동주택 단지 목록제공 서비스: AptListService4/getSigunguAptList4 (sigunguCode = 시군구 5자리)
- 국토교통부_공동주택 기본 정보제공 서비스: AptBasisInfoServiceV5/getAphusBassInfoV5 (기본), getAphusDtlInfoV5 (상세)
  (포털이 버전을 올리면 예전 주소는 400 '없는 서비스'로 응답합니다. 응답 항목 이름은 그대로)

받은 원본은 data/kapt/list/<시군구>.json, data/kapt/info/<단지코드>.json 에 둡니다.
K-apt 에는 의무관리대상(대략 150세대 이상) 단지만 있어 작은 단지는 정보가 없을 수 있어요.
"""
from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

import requests

from .molit import MolitError, _norm_name

LIST_URL = "https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4"
BASS_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5"
DTL_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5"
REFRESH_DAYS = 180  # 단지 정보는 잘 안 바뀌어서 반년마다 다시 받음


def parse(text: str) -> tuple[list[dict], int]:
    """응답(JSON 또는 XML)에서 항목 목록과 전체 건수를 꺼냅니다."""
    t = text.lstrip()
    if t.startswith("<"):
        try:
            root = ET.fromstring(t)
        except ET.ParseError as e:
            raise MolitError(f"XML 파싱 실패: {t[:200]!r}") from e
        auth = root.findtext(".//returnAuthMsg")
        if auth:
            raise MolitError(f"포털 오류: {auth} ({root.findtext('.//returnReasonCode')})")   # 인증 키·없는 서비스·호출 한도 등
        code = (root.findtext(".//resultCode") or "").strip()
        if code not in ("00", "000"):
            raise MolitError(f"API 오류 {code}: {root.findtext('.//resultMsg')}")
        items = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
        return items, int((root.findtext(".//totalCount") or "0").strip() or 0) or len(items)
    try:
        data = json.loads(t)
    except ValueError as e:
        raise MolitError(f"응답 파싱 실패: {t[:200]!r}") from e
    resp = data.get("response", data)
    head = resp.get("header") or {}
    code = str(head.get("resultCode", "00")).strip()
    if code not in ("00", "000"):
        raise MolitError(f"API 오류 {code}: {head.get('resultMsg')}")
    body = resp.get("body") or {}
    raw = body.get("items", body.get("item"))
    if isinstance(raw, dict) and "item" in raw:
        raw = raw["item"]
    items = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
    items = [{k: ("" if v is None else str(v).strip()) for k, v in it.items()} for it in items]
    return items, int(body.get("totalCount") or 0) or len(items)


def _get(s: requests.Session, url: str, params: dict, retries: int = 3) -> tuple[list[dict], int]:
    for attempt in range(retries):
        try:
            r = s.get(url, params=params, timeout=(10, 30))
            if r.status_code >= 400:
                # 포털 게이트웨이 오류는 본문 XML에 이유가 있어(인증 오류, 없는 서비스 등) 그것을 남깁니다
                parse(r.text)
                r.raise_for_status()
            return parse(r.text)
        except (requests.RequestException, MolitError):
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return [], 0


def fetch_list(key: str, sgg: str, session=None, rows: int = 1000) -> list[dict]:
    s = session or requests.Session()
    page, out = 1, []
    while True:
        items, total = _get(s, LIST_URL, {"serviceKey": key, "sigunguCode": sgg, "pageNo": page, "numOfRows": rows})
        out.extend(items)
        if not items or len(out) >= total:
            return out
        page += 1


def collect(key: str, districts: dict[str, str], root: Path, budget: int | None = None, log=print) -> None:
    """단지 목록(시군구별)은 매번, 단지별 기본·상세 정보는 없거나 오래된 것만 받습니다."""
    s = requests.Session()
    (root / "list").mkdir(parents=True, exist_ok=True)
    (root / "info").mkdir(parents=True, exist_ok=True)
    codes = []
    for sgg, name in districts.items():
        path = root / "list" / f"{sgg}.json"
        try:
            items = fetch_list(key, sgg, s)
            path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
        except (requests.RequestException, MolitError) as e:
            if not path.exists():
                raise
            log(f"::warning::{name} 단지 목록 받기 실패, 받아 둔 목록 사용: {e}")
            items = json.loads(path.read_text(encoding="utf-8"))
        codes += [it["kaptCode"] for it in items if it.get("kaptCode")]
    old = (date.today() - timedelta(days=REFRESH_DAYS)).isoformat()
    todo = []
    for c in codes:
        p = root / "info" / f"{c}.json"
        if not p.exists():
            todo.append((0, c))
        else:
            at = json.loads(p.read_text(encoding="utf-8")).get("_at", "")
            if at < old:
                todo.append((1, c))
    todo.sort()  # 처음 받는 단지 먼저
    used, fails = 0, 0
    for _, c in todo:
        if budget is not None and used + 2 > budget:
            log(f"::notice::단지 정보 {used // 2}곳 받음, 나머지 {len(todo) - used // 2}곳은 다음 실행 때 받습니다")
            return
        try:
            bass, _ = _get(s, BASS_URL, {"serviceKey": key, "kaptCode": c})
            dtl, _ = _get(s, DTL_URL, {"serviceKey": key, "kaptCode": c})
        except (requests.RequestException, MolitError) as e:
            fails += 1
            log(f"::warning::단지 정보 {c} 받기 실패: {e}")
            if fails >= 3:
                log("::warning::여러 번 연달아 실패해 단지 정보는 여기까지 받습니다")
                return
            continue
        fails, used = 0, used + 2
        info = {**(dtl[0] if dtl else {}), **(bass[0] if bass else {}), "_at": date.today().isoformat()}
        (root / "info" / f"{c}.json").write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
    log(f"단지 정보: 목록 {len(codes):,}곳, 이번에 {used // 2:,}곳 받음")


def _num(v) -> int | None:
    v = re.sub(r"[^\d]", "", str(v or ""))
    return int(v) if v else None


def summarize(it: dict) -> dict:
    """원본 항목 → 화면에 쓰는 값만."""
    hh = _num(it.get("kaptdaCnt"))
    pk = sum(n for n in (_num(it.get("kaptdPcnt")), _num(it.get("kaptdPcntu"))) if n) or None
    ev = sum(n for n in (_num(it.get("groundElChargerCnt")), _num(it.get("undergroundElChargerCnt"))) if n) or None
    use = re.sub(r"[^\d]", "", it.get("kaptUsedate", ""))
    out = {
        "code": it.get("kaptCode"), "name": it.get("kaptName"),
        "hh": hh, "dongs": _num(it.get("kaptDongCnt")), "top": _num(it.get("kaptTopFloor")),
        "base": _num(it.get("kaptBaseFloor")),
        "use": f"{use[:4]}.{use[4:6]}" if len(use) >= 6 else None,
        "park": pk, "park_up": _num(it.get("kaptdPcnt")), "park_dn": _num(it.get("kaptdPcntu")),
        "ppu": round(pk / hh, 2) if pk and hh else None,
        "heat": it.get("codeHeatNm") or None, "hall": it.get("codeHallNm") or None,
        "builder": it.get("kaptBcompany") or None, "mgr": it.get("codeMgrNm") or None,
        "elev": _num(it.get("kaptdEcnt")), "evc": ev, "cctv": _num(it.get("kaptdCccnt")),
    }
    return {k: v for k, v in out.items() if v not in (None, "", 0) or k in ("code",)}


_JIBUN = re.compile(r"^(산\s?)?\d+(-\d+)?(번지)?$")


def _addr_jibun(addr: str) -> str | None:
    for tok in (addr or "").split():
        if _JIBUN.match(tok):
            return tok.replace("번지", "").replace(" ", "")
    return None


def load(root: Path, districts: dict[str, str]) -> list[dict]:
    """받아 둔 목록·정보를 합쳐 [{gu, dong, jibun, name, ...정보}] 로."""
    out = []
    for sgg, gu in districts.items():
        p = root / "list" / f"{sgg}.json"
        if not p.exists():
            continue
        for it in json.loads(p.read_text(encoding="utf-8")):
            ip = root / "info" / f"{it.get('kaptCode')}.json"
            info = json.loads(ip.read_text(encoding="utf-8")) if ip.exists() else {}
            dong = " ".join(x for x in (it.get("as3"), it.get("as4")) if x)
            out.append({"gu": gu, "dong": dong, "jibun": _addr_jibun(info.get("kaptAddr", "")),
                        "key": _norm_name(it.get("kaptName", "")), **summarize({**it, **info})})
    return out


def match(complexes: list[dict], kapt: list[dict]) -> dict[str, dict]:
    """매매 단지(complex_id, gu, dong, jibun, name) → K-apt 정보.
    같은 구·동에서 지번이 같으면(본번만 같아도) 그 단지, 여럿이면 이름이 더 비슷한 쪽. 지번으로 못 찾으면 이름으로."""
    by_dong: dict[tuple, list] = {}
    for k in kapt:
        by_dong.setdefault((k["gu"], k["dong"]), []).append(k)
    out = {}

    def score(a: str, b: str) -> int:
        if not a or not b:
            return 0
        if a == b:
            return 3
        return 2 if (a in b or b in a) else 1 if a[:2] == b[:2] else 0

    for c in complexes:
        cands = by_dong.get((c["gu"], c["dong"]), [])
        if not cands:
            continue
        jb, nm = str(c.get("jibun") or ""), _norm_name(c.get("name", ""))
        hit = [k for k in cands if k["jibun"] and k["jibun"] == jb]
        if not hit and jb:
            main = jb.split("-")[0]
            hit = [k for k in cands if k["jibun"] and k["jibun"].split("-")[0] == main]
        if hit:
            best = max(hit, key=lambda k: score(nm, k["key"]))
        else:
            named = [k for k in cands if score(nm, k["key"]) >= 2 and len(nm) >= 3]
            if len(named) != 1:
                continue
            best = named[0]
        out[c["complex_id"]] = {k: v for k, v in best.items() if k not in ("gu", "dong", "jibun", "key")}
    return out
