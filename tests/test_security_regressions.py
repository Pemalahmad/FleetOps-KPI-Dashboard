import duckdb
import pytest

from fleetkpi.ingest import _converter
from fleetkpi.webexport import _lit


@pytest.mark.parametrize("text", ["1e30", "Infinity", "-2147483649", "not a number"])
def test_out_of_range_integer_is_reportable_null(text):
    con = duckdb.connect()
    try:
        assert con.execute("SELECT " + _converter("INTEGER", "?"), [text]).fetchone()[0] is None
    finally:
        con.close()


def test_parquet_export_path_with_apostrophe_is_a_literal(tmp_path):
    out = tmp_path / "O'Brien.parquet"
    con = duckdb.connect()
    try:
        con.execute(f"COPY (SELECT 42 AS n) TO {_lit(str(out))} (FORMAT parquet)")
        assert con.execute("SELECT n FROM read_parquet(?)", [str(out)]).fetchone()[0] == 42
    finally:
        con.close()


def _match_documents(vehicles, refs):
    """Run the real stg_documents model on a tiny fleet and return {document_id: (vehicle_id, matched_by)}."""
    from pathlib import Path
    sql = (Path(__file__).parents[1] / "fleetkpi/sql/models/staging/stg_documents.sql").read_text()
    con = duckdb.connect()
    try:
        con.execute("CREATE MACRO snapshot_date() AS DATE '2026-11-23'")
        con.execute("CREATE MACRO doc_status(d) AS CASE WHEN d IS NULL THEN 'Unknown' ELSE 'Valid' END")
        con.execute("CREATE TABLE vehicles (vehicle_id VARCHAR, plate_number VARCHAR, vin VARCHAR)")
        con.executemany("INSERT INTO vehicles VALUES (?, ?, ?)", vehicles)
        con.execute("CREATE TABLE documents (document_id VARCHAR, vehicle_ref VARCHAR, doc_type VARCHAR, document_number VARCHAR,"
                    " issue_date DATE, expiry_date DATE, issuer VARCHAR, file_name VARCHAR)")
        con.executemany("INSERT INTO documents VALUES (?, ?, 'Registration', NULL, NULL, DATE '2027-01-01', NULL, 'card.jpg')",
                        list(refs.items()))
        return {r[0]: (r[1], r[2]) for r in con.execute(f"SELECT document_id, vehicle_id, matched_by FROM ({sql})").fetchall()}
    finally:
        con.close()


def test_a_vin_shaped_reference_attaches_to_the_vin_owner_not_a_colliding_fleet_id():
    vin = "5YJ3E1EA7KF000001"
    fleet = [("V-1", "D 100", vin), (vin, "D 200", "1HGCM82633A004352")]   # V-2's fleet id equals V-1's VIN
    got = _match_documents(fleet, {"DOC-1": vin, "DOC-2": "D 200", "DOC-3": "V-1"})
    assert got["DOC-1"] == ("V-1", "vin")
    assert got["DOC-2"] == (vin, "plate")
    assert got["DOC-3"] == ("V-1", "vehicle_id")


def test_a_reference_shared_by_two_vehicles_is_left_unattached():
    fleet = [("V-1", "D 100", None), ("D100", "D 300", None)]   # V-1's plate normalises to V-2's fleet id... at different priority
    assert _match_documents(fleet, {"DOC-1": "D100"})["DOC-1"] == ("D100", "vehicle_id")
    twins = [("V-1", "DXB 1", None), ("V-2", "DXB-1", None)]   # two vehicles with the same plate
    assert _match_documents(twins, {"DOC-1": "DXB 1"})["DOC-1"] == (None, "ambiguous")


