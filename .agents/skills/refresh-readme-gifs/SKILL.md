---
name: refresh-readme-gifs
description: Records or re-records a README GIF of the synthetic demo with web/scripts/capture-gifs.mjs, one scene at a time, and checks the README points at it. Use when a page shown in the README changed, or a new page needs its GIF.
---

# Refresh a README GIF

README GIFs are recorded, never drawn: each comes from a named scene in `web/scripts/capture-gifs.mjs`, which serves
the static build, drives the demo in dark mode at 1440 x 900 and encodes the frames with ffmpeg. Visual rules for what
the GIF should show come from [`design-crafter`](../../design-crafter.md) and
[`docs/DESIGN_PRINCIPLES.md`](../../../docs/DESIGN_PRINCIPLES.md). Run the commands from the repository root.

## Steps

### 1. Find the scene for the page

```bash
npm --prefix web run -s ship-check -- --gifs
```

Verify: the page's GIF appears with its scene name. If the page has no row, it needs a new scene (step 3).

### 2. Build the static site

```bash
npm --prefix web run build
```

Verify: `ls web/out/index.html` prints the path, and the build log ends without an error.

### 3. Add a scene for a new page

Skip this step when step 1 found a scene. Otherwise copy the closest existing entry in `SCENES` (for example
`replace`), point it at the page's route, and write `docs/web-<page>.gif`. Wait for the page's data, not a fixed
time, before the first frame.

```bash
node --check web/scripts/capture-gifs.mjs && npm --prefix web run -s ship-check -- --gifs
```

Verify: the new scene appears in the list with `-` for size (not recorded yet).

### 4. Record the one scene

```bash
cd web && npm run gifs <scene> && cd ..
```

Verify: the output ends with `wrote docs/web-<name>.gif from <n> frames`, and `npm --prefix web run -s ship-check -- --gifs`
shows it under 4 MB.

### 5. Look at the GIF

```bash
open docs/web-<name>.gif
```

Verify: the first frame shows loaded demo data (no spinner, skeleton or error), the page is in dark mode, nothing is
cut off at the edges, and the motion shows the feature the README text describes.

### 6. Point the README at it

For a new GIF, add `![<what the GIF shows, in one sentence>](docs/web-<name>.gif)` next to the text that describes the
page.

```bash
npm --prefix web run ship-check -- --fast
```

Verify: `readme-files` and `readme-gifs` read `PASS`, and `git status --short docs/` lists only the GIF you meant to
change.

## Error recovery

| Failure | Fix |
|---|---|
| `ffmpeg failed` or `spawnSync ffmpeg ENOENT` | Install it (`brew install ffmpeg` on macOS, `sudo apt-get install ffmpeg` on Linux) and rerun step 4. |
| `browserType.launch: Executable doesn't exist` | `npx --prefix web playwright install chromium`, then rerun step 4. |
| Every frame is blank or a 404 page | `web/out` is missing or stale: rerun step 2, then step 4. |
| The first frames show a spinner or empty tiles | In the scene, wait for a selector the loaded page renders (`await page.waitForSelector(...)`) before the first `frame()`. |
| GIF over 4 MB | Hold fewer frames (`frame(n)` with a smaller `n`) or cut a pause in the scene, then rerun step 4. |
| Other GIFs changed too | You ran `npm run gifs` without a scene; `git checkout -- docs/` for the ones you did not mean to change. |
| `readme-gifs` FAIL after renaming a GIF | Make the `record('web-<name>', ...)` name in the scene match the README path exactly. |
| `TypeError: SCENES[s] is not a function` | The scene name is wrong; use a name from step 1's list. |
