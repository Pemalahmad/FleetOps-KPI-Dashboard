# Privacy

**FleetOps does not collect your data. There is no FleetOps server to send it to.**

## What happens to what you import

| You provide | Where it goes | How long it stays |
|---|---|---|
| Spreadsheets (vehicle lists, work orders…) | Read and processed in your browser; saved in your browser's IndexedDB for this site | Until you click "Delete my fleet data" (Import page) or clear the site's data |
| Photos and PDFs of documents | Read in your browser (OCR); the file and the text read are saved in IndexedDB | Same as above; "Discard" or the bin icon removes one |
| Licence key | Checked on your device; saved in local storage | Until you clear the site's data |
| VINs, **only if you click "Decode VINs online"** | Sent to NHTSA's public vPIC service (U.S. Department of Transportation) to look up make, model and trim. Nothing else is sent: no plates, names, dates or files | Subject to NHTSA's own policy |

## What FleetOps does not do

- No accounts, sign-up or email collection.
- No cookies, analytics, advertising, tracking pixels or third-party scripts.
- No fonts, libraries, engines or engine extensions loaded from other sites: everything is served from the same place
  as the app, and the browser is told to refuse anything else (Content Security Policy, checked on every build).
- The page sends no referrer to other sites (`no-referrer`).

## On a shared computer

On the **Plan & offline** page you can protect everything FleetOps keeps in the browser with a passphrase. The data
is then stored encrypted (AES-256); the passphrase is never stored or sent anywhere, and the fleet locks whenever the
tab is closed or reloaded. Nobody, including the maintainer, can recover the data without the passphrase.

## The offline package

The downloadable version runs entirely on your computer and listens only on `127.0.0.1` (or `localhost` on
Windows), so other devices on your network cannot reach it. It needs no internet connection, except for the optional
VIN decode above.

## If FleetOps ever charges

Paid plans would use a licence key checked on your device. A key identifies a customer and a plan; it does not
carry, and the app does not send, any of your fleet's data.
