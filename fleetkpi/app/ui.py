"""Design layer: data access, theme-aware tokens, chart styling and reusable visual components.

Light and dark come from Streamlit's theme (Settings → Theme). Charts use theme="streamlit" so
axes and backgrounds follow it; the few custom HTML pieces read st.context.theme.type."""
from __future__ import annotations

import html
import os
from pathlib import Path

import duckdb
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from fleetkpi import config as config_mod

# --- semantic colours (work on light and dark backgrounds) ---------------------------------
ACCENT = "#6366F1"
GOOD, WARN, BAD, NA = "#10B981", "#F59E0B", "#F43F5E", "#94A3B8"
RAG = {"green": GOOD, "amber": WARN, "red": BAD, "n/a": NA}
POWERTRAIN = {"BEV": "#6366F1", "PHEV": "#06B6D4", "HEV": "#10B981", "ICE": "#94A3B8"}
POWERTRAIN_NAME = {"BEV": "Electric", "PHEV": "Plug-in hybrid", "HEV": "Hybrid", "ICE": "Combustion"}
TIER = {"Platinum": "#8B5CF6", "Gold": "#F59E0B", "Silver": "#64748B", "Bronze": "#C2410C"}
DOC = {"Valid": GOOD, "Expiring": WARN, "Expired": BAD, "Unknown": NA}
STATUS = {"OK": GOOD, "WATCH": WARN, "INTERVENE": BAD, "LOW VOLUME": NA}
STARS = {5: "#10B981", 4: "#84CC16", 3: "#F59E0B", 2: "#F97316", 1: "#F43F5E"}


def dark() -> bool:
    try:
        return st.context.theme.type == "dark"
    except Exception:
        return False


def tokens() -> dict:
    """Theme-agnostic tokens: every custom surface is a tint of the current text colour, so the same CSS
    reads correctly in light and dark and follows a theme switch instantly (no reload)."""
    mix = lambda pct: f"color-mix(in srgb, currentColor {pct}%, transparent)"  # noqa: E731
    return dict(surface=mix(3), surface2=mix(6), border=mix(12), text="inherit", muted=mix(60),
                glow="rgba(99,102,241,.16)", grid="rgba(128,128,128,.16)", edge="#8A94AD")


def css() -> str:
    t = tokens()
    return f"""<style>
.block-container {{ padding-top: 3.2rem; padding-bottom: 3rem; max-width: 1480px; }}
h1, h2, h3 {{ letter-spacing: -0.025em; }}
[data-testid="stMetric"] {{ transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; }}
[data-testid="stMetric"]:hover {{ transform: translateY(-2px); box-shadow: 0 8px 24px {t['glow']}; }}
[data-testid="stMetricLabel"] p {{ font-size: .8rem; opacity: .7; font-weight: 500; }}
.fk-hero {{ border-radius: 18px; padding: 22px 26px; margin-bottom: 14px; border: 1px solid {t['border']};
  background: radial-gradient(1100px 260px at 0% 0%, rgba(99,102,241,.16), transparent 60%),
              radial-gradient(800px 240px at 100% 0%, rgba(6,182,212,.12), transparent 60%), {t['surface']}; }}
.fk-hero h1 {{ font-size: 1.65rem; margin: 2px 0 4px; font-weight: 700; }}
.fk-eyebrow {{ font-size: .7rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: {ACCENT}; }}
.fk-sub {{ color: {t['muted']}; font-size: .9rem; margin: 0; }}
.fk-chips {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }}
.fk-chip {{ font-size: .75rem; padding: 4px 10px; border-radius: 999px; border: 1px solid {t['border']};
  background: {t['surface2']}; font-variant-numeric: tabular-nums; white-space: nowrap; }}
.fk-chip b {{ font-weight: 650; }}
.fk-dot {{ display: inline-block; width: 7px; height: 7px; border-radius: 99px; margin-right: 6px; vertical-align: 1px; }}
.fk-card {{ border-radius: 16px; padding: 16px 18px; border: 1px solid {t['border']}; background: {t['surface']};
  transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; height: 100%; }}
.fk-card:hover {{ transform: translateY(-2px); box-shadow: 0 10px 28px {t['glow']}; }}
.fk-muted {{ color: {t['muted']}; font-size: .78rem; }}
.fk-big {{ font-size: 2rem; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }}
.fk-rank {{ font-size: 2.4rem; font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, {ACCENT}, #06B6D4); -webkit-background-clip: text; background-clip: text; color: transparent; }}
.fk-badge {{ display: inline-block; font-size: .68rem; padding: 2px 8px; border-radius: 6px; margin: 4px 4px 0 0;
  background: {t['surface2']}; border: 1px solid {t['border']}; }}
.fk-bar {{ height: 6px; border-radius: 99px; background: {t['surface2']}; overflow: hidden; margin-top: 10px; }}
.fk-bar > span {{ display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, {ACCENT}, #06B6D4);
  transform-origin: left; animation: fk-grow .7s cubic-bezier(.22,1,.36,1) both; }}
@keyframes fk-grow {{ from {{ transform: scaleX(0); }} to {{ transform: scaleX(1); }} }}
.fk-stage {{ border-radius: 14px; padding: 12px 14px; border: 1px solid {t['border']}; background: {t['surface']};
  position: relative; overflow: hidden; height: 100%; }}
.fk-stage::before {{ content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--c); }}
.fk-stage .n {{ font-size: .65rem; letter-spacing: .1em; color: {t['muted']}; font-weight: 600; }}
.fk-stage .t {{ font-weight: 650; font-size: .95rem; margin: 2px 0; }}
.fk-stage .d {{ font-size: .72rem; color: {t['muted']}; line-height: 1.35; }}
@media (prefers-reduced-motion: reduce) {{ .fk-card, [data-testid="stMetric"], .fk-bar > span {{ transition: none; animation: none; }} }}
</style>"""


