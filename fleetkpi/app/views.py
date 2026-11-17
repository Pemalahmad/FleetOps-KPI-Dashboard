"""Pages. Every number comes from a SQL view; this module only arranges and explains it."""
from __future__ import annotations

import json
import re

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
import yaml

from fleetkpi.app import ui
from fleetkpi.app.ui import q

KPI_DEFS = [
    # (column, rag column, label, fmt, target key)
    ("availability_pct", "availability_rag", "Availability", "{:.2f}%", "availability_pct"),
    ("utilization_pct", "utilization_rag", "Utilisation", "{:.1f}%", "utilization_pct"),
    ("turnaround_p50_h", "turnaround_rag", "Turnaround (median)", "{:.1f} h", "turnaround_p50_h"),
    ("first_time_fix_pct", "first_time_fix_rag", "First-time fix", "{:.1f}%", "first_time_fix_pct"),
    ("pm_compliance_pct", "pm_rag", "PM compliance", "{:.1f}%", "pm_compliance_pct"),
    ("cost_vs_budget_pct", "cost_rag", "Cost vs budget", "{:+.1f}%", "cost_vs_budget_pct"),
    ("recall_completion_pct", "recall_rag", "Recall completion", "{:.1f}%", "recall_completion_pct"),
]


def _fmt(fmt, v):
    return "–" if v is None or pd.isna(v) else fmt.format(v)


def _report_month():
    return pd.Timestamp(ui.setting("snapshot_ts")) - pd.Timedelta(days=1)


