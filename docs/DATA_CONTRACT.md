# fleetkpi data contract

Drop one file per table into your input folder, named after the table (`vehicles.csv`, `work_orders.xlsx`, `usage.parquet`...). Column names are matched case-insensitively and common synonyms are recognised; map anything else once in `fleet.yml` under `mapping:`.

## `sites`

Workshops, depots and outside vendors that hold or service vehicles.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `site_id` | VARCHAR | yes | Unique site code | site, site_code, workshop_id, depot_id, location_id |
| `site_name` | VARCHAR | yes | Readable name | name, workshop, workshop_name, depot, depot_name |
| `region` | VARCHAR | yes | Market, country or region used for roll-ups | market, country, area, zone, city |
| `site_type` | VARCHAR |  | workshop | depot | vendor | type, category |
| `technicians` | INTEGER |  | Technician headcount (for productivity KPIs) | techs, headcount, mechanics |
| `open_date` | DATE |  | Date the site started operating | opened, start_date, opening_date |

## `vehicles`

One row per vehicle in the fleet: electric, hybrid or combustion.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `vehicle_id` | VARCHAR | yes | Unique vehicle id (fleet / unit number, plate or VIN) | vehicle, vehicle_number, vehicle_no, unit_number, unit_no |
| `powertrain` | VARCHAR | yes | BEV | PHEV | HEV | ICE. Also accepts 'electric', 'plug-in hybrid', 'hybrid', 'petrol', 'diesel'... | fuel, fuel_type_group, drivetrain, propulsion, engine_type |
| `fuel_type` | VARCHAR |  | petrol | diesel for ICE/HEV/PHEV (default petrol) | fuel_kind, fuel_grade |
| `make` | VARCHAR |  | Manufacturer | brand, manufacturer, oem |
| `model` | VARCHAR |  | Model name | model_name, vehicle_model |
| `home_site_id` | VARCHAR | yes | Site the vehicle is based at / serviced by | site_id, home_site, depot_id, base, home_depot |
| `region` | VARCHAR |  | Defaults to the home site's region | market, country |
| `in_service_date` | DATE | yes | Date the vehicle entered service | in_service, start_date, commission_date, delivery_date, registration_date |
| `out_of_service_date` | DATE |  | Date it left the fleet (blank if active) | disposal_date, end_date, defleet_date, sold_date |
| `purchase_cost` | DOUBLE |  | Acquisition cost, for depreciation in total cost of ownership | price, cost, acquisition_cost, capex |
| `use_case` | VARCHAR |  | Ride-hail, delivery, pool car... | usage_type, segment, application |
| `registration_expiry` | DATE |  | Registration / licence (mulkiya, MOT, tax disc) expiry date | registration_expiry_date, reg_expiry, mulkiya_expiry, licence_expiry, license_expiry |
| `registration_class` | VARCHAR |  | Official registration type on the vehicle's registration card, used for Bahrain inspection (e.g. Private or Private transport) | registration_type, official_registration_class, vehicle_registration_type, registration_category |
| `manufacture_date` | DATE |  | Actual manufacture date (YYYY-MM-DD) used for Bahrain's Private inspection exemption | date_of_manufacture, manufacturing_date, build_date |
| `inspection_required_by_authority` | BOOLEAN |  | True when Bahrain Traffic specifically requires a technical inspection for this vehicle | gdt_inspection_required |
| `insurance_expiry` | DATE |  | Insurance policy expiry date | insurance_expiry_date, policy_expiry, insurance_valid_until, policy_end |
| `insurer` | VARCHAR |  | Insurance company | insurance_company, insurance_provider, policy_provider |
| `vin` | VARCHAR |  | 17-character Vehicle Identification Number (chassis number) | vin, vin_number, vin_no, vin_sn, chassis |
| `plate_number` | VARCHAR |  | Registration plate as printed on the registration card | plate, plate_no, plate_number, license_plate, licence_plate |
| `model_year` | INTEGER |  | Model year (decoded from the VIN when missing) | year, model_year, my, year_of_manufacture, manufacture_year |
| `trim` | VARCHAR |  | Trim, grade or variant | trim, trim_level, grade, variant, version |
| `configuration` | VARCHAR |  | Configuration: battery or engine, drive, body, seats, options | configuration, config, specification, specifications, spec |
| `licence_class_required` | VARCHAR |  | Licence class needed to drive it (B car or van, C truck, CE articulated, D bus); worked out from the model when blank | licence_class_required, license_class_required, required_licence, required_license, vehicle_class |
| `color` | VARCHAR |  | Exterior colour | color, colour, exterior_color, exterior_colour |

