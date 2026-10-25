from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Paths:
    data: Path

    @property
    def raw(self) -> Path:
        return self.data / "raw"

    @property
    def raw_presale(self) -> Path:
        return self.data / "raw_presale"

    @property
    def raw_rent(self) -> Path:
        return self.data / "raw_rent"

    @property
    def kapt(self) -> Path:
        return self.data / "kapt"

    @property
    def bldg(self) -> Path:
        return self.data / "bldg"

    @property
    def rents(self) -> Path:
        return self.data / "rents.csv"

    @property
    def trades(self) -> Path:
        return self.data / "trades.csv"

    @property
    def geo(self) -> Path:
        return self.data / "geo.json"

    @property
    def poi(self) -> Path:
        return self.data / "poi.json"

    @property
    def school(self) -> Path:
        return self.data / "school"

    @property
    def elev(self) -> Path:
        """언덕(고저차): 지형 타일로 계산한 단지·역 높이 (elev.py 가 씀)"""
        return self.data / "elev.json"

    @property
    def osm_stops(self) -> Path:
        return self.data / "osm_stops.json"

    @property
    def cpi(self) -> Path:
        return self.data / "cpi.csv"

    @property
    def macro(self) -> Path:
        """한국은행 물가·금리 (ecos.py 가 씀)"""
        return self.data / "macro.json"

    @property
    def scores(self) -> Path:
        return self.data / "scores.csv"

    @property
    def history(self) -> Path:
        return self.data / "history.csv"


@dataclass
class Config:
    raw: dict
    paths: Paths = field(default_factory=lambda: Paths(ROOT / "data"))

    @property
    def districts(self) -> dict[str, str]:
        return self.raw["region"]["districts"]

    @property
    def region_name(self) -> str:
        return self.raw["region"]["name"]

    @property
    def geo_region(self) -> str:
        """주소 검색에 쓰는 지역 이름 (예: 세종특별자치시). 없으면 name."""
        return self.raw["region"].get("geo_name", self.region_name)

    @property
    def site(self) -> dict:
        site = dict(self.raw.get("site", {}))
        base = site.get("base_url", "") or ""
        site["base_url"] = base if not base or base.endswith("/") else base + "/"
        return site

    @property
    def account(self) -> dict:
        """카카오 로그인·기록 이어 보기 [account] (지역 설정은 대전 것을 물려받음)."""
        return dict(self.raw.get("account", {}))

    @property
    def collect(self) -> dict:
        return self.raw["collect"]

    @property
    def filters(self) -> dict:
        return self.raw["filters"]

    @property
    def metrics(self) -> dict:
        return self.raw["metrics"]

    @property
    def index_components(self) -> list[str]:
        return self.raw["index"]["components"]

    @property
    def location_factors(self) -> list[dict]:
        return self.raw["location"]["factors"]

    @property
    def location_extras(self) -> list[dict]:
        """점수에는 쓰지 않고 함께 조사만 해 두는 항목 (학원가 자동 탐지 비교 등)."""
        return self.raw["location"].get("extras", [])

    @property
    def hub(self) -> dict:
        return self.raw["location"].get("hub", {})

    @property
    def school(self) -> dict:
        return self.raw.get("school", {})


REPLACE_KEYS = {"districts", "transit"}  # 합치지 않고 통째로 바꾸는 표 (지역마다 완전히 다른 값)


def merge(base: dict, over: dict) -> dict:
    """설정 덮어쓰기: 표(dict)는 키별로 합치고, 그 밖의 값(목록 포함)과 REPLACE_KEYS 는 통째로 바꿉니다."""
    out = dict(base)
    for k, v in over.items():
        deep = isinstance(v, dict) and isinstance(out.get(k), dict) and k not in REPLACE_KEYS
        out[k] = merge(out[k], v) if deep else v
    return out


def load(path: Path | None = None, data_dir: Path | None = None) -> Config:
    """extends = "config.toml" 이 있으면 그 설정 위에 덮어씁니다 (예: config.sejong.toml).
    data 키(예: "data/sejong")가 있으면 데이터 폴더로 씁니다. --data 가 우선."""
    path = Path(path or ROOT / "config.toml")
    with open(path, "rb") as f:
        raw = tomllib.load(f)
    if raw.get("extends"):
        base = load(path.parent / raw.pop("extends"))
        raw = merge(base.raw, raw)
    cfg = Config(raw)
    folder = data_dir or (ROOT / raw["data"] if raw.get("data") else None)
    if folder is not None:
        cfg.paths = Paths(Path(folder))
    return cfg
