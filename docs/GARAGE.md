# The visual garage

The home page turns the fleet register into an operating workspace. The previous KPI dashboard is available under Analytics at /overview/. Original light and dark colors are retained.

## Queues

| Queue | What puts a vehicle here | Next move |
|---|---|---|
| Road ready | Source requirements pass in the loaded report and there is no outstanding recovery review | Review before a new dispatch |
| Repair bays | Unfinished work orders, or an accident in its repair stage | Complete repair work and record source milestones |
| Renewal desk | Expired or unknown registration/insurance dates | Track renewal, receive the document and confirm updated expiry evidence |
| Accident intake | A reported incident in assessment, or an unfinished imported collision work order | Name the recovery owner and assess damage |
| Dispatch review | Recorded repair-ready milestones or accident quality/release stage | Close all source work orders, check requirements and complete release checks |
| Safety checks | Missing/stale operational evidence, overdue maintenance or unresolved recalls | Resolve or refresh the source evidence |

Queues follow the report date shown on screen. They describe recorded status, not physical vehicle location or a live telematics feed. Each garage area previews three cars; its count and the searchable queue cover the full fleet.

## Work a vehicle

1. Open its car or vehicle-queue row.
2. Review every source requirement. Expired documents, open repairs, overdue service, unresolved recalls and unknown evidence remain blockers.
3. Track registration and insurance renewal stages. Marking a document Received does not make an expired date valid; confirm the renewed source document.
4. Follow the recorded repair milestones. Blank timestamps are explicitly unrecorded. One ready job never conceals a second unfinished job.
5. For an accident, advance through Reported, Assessment, Repair, Quality checks and Ready for review. Release checkboxes become available during Quality checks.
6. Record the review owner, target date, notes, safety walkaround, required repair/road-test signoff and keys/dispatch handover.
7. Save the review, then record the handover when all requirements pass.

A live handover rechecks document dates against today. It also requires current report and vehicle usage coverage. Missing operational or affected-recall records cannot be treated as clearance. A source rebuild invalidates queued actions; changed source evidence or a new incident resets signoffs. Prior notes are archived, and completed handovers retain their signed review and source gates.

The tool records a human review; source evidence and physical checks still determine actual road readiness.

## Alerts and missions

Accident reports, imported collision work orders, expired documents, pending dispatch reviews, renewal reminders and overdue service create in-app alerts. Use type filters and page controls to reach every alert. Read status affects the inbox badge; it never clears a vehicle hold.

Missions point to the relevant queues. A recorded handover earns 50 crew XP once per vehicle/source revision. Replaying the same action cannot earn more credit. No points or rank waive a source requirement.

## Storage

Owner incidents, reviews, read status and handovers are saved with the existing Workspace in this browser. If passphrase protection is enabled, the existing encryption applies to garage records too. Saved progress survives reloads; deleting the fleet removes it. Demo practice is separate tab memory, survives internal navigation and resets on reload.

The garage sends no external notifications. It updates when new source records are imported or someone records an operation here.
