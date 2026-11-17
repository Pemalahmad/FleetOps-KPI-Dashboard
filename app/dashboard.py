"""Fleet & Service Operations dashboard. Every number comes from a SQL view in sql/models/.

Run:  streamlit run app/dashboard.py
"""
from pathlib import Path

import duckdb
import pandas as pd
import plotly.express as px
import streamlit as st

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "fleet.duckdb"

st.set_page_config(page_title="Fleet & Service Ops KPIs", page_icon="🚙", layout="wide")

RAG_COLORS = {"green": "#1f9d55", "amber": "#d69e2e", "red": "#e53e3e", "n/a": "#a0aec0"}
STATUS_COLORS = {"OK": "#1f9d55", "WATCH": "#d69e2e", "INTERVENE": "#e53e3e", "LOW VOLUME": "#a0aec0"}


@st.cache_resource
def connection() -> duckdb.DuckDBPyConnection:
    if not DB_PATH.exists():
        st.error("Warehouse not built yet. Run `python scripts/build.py` first.")
        st.stop()
    return duckdb.connect(str(DB_PATH), read_only=True)


@st.cache_data
def q(sql: str) -> pd.DataFrame:
    return connection().execute(sql).df()


# --------------------------------------------------------------------- header
st.title("Sahra Mobility · Fleet & Service Operations")
st.caption(
    "Snapshot 1 Oct 2026 · 7 markets · 15 service centers · 6,500 EVs. "
    "**Synthetic data**: a fictional operator, generated in SQL; no real company data."
)

scorecard = q("SELECT * FROM exec_scorecard")
network = q("""
    SELECT sum(active_vehicles) AS fleet,
           sum(availability_pct * vehicle_days) / sum(vehicle_days) AS availability,
           sum(utilization_pct * vehicle_days) / sum(vehicle_days)  AS utilization
    FROM fleet_monthly WHERE month_start = (SELECT max(month_start) FROM fleet_monthly)
""").iloc[0]
cost_total = q("""
    SELECT 100.0 * (sum(fleet_cost_usd) / sum(budget_usd) - 1) AS var
    FROM cost_monthly WHERE month_start = (SELECT max(month_start) FROM cost_monthly)
""").iloc[0]["var"]
service_total = q("""
    SELECT median(turnaround_h) AS p50, 100 * (1 - avg(repeat_visit::INT)) AS ftf
    FROM service_jobs
    WHERE job_type <> 'Recall'
      AND closed_at >= TIMESTAMP '2026-09-01' AND closed_at < TIMESTAMP '2026-10-01'
""").iloc[0]

k = st.columns(6)
k[0].metric("Fleet in service", f"{int(network.fleet):,}")
k[1].metric("Availability", f"{network.availability:.2f}%")
k[2].metric("Utilization", f"{network.utilization:.1f}%")
k[3].metric("Turnaround (p50)", f"{service_total.p50:.1f} h")
k[4].metric("First-time fix", f"{service_total.ftf:.1f}%")
k[5].metric("Cost vs budget", f"{cost_total:+.1f}%")

tab_exec, tab_service, tab_fleet, tab_recall, tab_cost, tab_sql = st.tabs(
    ["Executive scorecard", "Service network", "Fleet", "Recalls", "Cost", "How it's built"]
)

