"""Pages. Every number comes from a SQL mart; this module only arranges and visualises it."""
from __future__ import annotations

import json
import re

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
import yaml

from fleetkpi import sqlrunner
from fleetkpi.app import ui
from fleetkpi.app.ui import chart, q, style

# (column, rag column, label, format, lower-is-better)
SCORECARD = [
    ("availability_pct", "availability_rag", "Availability", "{:.2f}", False),
    ("key_to_key_p50_h", "key_to_key_rag", "Key-to-key h", "{:.1f}", True),
    ("csat_pct", "csat_rag", "CSAT", "{:.1f}", False),
    ("low_rating_pct", "low_rating_rag", "1-2★", "{:.1f}", True),
    ("productivity_pct", "productivity_rag", "Productivity", "{:.1f}", False),
    ("backlog_days", "backlog_rag", "Backlog days", "{:.2f}", True),
    ("first_time_fix_pct", "first_time_fix_rag", "First-time fix", "{:.1f}", False),
    ("pm_compliance_pct", "pm_rag", "PM compliance", "{:.1f}", False),
    ("registration_valid_pct", "registration_rag", "Registration", "{:.1f}", False),
    ("insurance_valid_pct", "insurance_rag", "Insurance", "{:.1f}", False),
    ("cost_vs_budget_pct", "cost_rag", "Cost vs budget", "{:+.1f}", True),
    ("recall_completion_pct", "recall_rag", "Recalls", "{:.1f}", False),
]


def _fmt(f: str, v) -> str:
    return "–" if v is None or pd.isna(v) else f.format(v)


def _trends() -> pd.DataFrame:
    """Monthly KPI series: network-wide, or for the selected region."""
    if ui.region():
        df = q(f"SELECT * FROM mart_region_month_kpis {ui.where_region()} ORDER BY month_start")
        bv = q(f"""SELECT month_start, sum(book_value_end) AS book_value FROM int_vehicle_months
                   {ui.where_region()} GROUP BY 1""")
        return df.merge(bv, on="month_start", how="left") if not df.empty else df
    return q("SELECT * FROM mart_network_trends ORDER BY month_start")


