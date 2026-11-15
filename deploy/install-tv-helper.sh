#!/bin/sh
# Install the hardened launcher helper on the helper host (server-t5).
# Run as root ON that host from a checkout of this repo:
#
#   sh deploy/install-tv-helper.sh
#
# Idempotent. Deliberately installs under its own unit and port so it never
# disturbs the pre-existing shared bridge on :8108 that other projects use
# (/ha/*, /jw/*, /powerstate). Requires python3 + ares-cli and the devmode SSH
# key at /root/.ssh/tv_webos_nopass.
set -eu

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/tv-launch-helper
ETC_DIR=/etc/tv-launch-helper
UNIT=tv-launch-helper
RANGE=192.168.0.0/24
PORT=8110

command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 missing" >&2; exit 1; }

# --- token + allowlist (generated/stored outside the code dir) ---------------
mkdir -p "$ETC_DIR"
chmod 700 "$ETC_DIR"
if [ ! -f "$ETC_DIR/tv-helper.env" ]; then
  TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
  umask 077
  cat > "$ETC_DIR/tv-helper.env" <<EOF
TV_HELPER_TOKEN=$TOKEN
TV_HELPER_PORT=$PORT
TV_HELPER_ALLOWLIST=$ETC_DIR/allowed_apps.json
EOF
  echo "==> generated $ETC_DIR/tv-helper.env"
  echo "    read the token with: grep TV_HELPER_TOKEN $ETC_DIR/tv-helper.env"
  echo "    then set it as VITE_TV_HELPER_TOKEN in the launcher's .env.local"
fi
chmod 600 "$ETC_DIR/tv-helper.env"
install -m 600 "$SRC_DIR/scripts/allowed_apps.json" "$ETC_DIR/allowed_apps.json"

# --- code ---------------------------------------------------------------------
mkdir -p "$APP_DIR"
install -m 755 "$SRC_DIR/scripts/tv-helper.py" "$APP_DIR/tv-helper.py"

# --- systemd ------------------------------------------------------------------
install -m 644 "$SRC_DIR/deploy/tv-helper.service" "/etc/systemd/system/$UNIT.service"
systemctl daemon-reload
systemctl enable "$UNIT"
systemctl restart "$UNIT"

# --- firewall -----------------------------------------------------------------
if command -v ufw >/dev/null 2>&1; then
  ufw allow from "$RANGE" to any port "$PORT" proto tcp comment 'webos launcher helper' >/dev/null
  echo "==> ufw: allowed $RANGE -> tcp/$PORT"
fi

sleep 1
systemctl --no-pager --lines=5 status "$UNIT" || true
echo
echo "==> smoke test (expect 401 without a token):"
echo "    curl -s -o /dev/null -w '%{http_code}\\n' -X POST http://127.0.0.1:$PORT/launch"