# --- data ---------------------------------------------------------------------------------------
@st.cache_resource
def cfg():
    return config_mod.load(os.environ.get("FLEETKPI_CONFIG", "fleet.yml"))


@st.cache_resource
def connection() -> duckdb.DuckDBPyConnection:
    db = cfg().database
    if not db.exists():
        st.error("No warehouse yet. Run `fleetkpi build` (or `fleetkpi demo`) first, then reload.")
        st.stop()
    return duckdb.connect(str(db), read_only=True)


@st.cache_data(show_spinner=False)
def q(sql: str) -> pd.DataFrame:
    try:
        return connection().execute(sql).df()
    except duckdb.Error:
        return pd.DataFrame()


def setting(key: str, default: str = "") -> str:
    df = q(f"SELECT value FROM cfg_settings WHERE key = '{key}'")
    return df.iloc[0, 0] if not df.empty else default


def targets() -> dict:
    df = q("SELECT * FROM cfg_targets")
    return {r.kpi: r for r in df.itertuples()}


def reload() -> None:
    st.cache_data.clear()
    st.cache_resource.clear()


# --- global region filter ----------------------------------------------------------------------
def region() -> str | None:
    r = st.session_state.get("region")
    return None if r in (None, "All regions") else r


def where_region(col: str = "region", prefix: str = "WHERE") -> str:
    r = region()
    return f"{prefix} {col} = '{r.replace(chr(39), chr(39) * 2)}'" if r else ""


# --- layout pieces -----------------------------------------------------------------------------
def esc(x) -> str:
    return html.escape(str(x))


def hero(eyebrow: str, title: str, sub: str = "", chips: list[tuple[str, str, str | None]] | None = None) -> None:
    chip_html = ""
    if chips:
        chip_html = '<div class="fk-chips">' + "".join(
            f'<span class="fk-chip">{f"<span class=fk-dot style=background:{c}></span>" if c else ""}'
            f'{esc(label)} <b>{value}</b></span>' for label, value, c in chips) + "</div>"
    st.html(f'<div class="fk-hero"><div class="fk-eyebrow">{esc(eyebrow)}</div><h1>{esc(title)}</h1>'
            f'<p class="fk-sub">{sub}</p>{chip_html}</div>')


def style(fig: go.Figure, height: int = 340, legend: bool = True, title: str | None = None) -> go.Figure:
    t = tokens()
    fig.update_layout(
        height=height, margin=dict(l=4, r=4, t=44 if title else 12, b=4),
        title=dict(text=title, font=dict(size=14), x=0, xanchor="left") if title else None,
        font=dict(family="Inter, sans-serif", size=12),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        hoverlabel=dict(font=dict(family="Inter, sans-serif")),
        showlegend=legend,
        legend=dict(orientation="h", yanchor="bottom", y=1.0, x=0, title=None, bgcolor="rgba(0,0,0,0)"),
        bargap=0.28,
    )
    if title and legend:
        # title on top, legend underneath: never let them collide
        fig.update_layout(legend=dict(orientation="h", yanchor="top", y=-0.14, x=0, title=None,
                                      bgcolor="rgba(0,0,0,0)"),
                          margin=dict(l=4, r=4, t=48, b=46))
    for tr in fig.data:
        if tr.type == "bar":
            tr.cliponaxis = False          # value labels may sit outside the plot area
    fig.update_xaxes(showgrid=False, zeroline=False, title=None)
    fig.update_yaxes(gridcolor=t["grid"], zeroline=False, title=None)
    return fig


