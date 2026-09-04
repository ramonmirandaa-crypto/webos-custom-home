#!/usr/bin/env python3
"""TV helper — bridge de launch para o launcher webOS (br.com.customhome.lite).

O WebAppMgr de devmode nega applicationManager/* para apps web (categoria "/"),
tanto via PalmServiceBridge quanto via JS service. Este helper roda no
server-t5 (mesma LAN da TV, 192.168.0.77) e executa o ares-cli para o perfil
'tv' — que usa SSH devmode e tem permissão de launch (já provado: ares-launch
abre qualquer app). Depois do root/Homebrew Channel, o launcher passa a usar o
bridge direto e deixa de depender deste helper.

Endpoints:
  GET /launch?app=<app_id>    -> ares-launch <id> -d tv   (abre o app)
  GET /running                -> ares-launch -r -d tv     (apps em execução)
  GET /list                   -> ares-install --list -d tv (apps instalados)
  GET /health                 -> {"ok": true}

Start (server-t5):
  scp scripts/tv-helper.py server-t5:/root/
  ssh server-t5 "setsid nohup python3 /root/tv-helper.py >/tmp/tv-helper.log 2>&1 < /dev/null &"
"""
import json
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

APP_ID_RE = re.compile(r'^[A-Za-z0-9._-]{1,100}$')


def run(args):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=30)
        return {"ok": p.returncode == 0, "code": p.returncode,
                "out": p.stdout[-2000:], "err": p.stderr[-1000:]}
    except Exception as e:  # noqa: BLE001 — report any failure to the launcher
        return {"ok": False, "error": str(e)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the LAN console quiet
        pass

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/launch":
            app = (q.get("app") or [""])[0]
            if not APP_ID_RE.match(app):
                self._send({"ok": False, "error": "invalid app id"}, 400)
                return
            self._send(run(["ares-launch", app, "-d", "tv"]))
        elif u.path == "/running":
            self._send(run(["ares-launch", "-r", "-d", "tv"]))
        elif u.path == "/list":
            self._send(run(["ares-install", "--list", "-d", "tv"]))
        elif u.path == "/health":
            self._send({"ok": True})
        else:
            self._send({"ok": False, "error": "not found"}, 404)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8108), Handler).serve_forever()
