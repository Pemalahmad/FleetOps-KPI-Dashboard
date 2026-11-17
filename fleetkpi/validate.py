"""Validation: plain-language data-quality findings. Errors block a build; warnings do not."""
from __future__ import annotations

from dataclasses import dataclass

import duckdb

from .contract import TABLES
from .ingest import TableLoad


@dataclass
class Issue:
    severity: str          # error | warning | info
    table: str
    check: str
    count: int
    example: str = ""


# (severity, table, check description, SQL returning offending rows' identifiers)
ROW_CHECKS: list[tuple[str, str, str, str]] = [
    ("error", "vehicles", "Duplicate vehicle_id",
     "SELECT vehicle_id FROM vehicles GROUP BY 1 HAVING count(*) > 1"),
    ("error", "sites", "Duplicate site_id",
     "SELECT site_id FROM sites GROUP BY 1 HAVING count(*) > 1"),
    ("error", "work_orders", "Duplicate work_order_id",
     "SELECT work_order_id FROM work_orders GROUP BY 1 HAVING count(*) > 1"),
    ("error", "vehicles", "Powertrain not recognised (use BEV, PHEV, HEV or ICE)",
     "SELECT vehicle_id || ' = ' || coalesce(powertrain, 'blank') FROM vehicles "
     "WHERE powertrain IS NULL OR powertrain NOT IN ('BEV','PHEV','HEV','ICE')"),
    ("error", "vehicles", "Home site not found in sites",
     "SELECT v.vehicle_id || ' -> ' || v.home_site_id FROM vehicles v "
     "LEFT JOIN sites s ON s.site_id = v.home_site_id WHERE s.site_id IS NULL"),
    ("error", "work_orders", "Work order for a vehicle not in vehicles",
     "SELECT w.work_order_id || ' -> ' || w.vehicle_id FROM work_orders w "
     "LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL"),
    ("error", "work_orders", "Work order at a site not in sites",
     "SELECT w.work_order_id || ' -> ' || w.site_id FROM work_orders w "
     "LEFT JOIN sites s USING (site_id) WHERE s.site_id IS NULL"),
    ("error", "work_orders", "Closed before it was opened",
     "SELECT work_order_id FROM work_orders WHERE closed_at < opened_at"),
    ("warning", "work_orders", "Opened before the vehicle entered service",
     "SELECT w.work_order_id FROM work_orders w JOIN vehicles v USING (vehicle_id) "
     "WHERE w.opened_at::DATE < v.in_service_date"),
    ("warning", "work_orders", "Opened before the site opened",
     "SELECT w.work_order_id FROM work_orders w JOIN sites s USING (site_id) "
     "WHERE s.open_date IS NOT NULL AND w.opened_at::DATE < s.open_date"),
    ("warning", "work_orders", "Negative cost",
     "SELECT work_order_id FROM work_orders WHERE total_cost < 0"),
    ("warning", "work_orders", "Open for more than 60 days (check it is not a missing close date)",
     "SELECT work_order_id FROM work_orders WHERE closed_at IS NULL "
     "AND opened_at < (SELECT max(opened_at) FROM work_orders) - INTERVAL 60 DAY"),
    ("warning", "usage", "Usage for a vehicle not in vehicles",
     "SELECT DISTINCT u.vehicle_id FROM usage u LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL"),
    ("warning", "usage", "Negative distance",
     "SELECT vehicle_id || ' ' || date FROM usage WHERE km < 0"),
    ("warning", "energy", "Energy for a vehicle not in vehicles",
     "SELECT DISTINCT e.vehicle_id FROM energy e LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL"),
    ("warning", "energy", "Fuel logged against an electric (BEV) vehicle",
     "SELECT DISTINCT e.vehicle_id FROM energy e JOIN vehicles v USING (vehicle_id) "
     "WHERE v.powertrain = 'BEV' AND e.energy_type = 'fuel'"),
    ("warning", "energy", "Charging logged against a combustion (ICE) or hybrid (HEV) vehicle",
     "SELECT DISTINCT e.vehicle_id FROM energy e JOIN vehicles v USING (vehicle_id) "
     "WHERE v.powertrain IN ('ICE','HEV') AND e.energy_type = 'electricity'"),
    ("warning", "recall_vehicles", "Recall vehicle not in vehicles",
     "SELECT r.vehicle_id FROM recall_vehicles r LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL"),
    ("warning", "recall_vehicles", "Recall campaign not in recalls",
     "SELECT DISTINCT r.campaign_id FROM recall_vehicles r LEFT JOIN recalls c USING (campaign_id) WHERE c.campaign_id IS NULL"),
]


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

    loaded = {ld.table for ld in loads if ld.source}
    for severity, table, check, sql in ROW_CHECKS:
        if table not in loaded:
            continue
        try:
            rows = con.execute(sql).fetchall()
        except duckdb.Error:
            continue  # a dependency table is missing; its own error is already reported
        if rows:
            issues.append(Issue(severity, table, check, len(rows), ", ".join(str(r[0]) for r in rows[:3])))
    return issues


def save(con: duckdb.DuckDBPyConnection, issues: list[Issue]) -> None:
    con.execute("CREATE OR REPLACE TABLE validation_issues "
                "(severity VARCHAR, table_name VARCHAR, check_name VARCHAR, n INTEGER, example VARCHAR)")
    if issues:
        con.executemany("INSERT INTO validation_issues VALUES (?, ?, ?, ?, ?)",
                        [(i.severity, i.table, i.check, i.count, i.example) for i in issues])
