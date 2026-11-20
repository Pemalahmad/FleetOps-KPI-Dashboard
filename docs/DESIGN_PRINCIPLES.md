# FleetOps design principles

How every FleetOps screen should look, read and move. The agents in `.agents/` (and anyone else changing UI) follow
this file; `web/src/app/globals.css` holds the tokens it refers to. Where this file and `AGENTS.md` disagree,
`AGENTS.md` wins.

The direction: **quiet paper-like tiles, black ink, one purple accent that always means something, thin tabular
numerals, and motion that is choreographed from one clock.** It borrows the craft of a "widget board" motion
piece (one surface style, one accent, a strict grid, every number a token) and adds what a working dashboard needs
and a motion piece doesn't: honest data, every state, contrast that passes, keyboard use, dark mode and Arabic.

---

## 1. One surface, one grid

- **One tile style everywhere.** A tile is the panel colour, a large radius, a hairline ring and one soft, low shadow
  from a single light source above. No second card style, no borders inside borders, no coloured tile backgrounds
  except the one "mode" tile that may flip dark (see 6).
- **A fixed cell grid.** Pages lay tiles on a grid of equal cells with one gap size; a tile spans whole cells (1 × 1,
  2 × 1, 1 × 2), never an odd width. Gap = the tile's inner padding, so whitespace reads as one rhythm.
- **Tokens for every number.** Every size, inset, radius, colour, duration and easing in a component comes from a
  token in `globals.css` (or a named constant for values the code computes per frame). No magic numbers in
  components. If a new value is needed, add a token with a comment saying what it is for.
- **The page and the canvas are the same colour** so a scaled or centred area never shows an edge.

## 2. Tile anatomy

Every KPI tile is built from the same parts, in this order, at the same insets:

| Part | What it is | Style |
|---|---|---|
| Label | accent dot + one or two words, top left | 13–14 px sans, muted, 6 px accent dot, 8 px gap |
| Context | the comparison or range, top right | 13 px, muted, right-aligned at the tile padding |
| Headline number | the one figure the tile exists for | display weight 300, tracking −0.04em, line height 1, tabular |
| Secondary line | what the number means: target, share, period | 13 px, muted |
| Visual | one chart: bars, ring, arc, track or sparkline | ink for data, accent for "now/today/selected" |
| Captions | times, units, day letters, axis ends | 10.5–11 px mono, muted |

- **One headline per tile.** If a tile needs two big numbers, it is two tiles.
- **Units live next to the number**, smaller and muted ("94 %", "1,240 km"), never in the label.
- **Machine values are mono** (timestamps, VINs, plates, IDs, percentages in lists); prose is sans.
- **Every number has a source and an "as of".** Data pages pass `asOf` to `PageHeader` (or render `<AsOf />`), which
  shows the report month and whose data it is ("simulated demo fleet" or "your fleet, on this device"); live tiles
  say they are live.

## 3. Type

- **One sans family and one mono family.** Hierarchy comes from size, weight and colour, never a third family.
- **Thin display numerals** (weight 300, tracking −0.04em) for headline figures; regular 400 for everything else;
  mono 500 only for chips and time columns.
- **Tabular figures everywhere numbers sit in a column or change while you watch** (`font-variant-numeric:
  tabular-nums`). Remember that the `font` shorthand resets it: add it back where the shorthand is used.
- **Fonts ship with the app.** The CSP allows `font-src 'self' data:` only, so no Google Fonts or font CDNs. FleetOps
  uses Geist and Geist Mono from the `geist` npm package (SIL OFL, pinned), served from its own origin by `next/font`,
  with the system stack as fallback; never a new network host.
- **Numbers are formatted for the reader's locale** (`Intl.NumberFormat`), not hard-coded `en-US`, and dates use
  the owner's time zone.

## 4. Colour: one accent, used as meaning

- **The accent is `#6366f1` (`--accent`)**: the label dots, "today", "now", the selected item, the active switch, the
  live bar. If everything is purple, nothing is: an accent appears at most a few times per tile.
- **Accent text uses `--accent-ink`.** `#6366f1` is 4.47:1 on white, just under WCAG AA for small text, so it stays
  the fill, dot and icon colour while text uses `--accent-ink` (`#4f46e5`, 6.3:1; `text-accent-ink` in Tailwind).
- **Every text colour passes AA (4.5:1) on the panel and the page, in both themes.** Light: `--muted` #5b6178,
  `--faint` #6b7189, `--good` #047857, `--warn` #b45309, `--bad` #be123c. Dark: `--faint` #7c8299. (Before
  2026-11-20 faint, good and warn were 2.6, 3.8 and 3.2:1.) Keep it that way when adding a colour.
- **Status colours are for status only, and never alone.** Good, warn and bad always come with an icon or a word:
  `STATUS_WORD` in `ui.tsx` gives "On target", "Watch", "Off target"; tiles show the word for amber and red and give
  it to screen readers for green.