# ============================================================================== Overview
def overview():
    snap = pd.Timestamp(ui.setting("snapshot_ts"))
    month = snap - pd.Timedelta(days=1)
    sc = q(f"SELECT * FROM mart_exec_scorecard {ui.where_region()}")
    rag_cols = [c for _, c, *_ in SCORECARD]
    fleet = int(sc.active_vehicles.sum()) if not sc.empty else 0
    lb = q("SELECT * FROM mart_leaderboard")
    reds = int((sc[rag_cols] == "red").sum().sum()) if not sc.empty else 0
    greens = int((sc[rag_cols] == "green").sum().sum()) if not sc.empty else 0
    ui.hero("Overview · " + (ui.region() or "All regions"), ui.setting("fleet_name", "Fleet"),
            f"Report month <b>{month:%B %Y}</b> · data to {month:%d %b %Y}",
            [("Vehicles", f"{fleet:,}", None), ("On target", f"{greens}", ui.GOOD), ("Off target", f"{reds}", ui.BAD),
             ("Top site", lb.iloc[0].site_name if not lb.empty else "–",
              ui.TIER.get(lb.iloc[0].tier) if not lb.empty else None)])

    tr = _trends()
    if tr.empty:
        st.info("No KPI data yet. Check the Pipeline page.")
        return
    last = tr.iloc[-1]
    bl = q(f"SELECT sum(open_jobs) / nullif(sum(daily_closures), 0) AS d FROM mart_backlog {ui.where_region()}")
    cur = ui.setting("currency", "USD")

    r1 = st.columns(4)
    with r1[0]:
        ui.metric("Availability", last.availability_pct, "{:.2f}%", tr.availability_pct,
                  help="Vehicle-hours on the road vs in the workshop")
    with r1[1]:
        ui.metric("Key-to-key (median)", last.key_to_key_p50_h, "{:.1f} h", tr.key_to_key_p50_h, inverse=True,
                  help="Key handed in → key handed back")
    with r1[2]:
        ui.metric("Customer satisfaction", last.csat_pct, "{:.1f}%", tr.csat_pct, help="Share of 4-5 star ratings")
    with r1[3]:
        ui.metric("1-2 star ratings", last.low_rating_pct, "{:.1f}%", tr.low_rating_pct, inverse=True)
    r2 = st.columns(4)
    with r2[0]:
        ui.metric("Technician productivity", last.productivity_pct, "{:.1f}%", tr.productivity_pct,
                  help="Billed ÷ available technician hours")
    with r2[1]:
        ui.metric("Days of backlog", bl.d.iloc[0] if not bl.empty else None, "{:.2f} d",
                  help="Open jobs ÷ average daily completions (last 28 days)")
    with r2[2]:
        ui.metric("Cost vs budget", last.cost_vs_budget_pct, "{:+.1f}%", tr.cost_vs_budget_pct, inverse=True)
    with r2[3]:
        ui.metric("Fleet book value", last.book_value / 1e6, cur + " {:,.1f}M", tr.book_value / 1e6,
                  delta_fmt="{:+,.1f}M", help="After depreciation")

    left, right = st.columns([3, 2], gap="medium")
    with left, st.container(border=True):
        opts = {"Availability": "availability_pct", "Key-to-key": "key_to_key_p50_h", "CSAT": "csat_pct",
                "1-2★": "low_rating_pct", "Productivity": "productivity_pct", "First-time fix": "first_time_fix_pct",
                "Cost vs budget": "cost_vs_budget_pct"}
        pick = st.segmented_control("Trend", list(opts), default="CSAT", key="ov_trend", label_visibility="collapsed")
        col = opts.get(pick or "CSAT")
        if ui.region():
            fig = go.Figure(go.Scatter(x=tr.month_start, y=tr[col], mode="lines+markers", fill="tozeroy",
                                       line=dict(color=ui.ACCENT, width=3), fillcolor="rgba(99,102,241,.12)",
                                       name=ui.region()))
        else:
            reg = q(f"SELECT region, month_start, {col} FROM mart_region_month_kpis ORDER BY month_start")
            fig = px.line(reg, x="month_start", y=col, color="region")
            fig.update_traces(line=dict(width=1.4), opacity=0.45)
            fig.add_scatter(x=tr.month_start, y=tr[col], name="Network", mode="lines+markers",
                            line=dict(color=ui.ACCENT, width=4, shape="spline"), marker=dict(size=6))
        tg = ui.targets().get(col)
        if tg is not None:
            fig.add_hline(y=tg.green, line_dash="dot", line_color=ui.GOOD, annotation_text="target",
                          annotation_position="top left")
        chart(style(fig, 330), key="ov_trend_chart")
    with right, st.container(border=True):
        top = lb.head(8).sort_values("ops_score")
        fig = go.Figure(go.Bar(
            x=top.ops_score, y=top.site_name, orientation="h",
            marker=dict(color=[ui.TIER.get(t, ui.NA) for t in top.tier], cornerradius=6),
            text=[f"{s:,.0f}" for s in top.ops_score], textposition="inside", insidetextanchor="end",
            textfont=dict(color="#FFFFFF"), hovertemplate="%{y}: %{x:,.0f}<extra></extra>"))
        fig.update_xaxes(range=[0, 1000], showticklabels=False)
        chart(style(fig, 378, legend=False, title="Ops Score leaders · colour = tier"), key="ov_league")

    with st.container(border=True):
        if not sc.empty:
            code = {"green": 2, "amber": 1, "red": 0, "n/a": None}
            z = [[code.get(getattr(r, rc)) for _, rc, *_ in SCORECARD] for r in sc.itertuples()]
            txt = [[_fmt(f, getattr(r, c)) for c, _, _, f, _ in SCORECARD] for r in sc.itertuples()]
            fig = go.Figure(go.Heatmap(
                z=z, x=[lbl for _, _, lbl, _, _ in SCORECARD], y=list(sc.region), text=txt, texttemplate="%{text}",
                textfont=dict(size=12, color="#FFFFFF"),
                colorscale=[[0, "rgba(244,63,94,.92)"], [0.5, "rgba(245,158,11,.92)"], [1, "rgba(16,185,129,.88)"]],
                zmin=0, zmax=2, showscale=False, xgap=4, ygap=4, hovertemplate="%{y} · %{x}: %{text}<extra></extra>"))
            fig.update_xaxes(side="top", tickangle=0, tickfont=dict(size=11))
            fig.update_yaxes(autorange="reversed")
            st.markdown("**Scorecard** · every region × every KPI, report month")
            chart(style(fig, 46 * len(sc) + 40, legend=False), key="ov_matrix")

    with st.container(border=True):
        st.markdown("**What needs attention**")
        flagged = q("""SELECT site_name, count(*) n FROM mart_site_weekly WHERE status = 'INTERVENE'
                       AND wk > (SELECT max(wk) FROM mart_site_weekly) - INTERVAL 4 WEEK GROUP BY 1""")
        chips = [(f"{r.site_name} · INTERVENE ×{r.n}", "SOP-03", ui.BAD) for r in flagged.itertuples()]
        sop_for = {"cost_rag": "SOP-06", "pm_rag": "SOP-05", "recall_rag": "SOP-04", "registration_rag": "SOP-07",
                   "insurance_rag": "SOP-07", "csat_rag": "SOP-08", "low_rating_rag": "SOP-08",
                   "key_to_key_rag": "SOP-03", "productivity_rag": "SOP-03", "backlog_rag": "SOP-02"}
        ambers = []
        for level, colr in [("red", ui.BAD), ("amber", ui.WARN)]:
            for r in sc.itertuples():
                for c, rc, lbl, f, _ in SCORECARD:
                    if getattr(r, rc) == level:
                        item = (f"{r.region} · {lbl} {_fmt(f, getattr(r, c))}", sop_for.get(rc, "SOP-02"), colr)
                        (chips if level == "red" else ambers).append(item)
        shown = chips + ambers[:8]
        more = len(ambers) - 8
        st.html('<div class="fk-chips">' + "".join(
            f'<span class="fk-chip"><span class="fk-dot" style="background:{c}"></span>{ui.esc(t)} '
            f'<b style="color:{ui.ACCENT}">{s}</b></span>' for t, s, c in shown)
            + (f'<span class="fk-chip">+{more} more amber in the scorecard</span>' if more > 0 else "") + "</div>"
            if shown else '<span class="fk-muted">Everything is on target.</span>')


