"""End-to-end tests: the demo fleet, a foreign-format customer fleet, and bad data."""
from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd
import pytest

from fleetkpi import build, config, demo


def _db(result):
    return duckdb.connect(str(result.database), read_only=True)


# ------------------------------------------------------------------ demo fleet
@pytest.fixture(scope="module")
def demo_build(tmp_path_factory):
    root = tmp_path_factory.mktemp("demo")
    cfg_path = demo.generate(root)
    return build.run(config.load(cfg_path))


def test_demo_pipeline_all_stages_pass(demo_build):
    assert demo_build.ok
    assert [s.stage for s in demo_build.stages] == [
        "Ingest", "Standardise", "Validate", "Staging", "Intermediate", "Marts", "Test", "Publish"]
    assert all(s.status == "ok" for s in demo_build.stages if s.stage != "Validate"), \
        [(s.stage, s.status, s.detail) for s in demo_build.stages]
    # The demo register carries deliberate dirt (malformed VINs, one duplicate VIN): warnings, never errors.
    assert not [i for i in demo_build.issues if i.severity == "error"]
    assert {i.check for i in demo_build.issues if i.severity == "warning"} == {
        "VIN is not 17 characters of A-Z / 0-9 (I, O and Q are never used)", "The same VIN on more than one vehicle",
        # the copied VIN does not carry its car's real model year, so the year check flags it too
        "Model year differs from the year encoded in the VIN (10th character); check which is right"}


def test_demo_covers_every_powertrain(demo_build):
    con = _db(demo_build)
    pts = {r[0] for r in con.execute("SELECT powertrain FROM mart_powertrain_kpis").fetchall()}
    assert pts == {"BEV", "PHEV", "HEV", "ICE"}
    # Physics sanity: electric is cheapest per km on energy and lowest CO2; combustion highest.
    e = dict(con.execute("SELECT powertrain, energy_cost_per_km FROM mart_powertrain_kpis").fetchall())
    c = dict(con.execute("SELECT powertrain, co2_g_per_km FROM mart_powertrain_kpis").fetchall())
    assert e["BEV"] < e["HEV"] < e["ICE"]
    assert c["BEV"] < c["HEV"] < c["ICE"]


def test_demo_detects_riyadh_north_crisis_and_recovery(demo_build):
    con = _db(demo_build)
    crisis, after = con.execute("""
        SELECT count(*) FILTER (WHERE status = 'INTERVENE' AND wk BETWEEN DATE '2026-03-01' AND DATE '2026-06-30'),
               count(*) FILTER (WHERE status = 'INTERVENE' AND wk >= DATE '2026-08-01')
        FROM mart_site_weekly WHERE site_name = 'Riyadh North'""").fetchone()
    assert crisis >= 10 and after == 0


def test_demo_detects_istanbul_turnaround(demo_build):
    con = _db(demo_build)
    before, after = con.execute("""
        SELECT avg(p50_turnaround_h) FILTER (WHERE wk < DATE '2025-10-01' AND status <> 'LOW VOLUME'),
               avg(p50_turnaround_h) FILTER (WHERE wk >= DATE '2025-11-01')
        FROM mart_site_weekly WHERE site_name = 'Istanbul Asia (Tuzla)'""").fetchone()
    assert after <= 0.7 * before


def test_demo_gamification_is_complete(demo_build):
    con = _db(demo_build)
    lb = con.execute("SELECT * FROM mart_leaderboard").df()
    assert len(lb) == 15
    assert lb.ops_score.between(0, 1000).all()
    assert lb.tier.notna().all()
    assert lb["rank"].min() == 1


def test_demo_sql_tests_all_pass(demo_build):
    assert demo_build.tests and all(t["status"] == "pass" for t in demo_build.tests), \
        [t for t in demo_build.tests if t["status"] != "pass"]


