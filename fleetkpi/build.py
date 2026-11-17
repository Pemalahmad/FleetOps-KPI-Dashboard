"""The pipeline: Ingest -> Map & standardise -> Validate -> Model -> Quality gate -> Publish.

Every stage is timed and logged into the warehouse (run_log), so the dashboard can show
exactly what ran, what it found, and why a number is what it is.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from importlib import resources
from pathlib import Path

import duckdb

from . import config as config_mod
from .config import Config
from .ingest import TableLoad, ingest
from .validate import Issue, save as save_issues, validate

MODELS = resources.files("fleetkpi").joinpath("sql", "models")

# Post-build sanity checks that must hold for ANY fleet.
QUALITY_GATE = {
    "Availability is between 0 and 100%":
        "SELECT count(*) = 0 FROM fleet_monthly WHERE availability_pct NOT BETWEEN 0 AND 100",
    "Utilisation is between 0 and 100% (when hours are supplied)":
        "SELECT count(*) = 0 FROM fleet_monthly WHERE utilization_pct NOT BETWEEN 0 AND 100",
    "No negative turnaround":
        "SELECT count(*) = 0 FROM wo WHERE turnaround_h < 0",
    "Executive scorecard has a row per active region":
        "SELECT (SELECT count(*) FROM exec_scorecard) = (SELECT count(DISTINCT region) FROM vehicle_months WHERE month_start = report_month())",
    "Recall completions never exceed affected vehicles":
        "SELECT count(*) = 0 FROM recall_completion WHERE completed_vehicles > affected_vehicles",
    "Every scored site has a tier":
        "SELECT count(*) = 0 FROM leaderboard WHERE tier IS NULL",
}


@dataclass
class Stage:
    stage: str
    status: str            # ok | warning | blocked | failed | skipped
    detail: str
    seconds: float
    metrics: dict = field(default_factory=dict)


@dataclass
class BuildResult:
    ok: bool
    stages: list[Stage]
    issues: list[Issue]
    loads: list[TableLoad]
    database: Path


def _resolve_dates(con: duckdb.DuckDBPyConnection, cfg: Config) -> tuple[str, str]:
    snap = str(cfg["fleet"].get("snapshot_date", "auto"))
    if snap == "auto":
        snap = con.execute("""
            SELECT (date_trunc('day', greatest(
                        (SELECT max(opened_at) FROM work_orders),
                        (SELECT max(closed_at) FROM work_orders),
                        (SELECT max(date)::TIMESTAMP FROM usage))) + INTERVAL 1 DAY)::VARCHAR
        """).fetchall()[0][0]
    start = str(cfg["fleet"].get("analysis_start", "auto"))
    if start == "auto":
        start = con.execute("SELECT date_trunc('month', min(date))::DATE::VARCHAR FROM usage").fetchall()[0][0]
    return str(snap), str(start)


def run(cfg: Config, force: bool = False, validate_only: bool = False) -> BuildResult:
    final_db = cfg.database
    final_db.parent.mkdir(parents=True, exist_ok=True)
    tmp_db = final_db.with_suffix(".building.duckdb")
    tmp_db.unlink(missing_ok=True)
    con = duckdb.connect(str(tmp_db))
    stages: list[Stage] = []
    issues: list[Issue] = []

    def timed(name, fn):
        t0 = time.time()
        status, detail, metrics = fn()
        stages.append(Stage(name, status, detail, round(time.time() - t0, 2), metrics))
        return status

    # 1. Ingest
    loads: list[TableLoad] = []

    def do_ingest():
        nonlocal loads
        loads = ingest(con, cfg)
        found = [ld for ld in loads if ld.source]
        rows = {ld.table: ld.rows for ld in loads}
        return ("ok" if found else "failed",
                f"{len(found)} of {len(loads)} tables found in {cfg.input_dir.name}/, "
                f"{sum(rows.values()):,} rows", rows)
    timed("Ingest", do_ingest)

    # 2. Map & standardise
    def do_map():
        mapped = sum(len(ld.mapped) for ld in loads)
        renamed = sum(1 for ld in loads for k, v in ld.mapped.items() if k != v)
        unused = sum(len(ld.unused_source_columns) for ld in loads)
        return ("ok", f"{mapped} columns mapped ({renamed} renamed from your names), "
                      f"{unused} extra columns ignored; values normalised (powertrain, job type, payer)",
                {"mapped": mapped, "renamed": renamed, "ignored": unused})
    timed("Map & standardise", do_map)

    # 3. Validate
    def do_validate():
        nonlocal issues
        issues = validate(con, loads)
        n_err = sum(i.severity == "error" for i in issues)
        n_warn = sum(i.severity == "warning" for i in issues)
        status = "blocked" if n_err and not force else ("warning" if n_err or n_warn else "ok")
        return status, f"{n_err} errors, {n_warn} warnings", {"errors": n_err, "warnings": n_warn}
    v_status = timed("Validate", do_validate)
    save_issues(con, issues)

    blocked = v_status == "blocked" or validate_only
    if not blocked:
        snapshot, start = _resolve_dates(con, cfg)
        config_mod.publish(con, cfg, snapshot, start)

        # 4. Model
        def do_model():
            files = sorted(p for p in MODELS.iterdir() if p.name.endswith(".sql"))
            for f in files:
                con.execute(f.read_text())
            views = con.execute("SELECT count(*) FROM duckdb_views() WHERE NOT internal").fetchall()[0][0]
            return "ok", f"{len(files)} SQL model files, {views} KPI views; snapshot {snapshot[:10]}", \
                   {"files": len(files), "views": views, "snapshot": snapshot[:10], "analysis_start": start}
        try:
            timed("Model", do_model)
        except duckdb.Error as exc:
            stages.append(Stage("Model", "failed", str(exc).splitlines()[0], 0.0))
            blocked = True

    if not blocked:
        # 5. Quality gate
        def do_gate():
            results = {name: bool(con.execute(sql).fetchall()[0][0]) for name, sql in QUALITY_GATE.items()}
            failed = [k for k, v in results.items() if not v]
            return ("ok" if not failed else "warning",
                    f"{len(results) - len(failed)}/{len(results)} checks passed"
                    + (f"; failed: {', '.join(failed)}" if failed else ""), results)
        timed("Quality gate", do_gate)

    # 6. Publish (always: a blocked run still publishes its validation report)
    def do_publish():
        return ("ok" if not blocked else "skipped",
                f"warehouse written to {final_db.name}" if not blocked
                else ("KPIs not published: a model failed (see Model)" if any(s.stage == "Model" and s.status == "failed" for s in stages)
                      else "KPIs not published: fix validation errors"),
                {})
    timed("Publish", do_publish)

    con.execute("CREATE OR REPLACE TABLE run_log (stage VARCHAR, status VARCHAR, detail VARCHAR, seconds DOUBLE, metrics VARCHAR, built_at TIMESTAMP)")
    built_at = datetime.now().replace(microsecond=0)
    con.executemany("INSERT INTO run_log VALUES (?, ?, ?, ?, ?, ?)",
                    [(s.stage, s.status, s.detail, s.seconds, json.dumps(s.metrics, default=str), built_at) for s in stages])
    con.execute("CREATE OR REPLACE TABLE ingest_log (table_name VARCHAR, source VARCHAR, n_rows BIGINT, "
                "mapped VARCHAR, missing_optional VARCHAR, unused_columns VARCHAR)")
    con.executemany("INSERT INTO ingest_log VALUES (?, ?, ?, ?, ?, ?)",
                    [(ld.table, ld.source, ld.rows, json.dumps(ld.mapped), json.dumps(ld.missing_optional),
                      json.dumps(ld.unused_source_columns)) for ld in loads])
    con.close()

    if blocked and final_db.exists() and not validate_only:
        # keep the last good warehouse; publish the failed run's report beside it
        os.replace(tmp_db, final_db.with_suffix(".failed.duckdb"))
    elif validate_only:
        tmp_db.unlink(missing_ok=True)
    else:
        os.replace(tmp_db, final_db)
    return BuildResult(ok=not blocked, stages=stages, issues=issues, loads=loads, database=final_db)


def summary(result: BuildResult) -> str:
    icon = {"ok": "✓", "warning": "!", "blocked": "✗", "failed": "✗", "skipped": "-"}
    lines = [f"  {icon.get(s.status, '?')} {s.stage:<18} {s.detail}  ({s.seconds:.2f}s)" for s in result.stages]
    shown = [i for i in result.issues if i.severity in ("error", "warning")]
    if shown:
        lines.append("\n  Data issues:")
        for i in shown[:25]:
            ex = f"  e.g. {i.example}" if i.example else ""
            lines.append(f"   [{i.severity.upper():7}] {i.table}: {i.check} ({i.count}){ex}")
        if len(shown) > 25:
            lines.append(f"   ... and {len(shown) - 25} more (see the Pipeline page)")
    return "\n".join(lines)


def as_dict(result: BuildResult) -> dict:
    return {"ok": result.ok, "stages": [asdict(s) for s in result.stages],
            "issues": [asdict(i) for i in result.issues]}
