"""Shared UI: data access, design tokens and small components. Restraint first:
neutral palette, one accent, colour only for status, tabular figures for numbers."""
from __future__ import annotations

import html
import os
from pathlib import Path

import duckdb
import pandas as pd
import streamlit as st

from fleetkpi import config as config_mod

ACCENT = "#4F46E5"
STATUS = {"green": "#15803D", "amber": "#B45309", "red": "#B91C1C", "n/a": "#A1A1AA"}
STATUS_BG = {"green": "#F0FDF4", "amber": "#FFFBEB", "red": "#FEF2F2", "n/a": "#F4F4F5"}
TIER = {"Platinum": ("#334155", "#E2E8F0"), "Gold": ("#854D0E", "#FEF3C7"),
        "Silver": ("#3F3F46", "#F4F4F5"), "Bronze": ("#7C2D12", "#FFEDD5")}
SITE_STATUS = {"OK": "#15803D", "WATCH": "#B45309", "INTERVENE": "#B91C1C", "LOW VOLUME": "#A1A1AA"}
POWERTRAIN_COLORS = {"BEV": "#4F46E5", "PHEV": "#0891B2", "HEV": "#65A30D", "ICE": "#71717A"}
POWERTRAIN_NAMES = {"BEV": "Electric (BEV)", "PHEV": "Plug-in hybrid", "HEV": "Hybrid", "ICE": "Combustion (ICE)"}

CSS = f"""
<style>
:root {{ --accent: {ACCENT}; --ink: #18181B; --muted: #71717A; --line: rgba(24,24,27,.08); }}
html, body, [class*="css"] {{ -webkit-font-smoothing: antialiased; }}
h1, h2, h3 {{ letter-spacing: -0.02em; text-wrap: balance; }}
.block-container {{ padding-top: 2.2rem; max-width: 1400px; }}
.fk-num {{ font-variant-numeric: tabular-nums; }}
.fk-eyebrow {{ font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 .25rem; }}
.fk-title {{ font-size: 1.75rem; font-weight: 650; color: var(--ink); margin: 0; letter-spacing: -0.025em; }}
.fk-sub {{ color: var(--muted); font-size: .9rem; margin: .25rem 0 1.25rem; }}
.fk-grid {{ display: grid; gap: 12px; }}
.fk-card {{ background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px;
           box-shadow: 0 1px 2px rgba(24,24,27,.04); transition: transform .18s ease-out, box-shadow .18s ease-out; }}
.fk-card:hover {{ transform: translateY(-1px); box-shadow: 0 4px 14px rgba(24,24,27,.06); }}
.fk-k-label {{ font-size: .78rem; color: var(--muted); display: flex; align-items: center; gap: 6px; }}
.fk-k-value {{ font-size: 1.6rem; font-weight: 650; color: var(--ink); letter-spacing: -0.02em; margin-top: 4px;
              font-variant-numeric: tabular-nums; }}
.fk-k-foot {{ font-size: .75rem; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }}
.fk-dot {{ width: 8px; height: 8px; border-radius: 99px; display: inline-block; }}
.fk-pill {{ display: inline-block; font-size: .72rem; font-weight: 600; padding: 2px 8px; border-radius: 99px;
           letter-spacing: .01em; white-space: nowrap; }}
.fk-badge {{ display: inline-block; font-size: .7rem; padding: 2px 8px; border-radius: 6px; margin: 2px 4px 0 0;
            border: 1px solid var(--line); color: #3F3F46; background: #FAFAFA; }}
.fk-bar {{ height: 6px; background: #F4F4F5; border-radius: 99px; overflow: hidden; margin-top: 8px; }}
.fk-bar > span {{ display: block; height: 100%; border-radius: 99px; background: var(--accent);
                  transform-origin: left; animation: fk-grow .5s cubic-bezier(.22,1,.36,1) both; }}
@keyframes fk-grow {{ from {{ transform: scaleX(0); }} to {{ transform: scaleX(1); }} }}
.fk-stage {{ position: relative; }}
.fk-stage .fk-k-value {{ font-size: 1rem; }}
.fk-stage-num {{ font-size: .7rem; color: var(--muted); font-variant-numeric: tabular-nums; }}
.fk-arrow {{ color: #D4D4D8; font-size: 1.1rem; align-self: center; text-align: center; }}
.fk-row {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0;
          border-bottom: 1px solid var(--line); }}
.fk-row:last-child {{ border-bottom: 0; }}
.fk-rank {{ font-size: 1.9rem; font-weight: 700; color: #D4D4D8; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }}
.fk-up {{ color: {STATUS["green"]}; }} .fk-down {{ color: {STATUS["red"]}; }} .fk-flat {{ color: var(--muted); }}
@media (prefers-reduced-motion: reduce) {{ .fk-card, .fk-bar > span {{ transition: none; animation: none; }} }}
</style>
"""