# ============================================================================== Customer
def customer():
    ui.hero("Customer", "Satisfaction, ratings and key-to-key",
            "What the customer feels: stars after every visit, and the time from key in to key back.")
    tr = _trends()
    rd = q(f"SELECT rating, sum(responses) n FROM mart_rating_distribution {ui.where_region()} GROUP BY 1 ORDER BY 1 DESC")
    if rd.empty:
        st.info("No feedback supplied (optional table `feedback`). Add ratings to unlock this page.")
        return
    total = int(rd.n.sum())
    avg = (rd.rating * rd.n).sum() / total
    csat = 100 * rd[rd.rating >= 4].n.sum() / total
    low = 100 * rd[rd.rating <= 2].n.sum() / total
    k2k = tr.key_to_key_p50_h.dropna().iloc[-1] if tr.key_to_key_p50_h.notna().any() else None

    g = st.columns(4)
    with g[0], st.container(border=True):
        chart(ui.gauge(csat, "CSAT · 4-5★", "csat_pct", (50, 100)), key="g_csat")
    with g[1], st.container(border=True):
        chart(ui.gauge(low, "1-2★ share", "low_rating_pct", (0, 20)), key="g_low")
    with g[2], st.container(border=True):
        chart(ui.gauge(k2k, "Key-to-key median", "key_to_key_p50_h", (0, 48), suffix=" h"), key="g_k2k")
    with g[3], st.container(border=True):
        stars = "★" * int(round(avg)) + "☆" * (5 - int(round(avg)))
        st.html(f'<div style="padding:18px 6px"><div class="fk-muted">Average rating · last '
                f'{ui.setting("kpi_window_months")} months</div><div class="fk-big">{avg:.2f}</div>'
                f'<div style="font-size:1.6rem;color:#F59E0B;letter-spacing:2px">{stars}</div>'
                f'<div class="fk-muted">{total:,} responses</div></div>')

    a, b = st.columns([2, 3], gap="medium")
    with a, st.container(border=True):
        fig = go.Figure(go.Bar(x=rd.n, y=[f"{int(r)}★" for r in rd.rating], orientation="h",
                               marker=dict(color=[ui.STARS[int(r)] for r in rd.rating], cornerradius=6),
                               text=[f"{n / total:.0%}" for n in rd.n], textposition="outside"))
        fig.update_yaxes(autorange="reversed")
        fig.update_xaxes(range=[0, rd.n.max() * 1.18])
        chart(style(fig, 300, legend=False, title="Rating distribution"), key="c_dist")
    with b, st.container(border=True):
        fig = go.Figure()
        fig.add_bar(x=tr.month_start, y=tr.low_rating_pct, name="1-2★ %", yaxis="y2",
                    marker=dict(color="rgba(244,63,94,.55)", cornerradius=4))
        fig.add_scatter(x=tr.month_start, y=tr.csat_pct, name="CSAT %", mode="lines+markers",
                        line=dict(color=ui.ACCENT, width=3, shape="spline"))
        fig.update_layout(yaxis2=dict(overlaying="y", side="right", showgrid=False, rangemode="tozero",
                                      tickformat=".0f", ticksuffix="%"))
        fig.update_yaxes(ticksuffix="%")
        chart(style(fig, 300, title="CSAT (line) vs 1-2★ share (bars), monthly"), key="c_trend")

    cs = q(f"""SELECT c.site_name, c.region, c.responses, c.csat_pct, c.low_ratings, c.low_rating_pct,
                      l.key_to_key_p50_h
               FROM mart_customer_site c LEFT JOIN mart_leaderboard l USING (site_name)
               {ui.where_region('c.region')}""")
    a, b = st.columns([3, 2], gap="medium")
    with a, st.container(border=True):
        fig = px.scatter(cs, x="key_to_key_p50_h", y="csat_pct", size="responses", color="low_rating_pct",
                         hover_name="site_name", color_continuous_scale=["#10B981", "#F59E0B", "#F43F5E"],
                         labels={"key_to_key_p50_h": "Key-to-key median (h)", "csat_pct": "CSAT %", "low_rating_pct": "1-2★ %"})
        fig.update_traces(marker=dict(line=dict(width=0), opacity=0.85))
        style(fig, 360, legend=False, title="Sites: satisfaction vs speed (bubble = responses)")
        fig.update_xaxes(title="Key-to-key median, hours (faster →)", autorange="reversed")
        fig.update_yaxes(title="CSAT %")
        chart(fig, key="c_scatter")
    with b, st.container(border=True):
        top = cs.sort_values("low_ratings").tail(10)
        fig = go.Figure(go.Bar(x=top.low_ratings, y=top.site_name, orientation="h",
                               marker=dict(color=ui.BAD, cornerradius=5), text=top.low_ratings, textposition="outside"))
        fig.update_xaxes(range=[0, max(top.low_ratings.max(), 1) * 1.15])
        chart(style(fig, 360, legend=False, title="1-2★ ratings by site (SOP-08)"), key="c_low_sites")

    a, b = st.columns(2, gap="medium")
    with a, st.container(border=True):
        kd = q("SELECT * FROM mart_key_to_key_distribution ORDER BY bucket_order")
        fig = px.bar(kd, x="bucket", y="jobs", color="job_type",
                     category_orders={"bucket": list(kd.sort_values("bucket_order").bucket.unique())})
        fig.update_traces(marker_cornerradius=4)
        chart(style(fig, 320, title="Key-to-key distribution by job type"), key="k_dist")
    with b, st.container(border=True):
        km = q(f"SELECT * FROM mart_key_to_key_monthly {ui.where_region()} ORDER BY month_start")
        fig = px.line(km, x="month_start", y="key_to_key_p50_h", color="region", line_shape="spline", markers=True)
        tg = ui.targets().get("key_to_key_p50_h")
        if tg is not None:
            fig.add_hline(y=tg.green, line_dash="dot", line_color=ui.GOOD, annotation_text="target")
        chart(style(fig, 320, title="Median key-to-key by region, hours"), key="k_month")


