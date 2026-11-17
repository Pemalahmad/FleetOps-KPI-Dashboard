"""Data-quality and logic checks on the built warehouse. Exits non-zero on any failure.

Usage:  python scripts/check.py
"""
from pathlib import Path
import sys

import duckdb

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "fleet.duckdb"

CHECKS = {
    "availability is a valid percentage":
        "SELECT count(*) = 0 FROM fleet_monthly WHERE availability_pct NOT BETWEEN 90 AND 100",
    "utilization is a valid percentage":
        "SELECT count(*) = 0 FROM fleet_monthly WHERE utilization_pct NOT BETWEEN 0 AND 100",
    "no job closes before it opens":
        "SELECT count(*) = 0 FROM service_jobs WHERE closed_at < opened_at",
    "no job is served by a center before it opened":
        """SELECT count(*) = 0 FROM service_jobs j JOIN service_centers c USING (center_id)
           WHERE j.opened_at::DATE < c.open_date""",
    "no vehicle is serviced before it entered service":
        """SELECT count(*) = 0 FROM service_jobs j JOIN vehicles v USING (vehicle_id)
           WHERE j.opened_at::DATE < v.in_service_date""",
    "recall completions never exceed affected vehicles":
        "SELECT count(*) = 0 FROM recall_completion WHERE completed_vehicles > affected_vehicles",
    "every recall job belongs to an affected vehicle":
        """SELECT count(*) = 0 FROM service_jobs j
           LEFT JOIN recall_campaign_vehicles cv USING (campaign_id, vehicle_id)
           WHERE j.job_type = 'Recall' AND cv.vehicle_id IS NULL""",
    "executive scorecard covers all 7 markets":
        "SELECT count(*) = 7 FROM exec_scorecard",
    "every RAG value is valid":
        """SELECT count(*) = 0 FROM exec_scorecard
           WHERE NOT list_has_all(['green','amber','red','n/a'],
               [availability_rag, utilization_rag, turnaround_rag, first_time_fix_rag, cost_rag, recall_rag])""",
    # The planted stories must be detectable, or the dashboard is not doing its job.
    "Riyadh North crisis is flagged (>= 10 INTERVENE weeks, Mar-Jun 2026)":
        """SELECT count(*) >= 10 FROM center_weekly
           WHERE center = 'Riyadh North' AND status = 'INTERVENE'
             AND wk BETWEEN DATE '2026-03-01' AND DATE '2026-06-30'""",
    "Riyadh North recovery holds (no INTERVENE weeks, Aug-Sep 2026)":
        """SELECT count(*) = 0 FROM center_weekly
           WHERE center = 'Riyadh North' AND status = 'INTERVENE' AND wk >= DATE '2026-08-01'""",
    "Istanbul Asia turnaround cut median turnaround by >= 30%":
        """SELECT avg(p50_turnaround_h) FILTER (WHERE wk >= DATE '2025-11-01')
                <= 0.7 * avg(p50_turnaround_h) FILTER (WHERE wk < DATE '2025-10-01')
           FROM center_weekly WHERE center = 'Istanbul Asia (Tuzla)'""",
}


def main() -> int:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    failed = 0
    for name, sql in CHECKS.items():
        ok = bool(con.execute(sql).fetchone()[0])
        failed += not ok
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print(f"\n{len(CHECKS) - failed}/{len(CHECKS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