# ------------------------------------------------------------------ data
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


def reload() -> None:
    st.cache_data.clear()
    st.cache_resource.clear()


# ------------------------------------------------------------ components
def esc(x) -> str:
    return html.escape(str(x))


def header(eyebrow: str, title: str, sub: str = "") -> None:
    st.html(f'<p class="fk-eyebrow">{esc(eyebrow)}</p><p class="fk-title">{esc(title)}</p>'
            + (f'<p class="fk-sub">{sub}</p>' if sub else ""))


def pill(text: str, fg: str, bg: str) -> str:
    return f'<span class="fk-pill" style="color:{fg};background:{bg}">{esc(text)}</span>'


def rag_pill(status: str, text: str | None = None) -> str:
    return pill(text or status, STATUS.get(status, "#71717A"), STATUS_BG.get(status, "#F4F4F5"))


def tier_pill(tier: str) -> str:
    fg, bg = TIER.get(tier, ("#3F3F46", "#F4F4F5"))
    return pill(tier, fg, bg)


def kpi_card(label: str, value: str, foot: str = "", status: str | None = None, progress: float | None = None,
             small: bool = False) -> str:
    dot = f'<span class="fk-dot" style="background:{STATUS[status]}"></span>' if status else ""
    bar = (f'<div class="fk-bar"><span style="width:{max(0, min(progress, 1)) * 100:.0f}%"></span></div>'
           if progress is not None else "")
    size = ' style="font-size:1.05rem;font-weight:600;letter-spacing:-0.01em"' if small else ""
    return (f'<div class="fk-card"><div class="fk-k-label">{dot}{esc(label)}</div>'
            f'<div class="fk-k-value"{size}>{value}</div><div class="fk-k-foot">{foot}</div>{bar}</div>')


def grid(cards: list[str], cols: int) -> None:
    st.html(f'<div class="fk-grid" style="grid-template-columns:repeat({cols},minmax(0,1fr))">{"".join(cards)}</div>')


def arrow(change) -> str:
    if change is None or pd.isna(change) or change == 0:
        return '<span class="fk-flat">–</span>'
    cls, sym = ("fk-up", "▲") if change > 0 else ("fk-down", "▼")
    return f'<span class="{cls}">{sym} {abs(int(change))}</span>'


def money(v, decimals: int = 0) -> str:
    cur = setting("currency", "USD")
    return "–" if v is None or pd.isna(v) else f"{cur} {v:,.{decimals}f}"


def plotly_defaults(fig, height: int = 340):
    fig.update_layout(height=height, margin=dict(l=0, r=0, t=40, b=10), font=dict(size=12),
                      plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
                      legend=dict(orientation="h", yanchor="top", y=-0.12, x=0, title=None),
                      title=dict(font=dict(size=14)))
    fig.update_xaxes(showgrid=False, title=None)
    fig.update_yaxes(gridcolor="rgba(24,24,27,.06)", zeroline=False)
    return fig


def sop_link(sop_id: str) -> str:
    return f'<span class="fk-badge" style="border-color:{ACCENT}33;color:{ACCENT}">{esc(sop_id)}</span>'


def empty(msg: str) -> None:
    st.info(msg, icon=":material/info:")


def sops_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "sops"
