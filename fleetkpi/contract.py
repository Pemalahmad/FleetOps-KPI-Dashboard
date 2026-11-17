"""The data contract: the canonical tables fleetkpi understands.

Any fleet can be plugged in by supplying these tables (CSV, Excel or Parquet).
Column names do not have to match: common synonyms are recognised automatically,
and anything else is mapped once in fleet.yml under `mapping:`.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Column:
    name: str
    type: str                      # VARCHAR | DATE | TIMESTAMP | DOUBLE | INTEGER | BOOLEAN
    required: bool
    description: str
    synonyms: tuple[str, ...] = ()
    example: str = ""


@dataclass(frozen=True)
class Table:
    name: str
    required: bool
    description: str
    columns: tuple[Column, ...]
    key: tuple[str, ...] = field(default_factory=tuple)

    def column(self, name: str) -> Column:
        return next(c for c in self.columns if c.name == name)


C = Column

TABLES: dict[str, Table] = {t.name: t for t in [
    Table("sites", True, "Workshops, depots and outside vendors that hold or service vehicles.", (
        C("site_id", "VARCHAR", True, "Unique site code", ("site", "site_code", "workshop_id", "depot_id", "location_id", "branch_id"), "WS01"),
        C("site_name", "VARCHAR", True, "Readable name", ("name", "workshop", "workshop_name", "depot", "depot_name", "location", "branch"), "Dubai Al Quoz"),
        C("region", "VARCHAR", True, "Market, country or region used for roll-ups", ("market", "country", "area", "zone", "city"), "UAE"),
        C("site_type", "VARCHAR", False, "workshop | depot | vendor", ("type", "category"), "workshop"),
        C("technicians", "INTEGER", False, "Technician headcount (for productivity KPIs)", ("techs", "headcount", "mechanics"), "14"),
        C("open_date", "DATE", False, "Date the site started operating", ("opened", "start_date", "opening_date"), "2024-01-01"),
    ), key=("site_id",)),

    Table("vehicles", True, "One row per vehicle in the fleet: electric, hybrid or combustion.", (
        C("vehicle_id", "VARCHAR", True, "Unique vehicle id (plate, VIN or asset number)", ("vehicle", "plate", "plate_no", "plate_number", "registration", "reg_no", "vin", "asset_id", "unit_id"), "V0100001"),
        C("powertrain", "VARCHAR", True, "BEV | PHEV | HEV | ICE. Also accepts 'electric', 'plug-in hybrid', 'hybrid', 'petrol', 'diesel'...", ("fuel", "fuel_type_group", "drivetrain", "propulsion", "engine_type", "vehicle_type", "energy"), "BEV"),
        C("fuel_type", "VARCHAR", False, "petrol | diesel for ICE/HEV/PHEV (default petrol)", ("fuel_kind", "fuel_grade"), "petrol"),
        C("make", "VARCHAR", False, "Manufacturer", ("brand", "manufacturer", "oem"), "Sahra"),
        C("model", "VARCHAR", False, "Model name", ("model_name", "vehicle_model"), "S1 Sedan EV"),
        C("home_site_id", "VARCHAR", True, "Site the vehicle is based at / serviced by", ("site_id", "home_site", "depot_id", "base", "home_depot", "workshop_id"), "WS01"),
        C("region", "VARCHAR", False, "Defaults to the home site's region", ("market", "country"), "UAE"),
        C("in_service_date", "DATE", True, "Date the vehicle entered service", ("in_service", "start_date", "commission_date", "delivery_date", "registration_date", "acquired_date"), "2025-02-14"),
        C("out_of_service_date", "DATE", False, "Date it left the fleet (blank if active)", ("disposal_date", "end_date", "defleet_date", "sold_date"), ""),
        C("purchase_cost", "DOUBLE", False, "Acquisition cost, for depreciation in total cost of ownership", ("price", "cost", "acquisition_cost", "capex"), "42000"),
        C("use_case", "VARCHAR", False, "Ride-hail, delivery, pool car...", ("usage_type", "segment", "application"), "Ride-hail"),
        C("registration_expiry", "DATE", False, "Registration / licence (mulkiya, MOT, tax disc) expiry date", ("registration_expiry_date", "reg_expiry", "mulkiya_expiry", "licence_expiry", "license_expiry", "registration_valid_until"), "2027-02-13"),
        C("insurance_expiry", "DATE", False, "Insurance policy expiry date", ("insurance_expiry_date", "policy_expiry", "insurance_valid_until", "policy_end"), "2026-12-31"),
        C("insurer", "VARCHAR", False, "Insurance company", ("insurance_company", "insurance_provider", "policy_provider"), "Gulf Insurance"),
    ), key=("vehicle_id",)),

    Table("work_orders", True, "Every workshop visit: preventive maintenance, repairs, warranty, collisions, tyres, recalls.", (
        C("work_order_id", "VARCHAR", True, "Unique job / work-order number", ("job_id", "wo", "wo_number", "work_order", "ticket", "job_number", "ro_number"), "WO0000001"),
        C("vehicle_id", "VARCHAR", True, "Vehicle serviced", ("vehicle", "plate", "plate_no", "vin", "asset_id", "unit_id"), "V0100001"),
        C("site_id", "VARCHAR", True, "Site that did the work", ("site", "workshop_id", "workshop", "location_id", "vendor_id"), "WS01"),
        C("job_type", "VARCHAR", True, "Preventive maintenance | Repair | Warranty | Collision | Tyres | Recall | Other (free text is normalised)", ("type", "category", "service_type", "job_category", "reason"), "Repair"),
        C("opened_at", "TIMESTAMP", True, "When the vehicle went off the road / job opened", ("opened", "open_date", "start", "check_in", "date_in", "created_at"), "2026-03-04 09:00"),
        C("closed_at", "TIMESTAMP", False, "When the vehicle was released (blank if still open)", ("closed", "close_date", "end", "check_out", "date_out", "completed_at"), "2026-03-05 14:30"),
        C("labour_hours", "DOUBLE", False, "Billed labour hours", ("labour", "labor_hours", "labor"), "3.5"),
        C("parts_wait_hours", "DOUBLE", False, "Hours spent waiting for parts", ("parts_wait", "waiting_parts_hours"), "12"),
        C("total_cost", "DOUBLE", True, "Total job cost (labour + parts)", ("cost", "amount", "invoice_total", "total"), "480.50"),
        C("paid_by", "VARCHAR", False, "Fleet | OEM | Insurance (default Fleet)", ("payer", "billing", "charge_to"), "Fleet"),
        C("repeat_visit", "BOOLEAN", False, "TRUE if the vehicle came back for the same fault", ("repeat", "comeback", "rework"), "false"),
        C("campaign_id", "VARCHAR", False, "Recall campaign id for recall jobs", ("recall_id", "campaign"), ""),
        C("key_in_at", "TIMESTAMP", False, "Customer handed over the key (defaults to opened_at)", ("key_in", "key_drop", "key_received", "handover_in", "drop_off"), "2026-03-04 08:20"),
        C("key_out_at", "TIMESTAMP", False, "Key handed back to the customer (defaults to closed_at)", ("key_out", "key_return", "handover_out", "pick_up", "collected_at"), "2026-03-05 16:10"),
        C("ready_at", "TIMESTAMP", False, "Vehicle ready for pick-up (defaults to closed_at)", ("ready", "ready_for_pickup", "ready_time", "job_completed_at", "qc_passed_at"), "2026-03-05 14:30"),
        C("back_in_service_at", "TIMESTAMP", False, "Vehicle back in operations / first trip after the visit (defaults to key_out_at)", ("back_in_service", "back_to_operations", "returned_to_service", "first_trip_after", "redeployed_at"), "2026-03-05 19:00"),
        C("issue_category", "VARCHAR", False, "What was wrong: Brakes, Tyres, HV battery, Electrical, Body... (free text is normalised)", ("issue", "fault", "fault_category", "complaint", "system", "repair_category", "concern"), "Brakes"),
        C("goodwill_amount", "DOUBLE", False, "Amount waived or refunded as goodwill on this job", ("goodwill", "goodwill_value", "waiver", "concession", "courtesy_amount"), "0"),
    ), key=("work_order_id",)),

    Table("usage", True, "Distance and hours per vehicle, daily or monthly (both work).", (
        C("vehicle_id", "VARCHAR", True, "Vehicle", ("vehicle", "plate", "plate_no", "vin", "asset_id", "unit_id"), "V0100001"),
        C("date", "DATE", True, "Day or month of the reading", ("day", "month", "period", "reading_date", "trip_date"), "2026-03-01"),
        C("km", "DOUBLE", True, "Distance driven in the period (km)", ("distance", "distance_km", "kilometres", "kilometers", "mileage"), "6120"),
        C("operating_hours", "DOUBLE", False, "Hours in operation in the period (for utilisation)", ("hours", "engine_hours", "active_hours", "duty_hours"), "352"),
    )),

    Table("energy", False, "Fuel and charging: litres for fuel, kWh for electricity.", (
        C("vehicle_id", "VARCHAR", True, "Vehicle", ("vehicle", "plate", "plate_no", "vin", "asset_id", "unit_id"), "V0100001"),
        C("date", "DATE", True, "Day or month", ("day", "month", "transaction_date", "session_date"), "2026-03-01"),
        C("energy_type", "VARCHAR", True, "fuel | electricity", ("type", "product", "energy", "source"), "electricity"),
        C("quantity", "DOUBLE", True, "Litres (fuel) or kWh (electricity)", ("litres", "liters", "kwh", "volume", "amount_qty"), "1050"),
        C("cost", "DOUBLE", False, "Amount paid; computed from fleet.yml prices if blank", ("amount", "spend", "total"), "126.00"),
        C("duration_minutes", "DOUBLE", False, "Time spent fuelling or charging during shifts", ("minutes", "charge_minutes", "duration"), "95"),
    )),

    Table("recalls", False, "Recall / service campaigns.", (
        C("campaign_id", "VARCHAR", True, "Campaign id", ("recall_id", "campaign"), "RC-26-02"),
        C("title", "VARCHAR", True, "What the campaign fixes", ("description", "name"), "HV connector seal replacement"),
        C("launch_date", "DATE", True, "Campaign launch date", ("start_date", "issued"), "2026-04-15"),
    ), key=("campaign_id",)),

    Table("recall_vehicles", False, "Which vehicles each campaign affects.", (
        C("campaign_id", "VARCHAR", True, "Campaign id", ("recall_id", "campaign"), "RC-26-02"),
        C("vehicle_id", "VARCHAR", True, "Affected vehicle", ("vehicle", "plate", "vin"), "V0100002"),
    ), key=("campaign_id", "vehicle_id")),

    Table("feedback", False, "Customer satisfaction responses (1-5 stars), ideally linked to a work order.", (
        C("feedback_id", "VARCHAR", False, "Response id", ("response_id", "survey_id", "id"), "F0000001"),
        C("work_order_id", "VARCHAR", False, "Work order the rating is about", ("job_id", "wo", "wo_number", "job_number", "ro_number"), "WO0000001"),
        C("vehicle_id", "VARCHAR", False, "Vehicle (if not linked to a work order)", ("vehicle", "plate", "plate_no", "vin"), "V0100001"),
        C("site_id", "VARCHAR", False, "Site (if not linked to a work order)", ("site", "workshop_id", "branch_id"), "WS01"),
        C("date", "DATE", True, "Response date", ("response_date", "survey_date", "submitted_at", "created_at"), "2026-03-06"),
        C("rating", "INTEGER", True, "Stars, 1 (worst) to 5 (best)", ("stars", "score", "csat", "satisfaction"), "5"),
        C("channel", "VARCHAR", False, "SMS, app, call...", ("source", "medium"), "SMS"),
        C("comment", "VARCHAR", False, "Free-text comment", ("comments", "verbatim", "feedback", "remarks"), ""),
    ), key=("feedback_id",)),

    Table("parts_orders", False, "Parts ordered for a work order, with the promised ETA and actual arrival.", (
        C("part_order_id", "VARCHAR", True, "Parts order / line id", ("po", "po_number", "order_id", "parts_order", "order_line"), "PO0000001"),
        C("work_order_id", "VARCHAR", True, "Work order waiting for the part", ("job_id", "wo", "wo_number", "job_number", "ro_number"), "WO0000001"),
        C("part_description", "VARCHAR", False, "Part name or number", ("part", "part_number", "part_no", "description", "item"), "Front brake pads"),
        C("supplier", "VARCHAR", False, "Supplier or warehouse", ("vendor", "source", "warehouse", "distributor"), "OEM central warehouse"),
        C("ordered_at", "TIMESTAMP", True, "When the part was ordered", ("order_date", "ordered", "po_date", "requested_at"), "2026-03-04 10:00"),
        C("promised_eta", "TIMESTAMP", True, "ETA promised by the supplier", ("eta", "promised_date", "expected_arrival", "due_date"), "2026-03-06 12:00"),
        C("arrived_at", "TIMESTAMP", False, "Actual arrival (blank while still on order)", ("arrival_date", "received_at", "delivered_at", "grn_date"), "2026-03-06 09:30"),
    ), key=("part_order_id",)),

    Table("fines", False, "Traffic and regulatory fines registered against a vehicle.", (
        C("fine_id", "VARCHAR", True, "Fine / violation reference", ("violation_id", "ticket_no", "fine_number", "reference"), "FN0000001"),
        C("vehicle_id", "VARCHAR", True, "Vehicle fined", ("vehicle", "plate", "plate_no", "vin"), "V0100001"),
        C("date", "DATE", True, "Date of the offence", ("offence_date", "violation_date", "issued_date", "fine_date"), "2026-03-02"),
        C("fine_type", "VARCHAR", True, "Speeding, Parking, Toll, Red light, Expired registration... (free text is normalised)", ("type", "violation", "offence", "category", "reason"), "Speeding"),
        C("amount", "DOUBLE", True, "Fine amount", ("fine_amount", "value", "penalty"), "300"),
        C("status", "VARCHAR", False, "Paid | Unpaid | Disputed (default Unpaid)", ("payment_status", "state"), "Paid"),
        C("authority", "VARCHAR", False, "Issuing authority", ("issuer", "issued_by"), "Dubai Police"),
    ), key=("fine_id",)),

    Table("budgets", False, "Fleet-paid maintenance budget per region and month. If absent, fleet.yml rates are used.", (
        C("region", "VARCHAR", True, "Region", ("market", "country"), "UAE"),
        C("month", "DATE", True, "First day of the month", ("period", "date"), "2026-03-01"),
        C("budget", "DOUBLE", True, "Budget amount", ("amount", "budget_amount"), "302400"),
    ), key=("region", "month")),
]}

LOAD_ORDER = ["sites", "vehicles", "work_orders", "usage", "energy", "feedback", "parts_orders", "fines",
              "recalls", "recall_vehicles", "budgets"]


def contract_markdown() -> str:
    """The data contract as Markdown: shipped to users by `fleetkpi init` and `fleetkpi contract`."""
    out = ["# fleetkpi data contract", "",
           "Drop one file per table into your input folder, named after the table "
           "(`vehicles.csv`, `work_orders.xlsx`, `usage.parquet`...). Column names are matched "
           "case-insensitively and common synonyms are recognised; map anything else once in "
           "`fleet.yml` under `mapping:`.", ""]
    for name in LOAD_ORDER:
        t = TABLES[name]
        out += [f"## `{t.name}`{'' if t.required else ' (optional)'}", "", t.description, "",
                "| Column | Type | Required | Description | Also recognised as |",
                "|---|---|---|---|---|"]
        for c in t.columns:
            out.append(f"| `{c.name}` | {c.type} | {'yes' if c.required else ''} | {c.description} | "
                       f"{', '.join(c.synonyms[:5])} |")
        out.append("")
    return "\n".join(out)