def test_demo_new_kpis(demo_build):
    con = _db(demo_build)
    sc = con.execute("SELECT * FROM mart_exec_scorecard").df()
    for col in ["csat_pct", "low_rating_pct", "key_to_key_p50_h", "productivity_pct", "backlog_days",
                "registration_valid_pct", "insurance_valid_pct"]:
        assert sc[col].notna().all(), col
    assert sc.csat_pct.between(50, 100).all() and sc.low_rating_pct.between(0, 25).all()
    # every star rating present; registration and insurance statuses all represented
    assert {r[0] for r in con.execute("SELECT DISTINCT rating FROM mart_rating_distribution").fetchall()} == {1, 2, 3, 4, 5}
    st = {(d, s) for d, s in con.execute("SELECT DISTINCT document, status FROM mart_compliance_status").fetchall()}
    assert {("Registration", "Expired"), ("Insurance", "Expiring"), ("Insurance", "Valid")} <= st
    # depreciation: value retained falls as the fleet ages, never below the residual floor
    vr = con.execute("SELECT min(value_retained_pct), max(value_retained_pct) FROM mart_asset_value_monthly").fetchall()[0]
    assert 20 <= vr[0] < vr[1] <= 100
    # the Riyadh North crisis shows up in satisfaction too
    ksa = dict(con.execute("""SELECT month_start::VARCHAR, low_rating_pct FROM mart_customer_monthly
                              WHERE region = 'KSA'""").fetchall())
    assert ksa["2026-06-01"] > ksa["2026-09-01"]


def test_demo_service_quality_kpis(demo_build):
    con = _db(demo_build)
    sc = con.execute("SELECT * FROM mart_exec_scorecard").df()
    for col in ["repeat_repair_pct", "repeat_visit_pct", "time_to_pickup_p50_h", "back_to_ops_p50_h",
                "parts_on_time_pct", "fines_per_100_vehicles", "goodwill_pct"]:
        assert sc[col].notna().all(), col
    assert sc.repeat_repair_pct.between(0, 25).all() and sc.parts_on_time_pct.between(40, 100).all()
    # every category and fine type the demo plants is recognised (nothing falls into 'Other')
    cats = {r[0] for r in con.execute("SELECT DISTINCT issue_category FROM mart_issue_categories").fetchall()}
    assert {"Brakes", "HV battery", "Charging system", "Engine & transmission", "Body & glass"} <= cats
    types = {r[0] for r in con.execute("SELECT DISTINCT fine_type FROM stg_fines").fetchall()}
    assert "Other" not in types and "Expired registration" in types
    # the Riyadh North crisis breaks supplier promises: KSA parts on-time collapses, then recovers
    ksa = dict(con.execute("""SELECT month_start::VARCHAR, parts_on_time_pct FROM mart_region_month_kpis
                              WHERE region = 'KSA'""").fetchall())
    assert ksa["2026-05-01"] < 50 < ksa["2026-09-01"]
    # combustion vehicles cost the most to service per km; electric the least
    spend = dict(con.execute("SELECT powertrain, avg(spend_per_1000_km) FROM mart_vehicle_service_spend GROUP BY 1").fetchall())
    assert spend["BEV"] < spend["ICE"]


def test_runner_orders_models_and_enforces_layers():
    from fleetkpi import sqlrunner
    plan = sqlrunner.plan()
    pos = {m.name: i for i, m in enumerate(plan)}
    for m in plan:
        assert all(pos[d] < pos[m.name] for d in m.deps), m.name
    assert {m.layer for m in plan} == {"staging", "intermediate", "marts"}
    assert len(sqlrunner.discover("tests")) >= 20 and len(sqlrunner.discover("validation")) >= 30


def test_demo_pm_compliance_by_powertrain_interval(demo_build):
    con = _db(demo_build)
    rows = con.execute("SELECT DISTINCT powertrain, interval_km FROM int_pm_status ORDER BY 1").fetchall()
    assert dict(rows) == {"BEV": 25000, "HEV": 15000, "ICE": 10000, "PHEV": 15000}