# ============================================================================== Workshop
def workshop():
    lb = q(f"SELECT * FROM mart_leaderboard {ui.where_region()} ORDER BY rank")
    ui.hero("Workshop", "League table, productivity and backlog",
            "Ops Score out of 1,000 from key-to-key, first-time fix, CSAT, productivity and PM compliance "
            "(last 4 weeks; movement vs the 4 weeks before).")
    if lb.empty:
        st.info("Not enough completed work orders to score sites yet.")
        return
    cols = st.columns(3, gap="medium")
    for col, r in zip(cols, lb.head(3).itertuples()):
        badges = "".join(f'<span class="fk-badge">{ui.esc(b)}</span>' for b in list(r.badges if r.badges is not None else []))
        move = "–" if pd.isna(r.rank_change) or r.rank_change == 0 else (
            f'<span style="color:{ui.GOOD}">▲ {int(r.rank_change)}</span>' if r.rank_change > 0
            else f'<span style="color:{ui.BAD}">▼ {int(-r.rank_change)}</span>')
        with col:
            st.html(ui.card(
                f'<div style="display:flex;justify-content:space-between;align-items:center">'
                f'<span class="fk-rank">#{r.rank}</span>'
                f'<span class="fk-chip"><span class="fk-dot" style="background:{ui.TIER.get(r.tier, ui.NA)}"></span>{r.tier}</span></div>'
                f'<div style="font-weight:650;font-size:1.05rem">{ui.esc(r.site_name)}</div>'
                f'<div class="fk-muted">{ui.esc(r.region)} · {move} · {int(r.clean_streak_weeks or 0)}-week clean streak</div>'
                f'<div class="fk-big" style="margin-top:6px">{r.ops_score:,.0f}<span class="fk-muted"> / 1,000</span></div>'
                f'<div class="fk-bar"><span style="width:{r.ops_score / 10:.0f}%"></span></div><div>{badges}</div>'))

    a, b = st.columns([3, 2], gap="medium")
    with a, st.container(border=True):
        d = lb.sort_values("ops_score")
        lbl = []
        for s, c in zip(d.ops_score, d.rank_change):
            mv = f"  ▲{int(c)}" if pd.notna(c) and c > 0 else (f"  ▼{int(-c)}" if pd.notna(c) and c < 0 else "")
            lbl.append(f"{s:,.0f}{mv}")
        fig = go.Figure(go.Bar(x=d.ops_score, y=d.site_name, orientation="h", text=lbl, textposition="outside",
                               marker=dict(color=[ui.TIER.get(t, ui.NA) for t in d.tier], cornerradius=6),
                               hovertemplate="%{y}: %{x:,.0f}<extra></extra>"))
        fig.update_xaxes(range=[0, 1050])
        chart(style(fig, 30 * len(d) + 80, legend=False, title="Ops Score league (colour = tier)"), key="w_league")
    with b, st.container(border=True):
        comp = lb[["site_name", "key_to_key_p50_h", "first_time_fix_pct", "csat_pct", "productivity_pct", "pm_compliance_pct"]]
        pick = st.selectbox("Site profile vs network median", list(lb.site_name), key="w_site")
        r = comp[comp.site_name == pick].iloc[0]
        med = comp.median(numeric_only=True)

        def norm(v, m, inv=False):
            return 0 if pd.isna(v) or pd.isna(m) or v == 0 else max(0, min(1.5, (m / v if inv else v / m))) * 100 / 1.5
        axes = ["Key-to-key", "First-time fix", "CSAT", "Productivity", "PM"]
        vals = [norm(r.key_to_key_p50_h, med.key_to_key_p50_h, True), norm(r.first_time_fix_pct, med.first_time_fix_pct),
                norm(r.csat_pct, med.csat_pct), norm(r.productivity_pct, med.productivity_pct),
                norm(r.pm_compliance_pct, med.pm_compliance_pct)]
        fig = go.Figure()
        fig.add_scatterpolar(r=[100 / 1.5] * 6, theta=axes + axes[:1], name="Network median", line=dict(color=ui.NA, dash="dot"))
        fig.add_scatterpolar(r=vals + vals[:1], theta=axes + axes[:1], name=pick, fill="toself",
                             line=dict(color=ui.ACCENT, width=2), fillcolor="rgba(99,102,241,.25)")
        fig.update_layout(polar=dict(bgcolor="rgba(0,0,0,0)", radialaxis=dict(visible=False, range=[0, 100]),
                                     domain=dict(x=[0.12, 0.88], y=[0.05, 0.92])))
        chart(style(fig, 330), key="w_radar")

    a, b = st.columns(2, gap="medium")
    with a, st.container(border=True):
        pr = q(f"""SELECT site_name, productivity_pct FROM mart_productivity
                   WHERE month_start = report_month() {ui.where_region(prefix='AND')} ORDER BY productivity_pct""")
        tg = ui.targets().get("productivity_pct")
        colr = [ui.GOOD if tg is None or v >= tg.green else (ui.WARN if v >= tg.amber else ui.BAD) for v in pr.productivity_pct]
        fig = go.Figure(go.Bar(x=pr.productivity_pct, y=pr.site_name, orientation="h", marker=dict(color=colr, cornerradius=5),
                               text=[f"{v:.0f}%" for v in pr.productivity_pct], textposition="outside"))
        if tg is not None:
            fig.add_vline(x=tg.green, line_dash="dot", line_color=ui.GOOD, annotation_text="target",
                          annotation_position="bottom right")
        fig.update_xaxes(range=[0, max(pr.productivity_pct.max(), 100) * 1.12], ticksuffix="%")
        chart(style(fig, 30 * len(pr) + 80, legend=False, title="Technician productivity, report month"), key="w_prod")
    with b, st.container(border=True):
        bl = q(f"SELECT * FROM mart_backlog {ui.where_region()} ORDER BY backlog_days NULLS FIRST")
        fig = go.Figure()
        for c, lb_, col in [("age_lt_1d", "< 1 day", "#10B981"), ("age_1_3d", "1-3 days", "#84CC16"),
                            ("age_3_7d", "3-7 days", "#F59E0B"), ("age_7d_plus", "7+ days", "#F43F5E")]:
            fig.add_bar(x=bl[c], y=bl.site_name, orientation="h", name=lb_, marker=dict(color=col))
        fig.add_scatter(x=bl.open_jobs, y=bl.site_name, mode="text", showlegend=False, hoverinfo="skip",
                        text=[f"   {d:.1f} d" if pd.notna(d) else "" for d in bl.backlog_days], textposition="middle right")
        fig.update_layout(barmode="stack")
        fig.update_xaxes(range=[0, max(bl.open_jobs.max(), 1) * 1.3])
        chart(style(fig, 30 * len(bl) + 110, title="Open jobs by age · label = days of backlog"), key="w_backlog")

    cw = q(f"SELECT * FROM mart_site_weekly {ui.where_region()} ORDER BY region, site_name, wk")
    if not cw.empty:
        judged = cw.assign(p50_turnaround_h=cw.p50_turnaround_h.where(cw.status != "LOW VOLUME"))
        heat = judged.pivot(index="site_name", columns="wk", values="p50_turnaround_h")
        fig = px.imshow(heat, aspect="auto", zmin=6, zmax=50,
                        color_continuous_scale=["#E0E7FF", "#A5B4FC", "#FCD34D", "#FB7185", "#9F1239"],
                        labels=dict(color="Median h", x="", y=""))
        with st.container(border=True):
            chart(style(fig, 26 * len(heat) + 100, legend=False, title="Weekly turnaround heatmap (red = drifting from network)"),
                  key="w_heat")


