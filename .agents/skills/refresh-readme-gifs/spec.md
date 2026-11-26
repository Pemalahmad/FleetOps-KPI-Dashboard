# refresh-readme-gifs: spec

## Goal

Record or re-record a README GIF of the synthetic demo with `web/scripts/capture-gifs.mjs`, so the README shows the
page as it ships today.

## Outputs

- `docs/web-<name>.gif`, written by a named scene in `SCENES` in `web/scripts/capture-gifs.mjs`.
- For a new page: a new scene and a README image with alt text that says what the GIF shows.
- `ship-check` lines `readme-files` and `readme-gifs` reading `PASS`.

## Required actions

- Record from a fresh production build (`npm run build`), never from `next dev`.
- Record one scene per run by naming it, so other GIFs stay byte-for-byte unchanged.
- Look at the result before committing: data loaded, no spinner or error state, dark mode, nothing cut off.
- Keep each GIF under 4 MB; shorten the scene or hold fewer frames when it is larger.

## Forbidden actions

- Recording real fleet data, an owner's workspace or anything other than the built-in synthetic demo.
- Editing GIFs by hand or replacing them with screenshots from another tool.
- Re-recording every scene when only one page changed.
- Adding a network host, font or CDN to make a recording work.
