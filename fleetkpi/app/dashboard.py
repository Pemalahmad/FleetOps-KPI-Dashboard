"""fleetkpi dashboard entry point.  Run with:  fleetkpi serve"""
import streamlit as st

from fleetkpi.app import ui, views

st.set_page_config(page_title="Fleet Ops", page_icon=":material/local_shipping:", layout="wide")
st.html(ui.CSS)

pages = [
    st.Page(views.command_center, title="Command Center", icon=":material/space_dashboard:", url_path="command-center", default=True),
    st.Page(views.leaderboard, title="Leaderboard", icon=":material/military_tech:", url_path="leaderboard"),
    st.Page(views.service_network, title="Service Network", icon=":material/build:", url_path="service-network"),
    st.Page(views.energy_tco, title="Energy & TCO", icon=":material/bolt:", url_path="energy-tco"),
    st.Page(views.recalls_cost, title="Recalls & Cost", icon=":material/fact_check:", url_path="recalls-cost"),
    st.Page(views.pipeline, title="Pipeline", icon=":material/account_tree:", url_path="pipeline"),
    st.Page(views.sops, title="SOPs", icon=":material/checklist:", url_path="sops"),
]
nav = st.navigation({"Operate": pages[:5], "Govern": pages[5:]})

with st.sidebar:
    st.caption(ui.setting("fleet_name", "Fleet"))
    snap = ui.setting("snapshot_ts", "")
    st.caption(f"Snapshot {snap[:10]}" if snap else "")
    if st.button("Reload data", icon=":material/sync:", use_container_width=True):
        ui.reload()
        st.rerun()

nav.run()
