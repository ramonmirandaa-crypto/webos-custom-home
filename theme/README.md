# tvOS overlay

The launcher's visual language is not defined by this repo's components — it is
applied from the outside by the tvOS overlay in this directory, matching the
Tailwind class names the components emit.

```
tvos-theme.css        base overlay: type ramp, label/fill ladders, materials,
                      app grid, dock platter, menu bar, screen title
tvos-panels.css       sidebar, context menu, profiles, Casa, alerts, toast
tvos-justwatch.css    "onde assistir" sheet
tvos-controls.js      runtime half of the base overlay (Control Centre on GREEN)
tvos-panels.js        runtime half of the panels (BLUE/YELLOW/RED, Casa via HA)
tvos-justwatch.js     runtime half of Just Watch
tvos-tokens.json      the measurements every rule above is derived from
```

`scripts/inject-theme.mjs` copies these into `dist/assets/` and appends the tags
to `dist/index.html` **after** the bundle, so the overlay wins by document
order. It runs as part of `npm run build`.

## The measurements are not invented

Every number comes from `tvos-tokens.json`, extracted from the Sketch document
*"Design Templates + Components + Guides"* (Sketch 2026.3) through the Sketch MCP
server, and measured on the exported 1920×1080 renders. The originals are the
tvOS UI kit frames — `Templates - Home Screen`, `Control Center`,
`Sidebar`, `Lockup`, `Alerts` — plus the `Guide - Type Styles` and
`Guide - Safe Areas & Grids` pages.

| token | value | used by |
|---|---|---|
| tile | 250×150, radius 30 (5:3) | app grid, dock |
| gutter / margin | 48 / 90 | grid rows, dock |
| dock platter | 1830 wide, radius 60, 40px padding | favourites row |
| menu bar | 60 tall, radius 60, at top 50 / right 50 | header |
| materials | `#1e1e1e` at 50/85 %, blur 75 | every panel |
| type scale | 76 / 57 / 48 / 38 / 31 / 29 / 25 / 23 | all text |
| labels | white at 100 / 50 / 30 / 20 % | the label ladder |
| fills | white at 20 / 16 / 12 / 8 % | tile backgrounds |

## Class names are a contract

The overlay matches on Tailwind class names, because the bundle cannot be
rewritten. That makes some class names load-bearing — **renaming one silently
removes its styling**, with no build error:

| class | the overlay turns it into |
|---|---|
| `h-[90px] w-[160px] rounded-[14px]` | the 250×150 app tile |
| `h-[120px] w-[80px]` / `h-[90px] w-[60px]` | the 16:9 and 2:3 media cards |
| `mt-[19px] > .flex` | the dock platter |
| `right-[24px]` | the menu-bar pill (with `span` / `button` / `button svg`) |
| `left-[41px]` | the screen title at the Sketch margin |
| `w-[740px]` + `.gap-3 > div` | the Settings panel, as Control Centre tiles |
| `div[style*="0.12"]` | the focused row inside Settings (inverts to white) |

`test/local-verify.py` asserts the resulting geometry, so a rename that breaks
the overlay fails the test instead of shipping silently.

## Verifying changes

```bash
npm run build
npm run test:local      # stages dist/test + asserts geometry and behaviour
```

The harness (`test/tv-sim.html` + `test/tv-sim.js`) stands in for the TV: it
implements `PalmServiceBridge`, `PalmSystem` and the `cursorStateChange` /
`keyboardStateChange` events, with Keymanager3 backed by real AES-256-CBC via
WebCrypto. No TV is involved, so iterate freely and deploy once it is green.

## Origin

This overlay was developed as a separate project (`webos-tvos-theme`) that
injected into a prebuilt IPK from the outside. It now lives in the repo so a
rebuild cannot drop it — which is exactly what happened once, when a routine
reinstall replaced the themed package with an unthemed one.
