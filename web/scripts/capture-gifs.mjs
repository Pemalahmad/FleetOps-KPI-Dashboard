// Records the README GIFs (garage, service board, dispatch lab) from the static build.
//   npm run build && node scripts/capture-gifs.mjs [garage|service|dispatch ...]
// Needs Playwright (dev dependency) and ffmpeg on the PATH. Writes ../docs/web-*.gif.
import http from 'node:http';
import { readFile, stat, mkdir, rm } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const OUT = resolve('out');
const DOCS = resolve('..', 'docs');
const FRAMES = resolve('.gif-frames');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.woff2': 'font/woff2' };

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(OUT, p);
  if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(OUT, p.replace(/\/$/, '') + '.html'); }
  try { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-unsafe-swiftshader'] });

async function record(name, path, script) {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000); // demo data loads and the SQL pipeline runs
  let n = 0;
  const frame = async (hold = 1) => { for (let i = 0; i < hold; i++) await page.screenshot({ path: join(FRAMES, `f${String(n++).padStart(4, '0')}.png`) }); };
  await script(page, frame);
  await page.close();
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '8', '-i', join(FRAMES, 'f%04d.png'),
    '-vf', 'scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    join(DOCS, `${name}.gif`)], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
  console.log(`wrote docs/${name}.gif from ${n} frames`);
}

const SCENES = {
  garage: () => record('web-garage', '/', async (page, frame) => {
    await frame(8);
    // The 3D garage floor is the largest canvas on the page: bring it into view, then turn it.
    const idx = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')]; let best = 0, area = 0; c.forEach((x, i) => { const a = x.clientWidth * x.clientHeight; if (a > area) { area = a; best = i; } }); return best; });
    const canvas = page.locator('canvas').nth(idx);
    await canvas.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.waitForTimeout(1500);
    await frame(8);
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (let i = 0; i < 24; i++) { await page.mouse.move(cx + i * 9, cy + Math.sin(i / 4) * 12); await page.waitForTimeout(40); await frame(); }
      await page.mouse.up();
    }
    for (const region of ['UAE', 'KSA', 'All regions']) {
      const chip = page.getByRole('button', { name: region, exact: true }).first();
      if (await chip.isVisible().catch(() => false)) { await chip.click(); await page.waitForTimeout(700); await frame(8); }
    }
    await frame(6);
  }),
  service: () => record('web-service-board', '/service/', async (page, frame) => {
    await frame(10);
    const stages = page.getByRole('radiogroup', { name: 'Stage' }).getByRole('radio');
    const count = await stages.count();
    for (let i = 1; i < Math.min(count, 4); i++) { await stages.nth(i).click(); await page.waitForTimeout(400); await frame(5); }
    if (count) { await stages.first().click(); await page.waitForTimeout(400); await frame(4); }
    const card = page.locator('section[aria-label] button').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click(); await page.waitForTimeout(700); await frame(8);
      for (const tab of ['Check-in', 'Work', 'Time', 'Invoice', 'History']) {
        const t = page.getByRole('tab', { name: tab }).first();
        if (await t.isVisible().catch(() => false)) { await t.click(); await page.waitForTimeout(500); await frame(7); }
      }
      await page.keyboard.press('Escape'); await page.waitForTimeout(400); await frame(5);
    }
  }),
  dispatch: () => record('web-dispatch-lab', '/dispatch/', async (page, frame) => {
    await frame(10);
    const groups = page.getByRole('radiogroup');
    const g = await groups.count();
    for (let k = 0; k < Math.min(g, 2); k++) {
      const radios = groups.nth(k).getByRole('radio');
      const c = await radios.count();
      for (let i = 0; i < Math.min(c, 3); i++) { await radios.nth(i).click(); await page.waitForTimeout(600); await frame(6); }
    }
    for (let y = 0; y < 5; y++) { await page.mouse.wheel(0, 280); await page.waitForTimeout(150); await frame(3); }
    await frame(6);
  }),
  overview: () => record('web-overview', '/overview/', async (page, frame) => {
    await frame(12);
    // Hover the north-star chart, then walk down the KPI wall.
    const chart = page.locator('section[aria-label="Headline indicators"] svg').first();
    const b = await chart.boundingBox().catch(() => null);
    if (b) for (let i = 0; i <= 10; i++) { await page.mouse.move(b.x + (b.width * i) / 10, b.y + b.height / 2); await page.waitForTimeout(60); await frame(); }
    for (let y = 0; y < 10; y++) { await page.mouse.wheel(0, 320); await page.waitForTimeout(220); await frame(4); }
    await frame(6);
  }),
  network: () => record('web-metric-network', '/network/', async (page, frame) => {
    await frame(10);
    const select = page.getByRole('combobox', { name: /Inspect metric/ }).first();
    const options = await select.locator('option').evaluateAll((o) => o.map((x) => x.value)).catch(() => []);
    for (const v of options.slice(1, 4)) { await select.selectOption(v); await page.waitForTimeout(700); await frame(6); }
    const focus = page.getByRole('button', { name: 'Focus connections' });
    if (await focus.isVisible().catch(() => false)) { await focus.click(); await page.waitForTimeout(600); await frame(8); await focus.click(); await page.waitForTimeout(300); }
    // Move the first two levers and let the effect table recompute.
    const sliders = page.locator('input[type="range"]');
    await sliders.first().scrollIntoViewIfNeeded().catch(() => {});
    await page.evaluate(() => window.scrollBy(0, -80));
    await frame(4);
    for (const [k, to] of [[0, 0.8], [1, 0.25]]) {
      const el = sliders.nth(k);
      if (!(await el.isVisible().catch(() => false))) continue;
      const box = await el.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + box.width * (0.5 + (to - 0.5) * (i / 12)), box.y + box.height / 2); await page.waitForTimeout(60); await frame(); }
      await page.mouse.up(); await frame(6);
    }
  }),
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
for (const s of wanted) await SCENES[s]();
await rm(FRAMES, { recursive: true, force: true });
await browser.close();
server.close();
