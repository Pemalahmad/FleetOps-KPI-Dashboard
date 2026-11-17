/**
 * Security end-to-end tests, run against the production build in a real browser on every CI run.
 *
 *  1. Every page loads under the strict Content Security Policy with no violations and no errors.
 *  2. A script injected into the page is refused (no 'unsafe-inline').
 *  3. A hostile workbook (XSS in headers and cells, SQL injection in an id, spreadsheet formulas) is shown as text,
 *     runs nothing and breaks no SQL.
 *  4. The page talks to its own origin only.
 *  5. Passphrase protection: the stored fleet contains no readable data, a wrong passphrase is refused, the right one
 *     opens it, and removing protection restores it.
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import * as XLSX from "xlsx";

const PAGES = ["/", "/overview/", "/fleet/", "/documents/", "/import/", "/plan/", "/network/", "/customer/", "/workshop/", "/ledger/",
  "/licence/", "/pipeline/", "/doctrine/"];
const SAMPLE = path.resolve(__dirname, "../../samples/fleet-vehicles.xlsx");

/** Collect CSP violations, page errors and every request's origin. */
async function watch(page: Page) {
  const seen = { violations: [] as string[], errors: [] as string[], origins: new Set<string>() };
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  page.on("pageerror", (e) => seen.errors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) seen.violations.push(m.text()); });
  page.on("request", (r) => { if (/^https?:/.test(r.url())) seen.origins.add(new URL(r.url()).origin); });
  return seen;
}

const cspViolations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
const ready = (page: Page) => expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });

async function importWorkbook(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/import/");
  await ready(page);
  await page.setInputFiles("input[type=file]", file);
  await page.getByRole("button", { name: /Add to my fleet and build/ }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
}

test.beforeEach(async ({ page }) => {
  // each test starts from an empty browser profile; make sure no fleet data is left over
  await page.goto("/");
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("fleetops-workspace"); q.onsuccess = q.onerror = q.onblocked = r; }));
});

test("every page loads under the strict CSP, with no violations or errors", async ({ page, baseURL }) => {
  const seen = await watch(page);
  for (const p of PAGES) {
    await page.goto(p);
    await ready(page);
    expect(await cspViolations(page), `CSP violations on ${p}`).toEqual([]);
  }
  const metas = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(metas).toHaveCount(1);
  const scriptSrc = (await metas.getAttribute("content"))!.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
  expect(scriptSrc).toMatch(/^script-src 'self' 'sha256-/);   // inline scripts pinned by hash...
  expect(scriptSrc).not.toContain("unsafe-inline");            // ...and nothing else inline allowed
  expect(scriptSrc).not.toMatch(/\s'unsafe-eval'/);           // only 'wasm-unsafe-eval', which compiles WASM, not JS
  expect(seen.violations).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect([...seen.origins]).toEqual([new URL(baseURL!).origin]);
});

test("an injected inline script is refused", async ({ page }) => {
  await watch(page);
  await page.goto("/fleet/");
  await ready(page);
  const ran = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__pwned = true";
    document.body.appendChild(s);
    return (window as unknown as { __pwned?: boolean }).__pwned === true;
  });
  expect(ran).toBe(false);
  expect((await cspViolations(page)).length).toBeGreaterThan(0);
});

test("a hostile workbook is shown as text, runs nothing and breaks no SQL", async ({ page, baseURL }) => {
  const seen = await watch(page);
  const sqlId = "X-001'); DROP TABLE vehicles; --";
  const rows = [
    ["Fleet No", "Plate No", `<img src=x onerror="window.__pwned=1">Make`, "Model", "Fuel"],
    [sqlId, "D 1", "<script>window.__pwned=2</script>", "=HYPERLINK(\"https://example.invalid\",\"x\")", "Electric"],
    ["X-002", "D 2", "Tesla", "\"><svg onload=window.__pwned=3>", "Petrol"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Vehicles");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await importWorkbook(page, { name: "hostile.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await page.goto("/fleet/");
  await expect(page.getByText(sqlId).first()).toBeVisible({ timeout: 90_000 });   // stored and shown literally
  await expect(page.getByText("X-002").first()).toBeVisible();                      // the table survived the "DROP"
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.locator("img[src='x'], svg[onload]").count()).toBe(0);
  expect(seen.errors).toEqual([]);
  expect([...seen.origins]).toEqual([new URL(baseURL!).origin]);
});

test("passphrase protection: nothing readable at rest, wrong passphrase refused, right one opens", async ({ page }) => {
  const PASS = "blue lorry midnight harbour";
  await importWorkbook(page, SAMPLE);

  await page.goto("/plan/");
  await page.getByLabel("New passphrase").fill(PASS);
  await page.getByLabel("Repeat passphrase").fill(PASS);
  await page.getByRole("button", { name: "Protect" }).click();
  await expect(page.getByText(/Protected\. Your fleet data is now encrypted/)).toBeVisible({ timeout: 30_000 });

  // the raw IndexedDB contents hold no plate, VIN or company name
  const raw = await page.evaluate(() => new Promise<string>((resolve) => {
    const req = indexedDB.open("fleetops-workspace");
    req.onsuccess = () => {
      const all = req.result.transaction("kv").objectStore("kv").getAll();
      all.onsuccess = () => resolve(JSON.stringify(all.result, (_k, v) =>
        v instanceof ArrayBuffer ? new TextDecoder("latin1").decode(new Uint8Array(v)) : v));
    };
  }));
  expect(raw).toContain("sealed");
  for (const secret of ["FJ-001", "D 48213", "5YJ3E1EA5PF100001", "Al Fajr"]) expect(raw).not.toContain(secret);

  await page.reload();
  await expect(page.getByText("Your fleet data is locked.")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Passphrase").fill("blue lorry midnight harbor");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("That passphrase is not right.")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });

  await page.goto("/fleet/");
  await expect(page.getByText("Your fleet data is locked.")).toBeVisible({ timeout: 60_000 });   // a reload locks again
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("FJ-001").first()).toBeVisible({ timeout: 90_000 });

  await page.getByRole("link", { name: /Plan & offline/ }).first().click();
  await page.getByRole("button", { name: "Remove protection" }).click();
  await expect(page.getByText(/Protection removed/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Your fleet data is locked.")).toHaveCount(0);
});

test("the document reader works under the strict CSP and stays on this site", async ({ page, baseURL }) => {
  const seen = await watch(page);
  await importWorkbook(page, SAMPLE);
  await page.goto("/documents/");
  await page.setInputFiles("input[type=file]", path.resolve(__dirname, "../../samples/registration-card-sample.png"));
  await expect(page.getByText(/Matches FJ-002/)).toBeVisible({ timeout: 120_000 });
  expect(await cspViolations(page)).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect([...seen.origins]).toEqual([new URL(baseURL!).origin]);
});