# ===================================================================== Command Center
def command_center():
    snap = pd.Timestamp(ui.setting("snapshot_ts"))
    ui.header("Command Center", ui.setting("fleet_name", "Fleet"),
              f"Report month <b>{_report_month():%B %Y}</b> · data to {snap - pd.Timedelta(days=1):%d %b %Y}")
    sc = q("SELECT * FROM exec_scorecard")
    if sc.empty:
        ui.empty("No scorecard yet. Check the Pipeline page.")
        return

    fleet = q("""SELECT sum(active_vehicles) n,
                        sum(availability_pct * vehicle_days) / sum(vehicle_days) a,
                        sum(utilization_pct * vehicle_days) / sum(vehicle_days) u
                 FROM fleet_monthly WHERE month_start = report_month()""").iloc[0]
    mix = q("SELECT powertrain, count(*) n FROM vehicle_months WHERE month_start = report_month() GROUP BY 1 ORDER BY 2 DESC")
    pt = q("SELECT * FROM powertrain_kpis")
    lb = q("SELECT * FROM leaderboard")
    mix_txt = " · ".join(f"{r.powertrain} {r.n:,}" for r in mix.itertuples())
    best_tco = pt.iloc[0] if not pt.empty else None
    cards = [
        ui.kpi_card("Fleet in service", f"{int(fleet.n):,}", mix_txt),
        ui.kpi_card("Availability", f"{fleet.a:.2f}%", "vehicle-hours on the road"),
        ui.kpi_card("Utilisation", "–" if pd.isna(fleet.u) else f"{fleet.u:.1f}%", "of planned operating hours"),
        ui.kpi_card("Lowest cost per km", "–" if best_tco is None else f"{ui.setting('currency')} {best_tco.tco_per_km:.3f}",
                    "" if best_tco is None else f"{ui.POWERTRAIN_NAMES.get(best_tco.powertrain, best_tco.powertrain)}, all-in"),
        ui.kpi_card("Top site", "–" if lb.empty else ui.esc(lb.iloc[0].site_name),
                    "" if lb.empty else f"Ops Score {lb.iloc[0].ops_score:,.0f} · {lb.iloc[0].tier}", small=True),
    ]
    ui.grid(cards, 5)

    # ---- missions: share of regions on target, per KPI (the corporate version of a quest log)
    st.markdown("#### Missions this month")
    st.caption("Each mission is a KPI target from fleet.yml. Progress = regions on target.")
    targets = q("SELECT * FROM cfg_targets")
    tgt = {r.kpi: r for r in targets.itertuples()}
    mcards = []
    for col, rag_col, label, fmt, key in KPI_DEFS:
        if rag_col not in sc or (sc[rag_col] == "n/a").all():
            continue
        valid = sc[sc[rag_col] != "n/a"]
        greens = int((valid[rag_col] == "green").sum())
        t = tgt.get(key)
        goal = f"target {'≥' if t.direction == 'higher' else '≤'} {fmt.format(t.green)}" if t else ""
        status = "green" if greens == len(valid) else ("red" if greens < len(valid) / 2 else "amber")
        mcards.append(ui.kpi_card(label, f"{greens}<span style='color:#A1A1AA;font-size:1rem'> / {len(valid)}</span>",
                                  f"regions on target · {goal}", status, greens / max(len(valid), 1)))
    ui.grid(mcards, min(len(mcards), 7))

    # ---- what needs attention, each item tied to the SOP that handles it
    st.markdown("#### What needs attention")
    items = []
    for r in sc.itertuples():
        for col, rag_col, label, fmt, key in KPI_DEFS:
            v = getattr(r, rag_col, "n/a")
            if v in ("red", "amber"):
                sop = {"cost_rag": "SOP-06", "pm_rag": "SOP-05", "recall_rag": "SOP-04"}.get(rag_col, "SOP-02")
                items.append((0 if v == "red" else 1, f'{ui.rag_pill(v)} <b>{ui.esc(r.region)}</b> · {label} '
                              f'<span class="fk-num">{_fmt(fmt, getattr(r, col))}</span> {ui.sop_link(sop)}'))
    flagged = q("""SELECT site_name, count(*) n FROM center_weekly
                   WHERE status = 'INTERVENE' AND wk > (SELECT max(wk) FROM center_weekly) - INTERVAL 4 WEEK
                   GROUP BY 1 ORDER BY 2 DESC""")
    for r in flagged.itertuples():
        items.insert(0, (-1, f'{ui.rag_pill("red", "INTERVENE")} <b>{ui.esc(r.site_name)}</b> · flagged in {r.n} of the '
                             f'last 4 weeks {ui.sop_link("SOP-03")}'))
    items.sort(key=lambda x: x[0])
    if items:
        st.html('<div class="fk-card">' + "".join(f'<div class="fk-row"><div>{t}</div></div>' for _, t in items[:12])
                + (f'<div class="fk-k-foot" style="padding-top:8px">+{len(items) - 12} more in the scorecard below</div>'
                   if len(items) > 12 else "") + "</div>")
    else:
        st.success("Every region is on target this month.")

    st.markdown("#### Region scorecard")
    show = sc[["region", "active_vehicles"] + [c for c, *_ in KPI_DEFS] + ["tco_per_km", "co2_g_per_km"]].copy()
    rag_cols = {c: rc for c, rc, *_ in KPI_DEFS}

    def color(col):
        rc = rag_cols.get(col.name)
        if rc is None:
            return [""] * len(col)
        return [f"color:{ui.STATUS.get(s, '')};font-weight:600" for s in sc[rc]]

    fmt_map = {"availability_pct": "{:.2f}", "utilization_pct": "{:.1f}", "turnaround_p50_h": "{:.1f}",
               "first_time_fix_pct": "{:.1f}", "pm_compliance_pct": "{:.1f}", "cost_vs_budget_pct": "{:+.1f}",
               "recall_completion_pct": "{:.1f}", "tco_per_km": "{:.3f}", "co2_g_per_km": "{:.0f}"}
    st.dataframe(show.style.apply(color).format(fmt_map, na_rep="–"),
                 hide_index=True, use_container_width=True,
                 column_config={"region": "Region", "active_vehicles": "Vehicles", "tco_per_km": "TCO / km",
                                "co2_g_per_km": "CO₂ g/km", **{c: l for c, _, l, _, _ in KPI_DEFS}})


