// Local TV simulator — loaded before the bundle in tests only.
//
// The launcher reaches the TV through two platform surfaces:
//   window.PalmServiceBridge   (every luna call, including webOSTV.js's own
//                               webOS.service.request wrapper)
//   window.PalmSystem          (platformBack, device identity, keyboard flag)
// plus the system events cursorStateChange / keyboardStateChange.
//
// This shim implements those, so every code path can be exercised off-TV and
// the app is only deployed once it is green. It is loaded by test/tv-sim.html
// and never ships in the app package.
//
// Keymanager3 is backed by real AES-256-CBC via WebCrypto, so the encrypt /
// decrypt round trip and the credential migration are genuinely exercised. The
// key lives in localStorage under a name the app never sees, mimicking a key
// that never leaves the TEE.
(function () {
	'use strict';

	var sim = {
		calls: [],
		apps: {
			'com.webos.app.livetv': 'TV ao vivo',
			'globoplaywebos': 'Globoplay',
			'com.crunchyroll.webos': 'Crunchyroll',
			'youtube.leanback.v4': 'YouTube',
			'io.strem.tv': 'Stremio',
			'com.plutotv.app': 'Pluto TV',
			'com.aceplayer.app': 'Ace Player',
			'com.webos.app.lgchannels': 'LG Channels',
			'com.webos.app.hdmi1': 'HDMI 1',
			'com.webos.app.hdmi2': 'HDMI 2',
			'com.webos.app.hdmi3': 'HDMI 3',
			'com.webos.app.hdmi4': 'HDMI 4',
			'com.webos.app.browser': 'Navegador',
			'com.webos.app.discovery': 'Loja de Apps',
			'com.palm.app.settings': 'Ajustes da TV'
		},
		launchCalls: [],
		// Flip from a test to exercise failure paths.
		deny: {},                    // {'com.webos.applicationManager/launch': true}
		keymanagerAvailable: true,
		backendCalls: []
	};
	window.__tvSim = sim;

	var pending = {};

	function b64(bytes) {
		var s = '';
		for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
		return btoa(s);
	}
	function unb64(str) {
		var bin = atob(str);
		var out = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}

	// ----------------------------------------------------------- PalmSystem
	window.PalmSystem = {
		isKeyboardVisible: false,
		platformBack: function () { sim.platformBackCalls = (sim.platformBackCalls || 0) + 1; },
		deviceInfo: JSON.stringify({modelName: 'SIMULATED-TV', platformVersion: '33.31.61'}),
		identifier: 'sim-device-id',
		timeZone: 'America/Sao_Paulo',
		country: JSON.stringify({country: 'BR', smartServiceCountry: 'BR'}),
		activate: function () {}
	};

	// ----------------------------------------------------- PalmServiceBridge
	// webOSTV.js routes webOS.service.request through this, so implementing the
	// bridge alone covers both the library calls and the app's raw calls.
	function PalmServiceBridge() {
		var self = this;
		self.onservicecallback = null;
		self.cancelled = false;
		self.call = function (uri, paramsJson) {
			// Split on the LAST slash: service names contain dots but never slashes,
			// while method names never do either — however `com.webos.service.keymanager3`
			// plus `/begin` means a naive first-slash split yields the wrong pair
			// whenever the caller passes a fully-qualified luna URI. webOSTV.js sends
			// the URI as given, so resolve it the same way the platform does: the
			// service is everything before the final segment.
			var rest = uri.replace(/^luna:\/\//, '');
			var slash = rest.lastIndexOf('/');
			var service = rest.slice(0, slash);
			var method = rest.slice(slash + 1);
			var params = {};
			try { params = JSON.parse(paramsJson || '{}'); } catch (e) { /* keep {} */ }
			var key = service + '/' + method;
			sim.calls.push(key);
			sim.backendCalls.push(key);

			// webOSTV.js assigns `onservicecallback` AFTER calling `call()`, so the
			// reply must be deferred and the callback read at fire time — checking
			// it synchronously would drop every response the library waits for.
			var emit = function (payload) {
				var body = JSON.stringify(payload);
				setTimeout(function () {
					if (self.cancelled || !self.onservicecallback) return;
					self.onservicecallback(body);
				}, 0);
			};

			if (sim.deny[key]) {
				emit({returnValue: false, errorCode: -1, errorText: 'Denied method call "' + method + '" for category "/"'});
				return;
			}

			if (key === 'com.webos.applicationManager/launch') {
				if (!sim.apps[params.id]) return emit({returnValue: false, errorCode: -101, errorText: 'not exist'});
				sim.launchCalls.push(params.id);
				return emit({returnValue: true, appId: params.id});
			}
			if (key === 'com.webos.applicationManager/getAppLoadStatus') {
				return emit({returnValue: true, exist: !!sim.apps[params.appId], appId: params.appId});
			}
			if (service === 'com.webos.service.keymanager3') {
				return keymanager(method, params, emit);
			}
			emit({returnValue: true});
		};
		self.cancel = function () { self.cancelled = true; };
	}
	window.PalmServiceBridge = PalmServiceBridge;

	// ---------------------------------------------------------- keymanager3
	function jwkKey(usages) {
		var jwk = JSON.parse(localStorage.getItem('__sim_teekey') || 'null');
		if (!jwk) return Promise.reject(new Error('Key not found'));
		return window.crypto.subtle.importKey('jwk', jwk, {name: 'AES-CBC'}, false, usages);
	}

	function keymanager(method, params, emit) {
		if (!sim.keymanagerAvailable) {
			return emit({returnValue: false, errorCode: -20000, errorText: 'keymanager3 not available'});
		}
		switch (method) {
		case 'generateKey':
			if (localStorage.getItem('__sim_teekey')) {
				return emit({returnValue: false, errorCode: -10002, errorText: 'Key already exists'});
			}
			window.crypto.subtle.generateKey({name: 'AES-CBC', length: 256}, true, ['encrypt', 'decrypt'])
				.then(function (k) { return window.crypto.subtle.exportKey('jwk', k); })
				.then(function (jwk) {
					localStorage.setItem('__sim_teekey', JSON.stringify(jwk));
					emit({returnValue: true});
				})
				.catch(function (e) { emit({returnValue: false, errorCode: -1, errorText: String(e)}); });
			return;
		case 'begin': {
			// Keymanager3 nests the algorithm description: the method arguments are
			// {name, params:{...ParamSet}} — reading `purpose` off the outer object
			// silently yields undefined and the IV never comes back.
			var set = params.params || {};
			var handle = 'h' + Math.random().toString(36).slice(2);
			// Encryption: the TEE generates the IV and hands it back. Decryption:
			// the caller passes back the IV that encryption produced.
			var iv = set.iv ? unb64(set.iv) : window.crypto.getRandomValues(new Uint8Array(16));
			pending[handle] = {params: set, iv: iv};
			var res = {returnValue: true, handle: handle};
			if ((set.purpose || []).indexOf('encrypt') !== -1) res.iv = b64(iv);
			return emit(res);
		}
		case 'finish': {
			var op = pending[params.handle];
			if (!op) return emit({returnValue: false, errorCode: -20028, errorText: 'Get error from keymaster'});
			delete pending[params.handle];
			var encrypting = (op.params.purpose || []).indexOf('encrypt') !== -1;
			jwkKey(encrypting ? ['encrypt'] : ['decrypt'])
				.then(function (k) {
					var data = unb64(params.data);
					return encrypting
						? window.crypto.subtle.encrypt({name: 'AES-CBC', iv: op.iv}, k, data)
						: window.crypto.subtle.decrypt({name: 'AES-CBC', iv: unb64(op.params.iv)}, k, data);
				})
				.then(function (buf) { emit({returnValue: true, output: b64(new Uint8Array(buf))}); })
				.catch(function (e) { emit({returnValue: false, errorCode: -20030, errorText: String(e)}); });
			return;
		}
		case 'abort':
			delete pending[params.handle];
			return emit({returnValue: true});
		default:
			return emit({returnValue: false, errorCode: -1, errorText: 'unsupported method'});
		}
	}

	// --------------------------------------------------------- system events
	sim.cursor = function (visible) {
		document.dispatchEvent(new CustomEvent('cursorStateChange', {detail: {visibility: visible}}));
	};
	sim.keyboard = function (visible) {
		window.PalmSystem.isKeyboardVisible = !!visible;
		document.dispatchEvent(new CustomEvent('keyboardStateChange', {detail: {visibility: visible}}));
	};
	sim.reset = function () {
		sim.calls.length = 0;
		sim.launchCalls.length = 0;
		sim.backendCalls.length = 0;
		sim.platformBackCalls = 0;
	};
})();
