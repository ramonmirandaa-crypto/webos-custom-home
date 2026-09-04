var Service = require('webos-service');
var fs = require('fs');

var APP_ID = 'br.com.customhome.lite';
var HOME_CODE = 773;
var EV_KEY = 1;
var EVENT_SIZE = 16;
var LOG = '/tmp/home-svc.log';
var ARGS = process.argv.slice(2);

function log(msg) { try { fs.appendFileSync(LOG, '[' + Date.now() + '] ' + msg + '\n'); } catch (e) {} }

if (process.argv.indexOf('--disable-timeouts') === -1) { process.argv.push('--disable-timeouts'); }

var service = new Service('br.com.customhome.lite.service');
try { fs.writeFileSync('/tmp/home-svc.pid', String(process.pid)); } catch (e) {}
log('start pid=' + process.pid + ' args=[' + ARGS.join(' ') + ']');

service.register('status', function (m) { m.respond({ returnValue: true, running: true, pid: process.pid }); });
service.register('readLog', function (m) {
	try {
		var data = fs.readFileSync(LOG, 'utf8');
		m.respond({ returnValue: true, log: data.slice(-4000) });
	} catch (e) { m.respond({ returnValue: false, error: String(e) }); }
});
// The web app is denied applicationManager/listLaunchPoints ("Denied method
// call ... for category /"); this service calls it with service privileges and
// forwards the result so the launcher can render real installed-app icons.
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

var launching = false;
function launchApp(reason) {
	if (launching) return;
	launching = true;
	setTimeout(function () { launching = false; }, 800);
	launchId(APP_ID, reason);
}

function bootLaunch(attempt) {
	attempt = attempt || 1;
	service.call('luna://com.webos.applicationManager/launch', { id: APP_ID }, function (m) {
		var ok = m && m.payload && m.payload.returnValue === true;
		log('bootLaunch #' + attempt + ': ' + JSON.stringify(m && m.payload));
		if (!ok && attempt < 30) { setTimeout(function () { bootLaunch(attempt + 1); }, 2000); }
	});
}

function watchAll() {
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
 						launchApp('home-key');
 					}
 				}
 			} catch (e) {
 				// Nonblocking fds raise EAGAIN when no event is ready; anything
 				// else (device removed, etc.) must not kill the watcher.
 				if (e && e.code !== 'EAGAIN' && e.code !== 'EWOULDBLOCK') { log('watch read error: ' + e.message); }
 			}
 		}
 	}, 100);
 }

setInterval(function () {
	try {
		if (fs.existsSync('/tmp/home-svc-cmd')) {
			var id = ('' + fs.readFileSync('/tmp/home-svc-cmd')).trim();
			fs.unlinkSync('/tmp/home-svc-cmd');
			if (id) { launchId(id, 'cmd'); }
		}
	} catch (e) {}
}, 250);

if (ARGS.indexOf('--boot') !== -1) {
	setTimeout(function () { bootLaunch(1); }, 1000);
}
if (ARGS.indexOf('--watch') !== -1) { watchAll(); }

function wakeRelaunch () {
	var tries = 0;
	var iv = setInterval(function () {
		tries++;
		service.call('luna://com.webos.applicationManager/launch', { id: APP_ID }, function (m) { log('wake launch ' + tries + ': ' + JSON.stringify(m && m.payload)); });
		if (tries >= 4) clearInterval(iv);
	}, 1500);
}
var lastBeat = Date.now();
setInterval(function () {
	var now = Date.now(), gap = now - lastBeat; lastBeat = now;
	if (gap > 10000) {
		log('WAKE detected -> relaunch');
		wakeRelaunch();
	}
}, 1000);
