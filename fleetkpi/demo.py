"""Generate the demo fleet as ordinary contract files, so it loads exactly like a customer's data."""
from __future__ import annotations

from importlib import resources
from pathlib import Path

import duckdb

from .contract import LOAD_ORDER

DEMO_CONFIG = """# Demo configuration for the fictional "Sahra Mobility" fleet.
fleet:
  name: "Sahra Mobility (demo)"
  currency: "USD"

energy:
  # Only used when an energy row has no cost; the demo files carry actual costs.
  prices_by_region:
    UAE:     {fuel_per_litre: 0.78, electricity_per_kwh: 0.12}
    KSA:     {fuel_per_litre: 0.62, electricity_per_kwh: 0.07}
    Türkiye: {fuel_per_litre: 1.30, electricity_per_kwh: 0.18}
  grid_co2_kg_per_kwh:
    default: 0.45
    by_region: {UAE: 0.40, KSA: 0.57, Qatar: 0.49, Kuwait: 0.60, Bahrain: 0.62, Oman: 0.47, Türkiye: 0.43}
"""


def generate(target: Path) -> Path:
    """Write demo CSVs into target/data/input and a demo fleet.yml into target. Returns the config path."""
    target = Path(target)
    inp = target / "data" / "input"
    inp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(resources.files("fleetkpi").joinpath("sql", "demo", "generate.sql").read_text())
    for table in LOAD_ORDER:
        out = inp / f"{table}.csv"
        con.execute(f"COPY (SELECT * FROM {table}) TO '{out.as_posix()}' (HEADER, DELIMITER ',')")
    con.close()
    cfg_path = target / "fleet.yml"
    cfg_path.write_text(DEMO_CONFIG)
    return cfg_path