- **Ink tints instead of greys.** Wells, tracks, hairlines and dotted guides are the text colour at 5–16 % opacity,
  so they stay in key on both themes.
- **Dark mode is designed, not inverted.** Every token has a dark value in `.dark`; check each new tile in both.

## 5. Motion: one clock, choreographed

- **Every animated value is a pure function of time.** Components compute from `t` (and seeded random numbers, as
  `web/src/lib/live.ts` does with `lcg`), so any moment can be redrawn, tested and recorded frame-exact. Expose a
  `render(t)` hook on pages with loops so README GIFs are captured frame by frame instead of screen-recorded.
- **Per-frame updates go through refs, not React state.** Write styles, text and SVG attributes directly; React
  renders the structure once.
- **Entrance: one stagger, once.** Tiles rise into place in grid order (opacity 0 → 1, about 20 px of rise, scale
  0.955 → 1, cubic ease-out, about 0.08 s apart). Only on first load of a page, never on every data refresh.
- **One event at a time.** In a live view, stagger changes so the eye can follow one thing: a press, then its result.
  A button press shows a dip (scale about 0.9–0.94) and a faint ink wash before the change it causes.
- **Numbers count up once, then sit still.** A headline may count up on first reveal (under 1.5 s, ease-out). A
  number someone is reading or comparing never animates on refresh: it changes in place, with at most a short
  highlight.
- **Easing vocabulary:** ease-out (cubic) to enter, in-out to move on screen, a small back-out overshoot only for
  bars springing up. Durations 150–250 ms for UI; choreographed reveals up to about 1.5 s.
- **Transform and opacity only.** Bars grow with `scaleY` from the bottom, progress with `width` inside a clipped
  track or `scaleX`; never animate layout.
- **Reduced motion shows a meaningful still**, not a blank or a frozen first frame: draw the moment where everything
  is in and the state is representative. Follow the setting live (`matchMedia` change event).
- **Anything that moves for more than 5 s can be paused** (WCAG 2.2.2); the live layer's pause control covers it.
  Loops stop when the tab is hidden.

## 6. Mode tiles and state changes

- A tile that represents a mode (focus, live, maintenance window) may flip to the dark surface with an accent glow.
  The flip happens at the midpoint of the fade: background fades over about 0.45 s, colours and words swap at once.
- Switches are drawn, not borrowed: a pill track (ink tint off, accent on), a white knob with a soft shadow,
  travel about 26 px, ease-out.

## 7. Built for real data (what a motion piece doesn't need)

- **Every data tile has four states:** loading (a skeleton in the tile's own shape, no spinner), empty (one line on
  what would fill it and how), error (what failed and a way out), and populated. In `ui.tsx`: `Skeleton` turns into
  `ErrorState` by itself when the warehouse build or a query in the current run fails (`useQueryFailure`), so no
  placeholder pulses for ever; use `EmptyState` for an empty chart or card and `EmptyRow` for a table with no rows.
- **Charts tell the truth.** Bar axes start at zero; a share shows its denominator; targets are drawn as a line, not
  implied by colour; sparklines show their period.
- **Tiles are interactive and accessible.** Real buttons and links with hover, active, focus-visible and disabled
  states; hit targets at least 44 px on touch; a chart has a text equivalent (the headline plus a summary, or a
  table). Decorative motion pieces may be one `role="img"` with a description; data tiles may not.
- **Arabic and right-to-left.** Use logical properties (`inset-inline-start`, `margin-inline-end`); the label sits
  at the start edge, the context at the end edge; icons that point (next, back) flip. Numbers and changes are
  isolated left to right (`.tile-figure`, `.kpi-delta`) so "97.61 %" and "+0.18 pp" never reverse.
- **Small screens.** Below about 640 px the grid becomes one column of full-width tiles in priority order; no
  horizontal scroll at 360 px. Scale a decorative stage as a whole; reflow data.
- **No images for UI.** Illustrations, covers and icons are CSS shapes, inline SVG or `@phosphor-icons/react`;
  nothing is loaded from another host.

## 8. Done when (checklist for every UI change)

- [ ] Tiles use the one tile style and sit on the cell grid; no new magic numbers (new values are tokens).
- [ ] Each tile has one headline number, a label with the accent dot, a muted secondary line and an "as of".
- [ ] Numbers are tabular and locale-formatted; machine values are mono.
- [ ] Text contrast is at least 4.5:1 in light and dark (3:1 for 18 px+ and for chart marks against their track).
- [ ] Status is never shown by colour alone.
- [ ] Loading, empty, error and populated states exist and were looked at.
- [ ] Entrance plays once; refreshes don't re-animate; reduced motion shows a meaningful still; loops can pause.
- [ ] Works with keyboard only, at 360 px and 1440 px, in light and dark, and with `dir="rtl"`.
- [ ] No new network host, font CDN or inline script (CSP); `npm run test:e2e` passes.
