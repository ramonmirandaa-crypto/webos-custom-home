# Custom Home Lite (AT4K)

A private replacement home screen for a **webOS TV 25** LG TV. Content first:
your live channels, films and series from an Xtream IPTV panel, then a tvOS-style
dock and grid of the apps actually installed on the panel. No ads, no
recommendation rows.

It runs as a **sideloaded web app** — no root, no boot takeover, no OS files
touched. A plain uninstall reverts the TV.

> **Target platform:** `sdkVersion 10.3.1` = **webOS TV 25 = Chromium 120**.
> The build targets `chrome >= 108` as a deliberate floor — see
> [`vite.config.ts`](vite.config.ts). Verified live on a 50UR871C0SA.
>
> **Interface:** Pointer **and** 5-way are both first-class, per LG's Magic Remote
> guidance. Back exits through the platform's own `webOS.platformBack()` popup.
> Visual language follows Apple's tvOS design templates (Top Shelf → Dock → grid,
> focus by scale + shadow, no glow).

---

## What you get

- **Content rows** — live channels, films and series pulled from an Xtream Codes
  panel, rendered from an on-device cache instantly and refreshed in the
  background (this panel streams slowly, so partial results show up as they land).
- **tvOS-style apps** — a dock of the first six apps plus a grid, 16:9 tiles,
  focus by scale + deep shadow, label under the tile.