## `work_orders`

Every workshop visit: preventive maintenance, repairs, warranty, collisions, tyres, recalls.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `work_order_id` | VARCHAR | yes | Unique job / work-order number | job_id, wo, wo_number, work_order, ticket |
| `vehicle_id` | VARCHAR | yes | Vehicle serviced | vehicle, plate, plate_no, vin, asset_id |
| `site_id` | VARCHAR | yes | Site that did the work | site, workshop_id, workshop, location_id, vendor_id |
| `job_type` | VARCHAR | yes | Preventive maintenance | Repair | Warranty | Collision | Tyres | Recall | Other (free text is normalised) | type, category, service_type, job_category, reason |
| `opened_at` | TIMESTAMP | yes | When the vehicle went off the road / job opened | opened, open_date, start, check_in, date_in |
| `closed_at` | TIMESTAMP |  | When the vehicle was released (blank if still open) | closed, close_date, end, check_out, date_out |
| `labour_hours` | DOUBLE |  | Billed labour hours | labour, labor_hours, labor |
| `parts_wait_hours` | DOUBLE |  | Hours spent waiting for parts | parts_wait, waiting_parts_hours |
| `total_cost` | DOUBLE | yes | Total job cost (labour + parts) | cost, amount, invoice_total, total |
| `paid_by` | VARCHAR |  | Fleet | OEM | Insurance (default Fleet) | payer, billing, charge_to |
| `repeat_visit` | BOOLEAN |  | TRUE if the vehicle came back for the same fault | repeat, comeback, rework |
| `campaign_id` | VARCHAR |  | Recall campaign id for recall jobs | recall_id, campaign |
| `driver_id` | VARCHAR |  | Driver involved (at the wheel for a collision or breakdown) | driver, driver_name, involved_driver, at_fault_driver |
| `reported_by` | VARCHAR |  | Who opened the ticket (a driver id, or a team) | reported_by, requested_by, raised_by, opened_by, requester |
| `key_in_at` | TIMESTAMP |  | Customer handed over the key (defaults to opened_at) | key_in, key_drop, key_received, handover_in, drop_off |
| `key_out_at` | TIMESTAMP |  | Key handed back to the customer (defaults to closed_at) | key_out, key_return, handover_out, pick_up, collected_at |
| `ready_at` | TIMESTAMP |  | Vehicle ready for pick-up (defaults to closed_at) | ready, ready_for_pickup, ready_time, job_completed_at, qc_passed_at |
| `back_in_service_at` | TIMESTAMP |  | Vehicle back in operations / first trip after the visit (defaults to key_out_at) | back_in_service, back_to_operations, returned_to_service, first_trip_after, redeployed_at |
| `issue_category` | VARCHAR |  | What was wrong: Brakes, Tyres, HV battery, Electrical, Body... (free text is normalised) | issue, fault, fault_category, complaint, system |
| `goodwill_amount` | DOUBLE |  | Amount waived or refunded as goodwill on this job | goodwill, goodwill_value, waiver, concession, courtesy_amount |

## `usage`

Distance and hours per vehicle, daily or monthly (both work).

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `vehicle_id` | VARCHAR | yes | Vehicle | vehicle, plate, plate_no, vin, asset_id |
| `date` | DATE | yes | Day or month of the reading | day, month, period, reading_date, trip_date |
| `km` | DOUBLE | yes | Distance driven in the period (km) | distance, distance_km, kilometres, kilometers, mileage |
| `operating_hours` | DOUBLE |  | Hours in operation in the period (for utilisation) | hours, engine_hours, active_hours, duty_hours |

