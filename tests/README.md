# `tests/`: Python test suite (`pytest`)

These test the package from the outside. The SQL data tests that run inside every build live in [`fleetkpi/sql/tests/`](../fleetkpi/sql/tests).

- **The demo, end to end:** eight stages green, the operating stories hold (Riyadh North crisis flagged then recovered, KSA parts on-time collapses in May, BEV service spend below ICE).
- **A foreign-format fleet:** Excel files, its own column names, `dd/mm` dates, monthly usage, no optional tables. It must plug in with mapping only.
- **Bad data:** blocked, with the right rule named.
- **The runner:** dependency order, layer rules, failing model named in the error.
