"""Ingest: find the user's files, map their columns onto the contract, and normalise values.

Every input column is read as text first, then converted with TRY_CAST, so a bad cell
never crashes a load: it becomes NULL and is reported by validation instead.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import duckdb
import pandas as pd

from .config import Config
from .contract import LOAD_ORDER, TABLES, Table

EXTENSIONS = (".csv", ".tsv", ".txt", ".xlsx", ".xls", ".parquet", ".json")
DATE_FORMATS = ["%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%d-%m-%Y %H:%M", "%d-%m-%Y",
                "%Y/%m/%d %H:%M", "%Y/%m/%d", "%d.%m.%Y", "%b %Y", "%Y-%m"]


@dataclass
class TableLoad:
    table: str
    source: str | None = None
    rows: int = 0
    mapped: dict[str, str] = field(default_factory=dict)     # canonical -> source column
    missing_required: list[str] = field(default_factory=list)
    missing_optional: list[str] = field(default_factory=list)
    unused_source_columns: list[str] = field(default_factory=list)
    unparsed: dict[str, int] = field(default_factory=dict)    # canonical column -> cells that failed to convert


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _q(ident: str) -> str:
    return '"' + str(ident).replace('"', '""') + '"'


def _lit(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def find_file(cfg: Config, table: str) -> Path | None:
    explicit = (cfg["data"].get("files") or {}).get(table)
    if explicit:
        p = (cfg.input_dir / explicit) if not Path(explicit).is_absolute() else Path(explicit)
        return p if p.exists() else None
    if not cfg.input_dir.exists():
        return None
    for p in sorted(cfg.input_dir.iterdir()):
        if p.suffix.lower() in EXTENSIONS and _norm(p.stem) == table:
            return p
    return None


def _read_raw(con: duckdb.DuckDBPyConnection, path: Path, raw_name: str) -> None:
    ext = path.suffix.lower()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str)
        con.register("_xl", df)
        con.execute(f"CREATE OR REPLACE TEMP TABLE {raw_name} AS SELECT * FROM _xl")
        con.unregister("_xl")
    elif ext == ".parquet":
        con.execute(f"CREATE OR REPLACE TEMP TABLE {raw_name} AS "
                    f"SELECT COLUMNS(*)::VARCHAR FROM read_parquet({_lit(str(path))})")
    elif ext == ".json":
        con.execute(f"CREATE OR REPLACE TEMP TABLE {raw_name} AS "
                    f"SELECT COLUMNS(*)::VARCHAR FROM read_json_auto({_lit(str(path))})")
    else:
        con.execute(f"CREATE OR REPLACE TEMP TABLE {raw_name} AS SELECT * FROM "
                    f"read_csv({_lit(str(path))}, all_varchar=true, header=true, auto_detect=true)")


def _converter(col_type: str, expr: str) -> str:
    """SQL that turns trimmed text into the contract type, NULL when it cannot."""
    txt = f"nullif(trim({expr}), '')"
    fmts = "[" + ", ".join(_lit(f) for f in DATE_FORMATS) + "]"
    if col_type == "TIMESTAMP":
        return f"coalesce(try_cast({txt} AS TIMESTAMP), try_strptime({txt}, {fmts}))"
    if col_type == "DATE":
        return f"coalesce(try_cast({txt} AS DATE), try_strptime({txt}, {fmts})::DATE)"
    if col_type in ("DOUBLE", "INTEGER"):
        num = f"try_cast(regexp_replace({txt}, '[,\\s]', '', 'g') AS DOUBLE)"
        return num if col_type == "DOUBLE" else f"TRY_CAST(round({num}) AS INTEGER)"
    if col_type == "BOOLEAN":
        return (f"CASE WHEN lower({txt}) IN ('true','t','yes','y','1','x') THEN TRUE "
                f"WHEN lower({txt}) IN ('false','f','no','n','0') THEN FALSE END")
    return txt


# Value normalisation, applied after type conversion.
NORMALISE = {
    ("vehicles", "powertrain"): """CASE
        WHEN regexp_matches(lower({x}), 'plug|phev') THEN 'PHEV'
        WHEN regexp_matches(lower({x}), '^(bev|ev|electric|battery|e)$|battery.?electric|full.?electric|^electric') THEN 'BEV'
        WHEN regexp_matches(lower({x}), 'hybrid|hev|^h$') THEN 'HEV'
        WHEN regexp_matches(lower({x}), 'ice|petrol|gasoline|gas|diesel|combustion|benzin|^p$|^d$') THEN 'ICE'
        ELSE upper({x}) END""",
    ("vehicles", "fuel_type"): """CASE
        WHEN regexp_matches(lower({x}), 'diesel') THEN 'diesel'
        WHEN {x} IS NULL THEN NULL ELSE 'petrol' END""",
    ("work_orders", "job_type"): """CASE
        WHEN regexp_matches(lower({x}), 'recall|campaign') THEN 'Recall'
        WHEN regexp_matches(lower({x}), 'prevent|schedul|routine|service|pm\\b|^pm|oil|inspection|periodic') THEN 'Preventive maintenance'
        WHEN regexp_matches(lower({x}), 'warrant') THEN 'Warranty'
        WHEN regexp_matches(lower({x}), 'collision|accident|body|crash|damage') THEN 'Collision'
        WHEN regexp_matches(lower({x}), 'tyre|tire|wheel') THEN 'Tyres'
        WHEN regexp_matches(lower({x}), 'repair|breakdown|corrective|fault|mechanic|electric|battery') THEN 'Repair'
        WHEN {x} IS NULL THEN NULL ELSE 'Other' END""",
    ("work_orders", "paid_by"): """CASE
        WHEN regexp_matches(lower({x}), 'oem|warrant|manufacturer') THEN 'OEM'
        WHEN regexp_matches(lower({x}), 'insur') THEN 'Insurance'
        ELSE 'Fleet' END""",
    ("energy", "energy_type"): """CASE
        WHEN regexp_matches(lower({x}), 'elec|kwh|charg|ev') THEN 'electricity'
        WHEN {x} IS NULL THEN NULL ELSE 'fuel' END""",
    ("sites", "site_type"): "coalesce(lower({x}), 'workshop')",
    ("work_orders", "issue_category"): """CASE
        WHEN {x} IS NULL THEN NULL
        WHEN regexp_matches(lower({x}), 'hv|high.?voltage|battery pack|traction battery') THEN 'HV battery'
        WHEN regexp_matches(lower({x}), 'charg|port|inlet|obc') THEN 'Charging system'
        WHEN regexp_matches(lower({x}), 'brake|pad|disc|rotor') THEN 'Brakes'
        WHEN regexp_matches(lower({x}), 'tyre|tire|wheel|puncture|alignment') THEN 'Tyres & wheels'
        WHEN regexp_matches(lower({x}), 'suspens|shock|strut|steering|link') THEN 'Suspension & steering'
        WHEN regexp_matches(lower({x}), 'software|firmware|ota|infotainment|screen|sensor|camera|adas') THEN 'Software & sensors'
        WHEN regexp_matches(lower({x}), 'a/?c|air.?con|climate|hvac|cooling') THEN 'Climate & cooling'
        WHEN regexp_matches(lower({x}), 'engine|oil|exhaust|transmission|gearbox|clutch|fuel') THEN 'Engine & transmission'
        WHEN regexp_matches(lower({x}), 'electric|12v|wiring|light|lamp|fuse') THEN 'Electrical (12V)'
        WHEN regexp_matches(lower({x}), 'body|paint|panel|glass|windscreen|bumper|dent') THEN 'Body & glass'
        WHEN regexp_matches(lower({x}), 'service|inspection|maintenance|filter') THEN 'Scheduled service'
        ELSE 'Other' END""",
    ("work_orders", "goodwill_amount"): "coalesce({x}, 0)",
    ("fines", "fine_type"): """CASE
        WHEN {x} IS NULL THEN NULL
        WHEN regexp_matches(lower({x}), 'speed|radar') THEN 'Speeding'
        WHEN regexp_matches(lower({x}), 'park') THEN 'Parking'
        WHEN regexp_matches(lower({x}), 'toll|salik|darb|road.?user') THEN 'Toll'
        WHEN regexp_matches(lower({x}), 'red.?light|signal') THEN 'Red light'
        WHEN regexp_matches(lower({x}), 'regist|mulkiya|licen[cs]e plate|istimara') THEN 'Expired registration'
        WHEN regexp_matches(lower({x}), 'insur') THEN 'No insurance'
        WHEN regexp_matches(lower({x}), 'behaviou?r|driving|phone|seat.?belt|lane|overtak|tailgat|reckless') THEN 'Driving behaviour'
        ELSE 'Other' END""",
    ("fines", "status"): """CASE
        WHEN regexp_matches(lower(coalesce({x}, '')), 'dispute|appeal|objection') THEN 'Disputed'
        WHEN regexp_matches(lower(coalesce({x}, '')), '^paid|settled|closed') THEN 'Paid'
        ELSE 'Unpaid' END""",
    ("work_orders", "repeat_visit"): "coalesce({x}, FALSE)",
    # identifiers: upper case, no spaces or dashes inside a VIN; plates keep their spacing but are trimmed and upper-cased
    ("vehicles", "vin"): "nullif(regexp_replace(upper({x}), '[^A-Z0-9]', '', 'g'), '')",
    ("vehicles", "plate_number"): "nullif(upper(trim(regexp_replace({x}, '\\s+', ' ', 'g'))), '')",
    ("vehicles", "model_year"): "CASE WHEN {x} BETWEEN 1950 AND 2100 THEN {x} END",
    ("documents", "document_id"): "coalesce({x}, 'DOC-' || lpad((row_number() OVER ())::VARCHAR, 6, '0'))",
    ("trips", "trip_id"): "coalesce({x}, 'TR-' || lpad((row_number() OVER ())::VARCHAR, 7, '0'))",
    ("trips", "speeding_events"): "coalesce({x}, 0)",
    ("trips", "harsh_events"): "coalesce({x}, 0)",
    ("trips", "geofence_exits"): "coalesce({x}, 0)",
    ("drivers", "status"): "CASE WHEN regexp_matches(lower(coalesce({x}, 'active')), 'inactive|left|terminated|suspend') THEN 'Inactive' ELSE 'Active' END",
    ("documents", "doc_type"): """CASE
        WHEN regexp_matches(lower(coalesce({x}, '')), 'regist|mulkiya|istimara|logbook|v5|licen|title') THEN 'Registration'
        WHEN regexp_matches(lower(coalesce({x}, '')), 'insur|policy|cover') THEN 'Insurance'
        WHEN regexp_matches(lower(coalesce({x}, '')), 'inspect|mot\\b|fahes|tasjeel|roadworth|periodic') THEN 'Inspection'
        WHEN regexp_matches(lower(coalesce({x}, '')), 'permit|rta|ptc|operating|tga') THEN 'Permit'
        ELSE 'Other' END""",
}


def _value_map_sql(cfg: Config, table: str, column: str, expr: str) -> str:
    vm = (cfg.raw.get("value_maps") or {}).get(f"{table}.{column}")
    if not vm:
        return expr
    cases = " ".join(f"WHEN trim({expr}) = {_lit(k)} THEN {_lit(v)}" for k, v in vm.items())
    return f"CASE {cases} ELSE {expr} END"


def load_table(con: duckdb.DuckDBPyConnection, cfg: Config, t: Table) -> TableLoad:
    res = TableLoad(table=t.name)
    path = find_file(cfg, t.name)
    cols_sql = []
    if path is None:
        # Optional (or missing required) table: create it empty so every model still runs.
        for c in t.columns:
            cols_sql.append(f"CAST(NULL AS {c.type}) AS {c.name}")
        con.execute(f"CREATE OR REPLACE TABLE {t.name} AS SELECT {', '.join(cols_sql)} WHERE FALSE")
        res.missing_required = [c.name for c in t.columns if c.required] if t.required else []
        return res

    res.source = path.name
    raw = f"raw_{t.name}"
    _read_raw(con, path, raw)
    src_cols = [r[0] for r in con.execute(f"DESCRIBE {raw}").fetchall()]
    by_norm = {_norm(s): s for s in src_cols}
    user_map = (cfg.raw.get("mapping") or {}).get(t.name) or {}

    for c in t.columns:
        src = None
        if c.name in user_map:
            wanted = user_map[c.name]
            src = wanted if wanted in src_cols else by_norm.get(_norm(wanted))
        if src is None and c.name not in user_map:
            for candidate in (c.name, *c.synonyms):
                hit = by_norm.get(_norm(candidate))
                # one source column feeds one contract column, except identifiers (a plate or VIN that is also the id)
                if hit is not None and (c.shared or hit not in res.mapped.values()):
                    src = hit
                    break
        elif src is not None and src in res.mapped.values() and not c.shared:
            src = None  # never map one source column to two contract columns
        if src is None:
            (res.missing_required if c.required else res.missing_optional).append(c.name)
            expr = f"CAST(NULL AS {c.type})"
        else:
            res.mapped[c.name] = src
            text = _value_map_sql(cfg, t.name, c.name, f"{_q(src)}::VARCHAR")
            expr = _converter(c.type, text)
            failed = con.execute(
                f"SELECT count(*) FROM {raw} WHERE nullif(trim({_q(src)}::VARCHAR), '') IS NOT NULL "
                f"AND ({expr}) IS NULL").fetchall()[0][0]
            if failed:
                res.unparsed[c.name] = failed
        if (t.name, c.name) == ("vehicles", "fuel_type") and src is None and "powertrain" in res.mapped:
            # No fuel-type column: infer diesel from the powertrain text itself ("Diesel" -> ICE + diesel).
            expr = f"CASE WHEN regexp_matches(lower({_q(res.mapped['powertrain'])}::VARCHAR), 'diesel') THEN 'diesel' END"
        norm = NORMALISE.get((t.name, c.name))
        if norm:
            expr = norm.replace("{x}", f"({expr})")
        cols_sql.append(f"{expr} AS {c.name}")

    con.execute(f"CREATE OR REPLACE TABLE {t.name} AS SELECT {', '.join(cols_sql)} FROM {raw}")
    res.rows = con.execute(f"SELECT count(*) FROM {t.name}").fetchall()[0][0]
    res.unused_source_columns = [s for s in src_cols if s not in res.mapped.values()]
    return res


def ingest(con: duckdb.DuckDBPyConnection, cfg: Config) -> list[TableLoad]:
    loads = [load_table(con, cfg, TABLES[name]) for name in LOAD_ORDER]
    # Derived defaults that need more than one table.
    con.execute("""
        UPDATE vehicles SET region = s.region
        FROM sites s WHERE vehicles.region IS NULL AND s.site_id = vehicles.home_site_id""")
    con.execute("UPDATE vehicles SET fuel_type = 'petrol' WHERE fuel_type IS NULL AND powertrain IN ('ICE','HEV','PHEV')")
    con.execute("UPDATE work_orders SET paid_by = 'Fleet' WHERE paid_by IS NULL")
    return loads

