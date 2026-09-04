type Params = Record<string, unknown>;

interface PalmBridge {
	onservicecallback?: (msg: string) => void;
	call: (uri: string, params: string) => void;
	cancel?: () => void;
}

declare global {
	interface Window {
		PalmServiceBridge?: new () => PalmBridge;
	}
}

export function isWebOS (): boolean {
	return typeof window !== 'undefined' && typeof window.PalmServiceBridge === 'function';
}

export function lunaCall<T = unknown> (service: string, method: string, params: Params = {}, timeoutMs = 4000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const Bridge = window.PalmServiceBridge;
		if (!Bridge) { reject(new Error('not on webOS')); return; }
		const bridge = new Bridge();
		let settled = false;
		const timer = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new Error(`timeout: ${service}/${method}`));
		}, timeoutMs);
		bridge.onservicecallback = (msg) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			try {
				const data = JSON.parse(msg) as T & {returnValue?: boolean; errorText?: string};
				if (data.returnValue === false) reject(new Error(data.errorText || `${service}/${method} failed`));
				else resolve(data);
			} catch (e) { reject(e as Error); }
		};
		try {
			bridge.call(`luna://${service}/${method}`, JSON.stringify(params));
		} catch (e) {
			if (!settled) { settled = true; window.clearTimeout(timer); reject(e as Error); }
		}
	});
}

// TV_HELPER_URL: devmode negates applicationManager/launch for web apps ("Denied
// method call ... category /"), so launching falls back to a LAN helper
// (scripts/tv-helper.py on server-t5) that runs ares-launch with the devmode SSH
// profile. Override via `settings` when HBC/root grants the direct bridge call.
const TV_HELPER_URL = 'http://192.168.0.77:8108';

function helperCall<T = unknown> (path: string): Promise<T> {
	return fetch(`${TV_HELPER_URL}/${path}`).then((r) => r.json() as Promise<T>);
}

export async function launchApp (id: string, params: Params = {}): Promise<unknown> {
	// 1) Direct bridge — works once Homebrew Channel/root grants the category.
	try {
		return await lunaCall('com.webos.applicationManager', 'launch', {id, params}, 4000);
	} catch { /* fall through to helper */ }
	// 2) LAN helper — devmode SSH profile, always permitted.
	const res = await helperCall<{ok: boolean; error?: string; out?: string}>(`launch?app=${encodeURIComponent(id)}`);
	if (!res.ok) {
		const detail = (res.out || res.error || '').split('\n').filter(Boolean).slice(0, 3).join(' · ');
		throw new Error(detail || 'launch fallback failed');
	}
	return res;
}

export interface LaunchPoint {id: string; title: string; icon: string; launchPointId?: string}

function listLaunchPointsDirect (): Promise<{launchPoints?: LaunchPoint[]}> {
	return lunaCall('com.webos.applicationManager', 'listLaunchPoints', {});
}

// The web app is denied applicationManager/listLaunchPoints; the bundled
// dev-mode service (br.com.customhome.lite.service) proxies it with service
// privileges. Try the proxy first, fall back to the direct call.
export async function listLaunchPoints (): Promise<{launchPoints?: LaunchPoint[]}> {
	try {
		return await lunaCall('br.com.customhome.lite.service', 'listLaunchPoints', {}, 5000);
	} catch {
		return listLaunchPointsDirect();
	}
}

export function blockScreenSaver (clientName = 'br.com.customhome.lite'): () => void {
	const Bridge = typeof window !== 'undefined' ? window.PalmServiceBridge : undefined;
	if (!Bridge) return () => { /* not on webOS */ };

	const bridge = new Bridge();
	bridge.onservicecallback = (msg) => {
		let data: {timestamp?: string} = {};
		try { data = JSON.parse(msg); } catch { return; }
		if (data.timestamp === undefined) return;
		lunaCall('com.webos.service.tvpower', 'power/responseScreenSaverRequest', {
			clientName, ack: false, timestamp: data.timestamp
		}).catch(() => { /* best-effort */ });
	};
	try {
		bridge.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
			JSON.stringify({clientName, subscribe: true}));
	} catch { /* noop */ }
	return () => { try { bridge.cancel?.(); } catch { /* noop */ } };
}