def _gcc(vehicles, documents=()):
    """Run stg_gcc_rules + mart_gcc_compliance on a tiny fleet; returns {vehicle_id: (status, reasons)}."""
    from pathlib import Path
    root = Path(__file__).parents[1] / "fleetkpi/sql/models"
    con = duckdb.connect()
    try:
        con.execute("CREATE MACRO snapshot_date() AS DATE '2026-11-23'")
        con.execute("""CREATE MACRO doc_status(e) AS CASE WHEN e IS NULL THEN 'Unknown' WHEN e < snapshot_date() THEN 'Expired'
                       WHEN e <= snapshot_date() + INTERVAL 30 DAY THEN 'Expiring' ELSE 'Valid' END""")
        con.execute("CREATE TABLE stg_vehicles (vehicle_id VARCHAR, plate_number VARCHAR, make VARCHAR, model VARCHAR, region VARCHAR,"
                    " use_case VARCHAR, model_year INTEGER, age_months INTEGER, is_active BOOLEAN,"
                    " registration_expiry DATE, insurance_expiry DATE)")
        con.executemany("INSERT INTO stg_vehicles VALUES (?, 'P', 'M', 'X', ?, ?, ?, ?, TRUE, ?, ?)", vehicles)
        con.execute("CREATE TABLE stg_vehicles2 AS SELECT *, doc_status(registration_expiry) AS registration_status,"
                    " doc_status(insurance_expiry) AS insurance_status FROM stg_vehicles")
        con.execute("DROP TABLE stg_vehicles; ALTER TABLE stg_vehicles2 RENAME TO stg_vehicles")
        con.execute("CREATE TABLE stg_documents (vehicle_id VARCHAR, doc_type VARCHAR, expiry_date DATE)")
        if documents:
            con.executemany("INSERT INTO stg_documents VALUES (?, ?, ?)", documents)
        con.execute("CREATE TABLE stg_gcc_rules AS " + (root / "staging/stg_gcc_rules.sql").read_text())
        rows = con.execute("SELECT vehicle_id, status, reasons FROM (" + (root / "marts/mart_gcc_compliance.sql").read_text() + ")").fetchall()
        return {r[0]: (r[1], r[2]) for r in rows}
    finally:
        con.close()


def test_gcc_rules_per_country():
    far, soon, past = "2027-09-01", "2026-12-10", "2026-11-01"
    got = _gcc([
        ("ok-uae", "Dubai", "Ride-hail", 2025, 10, far, far),
        ("expired-ksa", "KSA", "Pool car", 2024, 20, past, far),
        ("truck-ksa", "Riyadh", "Delivery", 2025, 6, far, far),            # goods vehicle: TGA operating card needed
        ("old-qatar", "Qatar", "Pool car", 2020, 70, soon, far),           # 6 years old, renewal near, no inspection on file
        ("bh-cover", "Bahrain", "Pool car", 2025, 6, far, "2027-03-01"),   # insurance ends before the registration
        ("tr", "Türkiye", "Pool car", 2025, 6, far, far),
        ("no-date", "Oman", "Pool car", 2025, 6, None, far),
    ])
    assert got["ok-uae"][0] == "Compliant"
    assert got["expired-ksa"] == ("Non-compliant", "Istimara (vehicle registration) expired 2026-11-01")
    assert got["truck-ksa"][0] == "Evidence missing" and "TGA operating card" in got["truck-ksa"][1]
    assert got["old-qatar"][0] == "Expiring" and "Book the technical inspection" in got["old-qatar"][1]
    assert got["bh-cover"][0] == "Expiring" and "must cover the whole registration period" in got["bh-cover"][1]
    assert got["tr"] == ("Not covered", "No GCC rule pack for this region")
    assert got["no-date"][0] == "Evidence missing"


def test_gcc_inspection_on_file_and_unknown_bahrain_threshold():
    soon, far = "2026-12-10", "2027-09-01"
    got = _gcc([("qa", "Doha", "Pool car", 2020, 70, soon, far), ("bh", "Manama", "Pool car", 2015, 130, soon, far)],
               documents=[("qa", "Inspection", "2027-01-15")])
    assert "inspection" not in got["qa"][1].lower()        # a current inspection on file clears the reminder
    assert "inspection" not in got["bh"][1].lower()        # Bahrain publishes no age threshold: FleetOps does not invent one
    assert got["qa"][0] == got["bh"][0] == "Expiring"       # the registration itself is still due soon
