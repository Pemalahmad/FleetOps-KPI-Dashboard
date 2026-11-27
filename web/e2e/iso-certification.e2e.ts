import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const TARGET = process.env.FLEETOPS_ISO_TEST_ORIGIN ?? "http://127.0.0.1:4310/";
const admin = { email: process.env.FLEETOPS_ISO_ADMIN_EMAIL ?? "", password: process.env.FLEETOPS_ISO_ADMIN_PASSWORD ?? "" };
const owner = { email: process.env.FLEETOPS_ISO_OWNER_EMAIL ?? "", password: process.env.FLEETOPS_ISO_OWNER_PASSWORD ?? "" };
const portal = (path: string) => new URL(path,TARGET).href;

test("SOP-10 exposes the complete fleet procedure and links to certification", async ({ page }) => {
  await page.goto(portal("doctrine/#SOP-10"));
  await expect(page.getByRole("heading", { name: "Fleet operations and ISO certification" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Record incidents, emergency actions, required notifications and independent closure.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Certification lifecycle/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "SOP-09 damage and controlled return" })).toBeVisible();
  await page.getByRole("link", { name: "Open ISO certification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ISO certification", exact: true })).toBeVisible();
});

async function signIn(context: BrowserContext, account: typeof admin) {
  const page = await context.newPage();
  await page.goto(portal("team-cases/"));
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible({ timeout: 30_000 });
  return page;
}
const isoNav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "ISO certification", exact: true });

