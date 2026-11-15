#!/bin/sh
# Remove Custom Home Lite from the TV.
#
#   sh installer/tv-uninstall.sh
#
# Run this ON the helper host. This is the whole revert: the app owns no OS
# files, no services, and no boot hooks.
set -eu

APP_ID=br.com.customhome.lite
DEVICE="${TV_DEVICE:-tv}"

command -v ares-install >/dev/null 2>&1 || { echo "ERROR: ares CLI missing" >&2; exit 1; }

echo "==> removing $APP_ID from device '$DEVICE'"
ares-install --device "$DEVICE" --remove "$APP_ID"

echo "✓ removed. Stock Home is untouched — this app never replaced it."

# The LAN helper lives on this host, not the TV. Remove it separately if you no
# longer need it:
#   systemctl disable --now tv-launch-helper
#   rm -rf /opt/tv-launch-helper /etc/tv-launch-helper
#   rm -f /etc/systemd/system/tv-launch-helper.service && systemctl daemon-reload
