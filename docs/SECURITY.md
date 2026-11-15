# Security notes

## Threat model

This launcher is a private sideload for one household's TV. The assets worth
protecting are the **IPTV panel credentials** and the **ability to launch apps**
on the TV. There is no multi-user story and no LG Store review.

## IPTV credentials

Credentials live in the Keymanager3 TEE store, never in plaintext on disk:

- One AES-256-CBC key named `iptv-key` is generated once inside the keymaster TA
  (`luna://com.webos.service.keymanager3/generateKey`). The key material never
  leaves the trusted execution environment.
- Only the IV and ciphertext are persisted, in `localStorage` under
  `atl_iptv_cipher_v1`.
- A config written by an older build (`atl_iptv_config_v1`, plaintext) is
  re-encrypted on first launch and the plaintext entry is deleted.
- If Keymanager3 is unavailable (webOS < 24, or the service is missing), the
  config falls back to `localStorage` **and the UI says so** — Settings shows
  "Keymanager3 indisponível: as credenciais ficam guardadas sem criptografia
  neste aparelho." Silent degradation is not acceptable for a credential store.

The panel base URL may be plain HTTP if the provider only offers it; Settings
warns explicitly ("Endereço sem TLS: usuário e senha trafegam sem
criptografia.") rather than pretending the connection is safe.

Reference: <https://webostv.developer.lge.com/develop/references/keymanager3>

## Launch bridge (`scripts/tv-helper.py`)

In developer mode the platform denies `applicationManager/*` to web apps
(`Denied method call ... category /`), so launching falls back to a helper on the
LAN. That helper is the one network-facing component, and it is locked down:

| Control | Behaviour |
|---|---|
| Method | `POST /launch` only. `GET /launch` is 404. |
| Authentication | `Authorization: Bearer <token>`, compared with `hmac.compare_digest`. No token configured → every request is rejected. |
| Allowlist | Only app IDs listed in `allowed_apps.json` may be launched; anything else is 403. A missing allowlist file denies everything. |
| Input validation | App IDs must match `^[A-Za-z0-9._-]{1,100}$`; the JSON body is capped at 4 KiB. |
| CORS | `Access-Control-Allow-Origin` is echoed only for `Origin: null` (the `file://` app). Any other origin gets no CORS header. |
| Rate limit | 10 requests/minute per client IP → 429. |
| Exposure | Firewall allows `192.168.0.0/24` only, on a dedicated port. |
| Process | Unprivileged `tvhelper` user, `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp`, CPU/memory caps. |
| Removed | `/running`, `/list`, `/apps` (unused by the UI, and they leaked installed-app inventory over the LAN). |

The launcher itself only sends the token over the LAN; the token is compiled
into the bundle via `VITE_TV_HELPER_TOKEN` from `.env.local`, which is
gitignored. **This is not a secret-protection boundary** — anyone who can read
the app package can read the token. It exists so a stray device on the LAN
cannot launch apps on the TV, not to defend against someone who already has the
package.

Rotate by regenerating `TV_HELPER_TOKEN` in `/etc/tv-launch-helper/tv-helper.env`
on the helper host, restarting the unit, and rebuilding the app with the new
value in `.env.local`.

## What is intentionally not done

- No `blockScreenSaver` / PowerManager veto. `com.webos.service.tvpower` is not
  granted to a developer-mode web app, and suppressing the platform screensaver
  from a sideloaded app is not something the platform intends to allow.
- No root, no bind mounts, no writes to OS partitions. Removing the app and its
  helper unit reverts the TV.
