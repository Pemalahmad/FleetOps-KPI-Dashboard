"""The pipeline, in eight stages:

    Ingest -> Standardise -> Validate -> Staging -> Intermediate -> Marts -> Test -> Publish

Ingest and Standardise read the user's files onto the data contract (Python + SQL type
conversion). Everything after that is SQL, run by fleetkpi.sqlrunner: validation rules,
three model layers in dependency order, and data tests. Each stage is timed and logged into
the warehouse (pipeline_runs, pipeline_models, pipeline_tests, validation_issues, ingest_log)
so the dashboard can show exactly what ran and why every number is what it is.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import duckdb

from . import config as config_mod
from . import sqlrunner
from .config import Config
from .contract import LOAD_ORDER
from .ingest import TableLoad, ingest
from .validate import Issue, save as save_issues, validate

STAGES = ["Ingest", "Standardise", "Validate", "Staging", "Intermediate", "Marts", "Test", "Publish"]


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
    models: list[dict] = field(default_factory=list)
    tests: list[dict] = field(default_factory=list)


def _resolve_dates(con: duckdb.DuckDBPyConnection, cfg: Config) -> tuple[str, str]:
    snap = str(cfg["fleet"].get("snapshot_date", "auto"))
    if snap == "auto":
        # If every usage row is dated the 1st, usage is monthly: its last row covers the whole month,
        # so the snapshot must not fall mid-month (that would divide a month of km/hours by a few days).
        snap = con.execute("""
            WITH u AS (
                SELECT CASE WHEN bool_and(day(date) = 1) THEN last_day(max(date)) ELSE max(date) END AS usage_end
                FROM usage
            )
            SELECT (date_trunc('day', greatest(
                        (SELECT max(opened_at) FROM work_orders),
                        (SELECT max(closed_at) FROM work_orders),
                        (SELECT usage_end::TIMESTAMP FROM u))) + INTERVAL 1 DAY)::VARCHAR
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
    loads: list[TableLoad] = []
    model_log: list[dict] = []
    test_log: list[dict] = []
    halted = False
    snapshot = ""

    def stage(name, fn):
        nonlocal halted
        if halted:
            stages.append(Stage(name, "skipped", "not run: an earlier stage stopped the pipeline", 0.0))
            return
        t0 = time.time()
        try:
            status, detail, metrics = fn()
        except (duckdb.Error, ValueError) as exc:
            status, detail, metrics = "failed", str(exc).splitlines()[0], {}
        stages.append(Stage(name, status, detail, round(time.time() - t0, 3), metrics))
        if status in ("failed", "blocked"):
            halted = True

    # 1. Ingest
    def do_ingest():
        nonlocal loads
        loads = ingest(con, cfg)
        found = [ld for ld in loads if ld.source]
        rows = {ld.table: ld.rows for ld in loads}
        return ("ok" if found else "failed",
                f"{len(found)} of {len(loads)} tables found, {sum(rows.values()):,} rows", rows)
    stage("Ingest", do_ingest)

    # 2. Standardise
    def do_standardise():
        mapped = sum(len(ld.mapped) for ld in loads)
        renamed = sum(1 for ld in loads for k, v in ld.mapped.items() if k != v)
        unused = sum(len(ld.unused_source_columns) for ld in loads)
        return ("ok", f"{mapped} columns on contract ({renamed} renamed), {unused} extra ignored; "
                      f"types converted, codes normalised",
                {"mapped": mapped, "renamed": renamed, "ignored": unused})
    stage("Standardise", do_standardise)

    # 3. Validate: contract checks in Python, row rules in SQL
    def do_validate():
        nonlocal issues
        issues = validate(con, loads)
        n_err = sum(i.severity == "error" for i in issues)
        n_warn = sum(i.severity == "warning" for i in issues)
        n_rules = len(sqlrunner.discover("validation"))
        status = "blocked" if (n_err and not force) else ("warning" if (n_err or n_warn) else "ok")
        return status, f"{n_rules} SQL rules + contract checks: {n_err} errors, {n_warn} warnings", \
               {"errors": n_err, "warnings": n_warn, "rules": n_rules}
    stage("Validate", do_validate)
    save_issues(con, issues)
    if validate_only:
        halted = True

    # 4-6. Model layers, in dependency order
    plan: list = []
    if not halted:
        snapshot, start = _resolve_dates(con, cfg)
        config_mod.publish(con, cfg, snapshot, start)
        sqlrunner.run_macros(con)
        try:
            plan = sqlrunner.plan()
        except ValueError as exc:
            stages.append(Stage("Staging", "failed", str(exc), 0.0))
            halted = True

    for layer, name in [("staging", "Staging"), ("intermediate", "Intermediate"), ("marts", "Marts")]:
        if any(s.stage == name for s in stages):
            continue

        def do_layer(layer=layer):
            log = sqlrunner.run_models(con, LOAD_ORDER, layer=layer, models=plan)
            model_log.extend(log)
            rows = sum(m["rows"] for m in log)
            extra = f"; snapshot {snapshot[:10]}" if layer == "staging" else ""
            return "ok", f"{len(log)} models, {rows:,} rows{extra}", {"models": len(log), "rows": rows}
        stage(name, do_layer)

    # 7. Test
    def do_test():
        nonlocal test_log
        test_log = sqlrunner.run_tests(con)
        failed = [t for t in test_log if t["status"] == "fail" or t["status"].startswith("error")]
        warned = [t for t in test_log if t["status"] == "warn"]
        status = "failed" if failed else ("warning" if warned else "ok")
        return status, (f"{len(test_log) - len(failed) - len(warned)}/{len(test_log)} SQL tests passed"
                        + (f", {len(warned)} warnings" if warned else "")
                        + (f"; failed: {', '.join(t['test'] for t in failed)}" if failed else "")), \
               {"tests": len(test_log), "failed": len(failed), "warnings": len(warned)}
    stage("Test", do_test)

    # 8. Publish
    published = not halted and not validate_only
    if published:
        stage("Publish", lambda: ("ok", f"warehouse published to {final_db.name}", {}))
    else:
        why = "validation only" if validate_only else "an earlier stage stopped the pipeline; last good warehouse kept"
        stages.append(Stage("Publish", "skipped", why, 0.0))

    _write_logs(con, stages, issues, loads, model_log, test_log)
    con.close()
    if validate_only:
        tmp_db.unlink(missing_ok=True)
    elif published:
        os.replace(tmp_db, final_db)
    else:
        os.replace(tmp_db, final_db.with_suffix(".failed.duckdb"))
    return BuildResult(ok=published, stages=stages, issues=issues, loads=loads, database=final_db,
                       models=model_log, tests=test_log)


