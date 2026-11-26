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
                    " issue_date DATE, expiry_date DATE, issuer VARCHAR, file_name VARCHAR, inspection_result VARCHAR)")
        con.executemany("INSERT INTO documents VALUES (?, ?, 'Registration', NULL, NULL, DATE '2027-01-01', NULL, 'card.jpg', NULL)",
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


def _gcc(vehicles, documents=(), snapshot="2026-11-23"):
    """Run stg_gcc_rules + mart_gcc_compliance on a tiny fleet; returns {vehicle_id: (status, reasons)}."""
    from pathlib import Path
    root = Path(__file__).parents[1] / "fleetkpi/sql/models"
    con = duckdb.connect()
    try:
        con.execute(f"CREATE MACRO snapshot_date() AS DATE '{snapshot}'")
        con.execute("""CREATE MACRO doc_status(e) AS CASE WHEN e IS NULL THEN 'Unknown' WHEN e < snapshot_date() THEN 'Expired'
                       WHEN e <= snapshot_date() + INTERVAL 30 DAY THEN 'Expiring' ELSE 'Valid' END""")
        con.execute("CREATE MACRO cfg_num(k) AS 30")
        con.execute("CREATE TABLE stg_vehicles (vehicle_id VARCHAR, plate_number VARCHAR, make VARCHAR, model VARCHAR, region VARCHAR,"
                    " use_case VARCHAR, model_year INTEGER, age_months INTEGER, is_active BOOLEAN,"
                    " registration_expiry DATE, insurance_expiry DATE, registration_class VARCHAR,"
                    " manufacture_date DATE, inspection_required_by_authority BOOLEAN,"
                    " first_registration_date DATE, registered_as_new BOOLEAN, registration_jurisdiction VARCHAR,"
                    " registration_owner_type VARCHAR, registration_weight_kg DOUBLE, vehicle_advertising BOOLEAN,"
                    " inspection_due_date DATE, inspection_schedule_reference VARCHAR)")
        con.executemany("INSERT INTO stg_vehicles VALUES (?, 'P', 'M', 'X', ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [(*v, *((None,) * (18 - len(v)))) for v in vehicles])
        con.execute("CREATE TABLE stg_vehicles2 AS SELECT *, doc_status(registration_expiry) AS registration_status,"
                    " doc_status(insurance_expiry) AS insurance_status FROM stg_vehicles")
        con.execute("DROP TABLE stg_vehicles; ALTER TABLE stg_vehicles2 RENAME TO stg_vehicles")
        con.execute("CREATE TABLE stg_documents (vehicle_id VARCHAR, doc_type VARCHAR, expiry_date DATE, issuer VARCHAR,"
                    " issue_date DATE, inspection_result VARCHAR)")
        if documents:
            con.executemany("INSERT INTO stg_documents VALUES (?, ?, ?, ?, ?, ?)",
                            [(*d, None, None) if len(d) == 4 else (*d, "Pass") if len(d) == 5 else d for d in documents])
        con.execute("CREATE TABLE stg_gcc_rules AS " + (root / "staging/stg_gcc_rules.sql").read_text())
        con.execute("CREATE TABLE stg_gcc_inspection_classes AS " + (root / "staging/stg_gcc_inspection_classes.sql").read_text())
        rows = con.execute("SELECT vehicle_id, status, reasons FROM (" + (root / "marts/mart_gcc_compliance.sql").read_text() + ")").fetchall()
        return {r[0]: (r[1], r[2]) for r in rows}
    finally:
        con.close()


def test_gcc_rules_per_country():
    far, soon, past = "2027-09-01", "2026-12-10", "2026-11-01"
    got = _gcc([
        ("ok-uae", "Dubai", "Ride-hail", 2025, 10, far, far, "Heavy vehicle", None, False, None, False),
        ("expired-ksa", "KSA", "Pool car", 2024, 20, past, far),
        ("truck-ksa", "Riyadh", "Delivery", 2025, 6, far, far),            # goods vehicle: TGA operating card needed
        ("old-qatar", "Qatar", "Pool car", 2020, 70, soon, far, "Private car", None, False, "2020-01-15", True),
        ("bh-cover", "Bahrain", "Pool car", 2025, 6, far, "2027-03-01"),   # insurance ends before the registration
        ("tr", "Türkiye", "Pool car", 2025, 6, far, far),
        ("no-date", "Oman", "Pool car", 2025, 6, None, far),
    ])
    assert got["ok-uae"][0] == "Compliant"
    assert got["expired-ksa"][0] == "Non-compliant" and "Istimara (vehicle registration) expired 2026-11-01" in got["expired-ksa"][1]
    assert got["truck-ksa"][0] == "Evidence missing" and "TGA operating card" in got["truck-ksa"][1]
    assert got["old-qatar"][0] == "Evidence missing" and "current technical inspection evidence for renewal" in got["old-qatar"][1]
    assert got["bh-cover"][0] == "Non-compliant" and "must cover the whole registration period" in got["bh-cover"][1]
    assert got["tr"] == ("Not covered", "No GCC rule pack for this region")
    assert got["no-date"][0] == "Evidence missing"


def test_gcc_bahrain_inspection_uses_official_type_and_exact_manufacture_date():
    soon, far = "2026-12-10", "2027-09-01"

    def vehicle(name, registration_class, manufactured=None, registry=soon, directed=False, region="Manama"):
        return (name, region, "Pool car", 2025, 12, registry, far, registration_class, manufactured, directed)

    got = _gcc([
        ("qa", "Doha", "Pool car", 2020, 70, soon, far, "Private car", None, False, "2020-01-15", True),
        vehicle("missing", None, registry=far),
        vehicle("unknown", "Fleet pool"),
        vehicle("missing-date", "Private"),
        vehicle("future-date", "Private", "2026-11-24"),
        vehicle("exactly-five", "خصوصي", "2021-11-23"),
        vehicle("over-five", "Private", "2021-11-22"),
        vehicle("private-transport", "Private transport", "2026-01-01", region="BH"),
        vehicle("current", "سيارة نقل خاص للركاب", region="البحرين"),
        vehicle("far-renewal", "Commercial", registry=far),
        vehicle("traffic-order", "Private", "2026-01-01", registry=far, directed=True),
    ], documents=[
        ("qa", "Inspection", "2027-01-15", "FAHES", "2026-11-20"),
        ("over-five", "Inspection", "2026-11-22", "Bahrain Traffic"),
        ("private-transport", "Inspection", "2026-12-10", "Bahrain Traffic", "2026-11-24"),
        ("current", "Inspection", "2026-11-23", "Bahrain Traffic"),
    ])
    assert got["qa"][0] == "Expiring" and "inspection" not in got["qa"][1].lower()
    for name in ("missing", "unknown"):
        assert got[name][0] == "Evidence missing" and "official Bahrain registration class" in got[name][1]
    for name in ("missing-date", "future-date"):
        assert got[name][0] == "Evidence missing" and "actual manufacture date" in got[name][1]
    assert got["exactly-five"] == got["current"] == ("Expiring", "Registration certificate expires 2026-12-10")
    for name in ("over-five", "private-transport"):
        assert got[name][0] == "Evidence missing" and "technical inspection evidence for renewal" in got[name][1]
    assert got["far-renewal"] == ("Compliant", "")
    assert got["traffic-order"] == ("Evidence missing", "Add current technical inspection evidence required by Bahrain Traffic")


def test_only_identified_tga_card_can_clear_saudi_goods_check():
    far = "2027-09-01"
    fleet = [("truck", "Riyadh", "Delivery", 2025, 6, far, far, "Public transport", None, False, "2025-05-01", True)]
    got = _gcc(fleet, documents=[("truck", "Permit", far, "Parking department")])
    assert got["truck"][0] == "Evidence missing"
    assert _gcc(fleet, documents=[("truck", "Permit", far, "Naql")])["truck"][0] == "Compliant"


def test_gcc_release_inspection_classes_dates_and_authority_evidence():
    soon, far = "2026-12-10", "2027-09-01"

    def vehicle(name, country, kind, *, reg=soon, manufacture=None, licensed=None, new=None, emirate=None,
                owner=None, kg=None, ads=None, next_due=None, ref=None, directed=False):
        return (name, country, "Pool car", 2025, 6, reg, far, kind, manufacture, directed,
                licensed, new, emirate, owner, kg, ads, next_due, ref)

    fleet = [
        vehicle("ae-first", "AE", "مركبة خفيفة خاصة", licensed="2023-11-24", new=True, emirate="Abu Dhabi"),
        vehicle("ae-exact", "UAE", "Private light vehicle", licensed="2023-11-23", new=True, emirate="Sharjah"),
        vehicle("ae-unknown-emirate", "AE", "Private light vehicle", licensed="2025-11-23", new=True),
        vehicle("ae-dubai", "دبي", "Heavy vehicle", new=False),
        vehicle("ae-dubai-other-centre", "Dubai", "Heavy vehicle", new=False),
        vehicle("ae-dubai-dealer", "Dubai", "Private light vehicle", manufacture="2024-02-01",
                licensed="2024-03-01", new=True, next_due="2027-01-01", ref="RTA-1"),
        vehicle("sa-private", "SA", "رخصة سير خاصة", reg=far, licensed="2023-11-24", new=True),
        vehicle("sa-taxi", "الرياض", "أجرة", reg=far, licensed="2024-11-23"),
        vehicle("sa-used", "KSA", "Private car", reg=far, licensed="2026-02-01", new=False),
        vehicle("sa-transport", "SA", "نقل خاص", reg=far, next_due="2027-01-01", ref="SASO-1"),
        vehicle("qa-light-owner", "QA", "Private transport", licensed="2025-01-01", new=True, owner="فرد", kg=2999),
        vehicle("qa-company", "QA", "نقل خاص", licensed="2025-01-01", owner="Company", kg=2999),
        vehicle("qa-boundary", "QA", "نقل خاص", licensed="2025-01-01", owner="Individual", kg=3000),
        vehicle("qa-boundary-recorded", "QA", "نقل خاص", licensed="2025-01-01", owner="Individual", kg=3000,
                next_due="2027-01-01", ref="FAHES-1"),
        vehicle("qa-rental-expired", "Qatar", "Rental car"),
        vehicle("qa-rental-current", "قطر", "Rental car"),
        vehicle("kw-confirmed", "KW", "سيارة خاصة", next_due="2027-01-01", ref="SAHEL-1"),
        vehicle("kw-missing-schedule", "Kuwait", "Private car", next_due="2027-01-01"),
        vehicle("kw-taxi", "الكويت", "سيارة أجرة"),
        vehicle("om-nine", "OM", "Private car", manufacture="2016-11-24"),
        vehicle("om-ten", "عمان", "Private car", manufacture="2016-11-23"),
        vehicle("om-pickup", "Oman", "Commercial pickup", manufacture="2025-11-23", ads=False),
        vehicle("om-ads", "Oman", "Commercial pickup", manufacture="2025-11-23", ads=True),
        vehicle("om-failed", "Oman", "Private car", reg=far, manufacture="2025-11-23"),
        vehicle("om-retested", "Oman", "Private car", reg=far, manufacture="2025-11-23"),
        vehicle("om-unverified", "Oman", "Commercial pickup", manufacture="2025-11-23"),
        vehicle("om-school", "Muscat", "حافلة مدرسية"),
        vehicle("om-directed", "Oman", "Private car", reg=far, manufacture="2025-11-23", directed=True),
        vehicle("none", "Saudi Arabia", "fleet pool", reg=far),
    ]
    got = _gcc(fleet, documents=[
        ("qa-rental-expired", "Inspection", far, "FAHES", "2026-10-23"),
        ("qa-rental-current", "Inspection", far, "FAHES", "2026-10-24"),
        ("ae-dubai", "Inspection", far, "RTA", "2026-11-22"),
        ("ae-dubai-other-centre", "Inspection", far, "Abu Dhabi centre", "2026-11-22"),
        ("om-failed", "Inspection", far, "ROP", "2026-11-19", "Pass"),
        ("om-failed", "Inspection", None, "ROP", "2026-11-22", "Fail"),
        ("om-retested", "Inspection", None, "ROP", "2026-11-22", "Fail"),
        ("om-retested", "Inspection", far, "ROP", "2026-11-23", "Pass"),
    ])
    for name in ("ae-first", "ae-dubai", "ae-dubai-dealer", "qa-light-owner", "qa-boundary-recorded", "qa-rental-current",
                 "kw-confirmed", "om-nine", "om-pickup"):
        assert got[name][0] == "Expiring", (name, got[name])
    for name in ("sa-private", "sa-transport", "om-retested"):
        assert got[name] == ("Compliant", "")
    for name in ("ae-exact", "ae-unknown-emirate", "ae-dubai-other-centre", "sa-taxi", "sa-used", "qa-company",
                 "qa-rental-expired", "qa-boundary", "kw-missing-schedule", "kw-taxi", "om-ten", "om-ads",
                 "om-unverified", "om-school", "om-directed", "none"):
        assert got[name][0] == "Evidence missing", (name, got[name])
    assert "licensing authority" in got["om-directed"][1]
    assert "periodic technical inspection" in got["sa-taxi"][1]
    assert got["om-failed"][0] == "Non-compliant" and "passing reinspection" in got["om-failed"][1]


def test_uae_changes_federal_light_class_rules_on_effective_date():
    fleet = [("uae", "AE", "Pool car", 2025, 6, "2027-01-08", "2027-06-01", "Light commercial vehicle",
              "2025-01-01", False, "2025-02-01", True, "Abu Dhabi")]
    assert _gcc(fleet, snapshot="2026-12-31")["uae"][0] == "Evidence missing"
    assert _gcc(fleet, snapshot="2027-01-01")["uae"][0] == "Expiring"
