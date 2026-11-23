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