# ------------------------------------------------- a customer's own export format
def _write_foreign_fleet(root: Path) -> Path:
    """A small fleet exported by some other system: own column names, Excel, dd/mm dates, free-text codes."""
    inp = root / "data" / "input"
    inp.mkdir(parents=True)
    pd.DataFrame({
        "Branch Code": ["B1", "B2"], "Branch": ["North Depot", "South Depot"], "Country": ["Egypt", "Egypt"],
        "Mechanics": [4, 3],
    }).to_excel(inp / "sites.xlsx", index=False)
    plates = [f"CAI-{i:03d}" for i in range(1, 9)]
    pd.DataFrame({
        "Plate No": plates,
        "Engine": ["Electric", "Electric", "Plug-in Hybrid", "Hybrid", "Petrol", "Diesel", "petrol", "EV"],
        "Base": ["B1", "B1", "B2", "B2", "B1", "B2", "B1", "B2"],
        "Commission Date": ["01/01/2025"] * 8,
        "Price": ["40,000", "40,000", "36,000", "30,000", "25,000", "28,000", "25,000", "41,000"],
    }).to_excel(inp / "vehicles.xlsx", index=False)
    months = pd.date_range("2025-01-01", "2025-06-01", freq="MS")
    pd.DataFrame([{"Plate No": p, "Month": m.strftime("%d/%m/%Y"), "Mileage": 3000, "Engine Hours": 200}
                  for p in plates for m in months]).to_csv(inp / "usage.csv", index=False)
    jobs = []
    for i, p in enumerate(plates):
        for k, m in enumerate(months):
            jobs.append({"Job Number": f"J{i}{k}", "Plate No": p, "Workshop ID": "B1" if i % 2 == 0 else "B2",
                         "Service Type": ["Oil service", "Breakdown", "Accident repair", "Tyre change", "Routine service", "Warranty claim"][k],
                         "Date In": (m + pd.Timedelta(days=3)).strftime("%d/%m/%Y 09:00"),
                         "Date Out": (m + pd.Timedelta(days=4)).strftime("%d/%m/%Y 15:00"),
                         "Invoice Total": "1,250.00" if k == 2 else "180"})
    pd.DataFrame(jobs).to_csv(inp / "work_orders.csv", index=False)
    (root / "fleet.yml").write_text(
        "fleet: {name: 'Cairo pilot', currency: EGP}\n"
        "mapping:\n"
        "  vehicles: {powertrain: Engine, home_site_id: Base, in_service_date: 'Commission Date'}\n"
        "  sites: {site_id: 'Branch Code', site_name: Branch}\n"
        "  usage: {date: Month, operating_hours: 'Engine Hours'}\n"
        "  work_orders: {site_id: 'Workshop ID', job_type: 'Service Type', opened_at: 'Date In', closed_at: 'Date Out', total_cost: 'Invoice Total'}\n")
    return root / "fleet.yml"


def test_foreign_format_fleet_plugs_in(tmp_path):
    result = build.run(config.load(_write_foreign_fleet(tmp_path)))
    assert result.ok, build.summary(result)
    assert not [i for i in result.issues if i.severity == "error"]
    con = _db(result)
    # powertrain words normalised
    pts = dict(con.execute("SELECT powertrain, count(*) FROM vehicles GROUP BY 1").fetchall())
    assert pts == {"BEV": 3, "PHEV": 1, "HEV": 1, "ICE": 3}
    assert con.execute("SELECT fuel_type FROM vehicles WHERE vehicle_id = 'CAI-006'").fetchone()[0] == "diesel"
    # job types normalised from free text
    jt = {r[0] for r in con.execute("SELECT DISTINCT job_type FROM work_orders").fetchall()}
    assert jt == {"Preventive maintenance", "Repair", "Collision", "Tyres", "Warranty"}
    # dd/mm dates and "1,250.00" parsed
    assert con.execute("SELECT max(total_cost) FROM work_orders").fetchone()[0] == 1250.0
    assert con.execute("SELECT min(in_service_date) FROM vehicles").fetchone()[0].isoformat() == "2025-01-01"
    # optional tables absent -> views exist and are empty, scorecard still produced
    assert con.execute("SELECT count(*) FROM mart_recall_completion").fetchone()[0] == 0
    assert con.execute("SELECT count(*) FROM mart_exec_scorecard").fetchone()[0] == 1
    assert con.execute("SELECT value FROM cfg_settings WHERE key = 'currency'").fetchone()[0] == "EGP"