test("shared ISO records notify owners and independently resolve overdue findings", async ({ browser }) => {
  test.skip(!admin.email || !admin.password || !owner.email || !owner.password, "Two synthetic accounts are required for the live ISO workflow.");
  test.setTimeout(490_000);
  const adminContext = await browser.newContext({ serviceWorkers: "block", timezoneId: "Asia/Dubai" });
  const ownerContext = await browser.newContext({ serviceWorkers: "block", timezoneId: "Asia/Dubai" });
  try {
    const managerPage = await signIn(adminContext,admin);
    const ownerPage = await signIn(ownerContext,owner);
    const run = Date.now().toString();
    const teamName = "Synthetic ISO workflow " + run;
    const certificateTitle = "Road safety certificate " + run;
    const auditTitle = "Surveillance audit " + run;
    const findingTitle = "Depot finding " + run;
    await managerPage.getByLabel("New team name").fill(teamName);
    await managerPage.getByRole("button", { name: "Create team" }).click();
    await expect(managerPage.getByRole("combobox", { name: "Team", exact: true }).locator("option:checked")).toHaveText(teamName);
    await managerPage.getByLabel("Manager work email").fill(owner.email);
    await managerPage.getByRole("button", { name: "Create invitation" }).click();
    const code = managerPage.getByLabel("Invitation code for the manager");
    await expect(code).not.toHaveValue("");
    await ownerPage.getByRole("textbox", { name: "Invitation code", exact: true }).fill(await code.inputValue());
    await ownerPage.getByRole("button", { name: "Join team" }).click();
    await expect(ownerPage.getByRole("combobox", { name: "Team", exact: true }).locator("option:checked")).toHaveText(teamName);
    await isoNav(managerPage).click();
    const day = (offset: number) => new Date(Date.parse(new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Dubai",dateStyle:"short"}).format(new Date()) + "T00:00:00Z") + offset*864e5).toISOString().slice(0,10);
    const records = (page: Page) => page.getByRole("region",{name:"ISO record details"});
    const fillMembers = async (form: ReturnType<Page["getByRole"]>) => {
      await form.getByRole("combobox",{name:"Record owner",exact:true}).selectOption({ label: owner.email });
      await form.getByRole("combobox",{name:"Accountable manager",exact:true}).selectOption({ label: admin.email });
    };
    await managerPage.getByRole("button",{name:"Add certificate",exact:true}).click();
    const certificate = managerPage.getByRole("form",{name:"Add certificate",exact:true});
    await certificate.getByLabel("Title",{exact:true}).fill(certificateTitle);
    await certificate.getByRole("combobox",{name:"Status",exact:true}).selectOption("verified");
    await certificate.getByRole("combobox",{name:"Standard and edition"}).selectOption("ISO 39001:2012");
    await certificate.getByLabel("Legal entity").fill("Synthetic Fleet Company");
    await certificate.getByLabel("Covered sites").fill("Dubai and Doha");
    await certificate.getByLabel("Certificate scope").fill("Fleet rental and maintenance");
    await certificate.getByLabel("Certification body").fill("Synthetic Certification");
    await certificate.getByLabel("Certificate number").fill("TEST-ISO-" + run);
    await certificate.getByLabel("Issue date").fill(day(-120));
    await certificate.getByLabel("Expiry date").fill(day(45));
    await certificate.getByLabel("Issuer verification reference").fill("Issuer record TEST-1");
    await fillMembers(certificate);
    await certificate.getByRole("button",{name:"Save certificate"}).click();
    await expect(records(managerPage).getByRole("heading",{name:certificateTitle})).toBeVisible();
    await expect(records(managerPage).getByText("Renewal due",{exact:true})).toBeVisible();
    await expect(records(managerPage).getByText("Fleet rental and maintenance",{exact:true})).toBeVisible();

    await managerPage.getByRole("button",{name:"Back to register"}).click();
    await managerPage.getByRole("button",{name:"Audits",exact:true}).click();
    await managerPage.getByRole("button",{name:"Add audit",exact:true}).click();
    const audit = managerPage.getByRole("form",{name:"Add audit"});
    await audit.getByLabel("Title",{exact:true}).fill(auditTitle);
    await audit.getByRole("combobox",{name:"Certificate",exact:true}).selectOption({label:certificateTitle});
    await audit.getByRole("combobox",{name:"Audit type",exact:true}).selectOption("surveillance");
    await audit.getByLabel("Scheduled audit date").fill(day(10));
    await fillMembers(audit);
    await audit.getByRole("button",{name:"Save audit"}).click();
    await expect(records(managerPage).getByRole("heading",{name:auditTitle})).toBeVisible();
    await expect(records(managerPage).getByText(day(10),{exact:true})).toBeVisible();

    await managerPage.getByRole("button",{name:"Back to register"}).click();
    await managerPage.getByRole("button",{name:"Findings",exact:true}).click();
    await managerPage.getByRole("button",{name:"Add finding",exact:true}).click();
    const finding = managerPage.getByRole("form",{name:"Add finding"});
    await finding.getByLabel("Title",{exact:true}).fill(findingTitle);
    await finding.getByRole("combobox",{name:"Certificate",exact:true}).selectOption({label:certificateTitle});
    await finding.getByRole("combobox",{name:"Audit",exact:true}).selectOption({label:auditTitle});
    await finding.getByRole("combobox",{name:"Severity",exact:true}).selectOption("major");
    await finding.getByLabel("Finding due date").fill(day(-1));
    await finding.getByLabel("Finding and corrective action notes").fill("Record evidence of the daily brake inspection.");
    await fillMembers(finding);
    await finding.getByRole("button",{name:"Save finding"}).click();
    await expect(records(managerPage).getByRole("heading",{name:findingTitle})).toBeVisible();
    await expect(records(managerPage).getByText("Overdue",{exact:true})).toBeVisible();

    const notices = ownerPage.getByRole("list",{name:"Team notifications"});
    await expect(notices.getByText(/ISO record assigned to you/).filter({hasText:findingTitle})).toBeVisible({timeout:45_000});
    const escalation = notices.getByRole("listitem").filter({hasText:"Overdue finding escalated"}).filter({hasText:findingTitle});
    await expect(escalation).toBeVisible({timeout:330_000});
    await expect(notices.getByText(/Certificate renewal reminder/).filter({hasText:certificateTitle})).toBeVisible();
    await expect(notices.getByText(/Audit date reminder/).filter({hasText:auditTitle})).toBeVisible();
    await escalation.getByRole("link",{name:"Open ISO record"}).click();
    await expect(records(ownerPage).getByRole("heading",{name:findingTitle})).toBeVisible();
    await expect(records(ownerPage).getByRole("list",{name:"ISO record history"})).toContainText("Overdue finding escalated");
    await ownerPage.setViewportSize({width:360,height:800});
    expect(await ownerPage.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    await managerPage.getByRole("button",{name:"Edit finding"}).click();
    const closure = managerPage.getByRole("form",{name:"Edit finding"});
    await closure.getByRole("combobox",{name:"Status",exact:true}).selectOption("resolved");
    await closure.getByLabel("Corrective action and effectiveness evidence").fill("Sampled logs and checks verified in QA-42.");
    await closure.getByRole("button",{name:"Save finding"}).click();
    await expect(records(ownerPage).getByText("Resolved",{exact:true})).toBeVisible({timeout:45_000});
    await expect(records(ownerPage).getByText("Sampled logs and checks verified in QA-42.",{exact:true}).first()).toBeVisible();
  } finally {
    await Promise.all([adminContext.close(),ownerContext.close()]);
  }
});
