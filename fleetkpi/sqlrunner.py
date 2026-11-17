"""A small dbt-style SQL runner.

Project layout (fleetkpi/sql/):
    macros/        *.sql   executed first, in file order (DuckDB macros)
    validation/    *.sql   raw-data checks: SELECT returns offending ids  (0 rows = pass)
    models/staging|intermediate|marts/*.sql
                           one model per file: a SELECT; the file name is the model name
    tests/         *.sql   data tests on models: SELECT returns failing rows (0 rows = pass)

Every file starts with a header of `-- key: value` lines, e.g.
    -- description: Vehicles with age, book value and document status
    -- materialized: table            (default: view)
    -- severity: error                (validation / tests; default: error)
    -- table: work_orders             (validation: which input table it checks)

Dependencies are discovered from the SQL itself (any known model or source name used as an
identifier), and models run in topological order, so adding a model is just adding a file.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path

import duckdb

LAYERS = ("staging", "intermediate", "marts")
HEADER = re.compile(r"^--\s*([a-z_]+):\s*(.+?)\s*$")


@dataclass
class SqlFile:
    name: str
    path: Path
    layer: str
    meta: dict[str, str]
    body: str
    deps: list[str] = field(default_factory=list)


def _parse(path: Path, layer: str) -> SqlFile:
    meta, body_lines, in_header = {}, [], True
    for line in path.read_text().splitlines():
        m = HEADER.match(line) if in_header else None
        if m:
            meta[m.group(1)] = m.group(2)
            continue
        if in_header and not line.strip():
            continue
        in_header = False
        body_lines.append(line)
    body = "\n".join(body_lines).strip().rstrip(";").strip()
    return SqlFile(path.stem, path, layer, meta, body)


def _root() -> Path:
    return Path(str(resources.files("fleetkpi").joinpath("sql")))


def discover(kind: str) -> list[SqlFile]:
    root = _root()
    if kind == "models":
        files = [_parse(p, layer) for layer in LAYERS for p in sorted((root / "models" / layer).glob("*.sql"))]
    else:
        files = [_parse(p, kind) for p in sorted((root / kind).glob("*.sql"))]
    return files


def _strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


def _relations(sql: str) -> set[str]:
    """Relation names a query reads: identifiers that follow FROM or JOIN (column aliases never count)."""
    return set(re.findall(r"\b(?:from|join)\s+([a-z_][a-z0-9_]*)", _strip_comments(sql).lower()))


def resolve_order(models: list[SqlFile]) -> list[SqlFile]:
    names = {m.name for m in models}
    for m in models:
        m.deps = sorted((_relations(m.body) & names) - {m.name})
    ordered, done, visiting = [], set(), set()
    by_name = {m.name: m for m in models}

    def visit(n: str) -> None:
        if n in done:
            return
        if n in visiting:
            raise ValueError(f"circular dependency at model '{n}'")
        visiting.add(n)
        for d in by_name[n].deps:
            visit(d)
        visiting.discard(n)
        done.add(n)
        ordered.append(by_name[n])

    for m in models:
        visit(m.name)
    return ordered


def source_deps(sql: SqlFile, sources: list[str]) -> list[str]:
    return sorted(_relations(sql.body) & set(sources))


def run_macros(con: duckdb.DuckDBPyConnection) -> int:
    files = discover("macros")
    for f in files:
        con.execute(f.path.read_text())
    return len(files)


def run_validation(con: duckdb.DuckDBPyConnection, loaded: set[str]) -> list[dict]:
    """Raw-data checks written in SQL. Skipped when the table they check was not supplied."""
    out = []
    for f in discover("validation"):
        table = f.meta.get("table", "")
        needs = [t.strip() for t in f.meta.get("needs", table).split(",") if t.strip()]
        if any(t not in loaded for t in needs):
            continue
        rows = con.execute(f.body).fetchall()
        if rows:
            out.append({"severity": f.meta.get("severity", "error"), "table": table,
                        "check": f.meta.get("description", f.name), "count": len(rows),
                        "example": ", ".join(str(r[0]) for r in rows[:3]), "rule": f.name})
    return out


def plan() -> list[SqlFile]:
    """All models in dependency order; a model may only depend on its own or an earlier layer."""
    models = resolve_order(discover("models"))
    rank = {layer: i for i, layer in enumerate(LAYERS)}
    by_name = {m.name: m for m in models}
    for m in models:
        for d in m.deps:
            if rank[by_name[d].layer] > rank[m.layer]:
                raise ValueError(f"{m.layer} model '{m.name}' depends on {by_name[d].layer} model '{d}'")
    return models


def run_models(con: duckdb.DuckDBPyConnection, sources: list[str], layer: str | None = None,
               models: list[SqlFile] | None = None) -> list[dict]:
    models = models if models is not None else plan()
    log = []
    for m in models:
        if layer and m.layer != layer:
            continue
        kind = "TABLE" if m.meta.get("materialized", "view") == "table" else "VIEW"
        t0 = time.time()
        try:
            con.execute(f"CREATE OR REPLACE {kind} {m.name} AS\n{m.body}")
        except duckdb.Error as exc:
            raise duckdb.Error(f"model {m.name} ({m.layer}/{m.path.name}): {str(exc).splitlines()[0]}") from exc
        rows = con.execute(f"SELECT count(*) FROM {m.name}").fetchall()[0][0]
        log.append({"model": m.name, "layer": m.layer, "materialized": kind.lower(),
                    "description": m.meta.get("description", ""), "rows": rows,
                    "seconds": round(time.time() - t0, 4), "deps": m.deps,
                    "sources": source_deps(m, sources)})
    return log


def run_tests(con: duckdb.DuckDBPyConnection) -> list[dict]:
    out = []
    for t in discover("tests"):
        t0 = time.time()
        try:
            failing = con.execute(f"SELECT count(*) FROM ({t.body})").fetchall()[0][0]
            status = "pass" if failing == 0 else ("fail" if t.meta.get("severity", "error") == "error" else "warn")
        except duckdb.Error as exc:
            failing, status = -1, f"error: {str(exc).splitlines()[0]}"
        out.append({"test": t.name, "severity": t.meta.get("severity", "error"),
                    "description": t.meta.get("description", ""), "failing_rows": failing,
                    "status": status, "seconds": round(time.time() - t0, 4)})
    return out


def catalog_markdown() -> str:
    """Every SQL file in the project, described from its own header: the single source for docs/SQL_CATALOG.md."""
    from .contract import LOAD_ORDER
    models = plan()
    used_by: dict[str, list[str]] = {}
    for m in models:
        for d in m.deps:
            used_by.setdefault(d, []).append(m.name)
    out = ["# SQL catalog", "",
           "Generated by `fleetkpi docs` from each file's `-- description:` header. Do not edit by hand.", "",
           f"**{len(models)} models** in three layers, **{len(discover('validation'))} validation rules**, "
           f"**{len(discover('tests'))} data tests**. Models run in dependency order, discovered from their FROM / JOIN clauses.", ""]
    for layer in LAYERS:
        ms = [m for m in models if m.layer == layer]
        out += [f"## {layer.title()} · {len(ms)} models", "",
                "| Model | Stored as | What it is | Reads from | Used by |", "|---|---|---|---|---|"]
        for m in sorted(ms, key=lambda x: x.name):
            reads = ", ".join(f"`{d}`" for d in (m.deps + source_deps(m, LOAD_ORDER))) or "–"
            used = ", ".join(f"`{u}`" for u in sorted(used_by.get(m.name, []))) or "dashboard"
            out.append(f"| `{m.name}` | {m.meta.get('materialized', 'view')} | {m.meta.get('description', '')} | {reads} | {used} |")
        out.append("")
    out += ["## Validation rules (raw data, before modelling)", "",
            "| Rule | Table | Severity | Checks |", "|---|---|---|---|"]
    out += [f"| `{f.name}` | {f.meta.get('table', '')} | {f.meta.get('severity', 'error')} | {f.meta.get('description', '')} |"
            for f in discover("validation")]
    out += ["", "## Data tests (models, after modelling)", "", "| Test | Severity | Asserts |", "|---|---|---|"]
    out += [f"| `{f.name}` | {f.meta.get('severity', 'error')} | {f.meta.get('description', '')} |" for f in discover("tests")]
    return "\n".join(out) + "\n"
