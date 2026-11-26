# GCC compliance rules

FleetOps checks each active vehicle against the published registration, insurance, inspection and operating-card rules of
its country: the United Arab Emirates, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman. The rules live in one SQL model,
[`stg_gcc_rules`](../fleetkpi/sql/models/staging/stg_gcc_rules.sql), and are applied by
[`mart_gcc_compliance`](../fleetkpi/sql/models/marts/mart_gcc_compliance.sql). The Licence page shows the report result.
Daily Command and the Garage release review use the same jurisdiction and applicability data, with evidence dates
checked again for the proposed handover day.

**FleetOps checks the records you hold; it does not certify a vehicle.** Rules change. Confirm with the authority before
acting, and update the rules model when they change.

Inspection rules and source links reviewed on **26 November 2026**. The rule records show the applicable authority and source.

## How a vehicle is judged

| Status | Meaning |
|---|---|
| **Non-compliant** | A recorded technical inspection failure remains open, registration, insurance or a required operating card has expired, or recorded Bahrain insurance ends before registration. |
| **Evidence missing** | FleetOps needs a supported registration class, an applicability date or current document evidence. |
| **Expiring** | A renewal is inside the expiring window, or a technical inspection is due before the coming renewal. |
| **Compliant** | Every rule that applies is met on the records held. |
| **Not covered** | The vehicle's region is outside the six countries. |

A vehicle's country comes from its region (or its home site's region): a country name or a city such as Dubai, Riyadh,
Doha, Manama or Muscat. Set the region to the jurisdiction that registered the vehicle. Copy the official class from
the vehicle registration card. Age rules use the original licensing or manufacture date specified by the local rule.

Garage holds release for unresolved inspection failures, missing or unrecognized classes, and missing evidence for an
applicable inspection. Renewal inspections are checked inside the configured renewal review window. Periodic Saudi
inspections and a confirmed Kuwait periodic inspection date can block release outside that window. An authority direction
to inspect also applies immediately.
For a Saudi goods vehicle, record the permit with an issuer identifying the Transport General Authority or Naql.
An unrelated permit does not establish TGA card evidence. A blank region or a missing country result requires
review. Entered non-GCC regions are outside the pack and use the general release checks.

## Rules by country

