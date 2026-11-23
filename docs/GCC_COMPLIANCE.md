# GCC compliance rules

FleetOps checks each active vehicle against the published registration, insurance, inspection and operating-card rules of
its country: the United Arab Emirates, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman. The rules live in one SQL model,
[`stg_gcc_rules`](../fleetkpi/sql/models/staging/stg_gcc_rules.sql), and are applied by
[`mart_gcc_compliance`](../fleetkpi/sql/models/marts/mart_gcc_compliance.sql). The Licence page shows the result.

**FleetOps checks the records you hold; it does not certify a vehicle.** Rules change. Confirm with the authority before
acting, and update the rules model when they change.

Rules researched on **23 November 2026**. Some official portals could not be read directly that day: Absher, Hukoomi,
e.gov.kw and TAMM blocked automated reading, and one ROP page was unavailable. Where a rule rests on a news report of an
official decision rather than the portal itself, its confidence is lowered.

## How a vehicle is judged

| Status | Meaning |
|---|---|
| **Non-compliant** | Registration, insurance or a required operating card has expired. |
| **Evidence missing** | An expiry date or a required document is not on file, so FleetOps cannot tell. |
| **Expiring** | A renewal is inside the expiring window, insurance ends before the registration where that is not allowed, or a technical inspection is due before the coming renewal. |
| **Compliant** | Every rule that applies is met on the records held. |
| **Not covered** | The vehicle's region is outside the six countries. |

A vehicle's country comes from its region (or its home site's region): a country name or a city such as Dubai, Riyadh,
Doha, Manama or Muscat. Inspection age uses the model year or the in-service date, whichever makes the vehicle older,
because the exemptions run from the earlier date.

## Rules by country

| Country | Registration | Inspection | Other | Confidence | Source |
|---|---|---|---|---|---|
| UAE | Mulkiya. Company vehicles renew yearly. Dubai: renew up to 150 days early, but early renewal runs from the renewal date. 30-day grace; traffic file blocked 2 months after expiry. | At renewal once 3 years old (new, first owner exempt for 3 years from manufacture or registration). Certificates valid 30 days. | Insurance checked at renewal. | high | [RTA](https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=582), [RTA inspection](https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=455) |
| Saudi Arabia | Istimara. Driving on an expired Istimara is a violation (January 2025). | Fahas / MVPI: first after 3 years, then yearly; taxis and public transport after 2 years. | Goods-transport, truck-leasing and private-road-transport vehicles need a TGA operating card. Compulsory third-party insurance linked in Absher. | medium | [Traffic Authority, reported](https://english.ajel.sa/news/iefv0ioza), [Road Transport Law](https://misa.gov.sa/app/uploads/2025/07/Road-Transport-Law.pdf) |
| Qatar | Istimara. | FAHES from 3 years after manufacture, then yearly; renew within 30 days of the pass report. | Insurance valid at least a year, renewed first. | medium | [FAHES](https://www.fahes.com.qa/en/service-details/periodicalinspections) |
| Kuwait | Daftar (digital copy valid). | Reported at 3 years after purchase, then 3 and 2 year intervals, at government centres since May 2026. | Registration refused on a non-compliant insurance policy (Ministerial Decision 2116/2025). | low | [Arab Times](https://www.arabtimesonline.com/news/new-rules-for-compulsory-vehicle-insurance-policies-in-kuwait) |
| Bahrain | Registration certificate, annual. Late fee 500 fils a day, capped at 20 BHD a year. | When the Traffic app says so; **no age threshold is published, so FleetOps does not apply one.** | Insurance must cover the whole registration period. | high | [bahrain.bh](https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=3195) |
| Oman | Mulkiya, private vehicles yearly. | At registration and renewal for cars and pick-ups 10 years or older, taxis, school vehicles, buses and commercial vehicles (ROP Decision 61/2024). | Insurance renewed first via the ROP app. | medium | [Oman Observer](https://www.omanobserver.om/article/1153939/oman/longer-validity-period-for-vehicle-registration) |

## Not confirmed (left out on purpose)

- Abu Dhabi registration validity, renewal window and grace period; the "insurance must cover 13 months" claim.
- Saudi Istimara validity (sources say 3 years or no expiry), renewal window and grace period.
- Qatar registration validity, renewal window and grace period.
- Kuwait registration validity, renewal window, grace period and the official inspection schedule.
- Bahrain inspection age threshold and renewal window.
- Oman renewal window (sources conflict) and grace period.
- Commercial operating permits outside Saudi Arabia, and licence classes in most countries.
- UAE Cabinet Decision 174 of 2026 (from 1 January 2027: company vehicles keep 1-year registration): read in news reports, not the gazette.

## Changing a rule

Edit `stg_gcc_rules.sql`: set the value, the source URL and the confidence. A `NULL` inspection age means "not
published": FleetOps then gives no inspection reminder rather than inventing one. Run `pytest -q` (the GCC tests in
`tests/test_security_regressions.py` cover each country) and `fleetkpi web-export --out web/public` to update the app.
