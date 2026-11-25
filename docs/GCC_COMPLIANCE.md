# GCC compliance rules

FleetOps checks each active vehicle against the published registration, insurance, inspection and operating-card rules of
its country: the United Arab Emirates, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman. The rules live in one SQL model,
[`stg_gcc_rules`](../fleetkpi/sql/models/staging/stg_gcc_rules.sql), and are applied by
[`mart_gcc_compliance`](../fleetkpi/sql/models/marts/mart_gcc_compliance.sql). The Licence page shows the report result.
Daily Command and the Garage release review use the same jurisdiction and applicability data, with evidence dates
checked again for the proposed handover day.

**FleetOps checks the records you hold; it does not certify a vehicle.** Rules change. Confirm with the authority before
acting, and update the rules model when they change.

Rules researched on **23 November 2026**. Bahrain inspection was cross-checked on **26 November 2026**. Some official portals could not be read directly on 23 November: Absher, Hukoomi,
e.gov.kw and TAMM blocked automated reading, and one ROP page was unavailable. Where a rule rests on a news report of an
official decision rather than the portal itself, its confidence is lowered.

## How a vehicle is judged

| Status | Meaning |
|---|---|
| **Non-compliant** | Registration, insurance or a required operating card has expired, or recorded Bahrain insurance ends before registration. |
| **Evidence missing** | FleetOps needs a supported registration class, an applicability date or current document evidence. |
| **Expiring** | A renewal is inside the expiring window, or a technical inspection is due before the coming renewal. |
| **Compliant** | Every rule that applies is met on the records held. |
| **Not covered** | The vehicle's region is outside the six countries. |

A vehicle's country comes from its region (or its home site's region): a country name or a city such as Dubai, Riyadh,
Doha, Manama or Muscat. The generic age-based rules use the model year or in-service date, whichever makes the vehicle older. Bahrain uses the exact manufacture date for class Private.

Garage holds a release for blocked or missing applicable evidence. For a supported inspection requirement, this
includes missing current inspection evidence inside the configured renewal review window. That is an internal release
control. A low-confidence inspection schedule is shown for awareness and does not become a release gate.
For a Saudi goods vehicle, record the permit with an issuer identifying the Transport General Authority or Naql.
An unrelated permit does not establish TGA card evidence. A blank region or a missing country result requires
review. Entered non-GCC regions are outside the pack and use the general release checks.

## Rules by country

| Country | Registration | Inspection | Other | Confidence | Source |
|---|---|---|---|---|---|
| UAE | Mulkiya. Company vehicles renew yearly. Dubai: renew up to 150 days early, but early renewal runs from the renewal date. 30-day grace; traffic file blocked 2 months after expiry. | At renewal once 3 years old (new, first owner exempt for 3 years from manufacture or registration). Certificates valid 30 days. | Insurance checked at renewal. | high | [RTA](https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=582), [RTA inspection](https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=455) |
| Saudi Arabia | Istimara. Driving on an expired Istimara is a violation (January 2025). | Fahas / MVPI: first after 3 years, then yearly; taxis and public transport after 2 years. | Goods-transport, truck-leasing and private-road-transport vehicles need a TGA operating card. Compulsory third-party insurance linked in Absher. | medium | [Traffic Authority, reported](https://english.ajel.sa/news/iefv0ioza), [Road Transport Law](https://misa.gov.sa/app/uploads/2025/07/Road-Transport-Law.pdf) |
| Qatar | Istimara. | FAHES from 3 years after manufacture, then yearly; renew within 30 days of the pass report. | Insurance valid at least a year, renewed first. | medium | [FAHES](https://www.fahes.com.qa/en/service-details/periodicalinspections) |
| Kuwait | Daftar (digital copy valid). | Reported at 3 years after purchase, then 3 and 2 year intervals, at government centres since May 2026. | Registration refused on a non-compliant insurance policy (Ministerial Decision 2116/2025). | low | [Arab Times](https://www.arabtimesonline.com/news/new-rules-for-compulsory-vehicle-insurance-policies-in-kuwait) |
| Bahrain | Registration certificate, annual. Late fee 500 fils a day, capped at 20 BHD a year. | Technical inspection at renewal. Private cars are exempt up to and including the fifth anniversary of manufacture, unless Traffic requires an inspection. | Insurance must cover the whole registration period. | high | [Traffic renewal instructions (Arabic)](https://services.bahrain.bh/wps/portal/VehicleRegistrationRenewal_ar), [Decision 154/2015, Articles 96 and 121 (Arabic)](https://www.lloc.gov.bh/PDF/RINT15415.pdf) |
| Oman | Mulkiya, private vehicles yearly. | At registration and renewal for cars and pick-ups 10 years or older, taxis, school vehicles, buses and commercial vehicles (ROP Decision 61/2024). | Insurance renewed first via the ROP app. | medium | [Oman Observer](https://www.omanobserver.om/article/1153939/oman/longer-validity-period-for-vehicle-registration) |

## Bahrain release evidence

1. In **Import**, include `registration_class` in the vehicle file and copy the official registration type from the registration certificate. Examples include `خصوصي` / `Private` and `نقل خاص` / `Private transport`. A blank or unrecognized class holds release.
2. For Private cars, include the actual `manufacture_date` in YYYY-MM-DD format. Enter `inspection_required_by_authority=true` when Bahrain Traffic directs an inspection. Garage checks current evidence for that direction even outside the renewal review window.
3. For a vehicle subject to the renewal inspection rule, add a matched `Inspection` record in **Documents** with its real expiry date. FleetOps applies this release check when the configured renewal review window opens. The expiry date is inclusive.
4. Open the Garage vehicle and review **Source requirements**. The release record captures the registration class and the inspection result or applicable exemption. Confirm special registration arrangements directly with Traffic.

## Requirements pending confirmation

- Abu Dhabi registration validity, renewal window and grace period; the "insurance must cover 13 months" claim.
- Saudi Istimara validity (sources say 3 years or no expiry), renewal window and grace period.
- Qatar registration validity, renewal window and grace period.
- Kuwait registration validity, renewal window, grace period and the official inspection schedule.
- Oman renewal window (sources conflict) and grace period.
- Commercial operating permits outside Saudi Arabia, and licence classes in most countries.
- UAE Cabinet Decision 174 of 2026 (from 1 January 2027: company vehicles keep 1-year registration): read in news reports, not the gazette.

## Changing a rule

Update the rule and its source and confidence in `stg_gcc_rules.sql`. Bahrain's class-specific applicability is in
`mart_gcc_compliance.sql` and the Garage release gates. Run `pytest -q` (the GCC tests in
`tests/test_security_regressions.py` cover each country) and `fleetkpi web-export --out web/public` to update the app.
