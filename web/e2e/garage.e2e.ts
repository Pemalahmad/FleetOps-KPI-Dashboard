import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("region", { name: "Visual fleet garage" })).toBeVisible();
};
test("garage has real queues and retains analytical access", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("heading", { name: "Daily command", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Daily fleet command" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Damage SOP-09" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Road ready queue" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fleet operations, as one system" })).toBeVisible();
});
test("mobile garage contains the wide queue without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await ready(page);
  const pageWidth = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport);
  await expect(page.getByRole("region", { name: "Renewal desk queue", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Daily command" })).toHaveAttribute("aria-current", "page");
});
test("daily command sends an exception into its working queue", async ({ page }) => {
  await ready(page);
  const command = page.getByRole("region", { name: "Daily fleet command" });
  await command.getByRole("button", { name: /Accident intake/ }).click();
  await expect(page.getByRole("group", { name: "Garage queue filters" }).getByRole("button", { name: /Accident intake/ })).toHaveAttribute("aria-pressed", "true");
});
test("Daily Command shows both Bahrain deadlines based on the demo report date", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await ready(page);
  await page.getByRole("button", { name: "Bahrain", exact: true }).click();
  const command = page.getByRole("region", { name: "Daily fleet command" });
  await command.getByRole("button", { name: /GCC reminders/ }).click();
  await command.getByRole("textbox", { name: "Find vehicle or owner" }).fill("BA 53194");
  const registration = command.getByRole("listitem", { name: "BA 53194 Registration renewal" });
  const inspection = command.getByRole("listitem", { name: "BA 53194 Technical inspection" });
  await expect(registration.getByText("2026-10-18", { exact: true })).toBeVisible();
  await expect(inspection.getByText("2026-10-18", { exact: true })).toBeVisible();
  await expect(inspection).toContainText("Upcoming");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await inspection.getByRole("button", { name: "Open vehicle" }).click();
  await expect(page.getByRole("dialog").getByText("Bahrain technical inspection", { exact: false }).first()).toBeVisible();
});
test("an incomplete damage intake immediately places a hold and exports no release", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Practice a damage case" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Recovery owner" }).fill("Shift lead");
  await dialog.getByRole("textbox", { name: "What happened?" }).fill("Source evidence pending.");
  await dialog.getByRole("button", { name: "Record incident and hold vehicle" }).click();
  await expect(dialog.getByRole("heading", { name: "Damage escalation case" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Move to assessment" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Practice handover", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Download release record" })).toHaveCount(0);
});
test("accident recovery holds a vehicle and requires the complete handover workflow", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Practice a damage case" }).click();
  const report = page.getByRole("dialog");
  await report.getByRole("textbox", { name: "Recovery owner" }).fill("Garage test reviewer");
  await report.getByRole("textbox", { name: "What happened?" }).fill("Test bumper incident, recovery evidence checked.");
  await report.getByRole("combobox", { name: "Severity" }).selectOption("minor");
  await report.getByRole("combobox", { name: "Drivability" }).selectOption("drivable");
  await report.getByRole("combobox", { name: "Police notification" }).selectOption("no");
  await report.getByRole("textbox", { name: "Police rationale" }).fill("Synthetic single-vehicle case.");
  await report.getByRole("combobox", { name: "Insurer notification" }).selectOption("no");
  await report.getByRole("textbox", { name: "Insurer rationale" }).fill("Synthetic internal repair.");
  await report.getByRole("textbox", { name: "Management escalation deadline" }).fill("2026-11-24T12:00");
  await report.getByRole("button", { name: "Record incident and hold vehicle" }).click();
  await expect(page.getByRole("heading", { name: "Report an accident" })).not.toBeVisible();
  const review = page.getByRole("dialog");
  await expect(review.getByText("Accident recovery", { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Practice handover", exact: true })).toBeDisabled();
  await expect(review.getByRole("link", { name: "Open SOP-09" })).toBeVisible();
  await expect(review.getByRole("button", { name: "Move to assessment" })).toBeDisabled();
  const plate = (await review.getByRole("heading", { level: 2 }).innerText()).trim();
  await review.getByRole("button", { name: "Close vehicle details" }).click();
  const command = page.getByRole("region", { name: "Daily fleet command" });
  await command.getByRole("button", { name: /Damage deadlines overdue/ }).click();
  await command.getByRole("textbox", { name: "Find vehicle or owner" }).fill(plate);
  await expect(command.getByText("Escalate overdue management notification")).toBeVisible();
  const shift = page.waitForEvent("download");
  await command.getByRole("button", { name: "Download shift handoff" }).click();
  expect(await readFile((await (await shift).path())!, "utf8")).toContain("Escalate overdue management notification");
  await command.getByRole("button", { name: /Open damage case/ }).click();
  await review.getByRole("combobox", { name: "Status" }).selectOption("sent");
  await review.getByRole("textbox", { name: "Management deadline source" }).fill("Practice depot policy");
  await review.getByRole("textbox", { name: "Completed at" }).fill("2026-11-23T10:00");
  await review.getByRole("textbox", { name: "Recorded by" }).fill("Garage test reviewer");
  await review.getByRole("textbox", { name: "Reference", exact: true }).fill("MGT-001");
  for (const name of ["Scene photos", "Vehicle photos", "Driver statement", "Estimate", "Repair completion", "Quality record"]) {
    await review.getByRole("checkbox", { name: new RegExp(name, "i") }).check();
    await review.getByRole("group", { name: "Evidence references" }).getByRole("textbox", { name: `${name} reference` }).fill(`${name.toUpperCase().replaceAll(" ", "-")}-001`);
  }
  await review.getByRole("textbox", { name: "Estimate supplier" }).fill("Approved Repair Co");
  await review.getByRole("textbox", { name: "Currency" }).fill("AED");
  await review.getByRole("spinbutton", { name: "Amount" }).fill("2500");
  await review.getByRole("group", { name: "Estimate and authorization" }).getByRole("textbox", { name: "Estimate reference" }).fill("EST-001");
  await review.getByRole("textbox", { name: "Received at" }).fill("2026-11-23T10:30");
  await review.getByRole("combobox", { name: "Authorization" }).selectOption("approved");
  await review.getByRole("textbox", { name: "Approver" }).fill("Fleet manager");
  await review.getByRole("textbox", { name: "Decision time" }).fill("2026-11-23T10:45");
  await review.getByRole("textbox", { name: "Authorization reference" }).fill("AUTH-001");
  await review.getByRole("textbox", { name: "Supplier", exact: true }).fill("Approved Repair Co");
  await review.getByRole("textbox", { name: "Work order" }).fill("WO-001");
  await review.getByRole("textbox", { name: "Invoice reference" }).fill("INV-001");
  await review.getByRole("textbox", { name: "Completion reference", exact: true }).fill("COMP-001");
  await review.getByRole("textbox", { name: "Started" }).fill("2026-11-23T11:00");
  await review.getByRole("textbox", { name: "Completed", exact: true }).fill("2026-11-23T12:00");
  await review.getByRole("textbox", { name: "Reviewer", exact: true }).fill("Quality reviewer");
  await review.getByRole("textbox", { name: "Reviewed at" }).fill("2026-11-23T12:30");
  await review.getByRole("textbox", { name: "Quality reference" }).fill("QA-001");
  for (const name of ["Scope complete", "Safety defects clear", "Warning lights clear", "Road or functional test", "Final photos"])
    await review.getByRole("checkbox", { name: new RegExp(name, "i") }).check();
  await review.getByRole("button", { name: "Save damage case" }).click();
  await expect(review.getByRole("button", { name: "Move to assessment", exact: true })).toBeEnabled();
  await review.getByRole("button", { name: "Move to assessment", exact: true }).click();
  await review.getByRole("button", { name: "Move to repair", exact: true }).click();
  await review.getByRole("button", { name: "Move to quality checks", exact: true }).click();
  await review.getByRole("button", { name: "Move to ready for review", exact: true }).click();
  await review.getByRole("checkbox", { name: /Safety walkaround/ }).check();
  await review.getByRole("checkbox", { name: /Repair \/ road test signed off/ }).check();
  await review.getByRole("checkbox", { name: /Keys and dispatch handover/ }).check();
  await review.getByRole("button", { name: "Practice handover", exact: true }).click();
  await expect(review.getByRole("button", { name: "Handover recorded", exact: true })).toBeDisabled();
  await expect(review.getByText(/Practice handover completed/)).toBeVisible();
  const release = page.waitForEvent("download");
  await review.getByRole("button", { name: "Download release record" }).click();
  const receipt = await readFile((await (await release).path())!, "utf8");
  expect(receipt).toContain("Practice depot policy");
  expect(receipt).toContain("QA-001");
  expect(receipt).toContain("Garage test reviewer");
});

test("a Saudi operating-card evidence gap blocks actual Garage handover", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "KSA", exact: true }).click();
  const command = page.getByRole("region", { name: "Daily fleet command" });
  await command.getByRole("button", { name: /Needs evidence/ }).click();
  await command.getByRole("button", { name: /Add the TGA or Naql operating card/ }).first().click();
  const vehicle = page.getByRole("dialog");
  await expect(vehicle.getByText("TGA operating card", { exact: false }).first()).toBeVisible();
  await vehicle.getByRole("textbox", { name: "Review owner" }).fill("Release reviewer");
  for (const label of [/Safety walkaround/, /Repair \/ road test signed off/, /Keys and dispatch handover/])
    await vehicle.getByRole("checkbox", { name: label }).check();
  await vehicle.getByText(/\d+ handover blocker\(s\)/).click();
  await expect(vehicle.getByText("TGA operating card: Add the TGA or Naql operating card and its expiry.")).toBeVisible();
  await expect(vehicle.getByRole("button", { name: "Practice handover", exact: true })).toBeDisabled();
});
test("Bahrain registration class and inspection determine actual Garage handover", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Bahrain", exact: true }).click();
  const command = page.getByRole("region", { name: "Daily fleet command" });
  await command.getByRole("button", { name: /Needs evidence/ }).click();
  await command.getByRole("textbox", { name: "Find vehicle or owner" }).fill("BA 53194");
  await expect(command.getByText("Inspection is due for renewal. Add current technical inspection evidence before release.")).toBeVisible();

  const scenarios = [
    { plate: "BA 33306", gate: "Bahrain registration class", detail: "Add the official registration type from the Bahrain registration card.", held: true },
    { plate: "BA 53194", gate: "Bahrain technical inspection", detail: "Inspection is due for renewal. Add current technical inspection evidence before release.", held: true },
    { plate: "BA 57056", gate: "Bahrain technical inspection", detail: "Bahrain Traffic requires inspection. Add current technical inspection evidence before release.", held: true },
    { plate: "BA 52154", gate: "Bahrain technical inspection", detail: "Private class age exemption applies through 2026-10-01.", held: false, registration: "خصوصي" },
    { plate: "BA 35115", gate: "Bahrain technical inspection", detail: "Inspection is due for renewal. Evidence valid through 2026-10-24.", held: false, registration: "Private transport" },
  ];
  for (const { plate, gate, detail, held, registration } of scenarios) {
    await page.getByRole("textbox", { name: "Search garage vehicles" }).fill(plate);
    await page.getByRole("button", { name: `Open vehicle ${plate}`, exact: true }).click();
    const vehicle = page.getByRole("dialog");
    await expect(vehicle.getByText(detail, { exact: true })).toBeVisible();
    await expect(vehicle.getByRole("link", { name: "Ministry of Interior, General Directorate of Traffic" }).first())
      .toHaveAttribute("href", "https://services.bahrain.bh/wps/portal/VehicleRegistrationRenewal_ar");
    await vehicle.getByRole("textbox", { name: "Review owner" }).fill("Bahrain release reviewer");
    for (const name of [/Safety walkaround/, /Repair \/ road test signed off/, /Keys and dispatch handover/])
      await vehicle.getByRole("checkbox", { name }).check();
    const handover = vehicle.getByRole("button", { name: "Practice handover", exact: true });
    if (held) {
      await vehicle.getByText(/\d+ handover blocker\(s\)/).click();
      await expect(vehicle.getByText(gate + ": " + detail, { exact: true })).toBeVisible();
      await expect(handover).toBeDisabled();
      await expect(vehicle.getByRole("button", { name: "Download release record" })).toHaveCount(0);
    } else {
      await handover.click();
      await expect(vehicle.getByText(/Practice handover completed/)).toBeVisible();
      const download = page.waitForEvent("download");
      await vehicle.getByRole("button", { name: "Download release record" }).click();
      const receipt = await readFile((await (await download).path())!, "utf8");
      expect(receipt).toContain(`Bahrain registration class | pass | ${registration}`);
      expect(receipt).toContain(`${gate} | pass | ${detail}`);
    }
    await vehicle.getByRole("button", { name: "Close vehicle details" }).click();
  }
});
test("Bahrain owner import uses officially declared class and matched inspection before recording handover", async ({ page }) => {
  await page.goto("/import/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  const today = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const day = (offset: number) => new Date(Date.parse(today + "T00:00:00Z") + offset * 864e5).toISOString().slice(0, 10);
  const book = XLSX.utils.book_new();
  const sheet = (name: string, data: (string | number | boolean)[][]) =>
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), name);
  sheet("sites", [["site_id", "site_name", "region"], ["BH-SYN", "Synthetic Bahrain depot", "BH"]]);
  const ids = ["BHT-HELD", "BHT-PASS"];
  sheet("vehicles", [
    ["vehicle_id", "plate_number", "make", "model", "powertrain", "home_site_id", "in_service_date", "Registration Type",
      "Date of Manufacture", "registration_expiry", "insurance_expiry", "GDT Inspection Required"],
    ...ids.map((id) => [id, id, "Synthetic", "Fleet Van", "ICE", "BH-SYN", day(-120), "نقل خاص", day(-155), day(14), day(40), false]),
  ]);
  sheet("work_orders", [
    ["work_order_id", "vehicle_id", "site_id", "job_type", "opened_at", "closed_at", "total_cost"],
    ...ids.map((id) => ["PM-" + id, id, "BH-SYN", "Preventive maintenance", day(-2) + " 10:00", day(-2) + " 14:00", 70]),
  ]);
  sheet("usage", [["vehicle_id", "date", "km"], ...ids.flatMap((id) => [[id, day(-2), 100], [id, day(-1), 100]])]);
  sheet("recalls", [["campaign_id", "title", "launch_date"], ["SYN-FUTURE", "Synthetic future recall", day(10)]]);
  sheet("recall_vehicles", [["campaign_id", "vehicle_id"], ["SYN-FUTURE", ids[0]]]);
  sheet("documents", [
    ["document_id", "vehicle_ref", "doc_type", "issuer", "issue_date", "expiry_date"],
    ["BH-TST-CERT", ids[1], "Inspection", "Bahrain Traffic", day(-3), day(20)],
  ]);
  const buffer = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  await page.setInputFiles("input[type=file]", { name: "synthetic-bahrain-fleet.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: /Add to my fleet and build/ }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await page.goto("/");
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });

  for (const [i, id] of ids.entries()) {
    await page.getByRole("textbox", { name: "Search garage vehicles" }).fill(id);
    await page.getByRole("button", { name: "Open vehicle " + id, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("نقل خاص", { exact: true })).toBeVisible();
    await dialog.getByRole("textbox", { name: "Review owner" }).fill("Synthetic Bahrain release reviewer");
    for (const name of [/Safety walkaround/, /Repair \/ road test signed off/, /Keys and dispatch handover/])
      await dialog.getByRole("checkbox", { name }).check();
    const handover = dialog.getByRole("button", { name: "Record handover", exact: true });
    if (i === 0) {
      await expect(dialog.getByText("Inspection is due for renewal. Add current technical inspection evidence before release.", { exact: true })).toBeVisible();
      await expect(handover).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Download release record" })).toHaveCount(0);
    } else {
      await expect(dialog.getByText(`Inspection is due for renewal. Evidence valid through ${day(20)}.`, { exact: true })).toBeVisible();
      await handover.click();
      await expect(dialog.getByText("Handover recorded with reviewer and timestamp.")).toBeVisible();
      const download = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Download release record" }).click();
      const record = await readFile((await (await download).path())!, "utf8");
      expect(record).toContain("Bahrain registration class | pass | نقل خاص");
      expect(record).toContain(`Bahrain technical inspection | pass | Inspection is due for renewal. Evidence valid through ${day(20)}.`);
    }
    await dialog.getByRole("button", { name: "Close vehicle details" }).click();
  }
});
test("renewal task stages never waive expired source documents", async ({ page }) => {
  await ready(page);
  await page.getByRole("region", { name: "Renewal desk queue", exact: true }).locator(".garage-bay").first().click();
  const review = page.getByRole("dialog");
  await review.getByRole("textbox", { name: "Review owner", exact: true }).fill("Garage test reviewer");
  for (const label of [/Safety walkaround/, /Repair \/ road test signed off/, /Keys and dispatch handover/])
    await review.getByRole("checkbox", { name: label }).check();
  await review.getByRole("combobox", { name: /Renewal progress/ }).first().selectOption("received");
  await review.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(review.getByRole("button", { name: "Practice handover", exact: true })).toBeDisabled();
  await expect(review.getByRole("heading", { name: "Source requirements" })).toBeVisible();
});
test("official classes and inspection evidence govern handover in the other five GCC markets", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/import/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  const today = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const day = (offset: number) => new Date(Date.parse(today + "T00:00:00Z") + offset * 864e5).toISOString().slice(0, 10);
  const saFirstYear = Number(today.slice(0, 4)) - 3;
  const markets = [
    { code: "AE", country: "UAE", registration: "مركبة ثقيلة", issuer: "RTA Dubai", expiry: day(14), emirate: "Dubai" },
    { code: "SA", country: "Saudi Arabia", registration: "أجرة", issuer: "MVPI", expiry: day(95), licensed: `${saFirstYear}-01-15` },
    { code: "QA", country: "Qatar", registration: "نقل خاص", issuer: "FAHES", expiry: day(14), owner: "Company", kg: 2999 },
    { code: "KW", country: "Kuwait", registration: "سيارة خاصة", issuer: "Kuwait General Traffic Department", expiry: day(14), due: day(-1), ref: "DEMO-SAHEL-1" },
    { code: "OM", country: "Oman", registration: "مركبة ركاب خفيفة تجارية", issuer: "Royal Oman Police", expiry: day(14), advertising: true },
  ];
  const vehicles = markets.flatMap((market) => [false, true].map((passed) => ({
    ...market, passed, id: market.code + (passed ? "-TEST-PASS" : "-TEST-HELD"),
  })));
  const book = XLSX.utils.book_new();
  const sheet = (name: string, data: (string | number | boolean)[][]) =>
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), name);
  sheet("sites", [["site_id", "site_name", "region"], ...markets.map((m) => [m.code, "Synthetic " + m.country, m.code])]);
  sheet("vehicles", [
    ["vehicle_id", "plate_number", "make", "model", "powertrain", "home_site_id", "in_service_date", "use_case",
      "Registration Type", "first_registration_date", "manufacture_date", "registered_as_new", "registration_expiry",
      "insurance_expiry", "registration_emirate", "registration_owner_type", "registration_weight_kg",
      "vehicle_advertising", "inspection_due_date", "inspection_schedule_reference"],
    ...vehicles.map((v) => [v.id, v.id, "Synthetic", "Fleet asset", "ICE", v.code, day(-120),
      v.code === "SA" ? "Taxi" : "Pool car", v.registration, v.licensed ?? day(-150),
      v.licensed ?? day(-170), v.code !== "AE", v.code === "SA" && v.passed ? day(14) : v.expiry, day(150), v.emirate ?? "", v.owner ?? "",
      v.kg ?? "", v.advertising ?? "", v.due ?? "", v.ref ?? ""]),
  ]);
  sheet("work_orders", [
    ["work_order_id", "vehicle_id", "site_id", "job_type", "opened_at", "closed_at", "total_cost"],
    ...vehicles.map((v) => ["PM-" + v.id, v.id, v.code, "Preventive maintenance", day(-2) + " 10:00", day(-2) + " 14:00", 70]),
  ]);
  sheet("usage", [["vehicle_id", "date", "km"], ...vehicles.flatMap((v) => [[v.id, day(-2), 100], [v.id, day(-1), 100]])]);
  sheet("recalls", [["campaign_id", "title", "launch_date"], ["SYN-FUTURE", "Synthetic future recall", day(10)]]);
  sheet("recall_vehicles", [["campaign_id", "vehicle_id"], ["SYN-FUTURE", vehicles[0].id]]);
  sheet("documents", [
    ["document_id", "vehicle_ref", "doc_type", "issuer", "issue_date", "expiry_date", "inspection_result"],
    ...vehicles.filter((v) => v.passed || v.code === "OM").map((v) => ["CERT-" + v.id, v.id, "Inspection", v.issuer, day(-3), day(20), "Pass"]),
    ["OM-FAIL", "OM-TEST-HELD", "Inspection", "Royal Oman Police", day(-1), "", "Fail"],
  ]);
  const buffer = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  await page.setInputFiles("input[type=file]", { name: "synthetic-gcc-release.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: /Add to my fleet and build/ }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await page.goto("/");
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });

  const command = page.getByRole("region", { name: "Daily fleet command" });
  const search = command.getByRole("textbox", { name: "Find vehicle or owner" });
  const queue = command.getByLabel("Action queue");
  await command.getByRole("button", { name: /GCC reminders/ }).click();
  for (const market of markets) {
    await search.fill(market.code + "-TEST-HELD");
    const reminder = command.getByRole("listitem", { name: market.code + "-TEST-HELD Technical inspection" });
    await expect(reminder).toBeVisible();
    if (market.code === "OM") await expect(reminder).toContainText("Record a passing reinspection.");
    else {
      const dueOn = market.code === "SA" ? `${saFirstYear + 2}-01-15` : market.code === "KW" ? day(-1) : day(14);
      await expect(reminder.getByText(dueOn, { exact: true })).toBeVisible();
    }
    await search.fill(market.code + "-TEST-PASS");
    const renewal = command.getByRole("listitem", { name: market.code + "-TEST-PASS Registration renewal" });
    await expect(renewal.getByText(day(14), { exact: true })).toBeVisible();
  }

  await search.fill("KW-TEST-HELD");
  const inspection = command.getByRole("listitem", { name: "KW-TEST-HELD Technical inspection" });
  const renewal = command.getByRole("listitem", { name: "KW-TEST-HELD Registration renewal" });
  for (const [reminder, owner] of [[inspection, "Inspection lead"], [renewal, "Registration desk"]] as const) {
    await reminder.getByRole("button", { name: "Assign owner" }).click();
    await reminder.getByRole("textbox", { name: "Reminder owner" }).fill(owner);
    await reminder.getByRole("button", { name: "Save owner" }).click();
    await expect(reminder).toContainText("Owner " + owner);
  }
  await queue.selectOption("Overdue reminders");
  await expect(inspection).toContainText("Overdue");
  await expect(renewal).toHaveCount(0);
  const shift = page.waitForEvent("download");
  await command.getByRole("button", { name: "Download shift handoff" }).click();
  const handoff = await readFile((await (await shift).path())!, "utf8");
  expect(handoff).toContain("Owner: Inspection lead | Due: " + day(-1));
  expect(handoff).toContain("Owner: Registration desk | Due: " + day(14));
  await page.reload();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await command.getByRole("button", { name: /GCC reminders/ }).click();
  await search.fill("KW-TEST-HELD");
  await expect(inspection).toContainText("Owner Inspection lead");
  await expect(renewal).toContainText("Owner Registration desk");
  await inspection.getByRole("button", { name: "Change owner" }).click();
  await inspection.getByRole("textbox", { name: "Reminder owner" }).clear();
  await inspection.getByRole("button", { name: "Save owner" }).click();
  await expect(inspection).toContainText("Owner Unassigned");
  await expect(renewal).toContainText("Owner Registration desk");

  for (const v of vehicles) {
    await page.getByRole("textbox", { name: "Search garage vehicles" }).fill(v.id);
    await page.getByRole("button", { name: "Open vehicle " + v.id, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(v.registration, { exact: true })).toBeVisible();
    await dialog.getByRole("textbox", { name: "Review owner" }).fill("Synthetic GCC release reviewer");
    for (const name of [/Safety walkaround/, /Repair \/ road test signed off/, /Keys and dispatch handover/])
      await dialog.getByRole("checkbox", { name }).check();
    const handover = dialog.getByRole("button", { name: "Record handover", exact: true });
    const label = v.country + " technical inspection";
    if (v.passed) {
      await handover.click();
      await expect(dialog.getByText("Handover recorded with reviewer and timestamp.")).toBeVisible();
      const download = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Download release record" }).click();
      const receipt = await readFile((await (await download).path())!, "utf8");
      expect(receipt).toContain(`${v.country} registration class | pass | ${v.registration}`);
      expect(receipt).toContain(`${label} | pass | Evidence valid through ${day(20)}.`);
    } else {
      await dialog.getByText(/\d+ handover blocker\(s\)/).click();
      await expect(dialog.locator("#handover-blockers li")).toHaveCount(1);
      await expect(dialog.locator("#handover-blockers")).toContainText(label);
      if (v.code === "SA") await expect(dialog.locator("#handover-blockers")).toContainText("Periodic inspection is due.");
      if (v.code === "OM") await expect(dialog.locator("#handover-blockers")).toContainText("Record a passing reinspection");
      await expect(handover).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Download release record" })).toHaveCount(0);
    }
    await dialog.getByRole("button", { name: "Close vehicle details" }).click();
  }
});
test("alerts remain accessible beyond the first fifty and can be filtered", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: /Alerts/ }).click();
  const inbox = page.getByRole("dialog");
  await inbox.getByRole("button", { name: "Next alerts", exact: true }).click();
  await expect(inbox.getByText(/page 2 of/)).toBeVisible();
  await inbox.getByRole("button", { name: "Renewal / service", exact: true }).click();
  await expect(inbox.getByText(/page 1 of/)).toBeVisible();
  await inbox.getByRole("button", { name: "Mark shown as read", exact: true }).click();
  await expect(inbox.getByRole("button", { name: "Next alerts", exact: true })).toBeEnabled();
});
test("the owner can choose a car shape per model and the garage keeps it", async ({ page }) => {
  await ready(page);
  await page.getByRole("link", { name: /Fleet register/ }).first().click();
  const picker = page.getByRole("combobox", { name: /Car shape for/ }).first();
  await expect(picker).toHaveValue("auto");
  await picker.selectOption("pickup");
  await expect(picker).toHaveValue("pickup");
  await page.getByRole("link", { name: /Daily command/ }).first().click();
  await expect(page.getByRole("region", { name: "Visual fleet garage" })).toBeVisible();
  await page.getByRole("link", { name: "Match car shapes" }).click();
  await expect(page.getByRole("combobox", { name: /Car shape for/ }).first()).toHaveValue("pickup");
});

