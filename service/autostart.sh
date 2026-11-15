#!/bin/sh
# Reference autostart for a ROOTED TV only (webosbrew init.d hook).
# Not used by the developer-mode IPK: without root there is no init.d, and the
# devmode WebAppMgr denies applicationManager/* to web apps anyway.
SVCDIR=/media/developer/apps/usr/palm/services/br.com.customhome.lite.service
[ -f "$SVCDIR/service.js" ] || exit 0
[ -f /tmp/home-svc.pid ] && kill -9 "$(cat /tmp/home-svc.pid)" 2>/dev/null
export NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs
cd "$SVCDIR"
nohup /usr/bin/node service.js >/tmp/home-svc.stdout 2>&1 &
exit 0