# ======================================================================== Leaderboard
def leaderboard():
    ui.header("Leaderboard", "Service network league table",
              "Ops Score out of 1,000 from turnaround, first-time fix, same-day release and PM compliance "
              "over the last 4 complete weeks. Rank movement is vs the 4 weeks before.")
    lb = q("SELECT * FROM leaderboard")
    if lb.empty:
        ui.empty("Not enough completed work orders to score sites yet.")
        return

    # Podium
    podium = []
    for r in lb.head(3).itertuples():
        badges = "".join(f'<span class="fk-badge">{ui.esc(b)}</span>' for b in _badges(r.badges))
        podium.append(
            f'<div class="fk-card"><div style="display:flex;justify-content:space-between;align-items:flex-start">'
            f'<span class="fk-rank">#{r.rank}</span>{ui.tier_pill(r.tier)}</div>'
            f'<div style="font-weight:650;font-size:1.05rem;margin-top:2px">{ui.esc(r.site_name)}</div>'
            f'<div class="fk-k-foot">{ui.esc(r.region)} · {arrow_txt(r.rank_change)} · '
            f'{int(r.clean_streak_weeks or 0)}-week clean streak</div>'
            f'<div class="fk-k-value">{r.ops_score:,.0f}<span style="color:#A1A1AA;font-size:.9rem"> / 1,000</span></div>'
            f'<div class="fk-bar"><span style="width:{r.ops_score / 10:.0f}%"></span></div>'
            f'<div style="margin-top:8px">{badges}</div></div>')
    ui.grid(podium, 3)

    c1, c2 = st.columns([3, 1])
    with c1:
        st.markdown("#### Full table")
        t = lb.copy()
        t["movement"] = t["rank_change"].map(lambda c: "–" if pd.isna(c) or c == 0 else (f"▲ {int(c)}" if c > 0 else f"▼ {int(-c)}"))
        st.dataframe(
            t[["rank", "movement", "site_name", "region", "tier", "ops_score", "clean_streak_weeks",
               "p50_turnaround_h", "first_time_fix_pct", "same_day_release_pct", "pm_compliance_pct", "badges"]],
            hide_index=True, use_container_width=True, height=560,
            column_config={
                "rank": st.column_config.NumberColumn("#", width="small"),
                "movement": st.column_config.TextColumn("Move", width="small"),
                "site_name": "Site", "region": "Region", "tier": "Tier",
                "ops_score": st.column_config.ProgressColumn("Ops Score", min_value=0, max_value=1000, format="%d"),
                "clean_streak_weeks": st.column_config.NumberColumn("Clean streak", format="%d wks"),
                "p50_turnaround_h": st.column_config.NumberColumn("Turnaround", format="%.1f h"),
                "first_time_fix_pct": st.column_config.NumberColumn("First-time fix", format="%.1f%%"),
                "same_day_release_pct": st.column_config.NumberColumn("Same-day", format="%.0f%%"),
                "pm_compliance_pct": st.column_config.NumberColumn("PM", format="%.0f%%"),
                "badges": st.column_config.ListColumn("Badges"),
            })
    with c2:
        st.markdown("#### Movers")
        movers = lb.dropna(subset=["score_change"]).sort_values("score_change", ascending=False)
        rows = []
        for r in pd.concat([movers.head(3), movers.tail(2)]).itertuples():
            rows.append(f'<div class="fk-row"><div>{ui.esc(r.site_name)}</div>'
                        f'<div class="fk-num">{arrow_txt(r.score_change)} pts</div></div>')
        st.html('<div class="fk-card">' + "".join(rows) + "</div>")

        st.markdown("#### Badge cabinet")
        counts = pd.Series([b for bs in lb["badges"] for b in _badges(bs)], dtype=object).value_counts()
        defs = {"Clean Quarter": "13+ weeks without INTERVENE", "Fix It Once": "First-time fix ≥ 95%",
                "Speed Benchmark": "Turnaround ≤ 85% of the network median", "PM Perfect": "PM compliance ≥ 98%",
                "Backlog Zero": "No open job older than 72h", "Comeback": "Ops Score up 60+ points"}
        st.html('<div class="fk-card">' + "".join(
            f'<div class="fk-row"><div><span class="fk-badge">{b}</span><div class="fk-k-foot">{d}</div></div>'
            f'<div class="fk-num">{int(counts.get(b, 0))}</div></div>' for b, d in defs.items()) + "</div>")

    with st.expander("How the Ops Score is calculated"):
        w = q("SELECT * FROM cfg_score_weights")
        tiers = q("SELECT * FROM cfg_tiers ORDER BY min_score DESC")
        st.markdown(
            "Each component is scaled 0–1 over a realistic range, weighted, and summed to 1,000:\n\n"
            + "\n".join(f"- **{r.component.replace('_', ' ')}**: weight {r.weight:.0%}" for r in w.itertuples())
            + "\n\nTiers: " + " · ".join(f"{r.tier} ≥ {r.min_score:,.0f}" for r in tiers.itertuples())
            + "\n\nWeights and tiers live in `fleet.yml` under `gamification:`.")