# ------------------------------------------------------------------ bad data
def test_synonyms_auto_map_without_config(tmp_path):
    """'Base' is a known synonym for home_site_id: no mapping entry needed."""
    cfg_path = _write_foreign_fleet(tmp_path)
    cfg_path.write_text(cfg_path.read_text().replace("home_site_id: Base, ", ""))
    result = build.run(config.load(cfg_path))
    assert result.ok
    vehicles = next(ld for ld in result.loads if ld.table == "vehicles")
    assert vehicles.mapped["home_site_id"] == "Base"


def test_validation_blocks_bad_data(tmp_path):
    cfg_path = _write_foreign_fleet(tmp_path)
    inp = tmp_path / "data" / "input"
    wo = pd.read_csv(inp / "work_orders.csv", dtype=str)
    wo.loc[0, "Plate No"] = "GHOST-1"                          # unknown vehicle
    wo.loc[1, "Date Out"] = "01/01/2024 09:00"                 # closed before opened
    wo = pd.concat([wo, wo.iloc[[2]]])                          # duplicate job number
    wo.to_csv(inp / "work_orders.csv", index=False)
    result = build.run(config.load(cfg_path))
    assert not result.ok
    checks = {i.check for i in result.issues if i.severity == "error"}
    assert "Work order for a vehicle not in vehicles" in checks
    assert "Closed before it was opened" in checks
    assert "Duplicate work_order_id" in checks
    assert next(s for s in result.stages if s.stage == "Validate").status == "blocked"


def test_missing_required_column_is_explained(tmp_path):
    cfg_path = _write_foreign_fleet(tmp_path)
    # A column name nothing could guess, and no mapping for it
    veh = tmp_path / "data" / "input" / "vehicles.xlsx"
    pd.read_excel(veh, dtype=str).rename(columns={"Base": "Ref 7"}).to_excel(veh, index=False)
    cfg_path.write_text(cfg_path.read_text().replace("home_site_id: Base, ", ""))
    result = build.run(config.load(cfg_path), validate_only=True)
    msgs = [i.check for i in result.issues if i.severity == "error"]
    assert any("Required column 'home_site_id' not found" in m for m in msgs)


def test_init_creates_templates_and_contract(tmp_path):
    from fleetkpi.cli import main
    assert main(["init", str(tmp_path)]) == 0
    assert (tmp_path / "fleet.yml").exists()
    assert (tmp_path / "DATA_CONTRACT.md").read_text().startswith("# fleetkpi data contract")
    assert len(list((tmp_path / "templates").glob("*.csv"))) == 12


def test_web_export_manifest(tmp_path):
    """The browser engine runs exactly the package's SQL: same models in the same order, same rules and tests."""
    import json

    from fleetkpi import sqlrunner, webexport

    info = webexport.export(tmp_path)
    m = json.loads((tmp_path / "engine" / "manifest.json").read_text())
    assert [x["name"] for x in m["models"]] == [x.name for x in sqlrunner.plan()]
    assert info["models"] == len(m["models"]) and info["tests"] == len(m["tests"]) >= 22
    assert {t["name"] for t in m["tables"]} == {p.stem for p in (tmp_path / "demo").glob("*.parquet")}
    # settings carry the snapshot placeholders the browser fills in
    assert any("{{snapshot_ts}}" in s for s in m["settings_sql"])
    # every contract column has a mapped and an empty expression
    assert all(c["expr"] and c["empty_expr"] for t in m["tables"] for c in t["columns"])
    names = {x["name"] for x in m["models"]}
    assert {"mart_metric_panel", "mart_job_outcomes"} <= names


