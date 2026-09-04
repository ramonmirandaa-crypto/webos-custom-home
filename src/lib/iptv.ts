// IPTV data layer — Xtream Codes player_api + localStorage cache.
// The provider (g2026.sbs / Unistream panel) streams every full response slowly
// and its short-EPG endpoint returns empty listings. Strategy: render from
// cache instantly, refresh lists in the background, and treat EPG as optional
// info (typically absent — tiles/OSD fall back to group title).

export interface LiveChannel {
	id: number;
	name: string;
	logo: string;
	group: string;
	epgId: string;
}

export interface MovieItem {
	id: number;
	name: string;
	poster: string;
	rating: number;
}

export interface SeriesItem {
	id: number;
	name: string;
	cover: string;
	rating: number;
	year: string;
	plot: string;
}

export interface EpisodeItem {
	epNum: number;
	season: number;
	title: string;
	duration: string;
	plot: string;
}

export interface EpgProgram {
	title: string;
	start: number; // epoch seconds
	end: number;
}

export interface IptvConfig {
	base: string
	user: string
	pass: string
}

export function loadIptvConfig (): IptvConfig {
	try {
		const raw = localStorage.getItem('atl_iptv_config_v1')
		if (!raw) return {base: '', user: '', pass: ''}
		const c = JSON.parse(raw)
		if (typeof c.base === 'string' && typeof c.user === 'string' && typeof c.pass === 'string') {
			return {base: c.base, user: c.user, pass: c.pass}
		}
		return {base: '', user: '', pass: ''}
	} catch {
		return {base: '', user: '', pass: ''}
	}
}

export function saveIptvConfig (cfg: IptvConfig): void {
	try {
		localStorage.setItem('atl_iptv_config_v1', JSON.stringify({base: cfg.base, user: cfg.user, pass: cfg.pass}))
	} catch {
		/* quota — same guard as cacheSet */
	}
}

export function hasIptvConfig (): boolean {
	return loadIptvConfig().base !== ''
}

const LIST_TTL = 6 * 60 * 60 * 1000;
const EPG_TTL = 20 * 60 * 1000;

function apiUrl (action: string, extra = ''): string {
	const {base, user, pass} = loadIptvConfig();
	return `${base}/player_api.php?username=${user}&password=${pass}&action=${action}${extra}`;
}

async function getJson<T> (url: string, timeoutMs = 45_000): Promise<T> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, {headers: {Accept: 'application/json'}, signal: ctrl.signal});
		if (!res.ok) throw new Error(`IPTV HTTP ${res.status}`);
		return (await res.json()) as T;
	} catch (err) {
		if (ctrl.signal.aborted) throw new Error('timeout');
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

// The panel streams every list slowly (~1-3 KB/s), so a full get_live_streams
// call can take 10+ minutes. Lists are fetched as parallel category subsets
// instead (each ~30-60s), and partial failures just skip a category.
async function fetchCategories<T> (
	action: string,
	categoryIds: number[],
	timeoutMs = 50_000,
	concurrency = 4
): Promise<T[]> {
	const out: T[] = [];
	let next = 0;
	const workers = Array.from({length: concurrency}, async () => {
		while (next < categoryIds.length) {
			const id = categoryIds[next++];
			out.push(...await getJson<T[]>(apiUrl(action, `&category_id=${id}`), timeoutMs).catch(() => []));
		}
	});
	await Promise.all(workers);
	return out;
}

function cacheGet<T> (key: string, ttl = LIST_TTL): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const e = JSON.parse(raw);
		if (Date.now() - e.t > ttl) {
			localStorage.removeItem(key);
			return null;
		}
		return e.v as T;
	} catch {
		return null;
	}
}

function cacheSet (key: string, v: unknown, ttl = LIST_TTL): void {
	try {
		localStorage.setItem(key, JSON.stringify({t: Date.now(), v, ttl}));
	} catch {
		/* quota — lists are small (~30KB), EPG is per channel */
	}
}

// ---------------------------------------------------------------- live

interface RawStream {
	num?: number;
	stream_id: number;
	name: string;
	stream_icon: string;
	group_title?: string;
	epg_channel_id?: string;
	category_id?: string;
	category_ids?: number[];
}