def _badges(x) -> list:
    return [] if x is None or (isinstance(x, float) and pd.isna(x)) else list(x)


def arrow_txt(change) -> str:
    return ui.arrow(change)


# ==================================================================== Service Network
def service_network():
    ui.header("Service Network", "Workshops and preventive maintenance",
              "The heatmap a regional ops lead opens every Monday. Red is a site drifting from the network; "
              "blank weeks had too few jobs to judge.")
    cw = q("SELECT * FROM center_weekly ORDER BY region, site_name, wk")
    if cw.empty:
        ui.empty("No completed work orders yet.")
        return
    judged = cw.assign(p50_turnaround_h=cw.p50_turnaround_h.where(cw.status != "LOW VOLUME"))
    heat = judged.pivot(index="site_name", columns="wk", values="p50_turnaround_h")
    fig = px.imshow(heat, aspect="auto", color_continuous_scale=["#EEF2FF", "#C7D2FE", "#FDE68A", "#F87171", "#991B1B"],
                    zmin=8, zmax=60, labels=dict(color="Median h", x="", y=""))
    st.plotly_chart(ui.plotly_defaults(fig, 30 * len(heat) + 80), use_container_width=True)

    c1, c2 = st.columns(2)
    with c1:
        sites = sorted(cw.site_name.unique())
        flagged = cw[cw.status == "INTERVENE"].site_name
        default = flagged.value_counts().index[0] if not flagged.empty else sites[0]
        site = st.selectbox("Drill into a site", sites, index=sites.index(default))
        one = cw[cw.site_name == site]
        fig = go.Figure()
        fig.add_scatter(x=one.wk, y=one.network_p50_h, name="Network median", line=dict(color="#A1A1AA", dash="dot"))
        fig.add_scatter(x=one.wk, y=one.p50_turnaround_h, name=site, line=dict(color=ui.ACCENT, width=2))
        bad = one[one.status == "INTERVENE"]
        fig.add_scatter(x=bad.wk, y=bad.p50_turnaround_h, mode="markers", name="INTERVENE",
                        marker=dict(color=ui.STATUS["red"], size=8))
        fig.update_layout(title="Median turnaround, hours")
        st.plotly_chart(ui.plotly_defaults(fig), use_container_width=True)
    with c2:
        st.markdown("**Site scorecard**: last 4 weeks vs the 13 before")
        st.dataframe(q("SELECT * EXCLUDE (site_id) FROM center_scorecard"), hide_index=True,
                     use_container_width=True, height=380,
                     column_config={"turnaround_change_pct": st.column_config.NumberColumn("Δ turnaround", format="%+.1f%%")})

    st.markdown("#### Preventive-maintenance compliance")
    pm = q("""SELECT powertrain, sum(vehicles) vehicles, sum(overdue) overdue, sum(due_soon) due_soon,
                     round(100.0 * sum(vehicles - overdue) / sum(vehicles), 1) pct
              FROM pm_compliance GROUP BY 1 ORDER BY 1""")
    if not pm.empty:
        ui.grid([ui.kpi_card(ui.POWERTRAIN_NAMES.get(r.powertrain, r.powertrain), f"{r.pct:.1f}%",
                             f"{int(r.overdue):,} overdue · {int(r.due_soon):,} due soon of {int(r.vehicles):,}",
                             q(f"SELECT rag('pm_compliance_pct', {r.pct}) s").iloc[0, 0], r.pct / 100)
                 for r in pm.itertuples()], len(pm))
        with st.expander("Overdue vehicles (SOP-05)"):
            st.dataframe(q("SELECT vehicle_id, region, home_site, powertrain, km_since_service, months_since_service, "
                           "interval_km, interval_months FROM pm_status WHERE pm_state = 'Overdue' "
                           "ORDER BY km_since_service / interval_km DESC"), hide_index=True, use_container_width=True)

    st.markdown("#### Open backlog")
    st.caption("Anything older than 72h is customer-facing.")
    st.dataframe(q("SELECT * FROM backlog"), hide_index=True, use_container_width=True)