- **Real launches** — `webOSDev.launch` first, the platform's own
  `applicationManager/launch` second, and a LAN helper as the last resort (see
  [Launching apps](#launching-apps)).
- **Secure IPTV credentials** — AES-256 in the Keymanager3 TEE, never plaintext
  on disk. See [`docs/SECURITY.md`](docs/SECURITY.md).
- **Settings** — clock format, FPS meter, show/hide apps, IPTV credentials via
  the TV's own virtual keyboard, and layout reset.
- **Long-press OK on a tile** enters reorder mode (arrows move, OK saves).

## Launching apps

Developer mode denies `applicationManager/*` to web apps, so launching walks
three steps and stops at the first that works:

1. `webOSDev.launch()` (official webOSTV.js API).
2. `luna://com.webos.applicationManager/launch` over the service bridge.
3. The hardened LAN helper on the helper host (`deploy/`).

If all three fail and the app is not installed, the toast says exactly that —
"Não foi possível abrir X: não está instalado nesta TV" — instead of a generic
error.

## Tech stack

Vite + React + TypeScript + Tailwind v4, packaged with the webOS `ares` CLI.
`hls.js` loads lazily and only when the panel cannot play HLS natively.

> **Critical build detail:** the target panel is **Chromium 120** (webOS TV 25),
> but the build intentionally targets `chrome >= 108`. Lightning CSS downlevels
> Tailwind v4's `oklch()` palette and `color-mix()` to 108-safe fallbacks.
> **Do not remove this** or colors break on the panel.

## Prerequisites

1. **An LG webOS TV in Developer Mode.** No root needed — this app never takes
   over boot or the Home button. (See [`docs/TUTORIAL.md`](docs/TUTORIAL.md).)
2. **Node.js 18+** on your computer.
3. **The webOS CLI:** `npm i -g @webos-tools/cli` (provides `ares-*`).
4. **An ares device profile** pointing at your TV — see below.
5. **A helper host on the TV's LAN** for the last-resort launch path — see
   [Helper host](#helper-host).

## Setup

```bash
git clone <this repo> webos-custom-home
cd webos-custom-home
npm install
cp .env.example .env.local   # then fill in the helper token
```

### Point ares at your TV

Register your TV once (root SSH key or dev-mode passphrase):

```bash
ares-setup-device        # interactive: add a device named e.g. "tv" @ your TV's IP
ares-setup-device --list # confirm it's there
```

The deploy script uses the profile named **`tv`**; override it with
`TV_DEVICE=mytv npm run deploy`.

### Configure what shows up

| What | Where |
|------|-------|
| App tiles, labels, brand colors | [`src/lib/at4k-data.ts`](src/lib/at4k-data.ts) |
| App icons (bundled `.png`) | [`public/icons/`](public/icons/) |
| Category curation order for live channels | `CATEGORY_PRIORITY` in [`src/lib/iptv.ts`](src/lib/iptv.ts) |
| Helper URL / token | `.env.local` (`VITE_TV_HELPER_URL`, `VITE_TV_HELPER_TOKEN`) |

> App IDs must match apps **actually installed on your TV** — a tile for a
> missing app is a dead tile. Check with
> `ares-launch --device tv --listApp`, or ask the platform at runtime:
> the app calls `getAppLoadStatus` on the failure path and tells you the app
> isn't installed instead of failing silently.

---

## Develop

```bash
npm run dev      # design in a desktop browser (luna calls no-op off-TV)
```

## Deploy to the TV

```bash
npm run deploy
```

[`scripts/deploy.mjs`](scripts/deploy.mjs) builds, packages `dist/` with
`ares-package --no-minify`, prints `ares-package --info-detail` so the manifest
the TV will read is visible, then installs. The `service/` directory is **not**
packaged: a developer-mode sideload cannot register a meaningful LunaService, so
it stays in the repo as the rooted-TV reference implementation only.

Manual equivalent:

```bash
npm run build
ares-package dist -o . --no-minify
ares-package --info-detail br.com.customhome.lite_*.ipk   # verify the manifest
ares-install --device tv br.com.customhome.lite_*.ipk
```

### Helper host

The LAN helper must be running for the last-resort launch path:

```bash
scp -r scripts deploy server-t5:/tmp/tvh-src/
ssh server-t5 'cd /tmp/tvh-src && sh deploy/install-tv-helper.sh'
```

It installs to `/opt/tv-launch-helper`, reads its token from
`/etc/tv-launch-helper/tv-helper.env`, and opens `8110` to `192.168.0.0/24`
only. Copy that token into the launcher's `.env.local` as
`VITE_TV_HELPER_TOKEN` (gitignored) and rebuild; also set `VITE_TV_HELPER_URL`
if the helper host is not `192.168.0.77`.

## Troubleshooting

- **Colors look washed out / wrong** — the Lightning CSS downlevel isn't running.
  Confirm [`vite.config.ts`](vite.config.ts) targets `chrome >= 108` and rebuild.
- **"Failed to minify code" when packaging** — you dropped `--no-minify`. Keep it.
- **A tile says "não está instalado nesta TV"** — that app ID isn't on the panel.
  Remove it from [`src/lib/at4k-data.ts`](src/lib/at4k-data.ts) and redeploy, or
  install the app.
- **Tiles do nothing and the toast shows an `ares-launch` error** — the helper is
  unreachable or its token doesn't match. Check
  `systemctl status tv-launch-helper` on the helper host, and that
  `VITE_TV_HELPER_TOKEN` in `.env.local` equals `TV_HELPER_TOKEN` in
  `/etc/tv-launch-helper/tv-helper.env`.
- **Credentials prompt says "sem criptografia"** — Keymanager3 is unavailable on
  that panel, so the config is in `localStorage`. See
  [`docs/SECURITY.md`](docs/SECURITY.md).
- **Back button doesn't exit** — the exit popup comes from
  `webOS.platformBack()`; if the app was built without `public/lib/webOSTV.js`
  present, the library is missing and Back falls back to `window.close()`. Verify
  `dist/lib/webOSTV.js` exists in the package.

## Credits

- Built on the [webOS Homebrew](https://www.webosbrew.org/) project's tooling.
- `webOSTV.js` 1.2.13 is LG's official library, bundled under
  [`public/lib/`](public/lib/) with its Apache-2.0 license.

## License

[MIT](LICENSE). Bundled third-party app icons under `public/icons/` are the
property of their respective owners and are included only for interoperability;
replace them with your own if you prefer.
