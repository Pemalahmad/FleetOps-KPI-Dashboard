import { expect, test } from "@playwright/test";

const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("region", { name: "Visual fleet garage" })).toBeVisible();
};
test("garage has real queues and retains analytical access", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("heading", { name: "Every vehicle has a next move." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Daily fleet command" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Damage SOP-09" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Road ready queue" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fleet operations, as one system" })).toBeVisible();
});
test("mobile garage contains the wide queue without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await command.getByRole("button", { name: /Accident holds/ }).click();
  await expect(page.getByRole("group", { name: "Garage queue filters" }).getByRole("button", { name: /Accident intake/ })).toHaveAttribute("aria-pressed", "true");
});
test("accident recovery holds a vehicle and requires the complete handover workflow", async ({ page }) => {
  await ready(page);
  await page.getByRole("region", { name: "Road ready queue", exact: true }).locator(".garage-bay").first().click();
  const vehicle = page.getByRole("dialog");
  const plate = (await vehicle.getByRole("heading", { level: 2 }).innerText()).trim();
  await vehicle.getByRole("button", { name: "Report accident for this vehicle" }).click();
  const report = page.getByRole("dialog");
  await report.getByRole("textbox", { name: "Recovery owner" }).fill("Garage test reviewer");
  await report.getByRole("textbox", { name: "What happened?" }).fill("Test bumper incident, recovery evidence checked.");
  await report.getByRole("combobox", { name: "Severity" }).selectOption("minor");
  await report.getByRole("combobox", { name: "Drivability" }).selectOption("drivable");
  await report.getByRole("combobox", { name: "Police notification" }).selectOption("no");
  await report.getByRole("combobox", { name: "Insurer notification" }).selectOption("no");
  await report.getByRole("textbox", { name: "Management escalation deadline" }).fill("2026-11-24T12:00");
  await report.getByRole("button", { name: "Record incident and hold vehicle" }).click();
  await expect(report).not.toBeVisible();
  await page.getByRole("textbox", { name: "Search garage vehicles" }).fill(plate);
  await page.getByRole("button", { name: "Open vehicle " + plate, exact: true }).first().click();
  const review = page.getByRole("dialog");
  await expect(review.getByText("Accident recovery", { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Practice handover", exact: true })).toBeDisabled();
  await expect(review.getByRole("link", { name: "Open SOP-09" })).toBeVisible();
  await review.getByRole("combobox", { name: "Status" }).selectOption("sent");
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
