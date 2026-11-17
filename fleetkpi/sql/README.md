# `fleetkpi/sql/`: the warehouse, in plain SQL

Every number on the dashboard is produced here. Each file is one `SELECT` with a `-- description:` header; the full, generated list is in [`docs/SQL_CATALOG.md`](../../docs/SQL_CATALOG.md).

| Folder | Prefix | Holds | Runs |
|---|---|---|---|
| [`macros/`](macros) | – | Reusable SQL functions: `rag()`, `book_value()`, `doc_status()`, `cfg_num()`, price and CO₂ lookups | First, once |
| [`validation/`](validation) | `v01`…`v34` | Rules on **your raw files**. Each returns the offending ids; 0 rows = pass. Errors block the build | Stage 3 |
| [`models/staging/`](models/staging) | `stg_` | One clean, typed model per input table (the three clocks are computed here) | Stage 4 |
| [`models/intermediate/`](models/intermediate) | `int_` | Reusable building blocks: vehicle-months, visits and repeats, downtime, weekly site status | Stage 5 |
| [`models/marts/`](models/marts) | `mart_` | One model per dashboard chart or KPI | Stage 6 |
| [`tests/`](tests) | `t01`…`t20` | Assertions on **the models**: grain, ranges, reconciliations, the clock identity | Stage 7 |
| [`demo/`](demo) | – | Generates the fictional *Sahra Mobility* fleet as ordinary contract files | `fleetkpi demo` only |

**Naming rule:** a file's name is its table name. A model may read only from its own layer or the layers before it; the runner refuses anything else.