# ============================================================================== Fleet & assets
def fleet_assets():
    cur = ui.setting("currency", "USD")
    v = q(f"""SELECT powertrain, count(*) vehicles, avg(days_in_service) / 365.25 yrs,
                     sum(purchase_cost) cost, sum(book_value) bv
              FROM stg_vehicles WHERE is_active {ui.where_region(prefix='AND')} GROUP BY 1 ORDER BY 2 DESC""")
    ui.hero("Fleet & Assets", "Fleet mix, time in service, value and cost per km",
            "Electric, hybrid and combustion side by side: what each costs to run, and what it is worth today.")
    if v.empty:
        return
    n, yrs = v.vehicles.sum(), (v.yrs * v.vehicles).sum() / v.vehicles.sum()
    av = q(f"""SELECT month_start, sum(book_value_end) bv, sum(book_value_start - book_value_end) dep, sum(purchase_cost) cost
               FROM int_vehicle_months {ui.where_region()} GROUP BY 1 ORDER BY 1""")
    m = st.columns(4)
    with m[0]:
        ui.metric("Active fleet", n, "{:,.0f}")
    with m[1]:
        ui.metric("Average time in service", yrs, "{:.2f} yrs")
    with m[2]:
        ui.metric("Book value", v.bv.sum() / 1e6, cur + " {:,.1f}M", av.bv / 1e6, delta_fmt="{:+,.1f}M")
    with m[3]:
        ui.metric("Value retained", 100 * v.bv.sum() / v.cost.sum(), "{:.1f}%", 100 * av.bv / av.cost,
                  help="Book value ÷ acquisition cost")

    a, b, c = st.columns([1.1, 1.6, 1.6], gap="medium")
    with a, st.container(border=True):
        names = [ui.POWERTRAIN_NAME.get(p, p) for p in v.powertrain]
        ev = chart(ui.donut(names, v.vehicles, [ui.POWERTRAIN.get(p) for p in v.powertrain], f"{n:,}", "vehicles"),
                   key="f_mix", select=True)
    picked = None
    try:
        if ev and ev.selection and ev.selection.points:
            lbl = ev.selection.points[0].get("label")
            picked = next((k for k, nm in ui.POWERTRAIN_NAME.items() if nm == lbl), None)
    except Exception:
        picked = None
    with b, st.container(border=True):
        ts = q(f"""SELECT powertrain,
                     CASE WHEN days_in_service < 180 THEN '0-6 months' WHEN days_in_service < 365 THEN '6-12 months'
                          WHEN days_in_service < 730 THEN '1-2 years' WHEN days_in_service < 1095 THEN '2-3 years' ELSE '3+ years' END band,
                     CASE WHEN days_in_service < 180 THEN 1 WHEN days_in_service < 365 THEN 2 WHEN days_in_service < 730 THEN 3
                          WHEN days_in_service < 1095 THEN 4 ELSE 5 END o, count(*) vehicles
                   FROM stg_vehicles WHERE is_active {ui.where_region(prefix='AND')} GROUP BY ALL ORDER BY o""")
        if picked:
            ts = ts[ts.powertrain == picked]
        fig = px.bar(ts, x="band", y="vehicles", color="powertrain", color_discrete_map=ui.POWERTRAIN)
        fig.update_traces(marker_cornerradius=4)
        chart(style(fig, 280, title="Time in service" + (f" · {ui.POWERTRAIN_NAME[picked]}" if picked else "")), key="f_tis")
    with c, st.container(border=True):
        fig = go.Figure()
        fig.add_bar(x=av.month_start, y=av.dep / 1e6, name="Depreciation / month (right)", yaxis="y2",
                    marker=dict(color="rgba(244,63,94,.35)", cornerradius=3))
        fig.add_scatter(x=av.month_start, y=av.bv / 1e6, name="Book value", fill="tozeroy", mode="lines",
                        line=dict(color=ui.ACCENT, width=3, shape="spline"), fillcolor="rgba(99,102,241,.18)")
        fig.update_layout(yaxis2=dict(overlaying="y", side="right", showgrid=False, tickformat=".1f",
                                      range=[0, max(av.dep.max() / 1e6, 0.1) * 3]))
        chart(style(fig, 280, title=f"Book value and depreciation ({cur} M)"), key="f_value")
    st.caption("Click a slice of the fleet-mix donut to filter time in service by powertrain.")

    pt = q("SELECT * FROM mart_powertrain_kpis")
    a, b, c = st.columns([1.5, 1, 1.5], gap="medium")
    with a, st.container(border=True):
        long = pt.melt(id_vars="powertrain", value_vars=["energy_cost_per_km", "maintenance_cost_per_km", "depreciation_per_km"],
                       var_name="component", value_name="per_km")
        long["component"] = long.component.map({"energy_cost_per_km": "Energy", "maintenance_cost_per_km": "Maintenance",
                                                "depreciation_per_km": "Depreciation"})
        fig = px.bar(long, x="per_km", y="powertrain", color="component", orientation="h",
                     color_discrete_sequence=[ui.ACCENT, "#06B6D4", "#CBD5E1"])
        fig.update_traces(marker_cornerradius=4)
        chart(style(fig, 280, title=f"All-in cost per km ({cur})"), key="f_tco")
    with b, st.container(border=True):
        fig = go.Figure(go.Bar(x=pt.powertrain, y=pt.co2_g_per_km, text=[f"{x:.0f}" for x in pt.co2_g_per_km],
                               marker=dict(color=[ui.POWERTRAIN.get(p) for p in pt.powertrain], cornerradius=6),
                               textposition="outside"))
        chart(style(fig, 280, legend=False, title="CO₂ g/km"), key="f_co2")
    with c, st.container(border=True):
        en = q("SELECT * FROM mart_energy_monthly ORDER BY month_start")
        fig = px.line(en, x="month_start", y="energy_cost_per_km", color="powertrain", line_shape="spline",
                      color_discrete_map=ui.POWERTRAIN)
        chart(style(fig, 280, title=f"Energy cost per km ({cur}), monthly"), key="f_energy")

    cm = q(f"SELECT * FROM mart_cost_monthly {ui.where_region()} ORDER BY month_start")
    if not cm.empty:
        grid = cm.pivot(index="region", columns="month_start", values="cost_vs_budget_pct")
        fig = px.imshow(grid, aspect="auto", text_auto=".0f", zmin=-25, zmax=25,
                        color_continuous_scale=["#10B981", "#A7F3D0", "#F1F5F9", "#FECDD3", "#F43F5E"],
                        labels=dict(color="% vs budget", x="", y=""))
        with st.container(border=True):
            chart(style(fig, 40 * len(grid) + 100, legend=False, title="Fleet-paid maintenance vs budget, % (SOP-06)"),
                  key="f_cost")


