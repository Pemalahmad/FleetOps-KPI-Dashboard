"""fleetkpi dashboard entry point.  Run with:  fleetkpi serve"""
import streamlit as st

from fleetkpi.app import ui, views

st.set_page_config(page_title="Fleet Ops", page_icon=":material/electric_car:", layout="wide")
st.html(ui.css())

pages = {
    "Operate": [
        st.Page(views.overview, title="Overview", icon=":material/space_dashboard:", default=True),
        st.Page(views.customer, title="Customer", icon=":material/sentiment_satisfied:", url_path="customer"),
        st.Page(views.workshop, title="Workshop", icon=":material/build:", url_path="workshop"),
        st.Page(views.fleet_assets, title="Fleet & Assets", icon=":material/directions_car:", url_path="fleet-assets"),
        st.Page(views.compliance, title="Compliance", icon=":material/verified_user:", url_path="compliance"),
    ],
    "Govern": [
        st.Page(views.pipeline, title="Pipeline", icon=":material/account_tree:", url_path="pipeline"),
        st.Page(views.sops, title="SOPs", icon=":material/checklist:", url_path="sops"),
    ],
}
nav = st.navigation(pages)

with st.sidebar:
    st.markdown(f"**{ui.setting('fleet_name', 'Fleet')}**")
    st.caption(f"Snapshot {ui.setting('snapshot_ts', '')[:10]} · {ui.setting('currency', '')}")
    regions = ui.q("SELECT DISTINCT region FROM mart_exec_scorecard ORDER BY 1")
    st.pills("Region", ["All regions"] + (list(regions.region) if not regions.empty else []),
             selection_mode="single", default="All regions", key="region")
    st.caption("Theme: ⋮ menu (top right) → System · Light · Dark")
    if st.button("Reload data", icon=":material/sync:", use_container_width=True):
        ui.reload()
        st.rerun()

nav.run()
