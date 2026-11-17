# `fleetkpi/app/`: the dashboard

| File | Role |
|---|---|
| `dashboard.py` | Entry point: page navigation (Operate / Govern) and the global region filter |
| `views.py` | One function per page section; every chart reads a `mart_*` model |
| `ui.py` | Design system: colour tokens, chart styling, tiles, gauges, donuts, cards, CSS |
| `theme.toml` | Streamlit light and dark themes; `fleetkpi serve` installs it |

Pages: **Overview, Customer, Workshop, Fleet & Assets, Compliance** (Operate) and **Doctrine, Pipeline, SOPs** (Govern).