# ============================================================================== Compliance
def compliance():
    ui.hero("Compliance", "Registration, insurance, maintenance and recalls",
            "Every active vehicle legal to drive, insured, serviced on time and free of open recalls.")
    cs = q(f"SELECT document, status, sum(vehicles) n FROM mart_compliance_status {ui.where_region()} GROUP BY 1, 2")
    order = ["Valid", "Expiring", "Expired", "Unknown"]
    cols = st.columns(4, gap="medium")
    for i, doc in enumerate(["Registration", "Insurance"]):
        d = cs[cs.document == doc].set_index("status").reindex(order).dropna().reset_index()
        valid = d[d.status.isin(["Valid", "Expiring"])].n.sum()
        known = d[d.status != "Unknown"].n.sum()
        with cols[i * 2], st.container(border=True):
            chart(ui.donut(d.status, d.n, [ui.DOC[s] for s in d.status], f"{100 * valid / max(known, 1):.1f}%",
                           f"{doc.lower()} valid"), key=f"cp_d_{doc}")
        with cols[i * 2 + 1], st.container(border=True):
            exp = int(d[d.status == "Expired"].n.sum())
            soon = int(d[d.status == "Expiring"].n.sum())
            st.html(f'<div style="padding:8px 4px"><div class="fk-muted">{doc}</div>'
                    f'<div class="fk-big" style="color:{ui.BAD}">{exp:,}</div>'
                    f'<div class="fk-muted">expired: ground until renewed</div>'
                    f'<div class="fk-big" style="color:{ui.WARN};margin-top:10px">{soon:,}</div>'
                    f'<div class="fk-muted">expiring in {ui.setting("expiring_window_days")} days (SOP-07)</div></div>')

    a, b = st.columns([3, 2], gap="medium")
    with a, st.container(border=True):
        cal = q(f"SELECT * FROM mart_compliance_calendar ORDER BY wk")
        if not cal.empty:
            cal["when"] = [("Overdue" if o else w.strftime("%d %b")) for o, w in zip(cal.overdue, pd.to_datetime(cal.wk))]
            weeks = ["Overdue"] + [w.strftime("%d %b") for w in sorted(pd.to_datetime(cal[~cal.overdue].wk).unique())]
            fig = px.bar(cal, x="when", y="vehicles", color="document", barmode="group",
                         color_discrete_map={"Registration": ui.ACCENT, "Insurance": "#06B6D4"},
                         category_orders={"when": weeks})
            fig.update_traces(marker_cornerradius=4)
            style(fig, 320, title="Renewal calendar: overdue and next 13 weeks")
            fig.update_layout(legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                              margin=dict(l=4, r=4, t=56, b=4))
            fig.update_xaxes(tickangle=-45, tickfont=dict(size=10))
            chart(fig, key="cp_cal")
    with b, st.container(border=True):
        ex = q(f"SELECT vehicle_id, region, document, status, expiry_date, days_left, insurer "
               f"FROM mart_compliance_expiring {ui.where_region()}")
        st.markdown(f"**Action list** · {len(ex):,} vehicles")
        st.dataframe(ex, hide_index=True, use_container_width=True, height=280,
                     column_config={"days_left": st.column_config.NumberColumn("Days left", format="%d"),
                                    "expiry_date": st.column_config.DateColumn("Expiry")})

    a, b = st.columns(2, gap="medium")
    with a, st.container(border=True):
        pm = q(f"""SELECT powertrain, sum(vehicles - overdue - due_soon) ok, sum(due_soon) due_soon, sum(overdue) overdue
                   FROM mart_pm_compliance {ui.where_region()} GROUP BY 1 ORDER BY 1""")
        fig = go.Figure()
        for c, lbl, col in [("ok", "On schedule", ui.GOOD), ("due_soon", "Due soon", ui.WARN), ("overdue", "Overdue", ui.BAD)]:
            fig.add_bar(y=pm.powertrain, x=pm[c], name=lbl, orientation="h", marker=dict(color=col))
        fig.update_layout(barmode="stack", barnorm="percent")
        chart(style(fig, 260, title="Preventive maintenance by powertrain, % of vehicles (SOP-05)"), key="cp_pm")
    with b, st.container(border=True):
        rc = q(f"SELECT * FROM mart_recall_completion {ui.where_region()}")
        if rc.empty:
            st.info("No recall data supplied.")
        else:
            fig = px.bar(rc, x="region", y="completion_pct", color="campaign_id", barmode="group",
                         hover_data=["affected_vehicles", "completed_vehicles", "median_days_to_fix"])
            fig.update_traces(marker_cornerradius=4)
            tg = ui.targets().get("recall_completion_pct")
            if tg is not None:
                fig.add_hline(y=tg.green, line_dash="dot", line_color=ui.GOOD)
            fig.update_yaxes(range=[0, 115])
            chart(style(fig, 260, title="Recall completion by region (SOP-04)"), key="cp_recall")


# ============================================================================== Pipeline
STATUS_COL = {"ok": ui.GOOD, "warning": ui.WARN, "blocked": ui.BAD, "failed": ui.BAD, "skipped": ui.NA}
LAYER_COL = {"source": "#94A3B8", "staging": "#06B6D4", "intermediate": "#8B5CF6", "marts": "#6366F1"}


def _as_list(x) -> list:
    return [] if x is None or (isinstance(x, float) and pd.isna(x)) else list(x)