## `energy` (optional)

Fuel and charging: litres for fuel, kWh for electricity.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `vehicle_id` | VARCHAR | yes | Vehicle | vehicle, plate, plate_no, vin, asset_id |
| `date` | DATE | yes | Day or month | day, month, transaction_date, session_date |
| `energy_type` | VARCHAR | yes | fuel | electricity | type, product, energy, source |
| `quantity` | DOUBLE | yes | Litres (fuel) or kWh (electricity) | litres, liters, kwh, volume, amount_qty |
| `cost` | DOUBLE |  | Amount paid; computed from fleet.yml prices if blank | amount, spend, total |
| `duration_minutes` | DOUBLE |  | Time spent fuelling or charging during shifts | minutes, charge_minutes, duration |

## `feedback` (optional)

Customer satisfaction responses (1-5 stars), ideally linked to a work order.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `feedback_id` | VARCHAR |  | Response id | response_id, survey_id, id |
| `work_order_id` | VARCHAR |  | Work order the rating is about | job_id, wo, wo_number, job_number, ro_number |
| `vehicle_id` | VARCHAR |  | Vehicle (if not linked to a work order) | vehicle, plate, plate_no, vin |
| `site_id` | VARCHAR |  | Site (if not linked to a work order) | site, workshop_id, branch_id |
| `date` | DATE | yes | Response date | response_date, survey_date, submitted_at, created_at |
| `rating` | INTEGER | yes | Stars, 1 (worst) to 5 (best) | stars, score, csat, satisfaction |
| `channel` | VARCHAR |  | SMS, app, call... | source, medium |
| `comment` | VARCHAR |  | Free-text comment | comments, verbatim, feedback, remarks |

## `parts_orders` (optional)

Parts ordered for a work order, with the promised ETA and actual arrival.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `part_order_id` | VARCHAR | yes | Parts order / line id | po, po_number, order_id, parts_order, order_line |
| `work_order_id` | VARCHAR | yes | Work order waiting for the part | job_id, wo, wo_number, job_number, ro_number |
| `part_description` | VARCHAR |  | Part name or number | part, part_number, part_no, description, item |
| `supplier` | VARCHAR |  | Supplier or warehouse | vendor, source, warehouse, distributor |
| `ordered_at` | TIMESTAMP | yes | When the part was ordered | order_date, ordered, po_date, requested_at |
| `promised_eta` | TIMESTAMP | yes | ETA promised by the supplier | eta, promised_date, expected_arrival, due_date |
| `arrived_at` | TIMESTAMP |  | Actual arrival (blank while still on order) | arrival_date, received_at, delivered_at, grn_date |

## `fines` (optional)

Traffic and regulatory fines registered against a vehicle.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `fine_id` | VARCHAR | yes | Fine / violation reference | violation_id, ticket_no, fine_number, reference |
| `vehicle_id` | VARCHAR | yes | Vehicle fined | vehicle, plate, plate_no, vin |
| `date` | DATE | yes | Date of the offence | offence_date, violation_date, issued_date, fine_date |
| `fine_type` | VARCHAR | yes | Speeding, Parking, Toll, Red light, Expired registration... (free text is normalised) | type, violation, offence, category, reason |
| `amount` | DOUBLE | yes | Fine amount | fine_amount, value, penalty |
| `status` | VARCHAR |  | Paid | Unpaid | Disputed (default Unpaid) | payment_status, state |
| `authority` | VARCHAR |  | Issuing authority | issuer, issued_by |
| `driver_id` | VARCHAR |  | Driver responsible, when the authority or your records name one | driver, driver_name, offender, responsible_driver |

## `documents` (optional)

