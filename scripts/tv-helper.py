#!/usr/bin/env python3
"""TV helper — LAN launch bridge for the webOS launcher (br.com.customhome.lite).

The devmode WebAppMgr denies applicationManager/* to web apps (category "/"),
both through PalmServiceBridge and through a JS service, so the launcher's last
resort is this helper. It runs on server-t5 (same LAN as the TV) and shells out
to the ares CLI with the devmode SSH profile, which is allowed to launch.

Hardening (see docs/SECURITY.md):
  * POST only, JSON body, Bearer token required.
  * App-ID allowlist loaded from allowed_apps.json next to this file.
  * CORS limited to the app's null origin (file://) and the TV's address.
  * Per-IP rate limit, 15s subprocess timeout.

Endpoints:
  POST /launch   {"app": "<app_id>"}  -> ares-launch <id> -d tv
  GET  /health                        -> {"ok": true}

Environment:
  TV_HELPER_TOKEN  (required)  shared secret; the launcher sends it as Bearer.
  TV_HELPER_PORT   (optional)  default 8108
  TV_HELPER_HOST   (optional)  default 0.0.0.0

Run (server-t5):
  install -m 600 allowed_apps.json /etc/tv-helper/allowed_apps.json
  systemctl restart tv-helper    # see deploy/tv-helper.service
"""
import hmac
import json
import os
import re
import subprocess
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_ID_RE = re.compile(r'^[A-Za-z0-9._-]{1,100}$')
RATE_LIMIT = 10           # requests
RATE_WINDOW = 60          # per this many seconds, per client IP
LAUNCH_TIMEOUT = 15       # seconds for a single ares-launch

# The TV serves the app from file://, which browsers send as `Origin: null`.
# A bare request (no Origin) also happens for same-origin/curl probes and is
# allowed only when it carries a valid token, like everything else here.
ALLOWED_ORIGINS = {"null"}

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOWLIST_PATH = os.environ.get("TV_HELPER_ALLOWLIST", os.path.join(HERE, "allowed_apps.json"))

TV_SSH = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "HostKeyAlgorithms=+ssh-rsa",
          "-o", "PubkeyAcceptedKeyTypes=+ssh-rsa", "-o", "ConnectTimeout=5",
          "-p", "9922", "-i", "/root/.ssh/tv_webos_nopass", "prisoner@192.168.0.126"]

_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def load_allowlist():
    """App IDs this helper may launch. Missing file => empty (deny everything)."""
    try:
        with open(ALLOWLIST_PATH, encoding="utf-8") as f:
            data = json.load(f)
        apps = data.get("apps") if isinstance(data, dict) else data
        return {a for a in apps if isinstance(a, str) and APP_ID_RE.match(a)}
    except FileNotFoundError:
        return set()
    except (OSError, ValueError):
        return set()


def rate_limited(client_ip):
    now = time.time()
    with _hits_lock:
        bucket = _hits[client_ip]
        while bucket and now - bucket[0] > RATE_WINDOW:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return True
        bucket.append(now)
        return False


def run(args, timeout=LAUNCH_TIMEOUT):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return {
            "ok": p.returncode == 0,
            "code": p.returncode,
            "out": p.stdout[-2000:],
            "err": p.stderr[-1000:],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"timeout after {timeout}s"}
    except Exception as e:  # noqa: BLE001 — any failure is reported to the launcher
        return {"ok": False, "error": str(e)}


class Handler(BaseHTTPRequestHandler):
    server_version = "tv-helper/2"

    def log_message(self, *args):  # the access log line is replaced below
        pass

    def _log(self, outcome, app=""):
        """One line per launch attempt to stderr → journald. Never logs the token."""
        print(f"[{self.client_address[0]}] {self.command} {self.path} -> {outcome} {app}".strip(),
              flush=True)

    # -------------------------------------------------------------- helpers

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        expected = os.environ.get("TV_HELPER_TOKEN", "")
        if not expected:
            return False
        header = self.headers.get("Authorization", "")
        prefix = "Bearer "
        if not header.startswith(prefix):
            return False
        return hmac.compare_digest(header[len(prefix):], expected)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length <= 0 or length > 4096:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    # -------------------------------------------------------------- routes

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            self._send({"ok": True})
            return
        self._send({"ok": False, "error": "not found"}, 404)

    def do_POST(self):
        if self.path.split("?")[0] != "/launch":
            self._log("404")
            self._send({"ok": False, "error": "not found"}, 404)
            return
        if rate_limited(self.client_address[0]):
            self._log("429")
            self._send({"ok": False, "error": "rate limited"}, 429)
            return
        if not self._authorized():
            self._log("401")
            self._send({"ok": False, "error": "unauthorized"}, 401)
            return
        payload = self._read_json()
        app = (payload or {}).get("app")
        if not isinstance(app, str) or not APP_ID_RE.match(app):
            self._log("400 invalid-id")
            self._send({"ok": False, "error": "invalid app id"}, 400)
            return
        if app not in load_allowlist():
            self._log("403", app)
            self._send({"ok": False, "error": "app not in allowlist"}, 403)
            return
        result = run(["ares-launch", app, "-d", "tv"])
        self._log("200" if result.get("ok") else f"200 ares-rc={result.get('code')}", app)
        self._send(result)


if __name__ == "__main__":
    port = int(os.environ.get("TV_HELPER_PORT", "8108"))
    host = os.environ.get("TV_HELPER_HOST", "0.0.0.0")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
