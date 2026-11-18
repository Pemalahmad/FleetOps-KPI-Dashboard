"""Load fleet.yml, fill defaults, and publish settings into DuckDB as cfg_* tables the SQL reads."""
from __future__ import annotations

import copy
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any

import duckdb
import yaml

DEFAULTS: dict[str, Any] = yaml.safe_load(
    resources.files("fleetkpi").joinpath("fleet.example.yml").read_text()
)


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


@dataclass
class Config:
    raw: dict[str, Any]
    path: Path

    @property
    def root(self) -> Path:
        return self.path.parent

    @property
    def input_dir(self) -> Path:
        return (self.root / self.raw["data"]["input_dir"]).resolve()

    @property
    def database(self) -> Path:
        return (self.root / self.raw["data"]["database"]).resolve()

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]


def load(path: str | Path = "fleet.yml") -> Config:
    path = Path(path).resolve()
    user = yaml.safe_load(path.read_text()) if path.exists() else {}
    if path.exists() and not isinstance(user, dict):
        raise ValueError(f"{path} is not a valid YAML mapping")
    raw = _merge(DEFAULTS, user or {})
    # Lists/maps the user replaces wholesale should not inherit example entries.
    for section, key in [("gamification", "tiers"), ("gamification", "score_weights")]:
        if user and key in (user.get(section) or {}):
            raw[section][key] = user[section][key]
    return Config(raw=raw, path=path)


def publish(con: duckdb.DuckDBPyConnection, cfg: Config, snapshot_ts: str, analysis_start: str) -> None:
    """Write every setting the SQL models need into cfg_* tables."""
    f, e, m, s, b, g = (cfg["fleet"], cfg["energy"], cfg["maintenance"],
                        cfg["service"], cfg["budgets"], cfg["gamification"])
    settings = {
        "fleet_name": f["name"], "currency": f["currency"],
        "planned_hours_per_day": f["planned_operating_hours_per_day"],
        "kpi_window_months": f["kpi_window_months"],
        "productive_hours_per_day": f["productive_hours_per_day"], "working_days_per_week": f["working_days_per_week"],
        "depreciation_method": cfg["assets"]["depreciation_method"],
        "useful_life_years": cfg["assets"]["useful_life_years"],
        "residual_value_pct": cfg["assets"]["residual_value_pct"],
        "expiring_window_days": cfg["compliance"]["expiring_window_days"],
        "key_to_key_target_h": s["key_to_key_target_h"], "repeat_window_days": s["repeat_window_days"],
        "snapshot_ts": snapshot_ts, "analysis_start": analysis_start,
        "pm_tolerance_pct": m["pm_tolerance_pct"],
        "intervene_ratio": s["intervene_ratio"], "watch_ratio": s["watch_ratio"],
        "intervene_min_gap_h": s["intervene_min_gap_h"],
        "min_weekly_jobs": s["min_weekly_jobs"],
        "alert_speeding_per_100km": cfg["alerts"]["speeding_per_100km"], "alert_harsh_per_100km": cfg["alerts"]["harsh_per_100km"],
        "alert_idle_pct": cfg["alerts"]["idle_pct"], "alert_geofence_exits": cfg["alerts"]["geofence_exits"],
        "alert_window_days": cfg["alerts"]["window_days"],
    }
    con.execute("CREATE OR REPLACE TABLE cfg_settings (key VARCHAR, value VARCHAR)")
    con.executemany("INSERT INTO cfg_settings VALUES (?, ?)", [(k, str(v)) for k, v in settings.items()])

    con.execute("CREATE OR REPLACE TABLE cfg_targets (kpi VARCHAR, green DOUBLE, amber DOUBLE, direction VARCHAR)")
    con.executemany("INSERT INTO cfg_targets VALUES (?, ?, ?, ?)",
                    [(k, v["green"], v["amber"], v["direction"]) for k, v in cfg["targets"].items()])

    con.execute("CREATE OR REPLACE TABLE cfg_pm_intervals (powertrain VARCHAR, km DOUBLE, months INTEGER)")
    con.executemany("INSERT INTO cfg_pm_intervals VALUES (?, ?, ?)",
                    [(k, v["km"], v["months"]) for k, v in m["pm_intervals"].items()])

    con.execute("CREATE OR REPLACE TABLE cfg_prices (region VARCHAR, fuel_per_litre DOUBLE, electricity_per_kwh DOUBLE)")
    rows = [("*", e["default_prices"]["fuel_per_litre"], e["default_prices"]["electricity_per_kwh"])]
    for region, p in (e.get("prices_by_region") or {}).items():
        rows.append((region, p.get("fuel_per_litre", rows[0][1]), p.get("electricity_per_kwh", rows[0][2])))
    con.executemany("INSERT INTO cfg_prices VALUES (?, ?, ?)", rows)

    con.execute("CREATE OR REPLACE TABLE cfg_fuel_co2 (fuel_type VARCHAR, kg_per_litre DOUBLE)")
    con.executemany("INSERT INTO cfg_fuel_co2 VALUES (?, ?)", list(e["fuel_co2_kg_per_litre"].items()))

    con.execute("CREATE OR REPLACE TABLE cfg_grid_co2 (region VARCHAR, kg_per_kwh DOUBLE)")
    grid = [("*", e["grid_co2_kg_per_kwh"]["default"])]
    grid += list((e["grid_co2_kg_per_kwh"].get("by_region") or {}).items())
    con.executemany("INSERT INTO cfg_grid_co2 VALUES (?, ?)", grid)

    con.execute("CREATE OR REPLACE TABLE cfg_budget_rates (region VARCHAR, per_vehicle_month DOUBLE)")
    rates = [("*", b["per_vehicle_month_default"])] + list((b.get("per_region") or {}).items())
    con.executemany("INSERT INTO cfg_budget_rates VALUES (?, ?)", rates)

    con.execute("CREATE OR REPLACE TABLE cfg_score_weights (component VARCHAR, weight DOUBLE)")
    con.executemany("INSERT INTO cfg_score_weights VALUES (?, ?)", list(g["score_weights"].items()))

    con.execute("CREATE OR REPLACE TABLE cfg_tiers (tier VARCHAR, min_score DOUBLE)")
    con.executemany("INSERT INTO cfg_tiers VALUES (?, ?)", list(g["tiers"].items()))