Registration cards, insurance policies, inspections and permits, one row per document. The dashboard's document vault reads them from photos or PDFs; the latest expiry per vehicle feeds compliance.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `document_id` | VARCHAR |  | Unique document id (numbered automatically when absent) | doc_id, id, reference |
| `vehicle_ref` | VARCHAR | yes | The vehicle: its id, plate or VIN (any of the three is matched) | vehicle_id, vehicle, plate, plate_number, plate_no |
| `doc_type` | VARCHAR | yes | Registration | Insurance | Inspection | Permit | Other | document_type, type, category, kind |
| `document_number` | VARCHAR |  | Number printed on the document (registration or policy number) | number, doc_number, policy_number, policy_no, registration_no |
| `issue_date` | DATE |  | Issue or start date | issued, issue, start_date, valid_from, policy_start |
| `expiry_date` | DATE |  | Expiry date | expiry, expires, valid_until, valid_to, end_date |
| `issuer` | VARCHAR |  | Authority or insurer | authority, insurer, issued_by, provider |
| `file_name` | VARCHAR |  | Scanned file the details came from | file, attachment, scan |

## `recalls` (optional)

Recall / service campaigns.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `campaign_id` | VARCHAR | yes | Campaign id | recall_id, campaign |
| `title` | VARCHAR | yes | What the campaign fixes | description, name |
| `launch_date` | DATE | yes | Campaign launch date | start_date, issued |

## `recall_vehicles` (optional)

Which vehicles each campaign affects.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `campaign_id` | VARCHAR | yes | Campaign id | recall_id, campaign |
| `vehicle_id` | VARCHAR | yes | Affected vehicle | vehicle, plate, vin |

## `budgets` (optional)

Fleet-paid maintenance budget per region and month. If absent, fleet.yml rates are used.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `region` | VARCHAR | yes | Region | market, country |
| `month` | DATE | yes | First day of the month | period, date |
| `budget` | DOUBLE | yes | Budget amount | amount, budget_amount |

## `drivers` (optional)

Drivers and their licences, optionally with the vehicle each one usually drives.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `driver_id` | VARCHAR | yes | Unique driver id (employee or badge number) | driver, employee_id, employee_no, staff_id, badge |
| `driver_name` | VARCHAR |  | Name as shown to managers | name, full_name, driver_full_name, employee_name |
| `licence_number` | VARCHAR |  | Driving licence number | license_number, licence_no, license_no, dl_number |
| `licence_class` | VARCHAR |  | Licence category (B light vehicle, C truck, D bus...) | license_class, licence_category, license_category, licence_type, license_type |
| `licence_expiry` | DATE |  | Licence expiry date | license_expiry, licence_expiry_date, license_expiry_date, dl_expiry, expiry |
| `home_site_id` | VARCHAR |  | Depot or site the driver works from | site_id, depot_id, base, branch, home_site |
| `vehicle_id` | VARCHAR |  | Vehicle usually assigned | assigned_vehicle, vehicle, plate, plate_no, unit_number |
| `status` | VARCHAR |  | Active | On leave | Suspended | Inactive (default Active) | driver_status, state, employment_status |

## `trips` (optional)

Trips or period summaries exported from telematics (Geotab, Webfleet, Samsara, Motive...): one row per trip, or per vehicle and day or week. Drives the driving-behaviour KPIs and the alert rules.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `trip_id` | VARCHAR |  | Trip or summary id (numbered automatically when absent) | id, trip, journey_id, trip_number |
| `vehicle_id` | VARCHAR | yes | Vehicle | vehicle, unit, unit_number, asset, plate |
| `driver_id` | VARCHAR |  | Driver, if identified | driver, driver_name, employee_id, badge |
| `start_ts` | TIMESTAMP | yes | Trip (or period) start | start, start_time, trip_start, from, date |
| `end_ts` | TIMESTAMP |  | Trip (or period) end | end, end_time, trip_end, to, end_date |
| `km` | DOUBLE | yes | Distance driven | distance, distance_km, kilometres, kilometers, mileage |
| `driving_minutes` | DOUBLE |  | Time moving | drive_minutes, driving_time, drive_time, moving_minutes |
| `idle_minutes` | DOUBLE |  | Engine on, not moving | idle, idle_time, idling_minutes, idle_duration |
| `max_speed_kmh` | DOUBLE |  | Top speed | max_speed, top_speed, maximum_speed |
| `speeding_events` | INTEGER |  | Times over the speed limit | speeding, overspeed, over_speed_events, speeding_count |
| `harsh_events` | INTEGER |  | Harsh braking, acceleration and cornering | harsh, harsh_driving, harsh_braking, events |
| `geofence_exits` | INTEGER |  | Times the vehicle left its permitted zone | geofence, zone_exits, geofence_violations |

