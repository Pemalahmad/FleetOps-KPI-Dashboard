"""Export the SQL engine for the browser dashboard (web/).

The web app runs the same SQL as `fleetkpi build`, inside DuckDB-WASM. This module writes
everything it needs, so Python remains the single source of truth:

  engine/manifest.json   tables + ingest expressions, settings SQL, macros, rules, models (in order), tests
  demo/<table>.parquet   the demo fleet, already standardised
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import duckdb

from . import __version__, config, sqlrunner
from .contract import LOAD_ORDER, TABLES
from .ingest import NORMALISE, _converter

SNAP, START = "{{snapshot_ts}}", "{{analysis_start}}"

SNAPSHOT_SQL = """
WITH u AS (
    SELECT CASE WHEN bool_and(day(date) = 1) THEN last_day(max(date)) ELSE max(date) END AS usage_end FROM usage
)
SELECT (date_trunc('day', greatest(
            (SELECT max(opened_at) FROM work_orders),
            (SELECT max(closed_at) FROM work_orders),
            (SELECT usage_end::TIMESTAMP FROM u))) + INTERVAL 1 DAY)::VARCHAR AS snapshot_ts,
       (SELECT date_trunc('month', min(date))::DATE::VARCHAR FROM usage) AS analysis_start
"""

POST_INGEST = [
    "UPDATE vehicles SET region = s.region FROM sites s WHERE vehicles.region IS NULL AND s.site_id = vehicles.home_site_id",
    "UPDATE vehicles SET fuel_type = 'petrol' WHERE fuel_type IS NULL AND powertrain IN ('ICE','HEV','PHEV')",
    "UPDATE work_orders SET paid_by = 'Fleet' WHERE paid_by IS NULL",
]


def _lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def _settings_sql(cfg: config.Config) -> list[str]:
    """CREATE + INSERT statements for every cfg_* table, with snapshot placeholders."""
    con = duckdb.connect()
    config.publish(con, cfg, SNAP, START)
    out = []
    for (name,) in con.execute("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'cfg_%' "
                               "ORDER BY 1").fetchall():
        cols = con.execute(f"DESCRIBE {name}").fetchall()
        out.append(f"CREATE OR REPLACE TABLE {name} ({', '.join(f'{c[0]} {c[1]}' for c in cols)})")
        rows = con.execute(f"SELECT * FROM {name}").fetchall()
        if rows:
            out.append(f"INSERT INTO {name} VALUES " + ", ".join("(" + ", ".join(_lit(v) for v in r) + ")" for r in rows))
    return out


def _sql(f: sqlrunner.SqlFile) -> dict:
    return {"name": f.name, "description": f.meta.get("description", ""), "sql": f.body}


def manifest(cfg: config.Config) -> dict:
    tables = []
    for name in LOAD_ORDER:
        t = TABLES[name]
        cols = []
        for c in t.columns:
            mapped = _converter(c.type, "{src}")
            empty = f"CAST(NULL AS {c.type})"
            norm = NORMALISE.get((t.name, c.name))
            if norm:
                mapped, empty = norm.replace("{x}", f"({mapped})"), norm.replace("{x}", f"({empty})")
            cols.append({"name": c.name, "type": c.type, "required": c.required, "description": c.description,
                         "synonyms": [c.name, *c.synonyms], "expr": mapped, "empty_expr": empty,
                         "shared": c.shared, "example": c.example})
        tables.append({"name": t.name, "required": t.required, "description": t.description, "columns": cols})
    models = sqlrunner.plan()
    return {
        "version": __version__,
        "tables": tables,
        "post_ingest": POST_INGEST,
        "snapshot_sql": SNAPSHOT_SQL.strip(),
        "settings_sql": _settings_sql(cfg),
        "macros": [f.body for f in sqlrunner.discover("macros")],
        "validation": [{**_sql(f), "table": f.meta.get("table", ""), "severity": f.meta.get("severity", "error"),
                        "needs": [x.strip() for x in f.meta.get("needs", f.meta.get("table", "")).split(",") if x.strip()]}
                       for f in sqlrunner.discover("validation")],
        "models": [{**_sql(m), "layer": m.layer, "materialized": m.meta.get("materialized", "view"), "deps": m.deps,
                    "sources": sqlrunner.source_deps(m, list(LOAD_ORDER))} for m in models],
        "tests": [{**_sql(f), "severity": f.meta.get("severity", "error")} for f in sqlrunner.discover("tests")],
    }


def export(out: Path, cfg_path: str | None = None) -> dict:
    """Write web/public/engine/manifest.json and web/public/demo/*.parquet."""
    from . import build, demo

    out = Path(out)
    (out / "engine").mkdir(parents=True, exist_ok=True)
    (out / "demo").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        demo_cfg = config.load(demo.generate(Path(tmp) / "fleet"))
        cfg = demo_cfg if cfg_path is None else config.load(cfg_path)
        res = build.run(demo_cfg)
        if not res.ok:
            raise RuntimeError("demo build failed; run `fleetkpi demo` to see why")
        con = duckdb.connect(str(res.database), read_only=True)
        sizes = {}
        for name in LOAD_ORDER:
            p = out / "demo" / f"{name}.parquet"
            con.execute(f"COPY {name} TO '{p}' (FORMAT parquet, COMPRESSION zstd)")
            sizes[name] = p.stat().st_size
        con.close()
        m = manifest(cfg)
    (out / "engine" / "manifest.json").write_text(json.dumps(m, indent=1))
    return {"models": len(m["models"]), "rules": len(m["validation"]), "tests": len(m["tests"]),
            "demo_bytes": sum(sizes.values())}
