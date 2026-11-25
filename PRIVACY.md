# Privacy Policy

**Effective 25 November 2026.** Applies to the FleetOps web app at pemalahmad.github.io/FleetOps-KPI-Dashboard, the
downloadable offline package and this repository.

**In short: FleetOps does not collect your data. There is no FleetOps server to send it to.** Everything you import is
processed and stored on your own device, under your control.

## Who is responsible

FleetOps is published by Mohammad Alahmad ("we"). Because the app runs entirely in your browser or on your computer,
we never receive, see or store the fleet data you put into it. For that data **you are the controller**: you decide
what is imported, who uses the device and when it is deleted. We are the controller only of the messages you choose to
send us (for example a bug report or a support question).

## What happens to what you import

| You provide | Where it goes | How long it stays |
|---|---|---|
| Spreadsheets (vehicle lists, work orders…) | Read and processed in your browser; saved in your browser's IndexedDB for this site | Until you click "Delete my fleet data" (Import page) or clear the site's data |
| Garage incidents, damage facts, evidence references, notification decisions, deadlines and their sources, estimates, approvals, repair/quality records, review notes, audit history and handovers with the applicable country evidence | Saved with the device-local workspace, under the same optional passphrase encryption; demo actions stay in tab memory. FleetOps records notifications but sends none | Until fleet data is deleted; demo progress resets on reload |
| Shift handoff or release record you download | The browser saves a plain-text file on your device. It may include vehicle identifiers, names, timestamps and evidence references. It is outside workspace passphrase protection | Until you delete the downloaded file |
| Service orders: bookings, stage history and assignments, check-in and check-out condition (odometer, fuel or charge, body, interior, warning lights, tyre tread, pressure and condition), work lines (issue, diagnosis, work done, pay type, claim or campaign numbers), parts, technician hours, comments by technicians, advisors and owners, and invoices | Saved with the device-local workspace, under the same optional passphrase encryption; never sent anywhere; demo orders stay in tab memory | Until fleet data is deleted; demo orders reset on reload |
| Activity log of your own changes (imports, garage records, procedures, settings) | Saved with the device-local workspace, under the same optional passphrase encryption; never sent anywhere; the demo keeps none | Until fleet data is deleted; the newest 400 entries are kept |
| Drivers and trips you import (names, licence numbers and expiry, telematics summaries) | Read and processed in your browser; saved in IndexedDB like your other sheets | Until you delete your fleet data |
| Car shape chosen for each model (3D garage) | Saved with the device-local workspace, under the same optional passphrase encryption; demo choices stay in tab memory | Until fleet data is deleted |
| Procedure (SOP) review notes, owners and due dates | Saved with the device-local workspace, under the same optional passphrase encryption; demo notes stay in tab memory | Until fleet data is deleted |
| Photos and PDFs of documents | Read in your browser (OCR); the file and the text read are saved in IndexedDB | Same as above; "Discard" or the bin icon removes one |
| Warranties, add-ons and service-centre contacts you import (contact names, phone numbers and e-mails) | Kept in your browser with the rest of the fleet, sealed if you set a passphrase; never sent anywhere. Phone and e-mail links open your own phone or mail app | Until you delete the fleet |
| A file you choose to follow for live updates | Read from your disk by the browser each few seconds while the tab is open; when it changes it is re-imported like any spreadsheet. Only the file you picked is readable, and only for this session | Until you stop following or close the tab |
| Licence key | Checked on your device; saved in local storage | Until you clear the site's data |
| Light/dark theme choice | Saved in local storage | Until you clear the site's data |
| VINs, **only if you click "Decode VINs online"** | Sent to NHTSA's public vPIC service (U.S. Department of Transportation) to look up make, model and trim. Nothing else is sent: no plates, names, dates or files | Subject to NHTSA's own policy |

## What FleetOps does not do

- No accounts, sign-up or email collection.
- No cookies, analytics, advertising, tracking pixels, fingerprinting or third-party scripts.
- No sale or sharing of personal data, and no profiling or automated decisions about people.
- No fonts, libraries, engines or engine extensions loaded from other sites: everything is served from the same place
  as the app, and the browser is told to refuse anything else (Content Security Policy, checked on every build).
- The page sends no referrer to other sites (`no-referrer`).
- No remote switch, update channel or hidden account: the app cannot be told from outside to send, unlock or delete
  your data.

## Hosting

The web app is served by GitHub Pages. Like any web host, GitHub may record technical request data (such as IP address
and time) when your browser downloads the app's files; see the
[GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
That request data never includes your fleet data, which never leaves your device. The offline package avoids hosting
altogether.

## On a shared computer

On the **Plan & offline** page you can protect everything FleetOps keeps in the browser with a passphrase. The data
is then stored encrypted (AES-256-GCM); the passphrase is never stored or sent anywhere, and the fleet locks whenever
the tab is closed or reloaded. Nobody, including the maintainer, can recover the data without the passphrase.

## The offline package

The downloadable version runs entirely on your computer and listens only on `127.0.0.1` (or `localhost` on
Windows), so other devices on your network cannot reach it. It needs no internet connection, except for the optional
VIN decode above.

## Licence keys

Paid plans, if offered, use a licence key checked on your device. A key contains the customer name you gave us, the
plan, an expiry date and a vehicle limit. It does not carry, and the app does not send, any of your fleet's data. We
keep a record of keys we issue (customer name, plan, dates) for as long as the licence is active plus the period
required for accounting records.

## Your rights

Because your fleet data stays on your device, you exercise most rights directly: view it in the app, export it
(Excel, calendar), correct it by re-importing, and erase it with "Delete my fleet data". For information we do hold
(messages you sent us, licence records) you may ask for access, correction, deletion, restriction or a copy, and you
may object to its use, under the laws that apply to you, including the EU/UK GDPR, the UAE Personal Data Protection Law
(Federal Decree-Law No. 45 of 2021) and the Saudi Personal Data Protection Law. You may also complain to your data
protection authority.

## Personal data of drivers and staff

Fleet files often name drivers, technicians or reviewers. If you import such data, you are responsible for having a
lawful basis to process it and for telling those people, as your local law requires. FleetOps helps by keeping that
data on your device, encrypting it on request and deleting it in one step.

## Children

FleetOps is a business tool and is not directed at children.

## Changes

We will update this policy when the app's data handling changes and record the change in [CHANGELOG.md](CHANGELOG.md).
The effective date above shows the current version.

## Contact

Privacy questions: message the maintainer through the LinkedIn profile linked in the [README](README.md). Security
issues: see [SECURITY.md](SECURITY.md).
