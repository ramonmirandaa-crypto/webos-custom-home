#!/bin/sh
SVCDIR=/media/developer/apps/usr/palm/services/br.com.customhome.lite.service
[ -f "$SVCDIR/service.js" ] || exit 0
[ -f /tmp/home-svc.pid ] && kill -9 "$(cat /tmp/home-svc.pid)" 2>/dev/null
export NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs
cd "$SVCDIR"
nohup /usr/bin/node service.js --boot --watch >/tmp/home-svc.stdout 2>&1 &
exit 0
