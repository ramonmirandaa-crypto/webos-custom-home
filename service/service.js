// webOS LunaService for the custom home screen.
//
// DEV-MODE NOTE: this service is NOT shipped in the developer-mode IPK
// (scripts/deploy.mjs packages `dist/` only). A sideloaded web app in developer
// mode cannot register a service that survives, and the devmode WebAppMgr denies
// `applicationManager/*` to web apps regardless — that is why launching falls
// back to the LAN helper (scripts/tv-helper.py). This file stays in the repo as
// the reference implementation for a rooted TV (Homebrew Channel), where
// service registration grants the privileges that make it work.
//
// It requires the platform's Node (see webostv.developer.lge.com/develop/guides/js-service-basics):
// no top-level await, no Node 18+ APIs — the TV engine predates both.
var Service = require('webos-service');
var fs = require('fs');

var APP_ID = 'br.com.customhome.lite';
var HOME_CODE = 773;
var EV_KEY = 1;
var EVENT_SIZE = 16;
var LOG = '/tmp/home-svc.log';

function log(msg) { try { fs.appendFileSync(LOG, '[' + Date.now() + '] ' + msg + '\n'); } catch (e) {} }

if (process.argv.indexOf('--disable-timeouts') === -1) { process.argv.push('--disable-timeouts'); }

var service = new Service('br.com.customhome.lite.service');
try { fs.writeFileSync('/tmp/home-svc.pid', String(process.pid)); } catch (e) {}
log('start pid=' + process.pid);

service.register('status', function (m) { m.respond({ returnValue: true, running: true, pid: process.pid }); });

service.register('readLog', function (m) {
	try {
		var data = fs.readFileSync(LOG, 'utf8');
		m.respond({ returnValue: true, log: data.slice(-4000) });
	} catch (e) { m.respond({ returnValue: false, error: String(e) }); }
});

// The web app is denied applicationManager/listLaunchPoints ("Denied method
// call ... for category /"); this service calls it with service privileges and
// forwards the result.
service.register('listLaunchPoints', function (m) {
	service.call('luna://com.webos.applicationManager/listLaunchPoints', {}, function (res) {
		log('llp resp: ' + JSON.stringify(res && res.payload).slice(0, 400));
		m.respond(res && res.payload ? res.payload : { returnValue: false, errorText: 'applicationManager/listLaunchPoints unavailable' });
	});
});

function launchId(id, reason) {
	service.call('luna://com.webos.applicationManager/launch', { id: id }, function (m) {
		log('launch ' + id + ' (' + reason + '): ' + JSON.stringify(m && m.payload));
	});
}

// The HOME key is watched on every /dev/input/event* node. Non-blocking reads are
// essential: blocking reads across ~32 nodes exhaust libuv's 4-thread pool and
// starve the device that actually carries HOME.
function watchHome() {
	var fds = [];
	for (var i = 0; i < 32; i++) {
		try { fds.push(fs.openSync('/dev/input/event' + i, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)); }
		catch (e) {}
	}
	log('watching ' + fds.length + ' input devices for HOME (' + HOME_CODE + ')');
	var buf = Buffer.alloc(EVENT_SIZE);
	setInterval(function () {
		for (var f = 0; f < fds.length; f++) {
			try {
				while (fs.readSync(fds[f], buf, 0, EVENT_SIZE, null) === EVENT_SIZE) {
					// input_event (32-bit): type@8, code@10, value@12. value===1 is key-down.
					if (buf.readUInt16LE(8) === EV_KEY && buf.readUInt16LE(10) === HOME_CODE && buf.readInt32LE(12) === 1) {
						log('HOME key down');
						launchId(APP_ID, 'home-key');
					}
				}
			} catch (e) {
				// Non-blocking fds raise EAGAIN when nothing is ready; anything else
				// (device removed, etc.) must not kill the watcher.
				if (e && e.code !== 'EAGAIN' && e.code !== 'EWOULDBLOCK') { log('watch read error: ' + e.message); }
			}
		}
	}, 100);
}

watchHome();