def chart(fig: go.Figure, key: str | None = None, select: bool = False):
    kw = dict(use_container_width=True, theme="streamlit", config={"displayModeBar": False})
    if select:
        return st.plotly_chart(fig, key=key, on_select="rerun", selection_mode="points", **kw)
    st.plotly_chart(fig, key=key, **kw)
    return None


def gauge(value, title: str, kpi: str | None = None, rng: tuple[float, float] = (0, 100),
          suffix: str = "%", decimals: int = 1, height: int = 210) -> go.Figure:
    tg = targets().get(kpi) if kpi else None
    steps = []
    if tg is not None:
        lo, hi = rng
        if tg.direction == "higher":
            steps = [dict(range=[lo, tg.amber], color="rgba(244,63,94,.18)"),
                     dict(range=[tg.amber, tg.green], color="rgba(245,158,11,.18)"),
                     dict(range=[tg.green, hi], color="rgba(16,185,129,.18)")]
        else:
            steps = [dict(range=[lo, tg.green], color="rgba(16,185,129,.18)"),
                     dict(range=[tg.green, tg.amber], color="rgba(245,158,11,.18)"),
                     dict(range=[tg.amber, hi], color="rgba(244,63,94,.18)")]
    fig = go.Figure(go.Indicator(
        mode="gauge+number", value=None if value is None or pd.isna(value) else float(value),
        number=dict(suffix=suffix, valueformat=f".{decimals}f", font=dict(size=30)),
        title=dict(text=title, font=dict(size=13)),
        gauge=dict(axis=dict(range=list(rng), tickwidth=0, tickfont=dict(size=10)),
                   bar=dict(color=ACCENT, thickness=0.28), borderwidth=0, steps=steps,
                   threshold=dict(line=dict(color="#94A3B8", width=2), thickness=0.8,
                                  value=tg.green) if tg is not None else None)))
    fig.update_layout(height=height, margin=dict(l=34, r=34, t=46, b=6), paper_bgcolor="rgba(0,0,0,0)",
                      font=dict(family="Inter, sans-serif"))
    return fig


def donut(labels, values, colors, center: str, sub: str = "", height: int = 260) -> go.Figure:
    fig = go.Figure(go.Pie(labels=labels, values=values, hole=0.72, sort=False, direction="clockwise",
                           marker=dict(colors=colors, line=dict(width=0)), textinfo="none",
                           hovertemplate="%{label}: %{value:,} (%{percent})<extra></extra>"))
    fig.add_annotation(text=f"<b style='font-size:22px'>{center}</b><br><span style='font-size:11px'>{sub}</span>",
                       showarrow=False, x=0.5, y=0.5)
    fig.update_layout(height=height, margin=dict(l=0, r=0, t=6, b=0), paper_bgcolor="rgba(0,0,0,0)",
                      showlegend=True, legend=dict(orientation="h", y=-0.05, x=0.5, xanchor="center"),
                      font=dict(family="Inter, sans-serif"))
    return fig


def metric(label: str, value, fmt: str, series: pd.Series | None = None, inverse: bool = False,
           help: str | None = None, delta_fmt: str | None = None, chart_type: str = "area") -> None:
    """KPI tile: value, delta vs previous period, sparkline."""
    s = series.dropna() if series is not None else None
    delta = None
    if s is not None and len(s) >= 2:
        d = s.iloc[-1] - s.iloc[-2]
        signed = fmt if "{:+" in fmt else fmt.replace("{:", "{:+")
        delta = (delta_fmt or signed).format(d)
    st.metric(label, "–" if value is None or pd.isna(value) else fmt.format(value), delta=delta,
              delta_color="inverse" if inverse else "normal", help=help, border=True,
              chart_data=list(s.tail(12)) if s is not None and len(s) > 1 else None, chart_type=chart_type)


def card(inner: str) -> str:
    return f'<div class="fk-card">{inner}</div>'


def sops_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "sops"