test("service board: every stage has orders, gates hold, and a booking lands in Scheduled", async ({ page }) => {
  await page.goto("/service/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 120_000 });
  const board = (name: string) => page.getByRole("region", { name, exact: true });
  for (const stage of ["Scheduled", "Arrived", "Service ready", "On hold", "In service", "Diagnosis", "Service complete", "Delivered"])
    await expect(board(stage).locator("button").first()).toBeVisible();

  // An arrived order cannot move to Service ready until it is assigned.
  await board("Arrived").locator("button").first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Assigned to").fill("");
  await expect(sheet.getByText("Assign the stage to a technician or advisor.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Move to Service ready" })).toBeDisabled();
  await sheet.getByLabel("Assigned to").fill("Grace Okafor");
  await sheet.getByRole("button", { name: "Move to Service ready" }).click();
  await expect(sheet.getByText("Service ready", { exact: true }).first()).toBeVisible();
  for (const tab of ["Check-in", "Work", "Time", "Comments", "Invoice", "History"]) {
    await sheet.getByRole("tab", { name: tab }).click();
    await expect(sheet.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
  await page.keyboard.press("Escape");

  const scheduled = await board("Scheduled").locator("button").count();
  await page.getByRole("button", { name: "Book a vehicle" }).click();
  const book = page.getByRole("dialog");
  await book.getByLabel(/Vehicle/).fill("V0");
  await book.locator("ul button").first().click();
  await book.getByLabel("Service advisor").fill("Lina Haddad");
  await book.getByLabel("Issue reported").fill("Brake warning light on");
  await book.getByRole("button", { name: "Book in" }).click();
  await expect(board("Scheduled").locator("button")).toHaveCount(scheduled + 1);
});

async function importIncidentFleet(page: import("@playwright/test").Page) {
  await page.goto("/import/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  const today = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const day = (offset: number) => new Date(Date.parse(today + "T00:00:00Z") + offset * 864e5).toISOString().slice(0, 10);
  const plate = "SA-ESC-TEST";
  const book = XLSX.utils.book_new();
  const sheet = (name: string, data: (string | number | boolean)[][]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), name);
  sheet("sites", [["site_id", "site_name", "region"], ["SA", "Synthetic site", "SA"]]);
  sheet("vehicles", [
    ["vehicle_id", "plate_number", "make", "model", "powertrain", "home_site_id", "in_service_date", "use_case", "Registration Type",
      "first_registration_date", "registration_expiry", "insurance_expiry"],
    [plate, plate, "Synthetic", "Taxi", "ICE", "SA", day(-120), "Taxi", "أجرة", `${Number(today.slice(0, 4)) - 3}-01-15`, day(-1), day(150)],
  ]);
  sheet("work_orders", [["work_order_id", "vehicle_id", "site_id", "job_type", "opened_at", "closed_at", "total_cost"],
    ["WO-ESC-TEST", plate, "SA", "Preventive maintenance", day(-2) + " 10:00", day(-2) + " 14:00", 70]]);
  sheet("usage", [["vehicle_id", "date", "km"], [plate, day(-2), 100], [plate, day(-1), 100]]);
  const buffer = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  await page.setInputFiles("input[type=file]", { name: "synthetic-incident-fleet.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: /Add to my fleet and build/ }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  return { plate, day };
}

test("overdue GCC cases retain manager history and require separate confirmed document uploads", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const { plate, day } = await importIncidentFleet(page);
  const command = page.getByRole("region", { name: "Daily fleet command" });
  const openCommand = async () => {
    await page.goto("/");
    await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
    await command.getByRole("button", { name: /Overdue escalations/ }).click();
  };
  await openCommand();
  const registration = command.getByRole("listitem", { name: plate + " Registration renewal" });
  const inspection = command.getByRole("listitem", { name: plate + " Technical inspection" });
  await expect(registration).toContainText(day(-1));
  await expect(inspection).toBeVisible();
  await registration.getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: /Registration renewal/ });
  await dialog.getByLabel("Case owner").fill("Renewals lead");
  await dialog.getByLabel("Escalated to").fill("Fleet manager");
  await dialog.getByLabel("Follow-up date").fill(day(3));
  await dialog.getByLabel("Updated by").fill("Shift coordinator");
  await dialog.getByLabel("Update notes").fill("Called the responsible manager");
  await dialog.getByRole("button", { name: "Record escalation" }).click();
  await expect(dialog.getByRole("button", { name: "Mark awaiting document" })).toBeEnabled();
  await dialog.getByLabel("Update notes").fill("Updated card requested");
  await dialog.getByRole("button", { name: "Mark awaiting document" }).click();
  await expect(dialog.getByRole("region", { name: "Escalation history" })).toContainText("Updated card requested");
  await dialog.getByRole("button", { name: "Close escalation" }).click();
  await openCommand();
  await expect(registration).toContainText("Awaiting document");
  await expect(registration).toContainText("Manager Fleet manager");
  const download = page.waitForEvent("download");
  await command.getByRole("button", { name: /Download shift handoff/ }).click();
  expect(await readFile((await (await download).path())!, "utf8")).toContain(`Case owner: Renewals lead | Manager: Fleet manager | Follow-up: ${day(3)}`);

  const upload = async (kind: "Registration" | "Inspection", name: string) => {
    await page.goto("/documents/");
    await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
    await page.setInputFiles("input[type=file]", { name, mimeType: "text/plain", buffer: Buffer.from(`Synthetic ${kind} evidence for ${plate}`) });
    await page.getByLabel("Vehicle (plate, VIN or fleet number)").fill(plate);
    await expect(page.getByText(new RegExp("Matches " + plate))).toBeVisible();
    await page.getByRole("combobox", { name: "Type", exact: true }).selectOption(kind);
    await page.getByLabel("Number", { exact: true }).fill(`TEST-${kind}`);
    await page.getByLabel("Issued", { exact: true }).fill(day(-1));
    await page.getByLabel("Expires", { exact: true }).fill(day(80));
    await page.getByLabel("Issuer", { exact: true }).fill(kind === "Inspection" ? "MVPI" : "General Directorate of Traffic");
    if (kind === "Inspection") await page.getByLabel("Inspection result").selectOption("Pass");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Document vault · [12]/ })).toBeVisible({ timeout: 90_000 });
  };

  await upload("Registration", "synthetic-registration.txt");
  await openCommand();
  await expect(registration).toHaveCount(0, { timeout: 60_000 });
  await expect(inspection).toBeVisible();
  await command.getByLabel("Action queue").selectOption("Closed escalations");
  await registration.getByRole("button").click();
  await expect(dialog.getByRole("region", { name: "Verified document" })).toContainText("synthetic-registration.txt");
  await expect(dialog.getByRole("region", { name: "Verified document" })).toContainText("Manager Fleet manager");
  await expect(dialog.getByRole("region", { name: "Escalation history" })).toContainText("Called the responsible manager");
  await upload("Inspection", "synthetic-inspection-pass.txt");
  await openCommand();
  await expect(inspection).toHaveCount(0, { timeout: 60_000 });
  await command.getByLabel("Action queue").selectOption("Closed escalations");
  await inspection.getByRole("button").click();
  const inspectionDialog = page.getByRole("dialog", { name: /Technical inspection/ });
  await expect(inspectionDialog.getByRole("region", { name: "Verified document" })).toContainText("synthetic-inspection-pass.txt");
  await expect(inspectionDialog.getByRole("region", { name: "Verified document" })).toContainText(day(80));
});