## `warranties` (optional)

Warranty cover per vehicle: the manufacturer's basic, powertrain and battery warranties, and any extended plan. One row per vehicle and coverage.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `vehicle_id` | VARCHAR | yes | Vehicle | vehicle, plate, plate_no, vin, asset_id |
| `coverage` | VARCHAR | yes | What is covered: Basic, Powertrain, HV battery, Corrosion, Self-driving hardware, Extended plan... | warranty, warranty_type, cover, coverage_type, plan |
| `provider` | VARCHAR |  | Who gives the warranty: the manufacturer, the dealer or a third party | warrantor, issuer, underwriter, company |
| `start_date` | DATE | yes | Cover starts (usually the first registration or delivery date) | start, from, warranty_start, effective_date |
| `end_date` | DATE | yes | Cover ends by date | end, to, expiry, expiry_date, warranty_end |
| `km_limit` | DOUBLE |  | Cover ends at this odometer reading, whichever comes first | km, mileage_limit, distance_limit, max_km |
| `contract_number` | VARCHAR |  | Warranty or plan number | contract, policy, warranty_number, reference |
| `status` | VARCHAR |  | Active | Void (default Active): void when the maker has refused cover | warranty_status, state |

## `vehicle_addons` (optional)

Equipment added to each vehicle beyond the base trim: chargers, battery and thermal packs, self-driving hardware and software, cameras, telematics, body fit-outs.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `vehicle_id` | VARCHAR | yes | Vehicle | vehicle, plate, plate_no, vin, asset_id |
| `addon` | VARCHAR | yes | The component or package | option, component, accessory, equipment, package |
| `category` | VARCHAR |  | Charging, Battery & thermal, Self-driving, Safety, Telematics, Body... (free text is normalised) | type, group, system |
| `installed_date` | DATE |  | When it was fitted | installed, fitted, install_date, date |
| `supplier` | VARCHAR |  | Who supplied or fitted it | vendor, fitter, installer, brand |
| `serial_number` | VARCHAR |  | Serial or part number | serial, part_number, sn |
| `software_version` | VARCHAR |  | Software or firmware version, for computers and self-driving packages | software, firmware, version |
| `cost` | DOUBLE |  | Price paid | price, amount |
| `warranty_end` | DATE |  | The component's own warranty end | warranty, warranty_until, guarantee_end |

## `service_contacts` (optional)

Points of contact at the manufacturer's service centres: who to call for service, warranty claims, high-voltage work and self-driving calibration.

| Column | Type | Required | Description | Also recognised as |
|---|---|---|---|---|
| `contact_id` | VARCHAR |  | Contact id (numbered automatically when absent) | id, contact |
| `make` | VARCHAR | yes | Brand the centre services | brand, manufacturer, oem |
| `service_centre` | VARCHAR | yes | Service centre or dealer | centre, center, dealer, workshop, branch |
| `region` | VARCHAR |  | Region or country it serves | market, country |
| `role` | VARCHAR | yes | Service advisor, Warranty desk, EV specialist, Self-driving calibration, Parts, Roadside... | department, function, desk, title |
| `name` | VARCHAR | yes | Contact person | contact_name, person, full_name |
| `phone` | VARCHAR |  | Phone | telephone, mobile, tel, phone_number |
| `email` | VARCHAR |  | Email | e_mail, mail, email_address |
| `hours` | VARCHAR |  | Opening hours | opening_hours, working_hours, availability |