| Country | Registration | Inspection | Other | Confidence | Source |
|---|---|---|---|---|---|
| UAE | Mulkiya. | Through 31 December 2026, the federal rule uses three years from first licensing for new private light vehicles and one year for other new mechanical vehicles. Decision 174/2026 applies from 1 January 2027. Article 94 uses three years for qualifying new light vehicles and one year for other classes supplied by the manufacturer or approved dealer. Dubai qualification also uses the issuing emirate, first ownership and the earlier manufacture or registration year. Dubai test certificates are valid 30 days. | Record the issuing emirate. For Dubai commercial plates use a Dubai inspection centre. | high | [MOI, Art. 132](https://moi.gov.ae/DataFolder/leg/legqw2a.pdf), [Cabinet Decision 174/2026, Art. 94](https://uaelegislation.gov.ae/ar/legislations/4658), [Dubai RTA](https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=455) |
| Saudi Arabia | Istimara. | New Private vehicles are inspected three years after first licensing. Taxis, public buses and public transport start at two years. Both repeat annually. For other classes, use the official next date or a current passing report. | The Saudi goods-transport operating-card check continues to apply. | high | [Traffic Law, Art. 26 and plate/registration schedules](https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/85364e57-c01e-41ba-8c12-300c38908b52/1), [MOI, Arts. 26/2 and 26/3](https://www.moi.gov.sa/wps/wcm/connect/c94c6e10-677f-4d7a-8c12-300c38908b52/Traffic%2BSys.pdf?CVID=obeJVVy&MOD=AJPERES), [MVPI](https://www.mvpi.com.sa/en/faqs) |
| Qatar | Istimara. | New private passenger cars and privately owned eligible transport under 3,000 kg use the three-year first-use exemption. Company-owned light private transport, heavier private transport, taxi, rental and motorcycle registrations require inspection from first registration. The light/heavy boundary of exactly 3,000 kg requires FAHES confirmation. Renewal uses a pass report within 30 days. | For Private transport record the owner type and the registered weight used by FAHES. | high | [Al Meezan, Art. 4](https://www.almeezan.qa/LawArticles.aspx?LawTreeSectionID=12432&language=ar&lawId=3856), [FAHES class schedule](https://www.fahes.com.qa/en/pages/inspectiontips) |
| Kuwait | Daftar, including Sahel registration. | Inspection at licensing and renewal. Private cars and motorcycles have an initial exemption with approved-dealer and compulsory insurance conditions. The Traffic schedule lists 3, 3 and 2-year intervals for eligible private vehicles, then annual inspection. The regulation and Traffic notice differ on the initial Private transport period, so FleetOps uses the vehicle's verified official next date for these classes. | Keep the Traffic or Sahel record reference with that date. | high | [MOI executive regulation, Art. 5](https://www.moi.gov.kw/gdt/KuwaitTrafficLaw.pdf), [Traffic schedule](https://moi.gov.kw/gdt/traffic-news/details/53244), [Renewal service](https://www.e.gov.kw/sites/kgoenglish/Pages/Services/MOI/RenewVehicleLicense.aspx) |
| Bahrain | Registration certificate, annual. Late fee 500 fils a day, capped at 20 BHD a year. | Technical inspection at renewal. Private cars are exempt up to and including the fifth anniversary of manufacture, unless Traffic requires an inspection. | Insurance must cover the whole registration period. | high | [Traffic renewal instructions (Arabic)](https://services.bahrain.bh/wps/portal/VehicleRegistrationRenewal_ar), [Decision 154/2015, Articles 96 and 121 (Arabic)](https://www.lloc.gov.bh/PDF/RINT15415.pdf) |
| Oman | Mulkiya. | Police Decision 61/2024 requires inspection at licensing and renewal for the specified commercial classes, heavy government vehicles and equipment, taxi, training, bus and limited-use vehicles. The ten-year manufacture threshold applies to private cars, motorcycles and eligible small pickups and commercial light passenger vehicles. Advertising use removes the commercial light-class exception. | Record advertising use when relevant. | high | [Oman Official Gazette, Art. 39](https://www.mjla.gov.om/images/decisions/file/Book334710.pdf), [ROP renewal](https://www.rop.gov.om/english/Vehicle_Registration_renewal.aspx) |

## GCC release evidence

1. In **Import**, map `registration_class` to the official vehicle type on the registration card. Arabic and English card aliases are accepted. If the card has separate use and weight classes, use the full official category, for example `Private light vehicle`.
2. Enter the relevant `first_registration_date`, `registered_as_new` and `manufacture_date` from the owner's records. The UAE needs the issuing `registration_jurisdiction` when the fleet region does not identify the emirate. Use the authorized dealer or manufacturer evidence for eligible UAE initial exemptions and the RTA first inspection date for Dubai.
3. Enter `registration_owner_type` and `registration_weight_kg` for Qatar Private transport, or `vehicle_advertising` for Oman commercial light passenger vehicles and pickups. For the classes that need a date confirmed by the authority, enter both `inspection_due_date` and `inspection_schedule_reference`.
4. Add each official **Inspection** report in **Documents**, or import the documents sheet. Record `inspection_result` as `Pass` or `Fail` and the issue date. A pass needs its expiry date. In Dubai, record the Dubai centre or RTA in `issuer`. A failed inspection holds release until a later dated pass is on file. Keep the first-time and failed inspection records for review.
5. Set `inspection_required_by_authority=true` for an individual direction to inspect. In **Garage**, review **Source requirements** before signing. The handover record saves the registration class, inspection outcome and rule link.

## Bahrain release evidence

1. In **Import**, include `registration_class` in the vehicle file and copy the official registration type from the registration certificate. Examples include `خصوصي` / `Private` and `نقل خاص` / `Private transport`. A blank or unrecognized class holds release.
2. For Private cars, include the actual `manufacture_date` in YYYY-MM-DD format. Enter `inspection_required_by_authority=true` when Bahrain Traffic directs an inspection. Garage checks current evidence for that direction even outside the renewal review window.
3. For a vehicle subject to the renewal inspection rule, add a matched `Inspection` record in **Documents** with its real expiry date. FleetOps applies this release check when the configured renewal review window opens. The expiry date is inclusive.
4. Open the Garage vehicle and review **Source requirements**. The release record captures the registration class and the inspection result or applicable exemption. Confirm special registration arrangements directly with Traffic.

## Requirements pending confirmation

- Abu Dhabi registration validity, renewal window and grace period; the "insurance must cover 13 months" claim.
- Saudi Istimara validity (sources say 3 years or no expiry), renewal window and grace period.
- Qatar registration validity, renewal window and grace period.
- Kuwait registration grace periods and any special exemption without a verified Traffic or Sahel record.
- Oman renewal window (sources conflict) and grace period.
- Commercial operating permits outside Saudi Arabia, and licence classes in most countries.
- Specialized, emergency, diplomatic or other unusual vehicle licences may require vehicle-specific confirmation. Add the official next date and reference where FleetOps requests it.

## Changing a rule

Update the rule and its source in `stg_gcc_rules.sql`, class aliases in `stg_gcc_inspection_classes.sql`, and
the applied condition in `mart_gcc_compliance.sql`. Garage rechecks the resulting dates on handover. Run `pytest -q` (the GCC tests in
`tests/test_security_regressions.py` cover each country) and `fleetkpi web-export --out web/public` to update the app.