test("EHS is available across navigation and preserves incident escalation through independent closure", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const { plate, day } = await importIncidentFleet(page);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "EHS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Environment, health & safety" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Incident response SOP" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Escalation method" })).toBeVisible();
  await expect(page.getByRole("link", { name: /ISO 45001/ })).toHaveAttribute("href", "https://www.iso.org/standard/45001");
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "EHS", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Report EHS incident" }).click();
  const report = page.getByRole("form", { name: "Report EHS incident" });
  await report.getByLabel("Country").selectOption("Saudi Arabia");
  await report.getByLabel("Site or location").fill("Synthetic workshop");
  await report.getByLabel("Category").selectOption("Near miss");
  await report.getByLabel("Severity").selectOption("high");
  await report.getByLabel("Incident time (local)").fill(day(-1) + "T09:00");
  await report.getByLabel("Vehicle or work order reference").fill(plate);
  await report.getByLabel("Reported by").fill("Site supervisor");
  await report.getByLabel("What happened").fill("Synthetic equipment near miss");
  await report.getByRole("button", { name: "File incident report" }).click();
  const detail = page.getByRole("region", { name: "EHS case details" });
  const edit = detail.getByRole("form", { name: "Update EHS case" });
  await edit.getByLabel("Case owner").fill("Safety lead");
  await edit.getByLabel("Accountable manager").fill("Operations manager");
  await edit.getByLabel("Follow-up date").fill(day(-1));
  const step = async (button: string, note: string, actor = "Safety lead") => {
    const action = edit.getByRole("button", { name: button, exact: true });
    await expect(action).toBeEnabled();
    await edit.getByLabel("Updated by").fill(actor);
    await edit.getByLabel("Update note").fill(note);
    await action.click();
  };
  await step("Record escalation", "Manager acknowledged the escalation by phone");
  await expect(edit.getByRole("button", { name: "Record containment" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("list", { name: "EHS cases" })).toContainText("Owner Safety lead");
  await expect(page.getByRole("list", { name: "EHS cases" })).toContainText("Manager Operations manager");
  await expect(page.getByRole("list", { name: "EHS cases" })).toContainText("Overdue");
  await page.getByRole("button", { name: "Open case Synthetic equipment near miss" }).click();
  await step("Record containment", "Equipment isolated, test reference LOCK-1");
  await step("Record corrective action", "Interlock replaced and tested, reference TEST-7");
  await step("Verify and close", "Attempted closure before the reporting review", "Independent reviewer");
  await expect(page.getByRole("alert").filter({ hasText: "Resolve the external reporting review" })).toBeVisible();
  await edit.getByRole("combobox", { name: "External reporting", exact: true }).selectOption("not_required");
  await edit.getByLabel("Authority filing reference or decision basis").fill("EHS decision TEST-8");
  await step("Verify and close", "Independent functional test passed", "Independent reviewer");
  const history = detail.getByRole("region", { name: "EHS case history" });
  for (const expected of ["Manager acknowledged", "Equipment isolated", "Interlock replaced", "Independent functional test passed", "EHS decision TEST-8"]) {
    await expect(history).toContainText(expected);
  }
  await detail.getByRole("button", { name: "Back to case register" }).click();
  await page.getByLabel("Case status").selectOption("closed");
  await expect(page.getByRole("list", { name: "EHS cases" })).toContainText("Verified closed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
