"""Build the DuckDB warehouse: generate the synthetic seed, then run every KPI model in order.

Usage:  python scripts/build.py
"""
from pathlib import Path
import time

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "fleet.duckdb"
SQL_DIRS = [ROOT / "sql" / "seed", ROOT / "sql" / "models"]


def main() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = duckdb.connect(str(DB_PATH))
    started = time.time()
    for folder in SQL_DIRS:
        for sql_file in sorted(folder.glob("*.sql")):
            t0 = time.time()
            con.execute(sql_file.read_text())
            print(f"  ok  {sql_file.relative_to(ROOT)}  ({time.time() - t0:.1f}s)")
    counts = {
        t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        for t in ["markets", "service_centers", "vehicles", "vehicle_months", "service_jobs"]
    }
    print("\nRows: " + " · ".join(f"{k} {v:,}" for k, v in counts.items()))
    print(f"Built {DB_PATH.relative_to(ROOT)} in {time.time() - started:.1f}s")
    con.close()


if __name__ == "__main__":
    main()
