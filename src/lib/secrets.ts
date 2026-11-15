// Secure on-device storage for the IPTV credentials.
//
// webOS TV 24+ exposes Keymanager3 (luna://com.webos.service.keymanager3), which
// performs AES in the keymaster TA inside the TEE — the key never leaves it.
// We generate one AES-256-CBC key (`iptv-key`, owned by this app) and store only
// the IV + ciphertext in localStorage. If Keymanager3 is unavailable, the config
// stays in localStorage in the clear and the caller is told so it can warn.
//
// https://webostv.developer.lge.com/develop/references/keymanager3

import {lunaCall} from '../service/luna';
import type {IptvConfig} from './iptv';

const KM3 = 'com.webos.service.keymanager3';
const KEY_NAME = 'iptv-key';
const CIPHER_KEY = 'atl_iptv_cipher_v1';
const LEGACY_KEY = 'atl_iptv_config_v1';

/** -10002: the key already exists — expected on every boot after the first. */
const ERR_KEY_EXISTS = -10002;

export type StorageMode = 'keymanager' | 'local' | 'none';

interface CipherBlob {
	iv: string;
	ct: string;
}

let cached: IptvConfig = {base: '', user: '', pass: ''};
let mode: StorageMode = 'none';

/** Synchronous read of the decrypted config, for the data layer's hot paths. */
export function iptvConfigSync (): IptvConfig {
	return cached;
}

/** Where the credentials currently live; drives the honest UI warning. */
export function storageMode (): StorageMode {
	return mode;
}

// ------------------------------------------------------------------ helpers

function toBase64 (text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function fromBase64 (b64: string): string {
	const binary = atob(b64);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function luna<T> (method: string, parameters: Record<string, unknown>, timeoutMs = 5000): Promise<T> {
	// Keymanager3 is not wrapped by webOSTV.js's webOS API, so it goes through the
	// shared PalmServiceBridge path in service/luna.ts.
	return lunaCall<T>(KM3, method, parameters, timeoutMs);
}

async function ensureKey (): Promise<void> {
	try {
		await luna('generateKey', {
			name: KEY_NAME,
			params: {type: 'AES', size: 256, mode: ['CBC'], purpose: ['encrypt', 'decrypt'], padding: ['PKCS7']}
		});
	} catch (e) {
		const code = (e as Error & {code?: number}).code;
		if (code !== ERR_KEY_EXISTS) throw e;   // -10002 just means a previous run created it
	}
}

/**
 * Encrypt with the TEE key. `begin` returns the handle (and, for encryption, the
 * IV); the payload goes in a single `finish` since the config is a few hundred
 * bytes. Any failure calls `abort` so the handle never leaks a TA session.
 */
async function encrypt (plain: string): Promise<CipherBlob> {
	const params = {type: 'AES', size: 256, mode: ['CBC'], purpose: ['encrypt'], padding: ['PKCS7']};
	const begun = await luna<{handle?: string; iv?: string}>('begin', {name: KEY_NAME, params});
	const handle = begun.handle;
	if (!handle || !begun.iv) throw new Error('keymanager3: begin sem handle/iv');
	try {
		const out = await luna<{output?: string}>('finish', {handle, data: toBase64(plain)});
		if (!out.output) throw new Error('keymanager3: finish sem output');
		return {iv: begun.iv, ct: out.output};
	} catch (e) {
		await luna('abort', {handle}).catch(() => { /* best-effort */ });
		throw e;
	}
}

async function decrypt (blob: CipherBlob): Promise<string> {
	const params = {type: 'AES', size: 256, mode: ['CBC'], purpose: ['decrypt'], padding: ['PKCS7'], iv: blob.iv};
	const begun = await luna<{handle?: string}>('begin', {name: KEY_NAME, params});
	const handle = begun.handle;
	if (!handle) throw new Error('keymanager3: begin sem handle');
	try {
		const out = await luna<{output?: string}>('finish', {handle, data: blob.ct});
		if (!out.output) throw new Error('keymanager3: finish sem output');
		return fromBase64(out.output);
	} catch (e) {
		await luna('abort', {handle}).catch(() => { /* best-effort */ });
		throw e;
	}
}

// ------------------------------------------------------------------ public

function parseConfig (raw: string): IptvConfig | null {
	try {
		const c = JSON.parse(raw) as Partial<IptvConfig>;
		if (typeof c.base === 'string' && typeof c.user === 'string' && typeof c.pass === 'string') {
			return {base: c.base, user: c.user, pass: c.pass};
		}
	} catch { /* malformed — treated as absent */ }
	return null;
}

function readLegacy (): IptvConfig | null {
	const raw = localStorage.getItem(LEGACY_KEY);
	return raw ? parseConfig(raw) : null;
}

/**
 * Load the credentials once at startup.
 * Order: encrypted blob → legacy plaintext (migrated immediately) → empty.
 * Never throws: a broken store degrades to an empty config the UI can report.
 */
export async function initIptvSecrets (): Promise<{config: IptvConfig; mode: StorageMode; migrated: boolean}> {
	let migrated = false;
	const blobRaw = localStorage.getItem(CIPHER_KEY);
	if (blobRaw) {
		try {
			const blob = JSON.parse(blobRaw) as CipherBlob;
			const parsed = parseConfig(await decrypt(blob));
			if (parsed) {
				cached = parsed;
				mode = 'keymanager';
				return {config: cached, mode, migrated};
			}
		} catch { /* key rotated or blob corrupt — fall through to legacy/empty */ }
	}

	const legacy = readLegacy();
	if (legacy) {
		const saved = await persist(legacy);
		cached = legacy;
		mode = saved;
		migrated = saved === 'keymanager';
		// Drop the plaintext copy only once it is safely re-encrypted.
		if (saved === 'keymanager') localStorage.removeItem(LEGACY_KEY);
		return {config: cached, mode, migrated};
	}

	cached = {base: '', user: '', pass: ''};
	mode = 'none';
	return {config: cached, mode, migrated};
}

/** Persist to the TEE when available; otherwise keep the plaintext fallback. */
async function persist (cfg: IptvConfig): Promise<StorageMode> {
	try {
		await ensureKey();
		const blob = await encrypt(JSON.stringify(cfg));
		localStorage.setItem(CIPHER_KEY, JSON.stringify(blob));
		localStorage.removeItem(LEGACY_KEY);
		return 'keymanager';
	} catch {
		localStorage.setItem(LEGACY_KEY, JSON.stringify({base: cfg.base, user: cfg.user, pass: cfg.pass}));
		return 'local';
	}
}

/**
 * Save the credentials. Returns where they landed so the UI can warn when the
 * TEE was not available. Always updates the in-memory copy immediately.
 */
export async function saveIptvSecrets (cfg: IptvConfig): Promise<StorageMode> {
	cached = {base: cfg.base, user: cfg.user, pass: cfg.pass};
	mode = await persist(cached);
	return mode;
}

/** Forget stored credentials (both stores). */
export function clearIptvSecrets (): void {
	cached = {base: '', user: '', pass: ''};
	mode = 'none';
	localStorage.removeItem(CIPHER_KEY);
	localStorage.removeItem(LEGACY_KEY);
}