def pipeline():
    runs = q("SELECT * FROM pipeline_runs ORDER BY step")
    models = q("SELECT * FROM pipeline_models")
    tests = q("SELECT * FROM pipeline_tests")
    issues = q("SELECT * FROM validation_issues")
    rules = len(sqlrunner.discover("validation"))
    if runs.empty:
        st.info("No build yet.")
        return
    built = runs.built_at.iloc[0]
    passed = int((tests.status == "pass").sum()) if not tests.empty else 0
    n_err = int((issues.severity == "error").sum()) if not issues.empty else 0
    n_warn = int((issues.severity == "warning").sum()) if not issues.empty else 0
    ui.hero("Pipeline", "From your files to every number",
            f"Last build {built:%d %b %Y %H:%M} · snapshot {ui.setting('snapshot_ts')[:10]} · total {runs.seconds.sum():.2f}s",
            [("Stages", f"{(runs.status == 'ok').sum()}/{len(runs)} green", ui.GOOD if (runs.status == 'ok').all() else ui.WARN),
             ("SQL models", f"{len(models)}", ui.ACCENT),
             ("SQL tests", f"{passed}/{len(tests)} passing", ui.GOOD if passed == len(tests) else ui.BAD),
             ("Validation rules", f"{rules}", "#06B6D4"), ("Data issues", f"{n_err} errors · {n_warn} warnings", None)])

    cols = st.columns(len(runs), gap="small")
    for col, r in zip(cols, runs.itertuples()):
        with col:
            st.html(f'<div class="fk-stage" style="--c:{STATUS_COL.get(r.status, ui.NA)}">'
                    f'<div class="n">{r.step:02d} · {r.seconds:.2f}s</div><div class="t">{ui.esc(r.stage)}</div>'
                    f'<div class="d">{ui.esc(r.detail)}</div></div>')
    _, c2 = st.columns([5, 1])
    if c2.button("Run pipeline", icon=":material/play_arrow:", use_container_width=True, type="primary"):
        from fleetkpi import build as build_mod
        with st.spinner("Running all eight stages…"):
            res = build_mod.run(ui.cfg())
        ui.reload()
        (st.toast if res.ok else st.error)("Pipeline complete" if res.ok else "Pipeline stopped: see the stage cards")
        st.rerun()

    t_dag, t_models, t_tests, t_valid, t_contract = st.tabs(["Lineage", "Models", "SQL tests", "Validation", "Data contract"])
    with t_dag:
        layer = st.segmented_control("Layer", ["All", "staging", "intermediate", "marts"], default="All", key="dag_layer")
        t = ui.tokens()
        dot = ['digraph G { rankdir=LR; bgcolor="transparent"; nodesep=0.12; ranksep=0.9;',
               'node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=9, penwidth=0, fontcolor="#FFFFFF", height=0.28];',
               f'edge [color="{t["edge"]}", arrowsize=0.5, penwidth=0.6];']
        shown = models if layer in (None, "All") else models[models.layer == layer]
        names = set(shown.model)
        layer_of = dict(zip(models.model, models.layer))
        for s in sorted({s for ss in shown.sources for s in _as_list(ss)}):
            dot.append(f'"{s}" [fillcolor="{LAYER_COL["source"]}"];')
        for m in shown.itertuples():
            dot.append(f'"{m.model}" [fillcolor="{LAYER_COL[m.layer]}"];')
            for s in _as_list(m.sources):
                dot.append(f'"{s}" -> "{m.model}";')
            for d in _as_list(m.deps):
                if d not in names:
                    dot.append(f'"{d}" [fillcolor="{LAYER_COL[layer_of[d]]}", style="rounded,filled,dashed"];')
                dot.append(f'"{d}" -> "{m.model}";')
        dot.append("}")
        st.graphviz_chart("\n".join(dot), use_container_width=True)
        st.html('<div class="fk-chips">' + "".join(
            f'<span class="fk-chip"><span class="fk-dot" style="background:{c}"></span>{k}</span>'
            for k, c in LAYER_COL.items()) + "</div>")
    with t_models:
        a, b = st.columns([2, 3], gap="medium")
        with a, st.container(border=True):
            agg = models.groupby("layer", as_index=False).agg(n=("model", "count"))
            agg = agg.set_index("layer").reindex(["staging", "intermediate", "marts"]).reset_index()
            fig = go.Figure(go.Bar(x=agg.layer, y=agg.n, text=agg.n, textposition="outside",
                                   marker=dict(color=[LAYER_COL[l] for l in agg.layer], cornerradius=6)))
            chart(style(fig, 220, legend=False, title="Models per layer"), key="p_layers")
            slow = models.sort_values("seconds", ascending=False).head(8)
            fig = go.Figure(go.Bar(x=slow.seconds, y=slow.model, orientation="h",
                                   marker=dict(color=[LAYER_COL[l] for l in slow.layer], cornerradius=4)))
            fig.update_yaxes(autorange="reversed")
            chart(style(fig, 260, legend=False, title="Slowest models (seconds)"), key="p_slow")
        with b, st.container(border=True):
            st.dataframe(models[["model", "layer", "materialized", "n_rows", "seconds", "description"]], hide_index=True,
                         use_container_width=True, height=300,
                         column_config={"n_rows": st.column_config.NumberColumn("Rows", format="%d"),
                                        "seconds": st.column_config.NumberColumn("s", format="%.3f")})
            pick = st.selectbox("View model SQL", list(models.model), key="p_sql")
            f = next((m for m in sqlrunner.discover("models") if m.name == pick), None)
            if f:
                st.code(f.path.read_text(), language="sql")
    with t_tests:
        a, b = st.columns([1, 2], gap="medium")
        with a, st.container(border=True):
            cnt = tests.status.value_counts()
            chart(ui.donut(list(cnt.index), list(cnt.values),
                           [{"pass": ui.GOOD, "warn": ui.WARN}.get(s, ui.BAD) for s in cnt.index],
                           f"{passed}/{len(tests)}", "passing"), key="p_tests")
        with b, st.container(border=True):
            st.dataframe(tests, hide_index=True, use_container_width=True, height=300)
            pick = st.selectbox("View test SQL", list(tests.test), key="p_test_sql")
            f = next((m for m in sqlrunner.discover("tests") if m.name == pick), None)
            if f:
                st.code(f.path.read_text(), language="sql")
    with t_valid:
        st.caption(f"{rules} row-level rules in `sql/validation/` plus contract checks (required tables, columns, types). "
                   "Errors block publishing; warnings do not.")
        if issues.empty:
            st.success("No data-quality findings.")
        else:
            st.dataframe(issues, hide_index=True, use_container_width=True)
        rl = pd.DataFrame([{"rule": f.name, "table": f.meta.get("table"), "severity": f.meta.get("severity"),
                            "description": f.meta.get("description")} for f in sqlrunner.discover("validation")])
        st.dataframe(rl, hide_index=True, use_container_width=True, height=300)
    with t_contract:
        il = q("SELECT * FROM ingest_log")
        il["columns"] = il.mapped.map(lambda m: len(json.loads(m or "{}")))
        il["renamed"] = il.mapped.map(lambda m: ", ".join(f"{v}→{k}" for k, v in json.loads(m or "{}").items() if k != v) or "–")
        fig = go.Figure(go.Bar(x=il.table_name, y=il.n_rows.clip(lower=1),
                               marker=dict(color=[ui.ACCENT if s else ui.NA for s in il.source], cornerradius=6),
                               text=[f"{n:,}" if s else "not supplied" for n, s in zip(il.n_rows, il.source)],
                               textposition="outside"))
        fig.update_yaxes(type="log")
        chart(style(fig, 260, legend=False, title="Rows loaded per contract table (log scale)"), key="p_rows")
        st.dataframe(il[["table_name", "source", "n_rows", "columns", "renamed"]], hide_index=True, use_container_width=True)