# ------------------------------------------------------------ executive tab
with tab_exec:
    st.subheader("What needs attention")
    flags = []
    labels = {
        "availability_rag": ("availability", "availability_pct", "{:.2f}%"),
        "utilization_rag": ("utilization", "utilization_pct", "{:.1f}%"),
        "turnaround_rag": ("turnaround", "turnaround_p50_h", "{:.1f} h"),
        "first_time_fix_rag": ("first-time fix", "first_time_fix_pct", "{:.1f}%"),
        "cost_rag": ("cost vs budget", "cost_vs_budget_pct", "{:+.1f}%"),
        "recall_rag": ("recall completion", "recall_completion_pct", "{:.1f}%"),
    }
    for _, row in scorecard.iterrows():
        for rag_col, (label, val_col, fmt) in labels.items():
            if row[rag_col] == "red":
                flags.append(f"🔴 **{row.market}**: {label} at {fmt.format(row[val_col])}")
    for _, row in scorecard.iterrows():
        for rag_col, (label, val_col, fmt) in labels.items():
            if row[rag_col] == "amber":
                flags.append(f"🟠 **{row.market}**: {label} at {fmt.format(row[val_col])}")
    recent = q("""
        SELECT center, count(*) AS weeks FROM center_weekly
        WHERE status = 'INTERVENE' AND wk > (SELECT max(wk) FROM center_weekly) - INTERVAL 4 WEEK
        GROUP BY 1 ORDER BY 2 DESC
    """)
    for _, row in recent.iterrows():
        flags.append(f"🔧 **{row.center}**: INTERVENE in {row.weeks} of the last 4 weeks")
    st.markdown("\n".join(f"- {f}" for f in flags) if flags else "Nothing red or amber this month.")

    st.subheader(f"Market scorecard · {scorecard.month_start.iloc[0]:%B %Y}")
    show = scorecard[[
        "market", "active_vehicles",
        "availability_pct", "availability_rag", "utilization_pct", "utilization_rag",
        "turnaround_p50_h", "turnaround_rag", "first_time_fix_pct", "first_time_fix_rag",
        "cost_vs_budget_pct", "cost_rag", "recall_completion_pct", "recall_rag",
    ]]

    def color_rag(v):
        return f"background-color: {RAG_COLORS.get(v, '')}; color: white" if v in RAG_COLORS else ""

    st.dataframe(
        show.style.map(color_rag, subset=[c for c in show.columns if c.endswith("_rag")])
            .format({"availability_pct": "{:.2f}", "utilization_pct": "{:.1f}",
                     "turnaround_p50_h": "{:.1f}", "first_time_fix_pct": "{:.1f}",
                     "cost_vs_budget_pct": "{:+.1f}", "recall_completion_pct": "{:.1f}"}),
        hide_index=True, use_container_width=True,
    )
    st.caption("Targets live in one table (`kpi_targets` in sql/models/00_conventions.sql). "
               "Change a threshold there and every RAG status follows.")

# ---------------------------------------------------------- service network
with tab_service:
    st.subheader("Weekly median turnaround by center")
    st.caption("The heatmap a regional ops lead should open every Monday. Red rows are centers drifting from the network.")
    cw = q("SELECT center, market, wk, p50_turnaround_h, status FROM center_weekly ORDER BY market, center, wk")
    heat = cw.pivot(index="center", columns="wk", values="p50_turnaround_h")
    fig = px.imshow(heat, aspect="auto", color_continuous_scale="RdYlGn_r", zmin=10, zmax=60,
                    labels=dict(color="p50 hours", x="Week", y=""))
    fig.update_layout(height=520, margin=dict(l=0, r=0, t=10, b=0))
    st.plotly_chart(fig, use_container_width=True)

    c1, c2 = st.columns([1, 1])
    with c1:
        center = st.selectbox("Drill into a center", sorted(cw.center.unique()),
                              index=sorted(cw.center.unique()).index("Riyadh North"))
        one = q(f"""SELECT wk, p50_turnaround_h, network_p50_h, status FROM center_weekly
                   WHERE center = '{center.replace("'", "''")}' ORDER BY wk""")
        fig = px.line(one, x="wk", y=["p50_turnaround_h", "network_p50_h"],
                      labels={"value": "hours", "wk": "", "variable": ""},
                      color_discrete_map={"p50_turnaround_h": "#63b3ed", "network_p50_h": "#a0aec0"})
        fig.update_traces(selector=dict(name="network_p50_h"), line=dict(dash="dot"))
        intervene = one[one.status == "INTERVENE"]
        fig.add_scatter(x=intervene.wk, y=intervene.p50_turnaround_h, mode="markers",
                        marker=dict(color=STATUS_COLORS["INTERVENE"], size=9), name="INTERVENE")
        fig.update_layout(height=360, margin=dict(l=0, r=0, t=10, b=0), legend=dict(orientation="h"))
        st.plotly_chart(fig, use_container_width=True)
    with c2:
        st.markdown("**Center scorecard**: last 4 weeks vs the 13 before")
        st.dataframe(q("SELECT * EXCLUDE (center_id) FROM center_scorecard"),
                     hide_index=True, use_container_width=True, height=360)

    st.markdown("**Open backlog at snapshot** (anything older than 72h is customer-facing)")
    st.dataframe(q("SELECT * FROM backlog"), hide_index=True, use_container_width=True)