def _write_logs(con, stages, issues, loads, model_log, test_log) -> None:
    built_at = datetime.now().replace(microsecond=0)
    con.execute("CREATE OR REPLACE TABLE pipeline_runs (step INTEGER, stage VARCHAR, status VARCHAR, detail VARCHAR, "
                "seconds DOUBLE, metrics VARCHAR, built_at TIMESTAMP)")
    con.executemany("INSERT INTO pipeline_runs VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [(i, s.stage, s.status, s.detail, s.seconds, json.dumps(s.metrics, default=str), built_at)
                     for i, s in enumerate(stages, 1)])
    con.execute("CREATE OR REPLACE TABLE pipeline_models (model VARCHAR, layer VARCHAR, materialized VARCHAR, "
                "description VARCHAR, n_rows BIGINT, seconds DOUBLE, deps VARCHAR[], sources VARCHAR[])")
    if model_log:
        con.executemany("INSERT INTO pipeline_models VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [(m["model"], m["layer"], m["materialized"], m["description"], m["rows"], m["seconds"],
                          m["deps"], m["sources"]) for m in model_log])
    con.execute("CREATE OR REPLACE TABLE pipeline_tests (test VARCHAR, severity VARCHAR, description VARCHAR, "
                "failing_rows BIGINT, status VARCHAR, seconds DOUBLE)")
    if test_log:
        con.executemany("INSERT INTO pipeline_tests VALUES (?, ?, ?, ?, ?, ?)",
                        [(t["test"], t["severity"], t["description"], t["failing_rows"], t["status"], t["seconds"])
                         for t in test_log])
    con.execute("CREATE OR REPLACE TABLE ingest_log (table_name VARCHAR, source VARCHAR, n_rows BIGINT, "
                "mapped VARCHAR, missing_optional VARCHAR, unused_columns VARCHAR)")
    con.executemany("INSERT INTO ingest_log VALUES (?, ?, ?, ?, ?, ?)",
                    [(ld.table, ld.source, ld.rows, json.dumps(ld.mapped), json.dumps(ld.missing_optional),
                      json.dumps(ld.unused_source_columns)) for ld in loads])


def summary(result: BuildResult) -> str:
    icon = {"ok": "✓", "warning": "!", "blocked": "✗", "failed": "✗", "skipped": "-"}
    lines = [f"  {icon.get(s.status, '?')} {s.stage:<13} {s.detail}  ({s.seconds:.2f}s)" for s in result.stages]
    shown = [i for i in result.issues if i.severity in ("error", "warning")]
    if shown:
        lines.append("\n  Data issues:")
        for i in shown[:25]:
            ex = f"  e.g. {i.example}" if i.example else ""
            lines.append(f"   [{i.severity.upper():7}] {i.table}: {i.check} ({i.count}){ex}")
    bad_tests = [t for t in result.tests if t["status"] != "pass"]
    if bad_tests:
        lines.append("\n  SQL tests not passing:")
        lines += [f"   [{t['status'].upper()}] {t['test']}: {t['description']} ({t['failing_rows']} rows)" for t in bad_tests]
    return "\n".join(lines)


def as_dict(result: BuildResult) -> dict:
    return {"ok": result.ok, "stages": [asdict(s) for s in result.stages],
            "issues": [asdict(i) for i in result.issues], "tests": result.tests}
