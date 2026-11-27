import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const testPage = process.env.FLEETOPS_TEAM_TEST_PAGE ?? "/team-cases/";
const reporterEmail = process.env.FLEETOPS_TEAM_TEST_REPORTER_EMAIL ?? "";
const reporterPassword = process.env.FLEETOPS_TEAM_TEST_REPORTER_PASSWORD ?? "";
const managerEmail = process.env.FLEETOPS_TEAM_TEST_MANAGER_EMAIL ?? "";
const managerPassword = process.env.FLEETOPS_TEAM_TEST_MANAGER_PASSWORD ?? "";
test.skip(!reporterEmail || !reporterPassword || !managerEmail || !managerPassword,
  "Set two synthetic FleetOps team test accounts to run the signed-in case workflow.");

async function signIn(context: BrowserContext, email: string, password: string) {
  const page = await context.newPage();
  await page.goto(testPage);
  await page.getByRole("textbox", { name: "Work email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 30_000 });
  return page;
}

async function reportNearMiss(page: Page, name: string) {
  await page.getByRole("button", { name: "Report shared EHS incident" }).click();
  const form = page.getByRole("form", { name: "Report a team EHS incident" });
  await form.getByRole("combobox", { name: "Country" }).selectOption("Saudi Arabia");
  await form.getByLabel("Site or location").fill("Synthetic fleet workshop");
  await form.getByRole("combobox", { name: "Category" }).selectOption("Near miss");
  await form.getByRole("combobox", { name: "Severity" }).selectOption("high");
  await form.getByLabel("Incident time (local)").fill("2026-01-01T09:00");
  await form.getByLabel("What happened").fill(name);
  await form.getByRole("button", { name: "Share incident with team" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
}

async function importFleet(page: Page, plate: string) {
  const today = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const day = (offset: number) => new Date(Date.parse(today + "T00:00:00Z") + offset * 864e5).toISOString().slice(0, 10);
  const book = XLSX.utils.book_new();
  const sheet = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  sheet("sites", [["site_id","site_name","region"],["SA","Synthetic workshop","SA"]]);
  sheet("vehicles", [
    ["vehicle_id", "plate_number", "make", "model", "powertrain", "home_site_id", "in_service_date", "use_case",
      "Registration Type", "first_registration_date", "registration_expiry", "insurance_expiry"],
    [plate, plate, "Synthetic", "Taxi", "ICE", "SA", day(-120), "Taxi", "أجرة",
      `${Number(today.slice(0,4))-3}-01-15`, day(-2), day(150)],
  ]);
  sheet("work_orders", [["work_order_id","vehicle_id","site_id","job_type","opened_at","closed_at","total_cost"],
    ["WO-SHARED",plate,"SA","Preventive maintenance",day(-3)+" 09:00",day(-3)+" 14:00",70]]);
  sheet("usage", [["vehicle_id","date","km"],[plate,day(-3),20],[plate,day(-1),20]]);
  const buffer = Buffer.from(XLSX.write(book,{type:"buffer",bookType:"xlsx"}));
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Import",exact:true}).click();
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({timeout:90_000});
  await page.setInputFiles("input[type=file]",{name:"synthetic-shared-cases.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer});
  await page.getByRole("button",{name:/Add to my fleet and build/}).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({timeout:90_000});
  return day;
}

async function confirmRegistration(page: Page, plate: string, day: (offset: number) => string) {
  const nav = page.getByRole("navigation",{name:"Main navigation"});
  await nav.getByRole("link",{name:"Documents",exact:true}).click();
  await page.setInputFiles("input[type=file]",{name:"synthetic-registration-team.txt",mimeType:"text/plain",
    buffer:Buffer.from(`Synthetic registration evidence for ${plate}`)});
  await page.getByLabel("Vehicle (plate, VIN or fleet number)").fill(plate);
  await expect(page.getByText("Matches " + plate, { exact: false })).toBeVisible();
  await page.getByRole("combobox",{name:"Type",exact:true}).selectOption("Registration");
  await page.getByLabel("Number",{exact:true}).fill("TEST-SHARED-REGISTRATION");
  await page.getByLabel("Issued",{exact:true}).fill(day(-1));
  await page.getByLabel("Expires",{exact:true}).fill(day(80));
  await page.getByLabel("Issuer",{exact:true}).fill("General Directorate of Traffic");
  await page.getByRole("button",{name:"Confirm",exact:true}).click();
  await expect(page.getByRole("heading",{name:/Document vault · 1/})).toBeVisible();
  await nav.getByRole("link",{name:"Daily command",exact:true}).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({timeout:90_000});
}

test("signed-in managers share case history and receive assignment and overdue notifications", async ({ browser }) => {
  test.setTimeout(540_000);
  const reporterContext = await browser.newContext({ serviceWorkers: "block" });
  const managerContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 360, height: 800 } });
  try {
    const reporter = await signIn(reporterContext, reporterEmail, reporterPassword);
    const manager = await signIn(managerContext, managerEmail, managerPassword);
    const runId = Date.now().toString();
    const team = "Synthetic workflow " + runId;
    const title = "Synthetic near miss " + runId;
    await reporter.getByLabel("New team name").fill(team);
    await reporter.getByRole("button", { name: "Create team" }).click();
    await reporter.getByLabel("Manager work email").fill(managerEmail);
    await reporter.getByRole("button", { name: "Create invitation" }).click();
    const code = reporter.getByLabel("Invitation code for the manager");
    await expect(code).not.toHaveValue("");
    await reportNearMiss(reporter, title);
    await expect(manager.getByRole("heading", { name: title })).toHaveCount(0);
    await manager.getByRole("textbox", { name: "Invitation code", exact: true }).fill(await code.inputValue());
    await manager.getByRole("button", { name: "Join team" }).click();
    await expect(manager.getByRole("list", { name: "Shared cases" })).toContainText(title, { timeout: 30_000 });

    const edit = reporter.getByRole("form", { name: "Update shared case" });
    await edit.getByRole("combobox", { name: "Case owner", exact: true }).selectOption({ label: managerEmail });
    await edit.getByRole("combobox", { name: "Accountable manager", exact: true }).selectOption({ label: managerEmail });
    await edit.getByLabel("Follow-up date").fill("2026-01-02");
    await edit.getByLabel("Update note").fill("Manager accepted by phone");
    await edit.getByRole("button", { name: "Record escalation" }).click();
    const inbox = manager.getByRole("list", { name: "Team notifications" });
    await expect(inbox.getByText(/Case assigned to you/).filter({ hasText: team })).toBeVisible({ timeout: 45_000 });
    await expect(inbox.getByText(/Case overdue/).filter({ hasText: team })).toBeVisible({ timeout: 330_000 });
    await inbox.getByRole("listitem").filter({ hasText: "Case overdue" }).filter({ hasText: team })
      .getByRole("button", { name: "Open case" }).click();
    await expect(manager.getByRole("heading", { name: title })).toBeVisible();
    await expect(manager.getByText("Manager accepted by phone", { exact: true })).toBeVisible();
    expect(await manager.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await manager.getByRole("button",{name:"Back to cases",exact:true}).click();

    const plate = "SA-SHARED-" + runId.slice(-7);
    const day = await importFleet(reporter,plate);
    const nav = reporter.getByRole("navigation",{name:"Main navigation"});
    await nav.getByRole("link",{name:"Team cases",exact:true}).click();
    await reporter.getByRole("checkbox",{name:/Share this fleet’s active case summaries/}).check();
    await reporter.getByRole("button",{name:"Link fleet",exact:true}).click();
    await expect(reporter.getByText("This fleet publishes active EHS and compliance cases to this team.")).toBeVisible();
    await nav.getByRole("link",{name:"Daily command",exact:true}).click();
    const list = manager.getByRole("list",{name:"Shared cases"});
    await expect(list).toContainText(plate + " · Registration renewal",{timeout:45_000});
    await expect(list).toContainText(plate + " · Technical inspection");
    await confirmRegistration(reporter,plate,day);
    await expect(list.getByText(plate + " · Registration renewal",{exact:true})).toHaveCount(0,{timeout:60_000});
    await expect(list).toContainText(plate + " · Technical inspection");
    await manager.getByRole("combobox",{name:"Case status",exact:true}).selectOption("closed");
    await manager.getByRole("button",{name:`Open ${plate} · Registration renewal`,exact:true}).click();
    await expect(manager.getByText(/Verified evidence TEST-SHARED-REGISTRATION/)).toBeVisible();
    await expect(manager.getByText(/Recorded the verified replacement document/)).toBeVisible();
  } finally {
    await Promise.all([reporterContext.close(), managerContext.close()]);
  }
});
