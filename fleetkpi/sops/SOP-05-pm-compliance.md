---
id: SOP-05
title: Preventive-maintenance compliance
owner: Maintenance planner
cadence: Weekly
trigger: PM compliance below target, or any vehicle overdue
page: Service Network
---

## Purpose
Service every vehicle inside its interval (km or months, by powertrain), so breakdowns and warranty disputes stay rare.

## Steps
- [ ] Pull the **Overdue** and **Due soon** lists from Service Network → PM compliance.
- [ ] Book every overdue vehicle within 7 days, and every due-soon vehicle inside its window.
- [ ] Check intervals in `fleet.yml` match manufacturer schedules per powertrain. Electric vehicles need fewer services; combustion vehicles need oil services.
- [ ] Group bookings by site to protect workshop capacity (see the Service Network heatmap).
- [ ] Confirm completed services are recorded as **Preventive maintenance** work orders.

## Exit criteria
No vehicle overdue by more than 14 days; compliance at or above target.

## Escalation
Repeat overdue vehicles go to their operator's account manager.