// Category priority for the home "Ao vivo" row (order = curation order).
// Ids from get_live_categories on this panel.
const CATEGORY_PRIORITY: Record<number, number> = {
	51: 1, // GLOBO | CAPITAIS
	54: 2, // SBT
	53: 3, // REDE RECORD
	55: 4, // REDE BANDEIRANTES
	56: 5, // ABERTOS
	57: 6, // PREMIERE
	73: 7, // ESPN
	74: 8, // SPORTV
	76: 9, // TELECINE
	77: 10, // HBO
	68: 11, // FILMES E SÉRIES
	70: 12, // DISCOVERY
	79: 13, // NOTICIAS
	78: 14, // INFANTIL
	80: 15, // CINE SKY
	72: 16, // DOCUMENTÁRIOS
	71: 17, // HISTORY
	75: 18, // ESPORTES
	69: 19 // VARIEDADES
};

const LIVE_ROW_SIZE = 16;

function qualityRank (name: string): number {
	if (/\b(UHD|4K|FHD|H265|HEVC)\b/i.test(name)) return 3;
	if (/\bHD\b/i.test(name)) return 2;
	if (/\bSD\b/i.test(name)) return 0;
	return 1;
}

function baseName (name: string): string {
	return name
		.replace(/\[.*?\]/g, '')
		.replace(/\b(UHD|4K|FHD|HD|SD|H265|HEVC)\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function categoryPriority (catIds: number[]): number {
	let best = Infinity;
	for (const id of catIds) {
		const p = CATEGORY_PRIORITY[id];
		if (p !== undefined && p < best) best = p;
	}
	return best;
}

function curateLive (raw: RawStream[]): LiveChannel[] {
	const picks: LiveChannel[] = [];
	const seen = new Set<string>();
	const byPriority = new Map<number, RawStream[]>();

	for (const ch of raw) {
		// Category-filtered responses omit group_title; categoryPriority falls
		// back to the single category_id when category_ids is missing.
		const p = categoryPriority(ch.category_ids && ch.category_ids.length ? ch.category_ids : [Number(ch.category_id)]);
		if (!isFinite(p)) continue;
		if (!byPriority.has(p)) byPriority.set(p, []);
		byPriority.get(p)!.push(ch);
	}

	for (const [, list] of [...byPriority.entries()].sort((a, b) => a[0] - b[0])) {
		if (picks.length >= LIVE_ROW_SIZE) break;
		list.sort((a, b) => {
			const q = qualityRank(b.name) - qualityRank(a.name);
			if (q !== 0) return q;
			// The panel lists its own priority order first (SP/RJ/…); keep it.
			return (a.num || 0) - (b.num || 0);
		});
		let taken = 0;
		for (const ch of list) {
			const base = baseName(ch.name);
			if (seen.has(base)) continue;
			seen.add(base);
			picks.push({
				id: ch.stream_id,
				name: ch.name,
				logo: ch.stream_icon || '',
				group: (ch.group_title || '').replace(/^\W+\s*/, '').trim() || 'Ao vivo',
				epgId: ch.epg_channel_id || String(ch.stream_id)
			});
			taken += 1;
			if (taken >= 2 || picks.length >= LIVE_ROW_SIZE) break;
		}
	}
	return picks;
}

export function readCachedLive (): LiveChannel[] {
	return cacheGet<LiveChannel[]>('atl_live_v1') || [];
}

export async function refreshLive (onUpdate?: (channels: LiveChannel[]) => void): Promise<LiveChannel[]> {
	if (loadIptvConfig().base === '') throw new Error('IPTV não configurado');
	// Full get_live_streams regenerates slowly on this panel (1MB+ at ~1KB/s).
	// Fetch the top curated categories in small waves of two; every subset that
	// lands is merged and reported immediately so the UI fills progressively.
	const ids = Object.keys(CATEGORY_PRIORITY)
		.map(Number)
		.sort((a, b) => CATEGORY_PRIORITY[a] - CATEGORY_PRIORITY[b])
		.slice(0, 10);
	const collected: RawStream[] = [];
	const queue = [...ids];
	let inFlight = 0;
	let done = false;

	const finish = (): Promise<LiveChannel[]> => {
		const cur = curateLive(collected);
		if (cur.length >= readCachedLive().length) cacheSet('atl_live_v1', cur);
		return Promise.resolve(cur);
	};

	return new Promise<LiveChannel[]>((resolve, reject) => {
		const started = Date.now();
		const tick = () => {
			if (done) return;
			if (Date.now() - started > 240_000) {
				done = true;
				resolve(finish());
				return;
			}
			while (inFlight < 2 && queue.length > 0) {
				const id = queue.shift()!;
				inFlight += 1;
				getJson<RawStream[]>(apiUrl('get_live_streams', `&category_id=${id}`), 65_000)
									.then((list) => {
					collected.push(...(Array.isArray(list) ? list : []));
					const cur = curateLive(collected);
					if (cur.length > 0) onUpdate?.(cur);
					inFlight -= 1;
					tick();
				})
					.catch(() => {
						inFlight -= 1;
						tick();
					});
			}
			if (inFlight === 0 && queue.length === 0) {
				done = true;
				if (collected.length === 0) reject(new Error('Nenhum canal disponível'));
				else resolve(finish());
			}
		};
		tick();
	});
}

// ---------------------------------------------------------------- vod

interface RawVod {
	stream_id: number;
	name: string;
	stream_icon: string;
	rating: string;
}

interface RawSeries {
	series_id: number;
	name: string;
	cover: string;
	rating: string;
	year: string;
	plot: string;
}

function num (v: unknown): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

export function readCachedMovies (): MovieItem[] {
	return cacheGet<MovieItem[]>('atl_movies_v1') || [];
}

// Popular movie categories on this panel (names from get_vod_categories).
const MOVIE_CATEGORY_NAMES = ['Lançamentos', 'Ação', 'Comedia', 'Drama', 'Ficcao Cientifica', 'Cinema', 'Familia', 'Animacao'];

async function movieCategoryIds (): Promise<number[]> {
	try {
		const raw = await getJson<{category_id: number; category_name: string}[]>(
			apiUrl('get_vod_categories'),
			15_000
		);
		const byName = new Map(raw.map((c) => [c.category_name.toLowerCase().replace(/[^a-z]/g, ''), c.category_id]));
		const ids: number[] = [];
		for (const name of MOVIE_CATEGORY_NAMES) {
			const id = byName.get(name.toLowerCase().replace(/[^a-z]/g, ''));
			if (id) ids.push(id);
		}
		return ids;
	} catch {
		return [];
	}
}

export async function refreshMovies (): Promise<MovieItem[]> {
	if (loadIptvConfig().base === '') throw new Error('IPTV não configurado');
	const ids = await movieCategoryIds();
	const raw = ids.length
		? await fetchCategories<RawVod>('get_vod_streams', ids)
		: await getJson<RawVod[]>(apiUrl('get_vod_streams'), 50_000).catch(() => []);
	const list = (Array.isArray(raw) ? raw : [])
		.filter((m) => m.name && m.stream_icon)
		.map((m) => ({id: m.stream_id, name: m.name, poster: m.stream_icon, rating: num(m.rating)}))
		.sort((a, b) => b.rating - a.rating)
		.slice(0, 48);
	if (list.length === 0) throw new Error('Nenhum filme disponível');
	cacheSet('atl_movies_v1', list);
	return list;
}

export function readCachedSeries (): SeriesItem[] {
	return cacheGet<SeriesItem[]>('atl_series_v1') || [];
}

export async function refreshSeries (): Promise<SeriesItem[]> {
	if (loadIptvConfig().base === '') throw new Error('IPTV não configurado');
	// Category-scoped get_series calls time out on this panel; the full
	// catalog call is fast (~1s) and the getJson fix keeps the abort timer
	// covering the body stream — use it directly.
	const raw = await getJson<RawSeries[]>(apiUrl('get_series'), 75_000);
	const list = (Array.isArray(raw) ? raw : [])
		.filter((s) => s.name && s.cover)
		.map((s) => ({id: s.series_id, name: s.name, cover: s.cover, rating: num(s.rating), year: s.year || '', plot: s.plot || ''}))
		.sort((a, b) => b.rating - a.rating)
		.slice(0, 48);
	if (list.length === 0) throw new Error('Nenhuma série disponível');
	cacheSet('atl_series_v1', list);
	return list;
}

// ---------------------------------------------------------------- epg

interface RawEpgListing {
	title: string;
	start: string;
	end: string;
	start_timestamp?: number;
	end_timestamp?: number;
}

function parseEpoch (v: string | undefined, ts?: number): number {
	if (ts) return ts;
	if (!v) return 0;
	const t = Date.parse(v.replace(' ', 'T'));
	return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
}

// Provider's get_short_epg mostly returns empty listings; cache nulls with a
// short TTL so we never re-query a channel in the same session repeatedly.
export async function fetchEpg (channelId: number): Promise<EpgProgram | null> {
	if (loadIptvConfig().base === '') return null;
	const key = `atl_epg_${channelId}`;
	const cached = cacheGet<EpgProgram | null>(key, EPG_TTL);
	if (cached !== null || localStorage.getItem(key)) return cached;
	try {
		const r = await getJson<{epg_listings: RawEpgListing[]}>(apiUrl('get_short_epg', `&stream_id=${channelId}&limit=2`));
		const first = r?.epg_listings?.[0];
		if (!first?.title) {
			cacheSet(key, null, EPG_TTL);
			return null;
		}
		const prog: EpgProgram = {
			title: first.title,
			start: parseEpoch(first.start, first.start_timestamp),
			end: parseEpoch(first.end, first.end_timestamp)
		};
		cacheSet(key, prog, EPG_TTL);
		return prog;
	} catch {
		cacheSet(key, null, EPG_TTL);
		return null;
	}
}

// ---------------------------------------------------------------- episodes

interface RawEpisode {
	id: number;
	episode_num: number;
	title: string;
	season: number;
	info: {duration: string; plot: string};
}

export interface SeriesEpisodes {
	seasons: {n: number; name: string}[];
	episodes: EpisodeItem[];
}

export function readCachedEpisodes (seriesId: number): SeriesEpisodes | null {
	return cacheGet<SeriesEpisodes>(`atl_episodes_${seriesId}`);
}

export async function fetchEpisodes (seriesId: number): Promise<SeriesEpisodes> {
	if (loadIptvConfig().base === '') throw new Error('IPTV não configurado');
	const cached = readCachedEpisodes(seriesId);
	if (cached) return cached;
	const r = await getJson<{
		seasons: {season_number: number; name: string}[];
		episodes: RawEpisode[];
	}>(apiUrl('get_series_info', `&series_id=${seriesId}`));
	const ep = ((r.episodes || []) as RawEpisode[])
		.map((e) => ({
			epNum: num(e.episode_num),
			season: num(e.season),
			title: e.title || `Episódio ${e.episode_num}`,
			duration: e.info?.duration || '',
			plot: e.info?.plot || ''
		}))
		.sort((a, b) => (a.season - b.season) || (a.epNum - b.epNum));
	const seasons = (r.seasons || [])
		.map((s) => ({n: num(s.season_number), name: s.name || `Temporada ${s.season_number}`}))
		.filter((s) => s.n > 0);
	const out: SeriesEpisodes = {seasons, episodes: ep};
	cacheSet(`atl_episodes_${seriesId}`, out);
	return out;
}

// ---------------------------------------------------------------- urls

export function liveUrl (id: number): string {
	const {base, user, pass} = loadIptvConfig();
	if (base === '') return '';
	return `${base}/live/${user}/${pass}/${id}.m3u8`;
}

export function movieUrl (id: number): string {
	const {base, user, pass} = loadIptvConfig();
	if (base === '') return '';
	return `${base}/movie/${user}/${pass}/${id}.m3u8`;
}

export function episodeUrl (seriesId: number, season: number, ep: number): string {
	const {base, user, pass} = loadIptvConfig();
	if (base === '') return '';
	return `${base}/series/${user}/${pass}/${seriesId}.${season}.${ep}.m3u8`;
}
