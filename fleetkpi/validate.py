"""Validation: plain-language data-quality findings. Errors block a build; warnings do not."""
from __future__ import annotations

from dataclasses import dataclass

import duckdb

from . import sqlrunner
from .contract import TABLES
from .ingest import TableLoad


@dataclass
class Issue:
    severity: str          # error | warning | info
    table: str
    check: str
    count: int
    example: str = ""


def validate(con: duckdb.DuckDBPyConnection, loads: list[TableLoad]) -> list[Issue]:
    issues: list[Issue] = []
    for ld in loads:
        t = TABLES[ld.table]
        if ld.source is None:
            if t.required:
                issues.append(Issue("error", ld.table, "Required table missing: add "
                                    f"{ld.table}.csv (or .xlsx/.parquet) to the input folder", 1))
            else:
                issues.append(Issue("info", ld.table, "Optional table not supplied; related views stay empty", 0))
            continue
        for col in ld.missing_required:
            issues.append(Issue("error", ld.table, f"Required column '{col}' not found. Map it in fleet.yml "
                                f"under mapping: {ld.table}: {col}: \"<your column>\"", 1))
        for col, n in ld.unparsed.items():
            ctype = t.column(col).type
            issues.append(Issue("error" if t.column(col).required else "warning", ld.table,
                                f"'{col}' values that are not a valid {ctype}", n))
        for c in t.columns:
            if c.required and c.name in ld.mapped:
                n = con.execute(f"SELECT count(*) FROM {ld.table} WHERE {c.name} IS NULL").fetchall()[0][0]
                n -= ld.unparsed.get(c.name, 0)
                if n > 0:
                    issues.append(Issue("error", ld.table, f"Required '{c.name}' is blank", n))

    # Row-level rules live in SQL: fleetkpi/sql/validation/*.sql
    loaded = {ld.table for ld in loads if ld.source}
    for r in sqlrunner.run_validation(con, loaded):
        issues.append(Issue(r["severity"], r["table"], r["check"], r["count"], r["example"]))
    return issues


def save(con: duckdb.DuckDBPyConnection, issues: list[Issue]) -> None:
    con.execute("CREATE OR REPLACE TABLE validation_issues "
                "(severity VARCHAR, table_name VARCHAR, check_name VARCHAR, n INTEGER, example VARCHAR)")
    if issues:
        con.executemany("INSERT INTO validation_issues VALUES (?, ?, ?, ?, ?)",
                        [(i.severity, i.table, i.check, i.count, i.example) for i in issues])