# ================================================================================== SOPs
def _load_sops():
    out = []
    for p in sorted(ui.sops_dir().glob("SOP-*.md")):
        text = p.read_text()
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
        meta, body = (yaml.safe_load(m.group(1)), m.group(2)) if m else ({"id": p.stem, "title": p.stem}, text)
        out.append((meta, body))
    return out


def _triggers() -> dict[str, list[str]]:
    trig: dict[str, list[str]] = {"SOP-02": ["Weekly review: every Monday"]}
    f = q("""SELECT site_name, count(*) n FROM mart_site_weekly WHERE status = 'INTERVENE'
             AND wk > (SELECT max(wk) FROM mart_site_weekly) - INTERVAL 4 WEEK GROUP BY 1""")
    if not f.empty:
        trig["SOP-03"] = [f"{r.site_name}: INTERVENE in {r.n} of the last 4 weeks" for r in f.itertuples()]
    sc = q("SELECT * FROM mart_exec_scorecard")
    for col, sop, label in [("pm_rag", "SOP-05", "PM compliance"), ("recall_rag", "SOP-04", "Recall completion"),
                            ("cost_rag", "SOP-06", "Cost vs budget"), ("registration_rag", "SOP-07", "Registration"),
                            ("insurance_rag", "SOP-07", "Insurance"), ("low_rating_rag", "SOP-08", "1-2★ share"),
                            ("csat_rag", "SOP-08", "CSAT"), ("productivity_rag", "SOP-03", "Productivity")]:
        if col in sc:
            bad = sc[sc[col].isin(["red", "amber"])].region.tolist()
            if bad:
                trig.setdefault(sop, []).append(f"{label} off target in {', '.join(bad)}")
    exp = q("SELECT count(*) n FROM mart_compliance_expiring WHERE status = 'Expired'")
    if not exp.empty and exp.n.iloc[0] > 0:
        trig.setdefault("SOP-07", []).insert(0, f"{int(exp.n.iloc[0])} vehicle documents expired")
    vi = q("SELECT count(*) n FROM validation_issues WHERE severity IN ('error','warning')")
    if not vi.empty and vi.n.iloc[0] > 0:
        trig["SOP-01"] = [f"{int(vi.n.iloc[0])} open data-quality findings"]
    return trig


def _steps(body: str) -> list[str]:
    return re.findall(r"^- \[ \] (.+)$", body, re.M)


def sops():
    trig = _triggers()
    all_sops = _load_sops()
    prog = [(m["id"], len(_steps(b)), sum(st.session_state.get(f"{m['id']}-{i}", False) for i in range(len(_steps(b)))))
            for m, b in all_sops]
    ui.hero("SOPs", "Standard operating procedures",
            "Every flag maps to a procedure with an owner, a cadence and exit criteria. Live triggers mark it Active.",
            [("Active", f"{sum(1 for m, _ in all_sops if m['id'] in trig)}/{len(all_sops)}", ui.BAD),
             ("Steps done this session", f"{sum(p[2] for p in prog)}/{sum(p[1] for p in prog)}", ui.GOOD)])
    a, b = st.columns([1, 2], gap="medium")
    with a, st.container(border=True):
        fig = go.Figure(go.Bar(y=[p[0] for p in prog], x=[100 * p[2] / max(p[1], 1) for p in prog], orientation="h",
                               marker=dict(color=[ui.BAD if p[0] in trig and p[0] != "SOP-02" else ui.ACCENT for p in prog],
                                           cornerradius=5),
                               text=[f"{p[2]}/{p[1]}" for p in prog], textposition="outside"))
        fig.update_xaxes(range=[0, 120], showticklabels=False)
        fig.update_yaxes(autorange="reversed")
        chart(style(fig, 340, legend=False, title="Progress · red = live trigger"), key="s_prog")
    with b:
        options = [f"{m['id']} · {m['title']}" + ("  ●" if m["id"] in trig else "") for m, _ in all_sops]
        first = next((i for i, (m, _) in enumerate(all_sops) if m["id"] in trig and m["id"] != "SOP-02"), 0)
        sel = st.selectbox("Procedure", options, index=first, key="s_pick")
        meta, body = all_sops[options.index(sel)]
        sid = meta["id"]
        with st.container(border=True):
            chips = [(t, ui.BAD) for t in trig.get(sid, [])]
            chips += [(f"{k}: {meta.get(k.lower(), '–')}", None) for k in ["Owner", "Cadence", "Page"]]
            st.html('<div class="fk-chips">' + "".join(
                f'<span class="fk-chip">{f"<span class=fk-dot style=background:{c}></span>" if c else ""}{ui.esc(t)}</span>'
                for t, c in chips) + "</div>")
            purpose = re.search(r"## Purpose\n(.+?)\n\n", body, re.S)
            if purpose:
                st.markdown(purpose.group(1))
            steps = _steps(body)
            for i, s in enumerate(steps):
                st.checkbox(s, key=f"{sid}-{i}")
            done = sum(st.session_state.get(f"{sid}-{i}", False) for i in range(len(steps)))
            st.progress(done / max(len(steps), 1), text=f"{done} of {len(steps)} steps")
            if steps and done == len(steps):
                st.success(f"{sid} complete: record the outcome and owner in your action log.")
            for sec in ("Exit criteria", "Escalation"):
                m = re.search(rf"## {sec}\n(.+?)(\n\n|$)", body, re.S)
                if m:
                    st.markdown(f"**{sec}** · {m.group(1)}")