# --------------------------------------------------------------------- fleet
with tab_fleet:
    fm = q("SELECT * FROM fleet_monthly ORDER BY month_start")
    markets = st.multiselect("Markets", sorted(fm.market.unique()), default=["UAE", "KSA", "Türkiye"])
    sub = fm[fm.market.isin(markets)]
    c1, c2 = st.columns(2)
    c1.plotly_chart(px.line(sub, x="month_start", y="availability_pct", color="market",
                            title="Availability %", labels={"month_start": ""}), use_container_width=True)
    c2.plotly_chart(px.line(sub, x="month_start", y="utilization_pct", color="market",
                            title="Utilization % (GCC summer dip is demand, not supply)",
                            labels={"month_start": ""}), use_container_width=True)
    st.plotly_chart(px.area(fm, x="month_start", y="active_vehicles", color="market",
                            title="Fleet in service (KSA launch: Jul 2025)", labels={"month_start": ""}),
                    use_container_width=True)

# ------------------------------------------------------------------- recalls
with tab_recall:
    rc = q("SELECT * FROM recall_completion")
    st.dataframe(rc, hide_index=True, use_container_width=True)
    curve = q("SELECT * FROM recall_curve")
    for cid in curve.campaign_id.unique():
        st.plotly_chart(px.line(curve[curve.campaign_id == cid], x="week_no", y="cumulative_completion_pct",
                                color="market", title=f"{cid}: cumulative completion by week since launch",
                                labels={"week_no": "weeks since launch", "cumulative_completion_pct": "% complete"}),
                        use_container_width=True)

# ---------------------------------------------------------------------- cost
with tab_cost:
    cm = q("SELECT * FROM cost_monthly ORDER BY month_start")
    grid = cm.pivot(index="market", columns="month_start", values="cost_vs_budget_pct")
    fig = px.imshow(grid, aspect="auto", color_continuous_scale="RdYlGn_r", zmin=-25, zmax=25,
                    text_auto=".0f", labels=dict(color="% vs budget", x="", y=""),
                    title="Fleet-paid service cost vs budget, % by market and month")
    fig.update_layout(height=380, margin=dict(l=0, r=0, t=40, b=0))
    st.plotly_chart(fig, use_container_width=True)
    st.caption("Read across a row: KSA overspends through the Riyadh North crisis (Feb-Jun 2026), "
               "then lands on budget once the center recovers.")
    cm["cost_3m"] = (cm.sort_values("month_start").groupby("market")["fleet_cost_per_vehicle_month_usd"]
                       .transform(lambda s: s.rolling(3, min_periods=1).mean()))
    st.plotly_chart(px.line(cm, x="month_start", y="cost_3m", color="market",
                            title="Fleet cost per vehicle-month, USD (3-month rolling)",
                            labels={"month_start": "", "cost_3m": "USD"}),
                    use_container_width=True)

# ------------------------------------------------------------------ the SQL
with tab_sql:
    st.markdown(
        "Every number on this page is a SQL view. The pipeline: **seed** (synthetic data, generated in SQL) "
        "→ **models** (KPI views) → this app, which only reads them."
    )
    for f in sorted((Path(__file__).resolve().parent.parent / "sql").rglob("*.sql")):
        with st.expander(str(f.relative_to(f.parents[2]))):
            st.code(f.read_text(), language="sql")
