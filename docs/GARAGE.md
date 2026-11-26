# The visual garage

The home page turns the fleet register into an operating workspace. The previous KPI dashboard is available under Analytics at /overview/. Original light and dark colors are retained.

Start in **Daily command**. Filter **Held**, **Needs evidence**, **Ready for review**, **Renewal due** or an SOP-09
stage, then search by plate, fleet number, site or owner. One row per vehicle shows its next action, assigned owner
or assignment gap, and the recorded deadline. **Download shift handoff** exports the scope’s outstanding actions
and today’s recorded handovers. A named reviewer can download an individual release record from the vehicle’s
handover history.

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
5. For an accident, follow [SOP-09](../fleetkpi/sops/SOP-09-vehicle-damage-escalation.md). Record severity, drivability, safety facts and the operational hold before advancing through Reported, Assessment, Repair, Quality checks and Ready for review.
6. Record the review owner, target date, notes, safety walkaround, required repair/road-test signoff and keys/dispatch handover.
7. Save the review, then record the handover when all requirements pass.

A live handover rechecks document dates against today, including applicable GCC operating-card, renewal-inspection
and insurance-period requirements. It also requires current report and vehicle usage coverage. Missing operational
or affected-recall records remain evidence gaps. A source rebuild invalidates queued actions. Changed source or damage
evidence resets signoffs. Prior notes are archived, and completed handovers retain their signed review, source gates
and damage-case closure snapshot. Use the country rule links to confirm local requirements.

For Bahrain, the release review checks the official registration class and, for an applicable renewal inspection,
the current inspection evidence. Import the class and manufacture date with the vehicle file, then record any
required inspection in Documents. [Bahrain release evidence](GCC_COMPLIANCE.md#bahrain-release-evidence)

For the UAE, Saudi Arabia, Qatar, Kuwait and Oman, review the official class and the inspection result in
**Source requirements**. A failed inspection blocks handover until there is a later passing report. The affected
vehicle appears in Daily Command with the evidence to add. [GCC release evidence](GCC_COMPLIANCE.md#gcc-release-evidence)

## GCC reminders in Daily Command

Open **GCC reminders** to see upcoming and overdue inspections and registration renewals for the selected region.
The warning window is the fleet's configured renewal window, 30 days by default. Registration reminders use the
recorded expiry date. Inspection reminders use independently scheduled inspections or the applicable renewal
deadline. If a current inspection report expires before renewal, the reminder shows the earlier report expiry.
An open inspection failure or an undated authority direction prompts immediate action.

Choose **Assign owner** beside each task. Assignments stay with that vehicle and task when new dates are imported.
The inspection and registration tasks can have different owners. Search by plate or owner, or use **Overdue
reminders** in the action queue. **Download shift handoff** includes the reminders and their owners. The reminders
appear in Daily Command and the export.

## Overdue compliance escalations

Open **Overdue escalations** in Daily Command. A dated GCC inspection or registration renewal opens a case when
it becomes overdue. The case starts with the reminder owner, when assigned. Track the responsible owner, the
manager contacted, the next follow-up and the notes. Record the escalation after contacting the manager and use
**Mark awaiting document** while the replacement is pending. The shift handoff includes open case assignments.

Upload and confirm the updated registration or inspection in **Documents**. Daily Command verifies the upload
against the same vehicle and applicable check. An inspection requires a current passing report and, after a failed
test, a later reinspection. A date changed in a workbook leaves the case open. Use **Closed escalations** to review
the accepted file name, reference, validity and case history. The manager contact is recorded in FleetOps and made
through your own channels.

## Environment, health and safety

Use **EHS** from global navigation, Daily Command, accident intake or Doctrine & SOPs. The incident register covers
road incidents, injuries and illness, near misses, workshop or site hazards, spills and emergencies across the GCC.
Record the event, contact the responsible people according to severity, assign an owner and manager, and set the next
review date. The case history records containment, investigation, corrective action and evidence references.

An independent reviewer confirms the corrective action and records the external reporting decision before closing
the case. Use approved local channels for emergency response and statutory reporting. The app's internal escalation
targets apply to follow-up inside the team. For a vehicle that needs recovery and dispatch clearance, use the
damage case and Garage release review.

The standards used as references are [ISO 45001](https://www.iso.org/standard/45001),
[ISO 14001](https://www.iso.org/standard/14001), [ISO 39001](https://www.iso.org/standard/44958.html), and
[ILO-OSH 2001](https://www.ilo.org/topics/safety-and-health-work/occupational-safety-and-health-ilo-areas-work/occupational-safety-and-health-management-systems).

## Damage escalation controls

The damage case is a recorded, append-only operational trail:

1. Intake classifies severity and drivability, records injury/emergency, third-party, public-property and towing facts, and places an active vehicle hold.
2. Police, insurer and management requirements are explicit decisions. Required actions have deadlines from the applicable authority, insurer, contract or company policy. FleetOps does not invent a universal GCC deadline.
3. The assessment gate requires referenced photos/statements and conditional third-party, police and insurer evidence, plus a complete estimate and authorised approval.
4. The repair gate requires supplier, work order, start/completion times, invoice and completion evidence.
5. The quality gate requires a named reviewer, review time, scope/safety/warning-light/test/final-photo checks, and a quality reference.
6. The handover re-runs every damage and source gate. The hold is released only after the handover record succeeds; the closed damage snapshot cannot be edited.

Overdue required notifications appear as critical in-app alerts. They are operational reminders only: FleetOps does not send police reports, claims, email, SMS or other network messages. Complete the action through the approved external channel and record the time, responsible person and reference in Garage.

Legacy GarageState v1 records remain readable. An older incident without damage fields is normalised conservatively to an unclassified case with an active hold, so missing historical detail never becomes an automatic clearance.

The tool records a human review; source evidence and physical checks still determine actual road readiness.

## Alerts and missions

Accident reports, imported collision work orders, expired documents, pending dispatch reviews, renewal reminders and overdue service create in-app alerts. Use type filters and page controls to reach every alert. Read status affects the inbox badge; it never clears a vehicle hold.

Missions point to the relevant queues. A recorded handover earns 50 crew XP once per vehicle/source revision. Replaying the same action cannot earn more credit. No points or rank waive a source requirement.

## Storage

Owner incidents, compliance escalations, EHS records, reviews, read status and handovers are saved with the existing Workspace in this browser. If passphrase protection is enabled, the existing encryption applies to garage records too. Saved progress survives reloads; deleting the fleet removes it. Demo practice is separate tab memory, survives internal navigation and resets on reload.

The garage sends no external notifications. It updates when new source records are imported or someone records an operation here. Damage photos and documents remain references in the case unless separately stored in the document vault; avoid unnecessary personal or medical detail.
