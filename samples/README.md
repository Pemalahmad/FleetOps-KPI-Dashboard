# Sample files

Try FleetOps without your own data. Everything here is invented: the company, plates, VINs and the card.

| File | Use it on | What it shows |
|---|---|---|
| [`fleet-vehicles.xlsx`](fleet-vehicles.xlsx) | **Import** | A real-world-style vehicle list: title rows above the header, local column names (Chassis No, Mulkiya Expiry, Specs), `dd/mm/yyyy` dates, fuel written five different ways. 12 vehicles, with one expired registration, one insurance renewal due, one VIN that fails the check, one VIN missing and one fuel type blank. |
| [`registration-card-sample.png`](registration-card-sample.png) | **Documents** | A fictional registration card marked SPECIMEN. It is read in the browser, matched to vehicle FJ-002 by its VIN, and after you confirm it the vehicle's registration moves from expired to valid. |

1. Open the [live app](https://pemalahmad.github.io/FleetOps-KPI-Dashboard/import/) (or the offline package).
2. **Import:** drop `fleet-vehicles.xlsx`, check the mapping, click **Add to my fleet and build**.
3. **Fleet register:** 12 vehicles, each with one next action.
4. **Documents:** drop `registration-card-sample.png`, check the fields, click **Confirm**. FJ-002 is no longer grounded.

To start again, use **Delete my fleet data from this browser** on the Import page.