# ======================================================================== Energy & TCO
def energy_tco():
    months = ui.setting("kpi_window_months", "3")
    cur = ui.setting("currency", "USD")
    ui.header("Energy & TCO", "Electric, hybrid and combustion, compared",
              f"Last {months} complete months. Cost per km = energy + fleet-paid maintenance + depreciation.")
    pt = q("SELECT * FROM powertrain_kpis")
    if pt.empty:
        ui.empty("No usage in the KPI window.")
        return
    cards = []
    best = pt.tco_per_km.min()
    for r in pt.itertuples():
        eff = " · ".join(x for x in [
            "" if pd.isna(r.kwh_per_100km) else f"{r.kwh_per_100km:.1f} kWh/100km",
            "" if pd.isna(r.l_per_100km) else f"{r.l_per_100km:.1f} L/100km"] if x)
        delta = "lowest in fleet" if r.tco_per_km == best else f"+{(r.tco_per_km / best - 1) * 100:.0f}% vs best"
        cards.append(ui.kpi_card(ui.POWERTRAIN_NAMES.get(r.powertrain, r.powertrain), f"{cur} {r.tco_per_km:.3f}/km",
                                 f"{delta}<br>{eff}<br>{r.co2_g_per_km:.0f} g CO₂/km · {int(r.vehicles):,} vehicles"))
    ui.grid(cards, len(cards))

    c1, c2 = st.columns(2)
    with c1:
        long = pt.melt(id_vars="powertrain", value_vars=["energy_cost_per_km", "maintenance_cost_per_km", "depreciation_per_km"],
                       var_name="component", value_name="per_km")
        long["component"] = long.component.str.replace("_cost_per_km", "").str.replace("_per_km", "").str.title()
        fig = px.bar(long, x="powertrain", y="per_km", color="component", title=f"Cost per km ({cur}), by component",
                     color_discrete_sequence=[ui.ACCENT, "#A5B4FC", "#E4E4E7"])
        st.plotly_chart(ui.plotly_defaults(fig), use_container_width=True)
    with c2:
        fig = px.bar(pt, x="powertrain", y="co2_g_per_km", title="CO₂ per km (g)", color="powertrain",
                     color_discrete_map=ui.POWERTRAIN_COLORS)
        fig.update_layout(showlegend=False)
        st.plotly_chart(ui.plotly_defaults(fig), use_container_width=True)

    trend = q("SELECT * FROM energy_monthly_powertrain ORDER BY month_start")
    fig = px.line(trend, x="month_start", y="energy_cost_per_km", color="powertrain",
                  title=f"Energy cost per km ({cur}), monthly", color_discrete_map=ui.POWERTRAIN_COLORS)
    st.plotly_chart(ui.plotly_defaults(fig), use_container_width=True)

    st.markdown("#### Highest cost-per-km vehicles (SOP-06)")
    st.dataframe(q("SELECT * FROM tco_vehicle WHERE km > 1000 ORDER BY tco_per_km DESC LIMIT 25"),
                 hide_index=True, use_container_width=True)


