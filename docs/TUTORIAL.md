# Tutorial: from a stock LG TV to Custom Home Lite

This walks you from an untouched LG webOS TV to running your own home screen.
Budget an hour the first time. Nothing here writes to protected OS partitions —
every step is reversible, and a full uninstall returns the TV to stock.

**This app targets Developer Mode only.** It does not take over boot or the Home
button, needs no root, and ships no on-device service. That keeps the blast
radius at zero: uninstalling the app removes everything.

**Contents**

1. [Enable Developer Mode on the TV](#1-enable-developer-mode-on-the-tv)
2. [Install the tooling on your computer](#2-install-the-tooling-on-your-computer)
3. [Register your TV with ares](#3-register-your-tv-with-ares)
4. [Get the project and build it](#4-get-the-project-and-build-it)
5. [Set up the helper host](#5-set-up-the-helper-host)
6. [First deploy](#6-first-deploy)
7. [Configure what shows up](#7-configure-what-shows-up)
8. [Uninstall / revert](#8-uninstall--revert)

---

## 1. Enable Developer Mode on the TV

1. On the TV, open the **LG Content Store** and install **Developer Mode**.
2. Sign in with a free LG developer account and toggle **Dev Mode** on.
3. Note the TV's IP address (**Settings → Network**) and give it a DHCP
   reservation so it doesn't move. On this project the TV is `192.168.0.126`.
4. In the Developer Mode app, set a **passphrase** and note the SSH port it
   shows (usually `9922`).

> Developer Mode sessions expire (the app shows a countdown). When it lapses, the
> TV drops your dev session and `/media/developer` can be wiped — reopen the
> Developer Mode app, extend the session, and redeploy.

## 2. Install the tooling on your computer

Node.js 18+ and the webOS CLI:

```bash
npm i -g @webos-tools/cli      # provides ares-setup-device, ares-install, ares-launch, …
```

## 3. Register your TV with ares

```bash
ares-setup-device              # add a device named "tv"
ares-setup-device --list       # confirm
```

For Developer Mode, the device profile looks like:

```
name          deviceinfo                    connection  profile  passphrase
tv            prisoner@192.168.0.126:9922   ssh         tv       517943
```

The profile is named **`tv`** to match the deploy script's default; override
with `TV_DEVICE=<name> npm run deploy` if you used something else.

## 4. Get the project and build it

```bash
git clone <this repo> webos-custom-home
cd webos-custom-home
npm install
npm run build          # sanity check: should finish without type errors
```

`npm run dev` serves the UI in a desktop browser for fast iteration — Luna calls
no-op off-TV, so launching and credentials are inert there.

## 5. Set up the helper host

Developer mode denies `applicationManager/*` to web apps, so the launcher's last
resort for opening apps is a helper on the TV's LAN. Any always-on machine on the
same network works; on this project it is `server-t5` (`192.168.0.77`).

The helper needs `python3` and the same `ares` CLI, plus the TV's dev-mode SSH
key at `/root/.ssh/tv_webos_nopass`:

```bash
# On the TV side: copy the dev-mode key you already use with ares
# On the helper host:
scp -r scripts deploy <helper-host>:/tmp/tvh-src/
ssh <helper-host> 'cd /tmp/tvh-src && sh deploy/install-tv-helper.sh'
```

That creates `/opt/tv-launch-helper`, an unprivileged service user, the
`tv-launch-helper` unit, and a token in `/etc/tv-launch-helper/tv-helper.env`.
It opens port `8110` to the LAN subnet only.

Then point the app at it:

```bash
ssh <helper-host> 'grep TV_HELPER_TOKEN /etc/tv-launch-helper/tv-helper.env'
cp .env.example .env.local        # fill in URL + token
npm run build
```

`.env.local` is gitignored. The token is compiled into the bundle — see
[`docs/SECURITY.md`](../docs/SECURITY.md) for what that does and does not
protect against.

## 6. First deploy

```bash
npm run deploy
```

This builds, packages `dist/`, prints the manifest with
`ares-package --info-detail` (so you can see the version/icons the TV will read),
and installs. Then open **Home Lite** from the TV's app list, or:

```bash
ares-launch --device tv br.com.customhome.lite
```

## 7. Configure what shows up

| What | Where |
|------|-------|
| App tiles, labels, brand colors | [`src/lib/at4k-data.ts`](../src/lib/at4k-data.ts) |
| App icons | [`public/icons/`](../public/icons/) |
| Live-channel category order | `CATEGORY_PRIORITY` in [`src/lib/iptv.ts`](../src/lib/iptv.ts) |
| Wallpaper | `public/wallpaper.jpg` (1920×1080) |

App IDs must exist on the panel. List what is actually installed:

```bash
ares-install --device tv --list
```

Then set IPTV credentials on the TV itself: **Settings (gear) → Configurar IPTV**
— the TV's own virtual keyboard appears for each field, so nothing is typed
through a homemade input handler.

## 8. Uninstall / revert

```bash
ares-install --device tv --remove br.com.customhome.lite
```

That is the whole revert: no OS files, no services, no init hooks. If you also
installed the helper, remove it on the helper host:

```bash
ssh <helper-host> 'systemctl disable --now tv-launch-helper && rm -rf /opt/tv-launch-helper /etc/tv-launch-helper /etc/systemd/system/tv-launch-helper.service && systemctl daemon-reload'
```