def test_demo_fleet_register_and_documents(demo_build):
    """Documents match by plate, VIN or id; renewed cards move the expiry; every vehicle has one register row."""
    con = duckdb.connect(str(demo_build.database), read_only=True)
    matched = dict(con.execute("SELECT matched_by, count(*) FROM stg_documents GROUP BY 1").fetchall())
    assert {"plate", "vin", "vehicle_id"} <= set(matched) and None not in matched
    renewed = con.execute("""SELECT count(*) FROM stg_documents d JOIN vehicles v USING (vehicle_id)
                             WHERE d.doc_type = 'Registration' AND d.expiry_date > v.registration_expiry""").fetchone()[0]
    assert renewed > 0                                           # cards newer than the vehicle file exist ...
    assert con.execute("""SELECT count(*) FROM stg_documents d JOIN stg_vehicles v USING (vehicle_id)
                          WHERE d.doc_type = 'Registration' AND d.expiry_date > v.registration_expiry""").fetchone()[0] == 0
    reg = con.execute("SELECT count(*), count(DISTINCT vehicle_id), count(*) FILTER (WHERE model_year IS NOT NULL) FROM mart_fleet_registry").fetchone()
    assert reg[0] == reg[1] == 6500 and reg[2] == 6500
    assert con.execute("SELECT count(*) FROM mart_fleet_registry WHERE next_action LIKE 'Ground%'").fetchone()[0] > 0


def test_vin_macros():
    con = duckdb.connect()
    con.execute((Path(__file__).parent.parent / "fleetkpi" / "sql" / "macros" / "01_vin.sql").read_text())
    q = lambda v: con.execute("SELECT vin_status(?), vin_model_year(?, DATE '2026-11-17')", [v, v]).fetchone()
    assert q("1M8GDM9AXKP042788") == ("Valid", 2019)              # check digit X
    assert q("1HGCM82633A004352") == ("Valid", 2003)
    assert q("1M8GDM9A1KP042788")[0] == "Check digit mismatch"
    assert q("WVWZZZ1KZ6W61234O")[0] == "Invalid format"          # letter O is never used
    assert q(None)[0] == "Missing"
    assert con.execute("SELECT make FROM ref_wmi WHERE wmi = '5YJ'").fetchone()[0] == "Tesla"


def test_vehicle_list_with_plate_and_vin_maps_both(tmp_path):
    """A register with Plate and VIN columns but no id: the plate becomes the id and both identifiers are kept."""
    from fleetkpi.contract import TABLES
    from fleetkpi.ingest import load_table
    pd.DataFrame({"Plate": ["D 48213", "K 11"], "VIN": ["1HGCM82633A004352", "1M8GDM9AXKP042788"], "Fuel": ["Electric", "Petrol"],
                  "Depot": ["WS01", "WS01"], "In Service": ["01/02/2025", "15/03/2025"], "Trim": ["Long Range", "Base"]}
                 ).to_csv(tmp_path / "vehicles.csv", index=False)
    cfg_text = "fleet:\n  name: T\ndata:\n  input_dir: .\n"
    (tmp_path / "fleet.yml").write_text(cfg_text)
    con = duckdb.connect()
    res = load_table(con, config.load(tmp_path / "fleet.yml"), TABLES["vehicles"])
    assert res.mapped["vehicle_id"] == "Plate" and res.mapped["plate_number"] == "Plate" and res.mapped["vin"] == "VIN"
    assert res.mapped["trim"] == "Trim"
    assert con.execute("SELECT vehicle_id, vin, powertrain FROM vehicles ORDER BY 1").fetchall()[0] == ("D 48213", "1HGCM82633A004352", "BEV")