# ===================================================================== Recalls & Cost
def recalls_cost():
    ui.header("Recalls & Cost", "Compliance evidence and budget control")
    rc = q("SELECT * FROM recall_completion")
    st.markdown("#### Recall campaigns")
    if rc.empty:
        ui.empty("No recall data supplied (optional tables `recalls` and `recall_vehicles`).")
    else:
        st.dataframe(rc, hide_index=True, use_container_width=True,
                     column_config={"completion_pct": st.column_config.ProgressColumn("Completion", min_value=0, max_value=100, format="%.1f%%")})
        curve = q("SELECT * FROM recall_curve")
        for cid in curve.campaign_id.unique():
            fig = px.line(curve[curve.campaign_id == cid], x="week_no", y="cumulative_completion_pct", color="region",
                          title=f"{cid}: cumulative completion by week since launch")
            st.plotly_chart(ui.plotly_defaults(fig, 300), use_container_width=True)

    st.markdown("#### Fleet-paid maintenance vs budget")
    cm = q("SELECT * FROM cost_monthly ORDER BY month_start")
    if not cm.empty:
        grid_ = cm.pivot(index="region", columns="month_start", values="cost_vs_budget_pct")
        fig = px.imshow(grid_, aspect="auto", text_auto=".0f", zmin=-25, zmax=25,
                        color_continuous_scale=["#15803D", "#DCFCE7", "#FAFAFA", "#FEE2E2", "#B91C1C"],
                        labels=dict(color="% vs budget", x="", y=""))
        st.plotly_chart(ui.plotly_defaults(fig, 40 * len(grid_) + 80), use_container_width=True)


# ============================================================================ Pipeline
STAGE_HELP = {
    "Ingest": "Find each contract table in the input folder (CSV, Excel, Parquet, JSON) and read it as text.",
    "Map & standardise": "Match your column names to the contract, convert types, normalise powertrain / job type / payer.",
    "Validate": "Plain-language data-quality checks. Errors block publishing; warnings do not.",
    "Model": "Run the SQL models: base, fleet, energy & TCO, service network, PM, recalls & cost, gamification, scorecard.",
    "Quality gate": "Sanity checks that must hold for any fleet before numbers are shown.",
    "Publish": "Swap the new warehouse in atomically; the dashboard reads only published data.",
}
LINEAGE = {
    "sites": ["05_base", "20_service_network"], "vehicles": ["05_base", "25_pm_compliance"],
    "work_orders": ["05_base", "25_pm_compliance", "30_recalls_cost"], "usage": ["05_base"],
    "energy": ["15_energy_tco"], "recalls": ["30_recalls_cost"], "recall_vehicles": ["30_recalls_cost"],
    "budgets": ["30_recalls_cost"],
    "05_base": ["10_fleet", "15_energy_tco", "20_service_network", "25_pm_compliance"],
    "10_fleet": ["90_exec_scorecard"], "15_energy_tco": ["90_exec_scorecard", "Energy & TCO"],
    "20_service_network": ["50_gamification", "Service Network"], "25_pm_compliance": ["50_gamification", "90_exec_scorecard", "Service Network"],
    "30_recalls_cost": ["90_exec_scorecard", "Recalls & Cost"], "50_gamification": ["Leaderboard"],
    "90_exec_scorecard": ["Command Center"],
}


