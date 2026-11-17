import { expect, test } from "@playwright/test";

const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("region", { name: "Visual fleet garage" })).toBeVisible();
};
test("garage has real queues and retains analytical access", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("heading", { name: "Every vehicle has a next move." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Road ready queue" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fleet operations, as one system" })).toBeVisible();
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
  await report.getByRole("button", { name: "Record incident and hold vehicle" }).click();
  await expect(report).not.toBeVisible();
  await page.getByRole("textbox", { name: "Search garage vehicles" }).fill(plate);
  await page.getByRole("button", { name: "Open vehicle " + plate, exact: true }).first().click();
  const review = page.getByRole("dialog");
  await expect(review.getByText("Accident recovery", { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Practice handover", exact: true })).toBeDisabled();
  await review.getByRole("button", { name: "Move to assessment", exact: true }).click();
  await review.getByRole("button", { name: "Move to repair", exact: true }).click();
  await review.getByRole("button", { name: "Move to quality checks", exact: true }).click();
  await review.getByRole("checkbox", { name: /Safety walkaround/ }).check();
  await review.getByRole("checkbox", { name: /Repair \/ road test signed off/ }).check();
  await review.getByRole("checkbox", { name: /Keys and dispatch handover/ }).check();
  await review.getByRole("button", { name: "Move to ready for review", exact: true }).click();
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
