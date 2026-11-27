# Team cases

Open **Team cases** in FleetOps and sign in with the verified account issued by your team administrator. An administrator creates the team and a single-use invitation for each manager's work email. The manager signs in on any device and redeems the code. Use **Remove access** to revoke a member's access to that team's records.

## Share cases and assign responsibility

- Create an EHS report directly in the shared register or link an existing browser fleet under **Link this browser’s fleet**. Linking is an explicit choice. When that fleet is open with a signed-in team member, FleetOps shares its active case summaries and newly opened cases. The team copy owns assignments, shared notes and EHS progress. Browser-only case notes and document files stay in the local workspace. Keep personal medical details in authorized records.
- Choose a case owner, an accountable manager and a follow-up date. Both accounts receive an assignment in their notifications inbox. A shared update records the signed-in actor, assignment, date, stage and note. A stale update asks the user to refresh before trying again.
- The server checks overdue cases every five minutes, including while nobody has the dashboard open. The same account and deadline produce one overdue notice per case. Compliance notices cover the statutory date and the assigned follow-up. EHS notices use the current follow-up date. The inbox travels with the account. Desktop notifications are optional while FleetOps is open.
- EHS follows escalation, containment, corrective action and independent closure. The reviewer records the external reporting decision and reference.
- For registration or inspection closure, confirm the updated document on a linked fleet device and open Daily Command. Its existing vehicle and evidence checks verify the upload. The shared case receives the accepted reference and expiry. The upload itself, fleet data and vehicle release review remain in that browser.

## Deploy

Use a dedicated Supabase project in an approved data region. Apply the migrations in `supabase/migrations` in order. Verify the `fleetops-overdue-cases` Cron job is running. Leave the `fleet_private` schema out of the Data API's exposed schemas. Review authentication settings. Issue individual verified email/password accounts through Supabase Auth. The default Supabase email service has restricted delivery, so configure an approved SMTP provider if the organization wants email account invitations or password recovery.

Set GitHub Actions variables `FLEETOPS_TEAM_URL` and `FLEETOPS_TEAM_KEY` to the project HTTPS URL and its **publishable** API key. GitHub Pages compiles the two into the client and adds the single project origin to the CSP's `connect-src`. Never use a secret or service-role key in a build variable. Provide neither value for a local-only build.

Test the browser flow with two separate signed-in browser contexts and a synthetic fleet. Assign a case from the reporter context and verify both assignment and overdue events in the manager context. Test authenticated team isolation, candidate revision checks, notification deduplication and access removal with `supabase/tests/shared_cases.sql` against a disposable PostgreSQL database configured with Supabase Auth roles and functions.

The browser session stays in memory. Reopen Team cases and sign in again after closing or reloading a tab. Unlinking or clearing the local fleet stops sharing from that device. Ask the team's service administrator about hosted case retention or deletion.

To refresh the README recording, use a synthetic team with test cases and assignment notices. Set `FLEETOPS_TEAM_GIF_EMAIL`, `FLEETOPS_TEAM_GIF_PASSWORD` and `FLEETOPS_TEAM_GIF_TEAM` in the recording process, then run `npm --prefix web run gifs teams` against a configured build.
