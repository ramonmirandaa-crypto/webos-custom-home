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

// ------------------------------------------------------------------ platform

/** True on a webOS TV: webOSTV.js loaded (window.webOS) or the raw bridge exists. */
export function isWebOS (): boolean {
	if (typeof window === 'undefined') return false;
	return typeof window.webOS === 'object' || typeof window.PalmServiceBridge === 'function';
}

/**
 * Back-button exit per the official guide: webOS.platformBack() shows the
 * "exit app?" popup on webOS TV 6.0+ (Home launcher on 5.0 and lower).
 * Returns false when the library is missing (desktop preview).
 * https://webostv.developer.lge.com/develop/guides/back-button
 */
export function platformBack (): boolean {
	if (typeof window === 'undefined' || !window.webOS?.platformBack) return false;
	try {
		window.webOS.platformBack();
		return true;
	} catch {
		return false;
	}
}

/** Official key-code for the Magic Remote Back button. */
export const BACK_KEYCODE = 461;

// ------------------------------------------------------------------ raw luna

/** Raw PalmServiceBridge call — kept for services the webOSTV.js wrapper doesn't cover. */
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
				const data = JSON.parse(msg) as T & {returnValue?: boolean; errorText?: string; errorCode?: number};
				if (data.returnValue === false) {
					// errorCode is preserved so callers can special-case a known
					// failure (e.g. Keymanager3's -10002 "Key already exists").
					const err = new Error(data.errorText || `${service}/${method} failed`) as Error & {code?: number};
					err.code = data.errorCode;
					reject(err);
				} else resolve(data);
			} catch (e) { reject(e as Error); }
		};
		try {
			bridge.call(`luna://${service}/${method}`, JSON.stringify(params));
		} catch (e) {
			if (!settled) { settled = true; window.clearTimeout(timer); reject(e as Error); }
		}
	});
}

// ------------------------------------------------------------------ launching

// devmode negates applicationManager/launch for web apps ("Denied method call
// ... category /"), so a LAN helper (scripts/tv-helper.py on server-t5) is the
// fallback: it runs ares-launch with the devmode SSH profile. Both values are
// build-time overridable and the token never lives in the repo.
const TV_HELPER_URL: string = (import.meta.env.VITE_TV_HELPER_URL as string | undefined) || 'http://192.168.0.77:8110';
const TV_HELPER_TOKEN: string = (import.meta.env.VITE_TV_HELPER_TOKEN as string | undefined) || '';

function launchViaHelper (id: string): Promise<void> {
	return fetch(`${TV_HELPER_URL}/launch`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(TV_HELPER_TOKEN ? {Authorization: `Bearer ${TV_HELPER_TOKEN}`} : {})
		},
		body: JSON.stringify({app: id})
	}).then(async (r) => {
		const payload = (await r.json().catch(() => ({}))) as {ok?: boolean; out?: string; error?: string};
		if (!r.ok || !payload.ok) {
			const detail = (payload.out || payload.error || `helper HTTP ${r.status}`)
				.split('\n').filter(Boolean).slice(0, 3).join(' · ');
			throw new Error(detail || 'launch fallback failed');
		}
	});
}

/**
 * Launch an app: official path first (webOSDev.launch → applicationManager/launch),
 * LAN helper only if the platform denies it.
 */
export async function launchApp (id: string, params: Params = {}): Promise<void> {
	// 1) webOSDev.launch (webOSTV.js) — the documented API for launching apps.
	if (window.webOSDev?.launch) {
		const launched = await new Promise<boolean>((resolve) => {
			let settled = false;
			const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
			window.setTimeout(() => done(false), 4000);
			try {
				window.webOSDev!.launch({id, params, onSuccess: () => done(true), onFailure: () => done(false)});
			} catch { done(false); }
		});
		if (launched) return;
	}
	// 2) Direct luna call — works once HBC/root grants the category.
	try {
		await lunaCall('com.webos.applicationManager', 'launch', {id, params}, 4000);
		return;
	} catch { /* fall through */ }
	// 3) LAN helper — devmode SSH profile, always permitted.
	await launchViaHelper(id);
}

/**
 * Whether the app is installed on the TV (official applicationManager method).
 * The parameter is `appId` — passing `id` returns errorCode 2 "invalid
 * parameters" on this platform. Resolves false on desktop/denied callers
 * instead of throwing.
 */
export async function isAppInstalled (id: string): Promise<boolean> {
	try {
		const res = await lunaCall<{exist?: boolean}>(
			'com.webos.applicationManager', 'getAppLoadStatus', {appId: id}, 4000
		);
		return res.exist === true;
	} catch {
		return false;
	}
}

/**
 * Launch an app and, when it fails, say why: a tile for something that isn't
 * installed is the common case, and "não está instalado" is actionable where a
 * bare "falha ao abrir" is not. Only runs on the failure path.
 */
export async function launchAppWithReason (id: string, params: Params = {}): Promise<void> {
	try {
		await launchApp(id, params);
	} catch (err) {
		if (!(await isAppInstalled(id))) {
			throw new Error('não está instalado nesta TV');
		}
		throw err;
	}
}