def pipeline():
    ui.header("Pipeline", "From your files to every number on this dashboard",
              "Six stages, run by <code>fleetkpi build</code>. Nothing is shown unless every stage has passed.")
    log = q("SELECT * FROM run_log")
    if log.empty:
        ui.empty("No build has run yet.")
        return
    icon = {"ok": "green", "warning": "amber", "blocked": "red", "failed": "red", "skipped": "n/a"}
    cards = []
    for i, r in enumerate(log.itertuples(), 1):
        cards.append(
            f'<div class="fk-card fk-stage"><div class="fk-stage-num">STAGE {i} · {r.seconds:.2f}s</div>'
            f'<div class="fk-k-value">{ui.esc(r.stage)}</div>'
            f'<div style="margin:4px 0 6px">{ui.rag_pill(icon.get(r.status, "n/a"), r.status.upper())}</div>'
            f'<div class="fk-k-foot">{ui.esc(r.detail)}</div></div>')
    ui.grid(cards, len(cards))
    built = log.built_at.iloc[0]
    c1, c2 = st.columns([3, 1])
    c1.caption(f"Last build {built:%d %b %Y %H:%M} · snapshot {ui.setting('snapshot_ts')[:10]} · "
               f"analysis from {ui.setting('analysis_start')[:10]}")
    if c2.button("Run pipeline now", icon=":material/refresh:", use_container_width=True):
        from fleetkpi import build as build_mod
        with st.spinner("Running pipeline…"):
            res = build_mod.run(ui.cfg())
        ui.reload()
        (st.toast if res.ok else st.error)("Pipeline complete" if res.ok else "Pipeline blocked: see Validate")
        st.rerun()

    with st.expander("What each stage does", expanded=False):
        for k, v in STAGE_HELP.items():
            st.markdown(f"**{k}**: {v}")

    st.markdown("#### Data lineage")
    il = q("SELECT * FROM ingest_log")
    dot = ['digraph G { rankdir=LR; bgcolor="transparent"; nodesep=0.15; ranksep=0.6;',
           'node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=10, color="#E4E4E7", fillcolor="#FFFFFF"];',
           'edge [color="#D4D4D8", arrowsize=0.6];']
    for r in il.itertuples():
        if r.source:
            dot.append(f'"{r.source}" [fillcolor="#F4F4F5"]; "{r.source}" -> "{r.table_name}";')
            dot.append(f'"{r.table_name}" [color="{ui.ACCENT}"];')
    for src, dsts in LINEAGE.items():
        if src in set(il.table_name) and il.set_index("table_name").loc[src, "source"] is None:
            continue
        for d in dsts:
            style = ' [fillcolor="#EEF2FF", color="#C7D2FE"]' if d[0].isupper() else ""
            dot.append(f'"{d}"{style}; "{src}" -> "{d}";')
    dot.append("}")
    st.graphviz_chart("\n".join(dot), use_container_width=True)
    st.caption("Grey: your files · outlined: contract tables · white: SQL models · blue: dashboard pages")

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Data contract coverage")
        cov = il.copy()
        cov["columns mapped"] = cov.mapped.map(lambda m: len(json.loads(m or "{}")))
        cov["renamed"] = cov.mapped.map(lambda m: ", ".join(f"{v}→{k}" for k, v in json.loads(m or "{}").items() if k != v) or "–")
        cov["optional missing"] = cov.missing_optional.map(lambda m: ", ".join(json.loads(m or "[]")) or "–")
        st.dataframe(cov[["table_name", "source", "n_rows", "columns mapped", "renamed", "optional missing"]],
                     hide_index=True, use_container_width=True,
                     column_config={"table_name": "Table", "source": "Your file", "n_rows": st.column_config.NumberColumn("Rows", format="%d")})
    with c2:
        st.markdown("#### Validation findings")
        vi = q("SELECT * FROM validation_issues ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END")
        if vi.empty:
            st.success("No data-quality findings.")
        else:
            st.dataframe(vi, hide_index=True, use_container_width=True)
        gate = log[log.stage == "Quality gate"]
        if not gate.empty:
            st.markdown("**Quality gate**")
            for k, v in json.loads(gate.metrics.iloc[0]).items():
                st.markdown(f"{'✅' if v else '❌'} {k}")

    st.markdown("#### SQL models")
    from importlib import resources
    for f in sorted(p for p in resources.files("fleetkpi").joinpath("sql", "models").iterdir() if p.name.endswith(".sql")):
        with st.expander(f.name):
            st.code(f.read_text(), language="sql")


# ================================================================================ SOPs
def _load_sops():
    out = []
    for p in sorted(ui.sops_dir().glob("SOP-*.md")):
        text = p.read_text()
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
        meta, body = (yaml.safe_load(m.group(1)), m.group(2)) if m else ({"id": p.stem, "title": p.stem}, text)
        out.append((meta, body))
    return out


