#!/bin/sh
# Install Custom Home Lite on the TV from the helper host.
#
#   sh installer/tv-install.sh
#
# Run this ON the helper host (it has the ares profile and the dev-mode key).
# Developer Mode only — no root, no boot hook, no on-device service.
set -eu

APP_ID=br.com.customhome.lite
DEVICE="${TV_DEVICE:-tv}"
SRC="${1:-.}"

cd "$SRC"
[ -f appinfo.json ] || [ -f public/appinfo.json ] || { echo "ERROR: run this from a repo checkout" >&2; exit 1; }

command -v ares-install >/dev/null 2>&1 || { echo "ERROR: ares CLI missing (npm i -g @webos-tools/cli)" >&2; exit 1; }

echo "==> building"
npm run build

echo "==> packaging"
rm -f ./*.ipk
ares-package dist -o . --no-minify

IPK=$(ls ./*.ipk | head -1)
[ -n "$IPK" ] || { echo "ERROR: no .ipk produced" >&2; exit 1; }

echo "==> manifest the TV will read"
ares-package --info-detail "$IPK"

echo "==> installing $IPK"
ares-install --device "$DEVICE" "$IPK"

echo "==> launching"
ares-launch --device "$DEVICE" "$APP_ID" || true

echo
echo "✓ installed. Open 'Home Lite' on the TV, then set IPTV credentials in"
echo "  the gear menu — the TV's own virtual keyboard handles the fields."
