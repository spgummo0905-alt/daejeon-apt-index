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
    def trades(self) -> Path:
        return self.data / "trades.csv"

    @property
    def geo(self) -> Path:
        return self.data / "geo.json"

    @property
    def poi(self) -> Path:
        return self.data / "poi.json"

    @property
    def cpi(self) -> Path:
        return self.data / "cpi.csv"

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
    def site(self) -> dict:
        site = dict(self.raw.get("site", {}))
        base = site.get("base_url", "") or ""
        site["base_url"] = base if not base or base.endswith("/") else base + "/"
        return site

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
    def hub(self) -> dict:
        return self.raw["location"].get("hub", {})


def load(path: Path | None = None, data_dir: Path | None = None) -> Config:
    path = path or ROOT / "config.toml"
    with open(path, "rb") as f:
        raw = tomllib.load(f)
    cfg = Config(raw)
    if data_dir is not None:
        cfg.paths = Paths(Path(data_dir))
    return cfg