def _active_triggers() -> dict[str, list[str]]:
    trig: dict[str, list[str]] = {"SOP-02": ["Weekly review: every Monday"]}
    f = q("""SELECT site_name, count(*) n FROM center_weekly WHERE status = 'INTERVENE'
             AND wk > (SELECT max(wk) FROM center_weekly) - INTERVAL 4 WEEK GROUP BY 1""")
    if not f.empty:
        trig["SOP-03"] = [f"{r.site_name}: INTERVENE in {r.n} of the last 4 weeks" for r in f.itertuples()]
    sc = q("SELECT * FROM exec_scorecard")
    for col, sop, label in [("pm_rag", "SOP-05", "PM compliance"), ("recall_rag", "SOP-04", "Recall completion"),
                            ("cost_rag", "SOP-06", "Cost vs budget")]:
        if col in sc:
            bad = sc[sc[col] == "red"].region.tolist() + sc[sc[col] == "amber"].region.tolist()
            if bad:
                trig.setdefault(sop, []).append(f"{label} off target in {', '.join(bad)}")
    vi = q("SELECT count(*) n FROM validation_issues WHERE severity IN ('error','warning')")
    if not vi.empty and vi.n.iloc[0] > 0:
        trig["SOP-01"] = [f"{int(vi.n.iloc[0])} open data-quality findings"]
    return trig


def sops():
    ui.header("SOPs", "Standard operating procedures",
              "Every flag on this dashboard maps to a procedure with an owner, a cadence and exit criteria. "
              "Procedures with a live trigger are marked <b>Active</b>.")
    triggers = _active_triggers()
    all_sops = _load_sops()

    summary = []
    for meta, _ in all_sops:
        active = meta["id"] in triggers
        summary.append(ui.kpi_card(meta["id"], ui.esc(meta["title"]),
                                   f"{ui.esc(meta.get('owner', ''))}<br>{ui.esc(meta.get('cadence', ''))}",
                                   "red" if active and meta["id"] not in ("SOP-02",) else ("amber" if active else "green"),
                                   small=True))
    ui.grid(summary, 3)

    st.markdown("#### Run a procedure")
    for meta, body in all_sops:
        sid = meta["id"]
        active = sid in triggers
        steps = re.findall(r"^- \[ \] (.+)$", body, re.M)
        done = sum(st.session_state.get(f"{sid}-{i}", False) for i in range(len(steps)))
        label = f"{sid} · {meta['title']}" + ("  ·  ACTIVE" if active else "") + (f"  ·  {done}/{len(steps)} done" if done else "")
        with st.expander(label, expanded=active and sid == "SOP-03"):
            c1, c2 = st.columns([2, 1])
            with c1:
                if active:
                    st.html('<div class="fk-card" style="border-color:#FECACA;background:#FEF2F2">'
                            + "".join(f'<div class="fk-k-foot" style="color:#991B1B">● {ui.esc(t)}</div>' for t in triggers[sid])
                            + "</div>")
                purpose = re.search(r"## Purpose\n(.+?)\n\n", body, re.S)
                if purpose:
                    st.markdown(purpose.group(1))
                for i, s in enumerate(steps):
                    st.checkbox(s, key=f"{sid}-{i}")
                done = sum(st.session_state.get(f"{sid}-{i}", False) for i in range(len(steps)))
                st.progress(done / max(len(steps), 1), text=f"{done} of {len(steps)} steps complete")
                if steps and done == len(steps):
                    st.success(f"{sid} complete. Record the outcome and owner in your action log.")
            with c2:
                st.html(ui.kpi_card("Owner", ui.esc(meta.get("owner", "–")), "", small=True) +
                        '<div style="height:10px"></div>' +
                        ui.kpi_card("Cadence", ui.esc(meta.get("cadence", "–")), "", small=True) +
                        '<div style="height:10px"></div>' +
                        ui.kpi_card("Trigger", "", ui.esc(meta.get("trigger", "–")), small=True) +
                        '<div style="height:10px"></div>' +
                        ui.kpi_card("Dashboard page", ui.esc(meta.get("page", "–")), "", small=True))
                for sec in ("Exit criteria", "Escalation"):
                    m = re.search(rf"## {sec}\n(.+?)(\n\n|$)", body, re.S)
                    if m:
                        st.markdown(f"**{sec}**  \n{m.group(1)}")
