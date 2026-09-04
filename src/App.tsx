import {memo, useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense} from 'react';
import Header from './components/Header';
import AppCard from './components/AppCard';
import Settings from './components/Settings';
import {Row, ChannelTile, PosterTile} from './components/content';
import {type PlayItem} from './components/Player';
const Player = lazy(() => import('./components/Player').then((m) => ({default: m.Player})));
import {SeriesPicker} from './components/SeriesPicker';
import {DEFAULT_AT4K_APPS, type AT4KAppItem} from './lib/at4k-data';
import {launchApp, listLaunchPoints, blockScreenSaver, isWebOS} from './service/luna';
import {loadClock24, saveClock24} from './lib/prefs';
import {
	readCachedLive,
	refreshLive,
	readCachedMovies,
	refreshMovies,
	readCachedSeries,
	refreshSeries,
	fetchEpg,
	liveUrl,
	movieUrl,
	episodeUrl,
	type LiveChannel,
	type MovieItem,
	type SeriesItem,
	type EpisodeItem,
	type EpgProgram
} from './lib/iptv';
import {loadIptvConfig, saveIptvConfig, hasIptvConfig, type IptvConfig} from './lib/iptv';

const DOCK_COUNT = 6;
const GRID_COLS = 6;
const ORDER_KEY = 'at4k-app-order-v2';
const HIDDEN_KEY = 'at4k-hidden-v2';

const LIVE_W = 160;
const LIVE_GAP = 18;
const POSTER_W = 80;
const POSTER_GAP = 13;

type SectionId = 'live' | 'films' | 'series' | 'apps';
const SECTION_ORDER: SectionId[] = ['live', 'films', 'series', 'apps'];

interface FocusPos {
	section: SectionId;
	row: number;
	col: number;
}

interface PlayState {
	chIndex: number | null;
	item: PlayItem;
}

function loadSavedOrder (): string[] {
	try {
		const raw = localStorage.getItem(ORDER_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

function saveOrder (ids: string[]) {
	try {
		localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
	} catch {}
}

function loadSavedHidden (): Set<string> {
	try {
		const raw = localStorage.getItem(HIDDEN_KEY);
		if (!raw) return new Set();
		return new Set(JSON.parse(raw));
	} catch {
		return new Set();
	}
}

function saveHidden (ids: Set<string>) {
	try {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
	} catch {}
}

function focusKey (f: FocusPos): string {
	return `${f.section}:${f.row}:${f.col}`;
}

// Extracted memoized components to prevent unmount/remount on every render
const SectionTitle = memo(function SectionTitle ({title, count}: {title: string; count?: number}) {
	return (
		<div className="flex items-baseline gap-3 px-[98px]">
			<h2 className="text-[27px] font-bold tracking-tight text-white/95" style={{textShadow: '0 2px 10px rgba(0,0,0,0.7)'}}>
				{title}
			</h2>
			{count !== undefined && <span className="text-[14px] font-medium text-white/40">{count}</span>}
		</div>
	);
});

const SkeletonTiles = memo(function SkeletonTiles ({count, prefix, size = 'lg'}: {count: number; prefix: string; size?: 'lg' | 'md'}) {
	return (
		<>
			{Array.from({length: count}).map((_, i) => (
				<div
					key={i}
					data-fkey={`${prefix}:0:${i}`}
					className={`shrink-0 animate-pulse bg-white/5 ${size === 'md' ? 'rounded-[8px]' : 'rounded-[22px]'}`}
					style={size === 'md' ? {width: 60, height: 90} : {width: 320, height: 180}}
				/>
			))}
		</>
	);
});

function FpsMeter () {
	const [stat, setStat] = useState('—');
	useEffect(() => {
		let frames = 0;
		let worst = Infinity;
		let last = performance.now();
		let raf = 0;
		const loop = (now: number) => {
			frames++;
			if (now - last >= 500) {
				const fps = Math.round((frames * 1000) / (now - last));
				worst = Math.min(worst, fps);
				setStat(`${fps} · mín ${worst}`);
				frames = 0;
				last = now;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, []);
	return (
		<div className="absolute bottom-4 left-6 z-50 rounded-full bg-black/70 px-4 py-1.5 text-[14px] font-semibold tabular-nums text-white/85">
			{stat} fps
		</div>
	);
}

export default function App () {
	const [apps, setApps] = useState<AT4KAppItem[]>(() => {
		const saved = loadSavedOrder();
		if (saved.length === 0) return DEFAULT_AT4K_APPS;
		const map = new Map<string, AT4KAppItem>();
		for (const a of DEFAULT_AT4K_APPS) map.set(a.id, a);
		const ordered: AT4KAppItem[] = [];
		for (const id of saved) {
			const a = map.get(id);
			if (a) {
				ordered.push(a);
				map.delete(id);
			}
		}
		for (const a of map.values()) ordered.push(a);
		return ordered;
	});

	const [hidden, setHidden] = useState<Set<string>>(loadSavedHidden);
	const [focus, setFocus] = useState<FocusPos>(() => {
		// Never park focus on an empty row: boot into the first section that has items.
		if (!hasIptvConfig()) return {section: 'apps', row: 0, col: 0};
		try {
			if (readCachedLive().length) return {section: 'live', row: 0, col: 0};
			if (readCachedMovies().length) return {section: 'films', row: 0, col: 0};
			if (readCachedSeries().length) return {section: 'series', row: 0, col: 0};
		} catch {}
		return {section: 'apps', row: 0, col: 0};
	});
	const [inHeader, setInHeader] = useState<boolean>(false);
	const [headerCol, setHeaderCol] = useState<'settings' | 'filters'>('settings');
	const [reordering, setReordering] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [clock24, setClock24] = useState(loadClock24);
	const [fps, setFps] = useState(() => {
		try { return localStorage.getItem('home-fps-v1') === '1'; }
		catch { return false; }
	});
	const handleFps = useCallback((v: boolean) => {
		setFps(v);
		try { localStorage.setItem('home-fps-v1', v ? '1' : '0'); } catch {}
	}, []);
	const [toast, setToast] = useState<string | null>(null);
	const [iptvConfig, setIptvConfig] = useState<IptvConfig>(() => loadIptvConfig());

	const [channels, setChannels] = useState<LiveChannel[]>(() => readCachedLive());
	const [movies, setMovies] = useState<MovieItem[]>(() => readCachedMovies());
	const [series, setSeries] = useState<SeriesItem[]>(() => readCachedSeries());
	const [epgMap, setEpgMap] = useState<Record<number, EpgProgram>>({});
	const [liveError, setLiveError] = useState(false);
	const [play, setPlay] = useState<PlayState | null>(null);
	const [picker, setPicker] = useState<SeriesItem | null>(null);

	const holdTimer = useRef<number>(0);
	const holdFired = useRef<boolean>(false);
	const overlayActiveAtKeydown = useRef(false);
	const toastTimer = useRef<number>(0);
	const reorderSnapshot = useRef<AT4KAppItem[] | null>(null);
	const mainRef = useRef<HTMLElement | null>(null);
	const [viewportY, setViewportY] = useState(0);

	// Ref-based state mirrors for 0-latency keydown handling (no listener re-attachment)
	const focusRef = useRef(focus);
	focusRef.current = focus;
	const inHeaderRef = useRef(inHeader);
	inHeaderRef.current = inHeader;
	const settingsOpenRef = useRef(settingsOpen);
	settingsOpenRef.current = settingsOpen;
	const playRef = useRef(play);
	playRef.current = play;
	const pickerRef = useRef(picker);
	pickerRef.current = picker;
	const reorderingRef = useRef(reordering);
	reorderingRef.current = reordering;
	const appsRef = useRef(apps);
	appsRef.current = apps;
	const channelsRef = useRef(channels);
	channelsRef.current = channels;
	const moviesRef = useRef(movies);
	moviesRef.current = movies;
	const seriesRef = useRef(series);
	seriesRef.current = series;

	// O(1) DOM element ref cache for smooth scroll positioning
	const tileRefs = useRef<Map<string, HTMLElement>>(new Map());
	const registerTileRef = useCallback((key: string) => (el: HTMLElement | null) => {
		if (el) tileRefs.current.set(key, el);
		else tileRefs.current.delete(key);
	}, []);

	// Freeze scaling to 1:1, handling screen aspect
	const [fit, setFit] = useState<{sx: number; sy: number}>({sx: 1, sy: 1});
	useEffect(() => {
		const apply = () => {
			const sx = window.innerWidth / 1920;
			const sy = window.innerHeight / 1080;
			setFit((prev) =>
				Math.abs(prev.sx - sx) > 0.001 || Math.abs(prev.sy - sy) > 0.001 ? {sx, sy} : prev
			);
		};
		apply();
		window.addEventListener('resize', apply);
		return () => window.removeEventListener('resize', apply);
	}, []);

	const visibleApps = useMemo(() => apps.filter((a) => !hidden.has(a.id)), [apps, hidden]);

	const swapVisibleNeighbors = useCallback((visIdx: number, step: 1 | -1) => {
		const target = visIdx + step;
		if (target < 0 || target >= visibleApps.length) return;
		const a = visibleApps[visIdx];
		const b = visibleApps[target];
		setApps((prev) => {
			const ai = prev.findIndex((x) => x.id === a.id);
			const bi = prev.findIndex((x) => x.id === b.id);
			if (ai < 0 || bi < 0) return prev;
			const next = [...prev];
			next[ai] = b;
			next[bi] = a;
			return next;
		});
	}, [visibleApps]);

	const appsRows = useMemo(() => {
		const dock = visibleApps.slice(0, DOCK_COUNT);
		const grid = visibleApps.slice(DOCK_COUNT);
		const gridRows: AT4KAppItem[][] = [];
		for (let i = 0; i < grid.length; i += GRID_COLS) {
			gridRows.push(grid.slice(i, i + GRID_COLS));
		}
		return [dock, ...gridRows];
	}, [visibleApps]);

	const appsRowsRef = useRef(appsRows);
	appsRowsRef.current = appsRows;

	const sectionRows = useCallback(
		(section: SectionId): unknown[][] => {
			// Empty rows collapse: they hold no focus and render no section.
			if (section === 'live') return channelsRef.current.length ? [channelsRef.current] : [];
			if (section === 'films') return moviesRef.current.length ? [moviesRef.current] : [];
			if (section === 'series') return seriesRef.current.length ? [seriesRef.current] : [];
			return appsRowsRef.current;
		},
		[]
	);

	const showToast = useCallback((msg: string) => {
		setToast(msg);
		window.clearTimeout(toastTimer.current);
		toastTimer.current = window.setTimeout(() => setToast(null), 2600);
	}, []);

	const handleSaveIptv = useCallback((cfg: IptvConfig) => {
		saveIptvConfig(cfg);
		setIptvConfig(cfg);
		showToast('Configuração IPTV salva');
	}, [showToast]);

	// Keep focus on a rendered item after data/order changes.
	useEffect(() => {
		if (settingsOpen) return;
		setFocus((f) => {
			const rs = sectionRows(f.section);
			if (!rs.length) {
				// Current section dried up (e.g. cache cleared): jump to the first one with items.
				for (const s of SECTION_ORDER) {
					const cand = sectionRows(s);
					if (cand.length && (cand[0] as unknown[]).length) return {section: s, row: 0, col: 0};
				}
				return f;
			}
			const r = Math.min(f.row, rs.length - 1);
			const row = rs[r] as unknown[];
			const c = Math.min(f.col, Math.max(0, row.length - 1));
			return r === f.row && c === f.col ? f : {...f, row: r, col: c};
		});
	}, [channels, movies, series, appsRows, settingsOpen, sectionRows]);

	// Load IPTV lists: cache first (instant render), refresh in background.
	useEffect(() => {
		if (!hasIptvConfig()) return;
		const timers: number[] = [];
		const withRetry = (run: () => Promise<unknown>, after: () => void) => {
			run()
				.then(() => after())
				.catch(() => {
					after();
					timers.push(window.setTimeout(() => withRetry(run, after), 60_000));
				});
		};
		withRetry(
			() =>
				refreshLive((partial) => {
					setChannels(partial);
					setLiveError(false);
				}).then((l) => {
					setChannels(l);
					setLiveError(false);
				}),
			() => {
				if (channelsRef.current.length === 0) setLiveError(true);
			}
		);
		withRetry(
			() => refreshMovies().then(setMovies),
			() => {}
		);
		withRetry(
			() => refreshSeries().then(setSeries),
			() => {}
		);
		return () => timers.forEach((t) => window.clearTimeout(t));
	}, [iptvConfig]);

	// EPG for the curated live row
	useEffect(() => {
		if (!channels.length) return;
		let cancelled = false;
		(async () => {
			for (const ch of channels) {
				if (cancelled) return;
				const prog = await fetchEpg(ch.id);
				if (cancelled || !prog) continue;
				setEpgMap((m) => (m[ch.id] ? m : {...m, [ch.id]: prog}));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [channels]);

	// Merge launch-point icons from the TV
	useEffect(() => {
		if (!isWebOS()) return;
		let cancelled = false;
		let attempts = 0;
		const tryFetch = () => {
			if (cancelled) return;
			listLaunchPoints()
				.then((res) => {
					if (cancelled) return;
					setApps((prev) => {
						const launchPoints = res.launchPoints || [];
						const byId = new Map(launchPoints.map((lp) => [lp.id, lp]));
						const existing = new Set(prev.map((app) => app.id));
						let changed = false;

						const merged = prev.map((app) => {
							// The TV's own icon is the official art for what's installed —
							// keep it apart from the bundled fallback so neither clobbers the other.
							const launchPoint = byId.get(app.id);
							if (!launchPoint?.icon || launchPoint.icon === app.tvIcon) return app;
							changed = true;
							return {...app, tvIcon: launchPoint.icon};
						});

						for (const launchPoint of launchPoints) {
							if (existing.has(launchPoint.id)) continue;
							changed = true;
							merged.push({
								id: launchPoint.id,
								title: launchPoint.title,
								label: launchPoint.title,
								icon: launchPoint.icon,
								cardBg: '#263944',
								textColor: '#FFFFFF',
								logoType: 'generic'
							});
						}

						if (!changed) return prev;
						saveOrder(merged.map((app) => app.id));
						return merged;
					});
				})
				.catch(() => {
					if (cancelled) return;
					attempts += 1;
					if (attempts < 2) window.setTimeout(tryFetch, 3000);
				});
		};
		tryFetch();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => blockScreenSaver(), []);

	// Vertical scroll using fast Ref Map lookup instead of DOM querySelector
	useEffect(() => {
		const main = mainRef.current;
		if (!main) return;
		const key = focusKey(focus);
		const el = tileRefs.current.get(key) || main.querySelector(`[data-fkey="${key}"]`);
		if (!el) return;
		const frame = requestAnimationFrame(() => {
			const mt = main.getBoundingClientRect().top;
			const top = el.getBoundingClientRect().top - mt;
			const ny = Math.min(Math.max(0, top - 140), Math.max(0, main.scrollHeight - window.innerHeight));
			setViewportY((prev) => (Math.abs(prev - ny) > 2 ? ny : prev));
		});
		return () => cancelAnimationFrame(frame);
	}, [focus]);

	// ---------------------------------------------------------- actions

	const playChannel = useCallback((ch: LiveChannel) => {
		const idx = channelsRef.current.findIndex((c) => c.id === ch.id);
		setPlay({
			chIndex: idx >= 0 ? idx : null,
			item: {
				kind: 'live',
				url: liveUrl(ch.id),
				title: ch.name,
				logo: ch.logo || undefined,
				meta: ch.group
			}
		});
	}, []);

	const playMovie = useCallback((m: MovieItem) => {
		setPlay({
			chIndex: null,
			item: {kind: 'movie', url: movieUrl(m.id), title: m.name, meta: 'Filme'}
		});
	}, []);

	const openSeriesPicker = useCallback((s: SeriesItem) => {
		setPicker(s);
	}, []);

	const playEpisode = useCallback((seriesItem: SeriesItem, ep: EpisodeItem) => {
		setPicker(null);
		setPlay({
			chIndex: null,
			item: {
				kind: 'series',
				url: episodeUrl(seriesItem.id, ep.season, ep.epNum),
				title: ep.title,
				meta: `${seriesItem.name} · E${String(ep.epNum).padStart(2, '0')}`
			}
		});
	}, []);

	const handleZap = useCallback(
		(delta: 1 | -1) => {
			const p = playRef.current;
			if (!p) return;
			const nextIndex = (p.chIndex ?? 0) + delta;
			const ch = channelsRef.current[nextIndex];
			if (!ch) return;
			playChannel(ch);
		},
		[playChannel]
	);

	const handleEnterAction = useCallback(() => {
		const f = focusRef.current;
		if (f.section === 'live') {
			const ch = channelsRef.current[f.col];
			if (ch) playChannel(ch);
			return;
		}
		if (f.section === 'films') {
			const m = moviesRef.current[f.col];
			if (m) playMovie(m);
			return;
		}
		if (f.section === 'series') {
			const s = seriesRef.current[f.col];
			if (s) openSeriesPicker(s);
			return;
		}
		const app = appsRowsRef.current[f.row]?.[f.col];
		if (!app) return;
		if (app.launchType === 'internal') {
			setSettingsOpen(true);
			return;
		}
		if (isWebOS()) {
			launchApp(app.id).catch(() => {
				showToast(`Não foi possível abrir ${app.title}`);
			});
		} else {
			console.log('Launch:', app.id);
		}
	}, [playChannel, playMovie, openSeriesPicker, showToast]);

	// ZERO-LATENCY KEYDOWN HANDLER: Attached ONCE, reads state via refs.
	// Never torn down/re-attached during navigation.
	useEffect(() => {
		const clampDown = (f: FocusPos): FocusPos => {
			const orderIdx = SECTION_ORDER.indexOf(f.section);
			for (let i = orderIdx + 1; i < SECTION_ORDER.length; i++) {
				const rs = sectionRows(SECTION_ORDER[i]);
				if (rs.length && (rs[0] as unknown[]).length > 0) {
					const row = rs[0] as unknown[];
					return {section: SECTION_ORDER[i], row: 0, col: Math.min(f.col, Math.max(0, row.length - 1))};
				}
			}
			return f;
		};

		const clampUp = (f: FocusPos): FocusPos | 'header' => {
			const orderIdx = SECTION_ORDER.indexOf(f.section);
			if (orderIdx === 0) return 'header';
			for (let i = orderIdx - 1; i >= 0; i--) {
				const rs = sectionRows(SECTION_ORDER[i]);
				if (rs.length && (rs[rs.length - 1] as unknown[]).length > 0) {
					const lastRowIdx = rs.length - 1;
					const row = rs[lastRowIdx] as unknown[];
					return {section: SECTION_ORDER[i], row: lastRowIdx, col: Math.min(f.col, Math.max(0, row.length - 1))};
				}
			}
			return f;
		};

		const onKeyDown = (e: KeyboardEvent) => {
			overlayActiveAtKeydown.current = !!(settingsOpenRef.current || playRef.current || pickerRef.current);
			if (overlayActiveAtKeydown.current) return;

			const isBack = e.keyCode === 461 || e.key === 'GoBack' || e.key === 'Escape' || e.key === 'Backspace';

			if (isBack) {
				e.preventDefault();
				if (reorderingRef.current) {
					if (reorderSnapshot.current) setApps(reorderSnapshot.current);
					setReordering(false);
					reorderSnapshot.current = null;
					return;
				}
				if (inHeaderRef.current) {
					setInHeader(false);
					return;
				}
				const f = focusRef.current;
				let target: FocusPos = {section: 'apps', row: 0, col: 0};
				for (const s of SECTION_ORDER) {
					const cand = sectionRows(s);
					if (cand.length && (cand[0] as unknown[]).length) { target = {section: s, row: 0, col: 0}; break; }
				}
				if (f.section !== target.section || f.row !== target.row || f.col !== target.col) {
					setFocus(target);
				}
				return;
			}

			if (inHeaderRef.current) {
				if (e.key === 'ArrowLeft') {
					e.preventDefault();
					setHeaderCol('settings');
					return;
				}
				if (e.key === 'ArrowRight') {
					e.preventDefault();
					setHeaderCol('filters');
					return;
				}
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setInHeader(false);
					return;
				}
				if (e.key === 'Enter') {
					e.preventDefault();
					setSettingsOpen(true);
					setInHeader(false);
					return;
				}
				return;
			}

			const f = focusRef.current;
			const rs = sectionRows(f.section);
			if (!rs.length) return;
			const curRow = rs[f.row] as unknown[];

			if (e.key === 'ArrowRight') {
				e.preventDefault();
				if (f.col < curRow.length - 1) {
					if (reorderingRef.current && f.section === 'apps') {
						const visIdx = f.row === 0 ? f.col : DOCK_COUNT + (f.row - 1) * GRID_COLS + f.col;
						swapVisibleNeighbors(visIdx, 1);
					}
					setFocus((prev) => (prev.col < curRow.length - 1 ? {...prev, col: prev.col + 1} : prev));
				}
				return;
			}

			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				if (f.col > 0) {
					if (reorderingRef.current && f.section === 'apps') {
						const visIdx = f.row === 0 ? f.col : DOCK_COUNT + (f.row - 1) * GRID_COLS + f.col;
						swapVisibleNeighbors(visIdx, -1);
					}
					setFocus((prev) => (prev.col > 0 ? {...prev, col: prev.col - 1} : prev));
				}
				return;
			}

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (f.row < rs.length - 1) {
					const nextRow = rs[f.row + 1] as unknown[];
					const nextCol = Math.min(f.col, Math.max(0, nextRow.length - 1));
					setFocus((prev) => ({...prev, row: prev.row + 1, col: nextCol}));
				} else {
					const next = clampDown(f);
					if (next !== f) setFocus(next);
				}
				return;
			}

			if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (f.row > 0) {
					const prevRow = rs[f.row - 1] as unknown[];
					const prevCol = Math.min(f.col, Math.max(0, prevRow.length - 1));
					setFocus((prev) => ({...prev, row: prev.row - 1, col: prevCol}));
				} else {
					const prev = clampUp(f);
					if (prev === 'header') {
						setInHeader(true);
						setHeaderCol('settings');
					} else if (prev !== f) {
						setFocus(prev);
					}
				}
				return;
			}

			if (e.key === 'Enter') {
				e.preventDefault();
				if (e.repeat) return;
				holdFired.current = false;
				holdTimer.current = window.setTimeout(() => {
					holdFired.current = true;
					if (focusRef.current.section === 'apps') {
						reorderSnapshot.current = appsRef.current;
						setReordering(true);
						showToast('Organizar apps: use ← → para mover · OK salvar');
					}
				}, 500);
				return;
			}
		};

		const onKeyUp = (e: KeyboardEvent) => {
			// The keydown of this same press was consumed by an overlay (e.g. the
			// player closed on Enter) — never let the keyup re-trigger the action.
			if (overlayActiveAtKeydown.current) {
				overlayActiveAtKeydown.current = false;
				return;
			}
			if (settingsOpenRef.current || playRef.current || pickerRef.current) return;
			if (e.key !== 'Enter') return;
			window.clearTimeout(holdTimer.current);
			if (holdFired.current) return;
			if (reorderingRef.current) {
				setReordering(false);
				saveOrder(appsRef.current.map((a) => a.id));
				reorderSnapshot.current = null;
				showToast('Posição salva');
				return;
			}
			handleEnterAction();
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [sectionRows, swapVisibleNeighbors, handleEnterAction, showToast]);

	// ---------------------------------------------------------- render

	return (
		<>
			<div
				className="fixed inset-0"
				style={{background: 'url(./wallpaper.jpg) center/cover', filter: 'blur(28px) brightness(0.55)'}}
			/>
			<div
				className="launcher-shell absolute left-0 top-0 select-none"
				style={{
					background: '#050506',
					width: 1920,
					height: 1080,
					transform: `scale(${fit.sx}, ${fit.sy})`,
					transformOrigin: '0 0'
				}}
			>
				<div className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{backgroundImage: 'url(./wallpaper.jpg)'}} />
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[180px]" style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))'}} />
			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px]" style={{background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))'}} />
				<div
					className="pointer-events-none absolute left-[50%] top-[42%] h-[360px] w-[1460px] -translate-x-1/2 -translate-y-1/2"
					style={{background: 'radial-gradient(closest-side, rgba(86,124,255,0.2), rgba(120,64,220,0.13) 46%, rgba(0,0,0,0) 78%)'}}
				/>
				<div className="pointer-events-none absolute left-[12%] top-[58%] h-[300px] w-[420px]" style={{background: 'radial-gradient(closest-side, rgba(42,196,214,0.16), rgba(0,0,0,0) 70%)'}} />
				<div className="pointer-events-none absolute right-[10%] top-[56%] h-[300px] w-[420px]" style={{background: 'radial-gradient(closest-side, rgba(255,92,128,0.14), rgba(0,0,0,0) 70%)'}} />

				<div className="absolute left-[41px] top-[21px] z-40">
					<p className="text-[21px] font-semibold tracking-tight text-white/92" style={{textShadow: '0 1px 6px rgba(0,0,0,0.8)'}}>
						Início
					</p>
				</div>
				<Header
					clock24={clock24}
					focusedButton={inHeader ? headerCol : null}
					onOpenSettings={() => setSettingsOpen(true)}
				/>

				<main
					ref={mainRef}
					className="absolute inset-0 pt-[75px] will-change-transform"
					style={{
						transform: `translate3d(0, ${-viewportY}px, 0)`,
						transitionProperty: 'transform',
						transitionDuration: '240ms',
						transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
					}}
				>
					<div className="space-y-[27px] pb-[70px]">
						{(iptvConfig.base !== '' || channels.length > 0 || movies.length > 0 || series.length > 0 || liveError) ? (
							<>
						{/* Ao vivo */}
						<section aria-label="Canais ao vivo">
							<SectionTitle title="Ao vivo" count={channels.length || undefined} />
							<div className="mt-[11px] overflow-hidden px-[98px] pb-[64px]">
								{liveError && channels.length === 0 ? (
									<p className="text-[16px] font-medium text-white/45">O provedor IPTV está lento — tentando novamente…</p>
								) : (
									<Row
										tileWidth={LIVE_W}
										tileGap={LIVE_GAP}
										count={Math.max(channels.length, 5)}
										focusedIndex={focus.section === 'live' ? focus.col : -1}
									>
										{channels.length
											? channels.map((ch, i) => (
												<div
													key={ch.id}
													ref={registerTileRef(`live:0:${i}`)}
													data-fkey={`live:0:${i}`}
													style={{marginRight: i === channels.length - 1 ? 0 : LIVE_GAP}}
												>
													<ChannelTile
														item={ch}
														focused={!inHeader && focus.section === 'live' && focus.col === i}
														epg={epgMap[ch.id] ?? null}
														enter={playChannel}
													/>
												</div>
											))
											: <SkeletonTiles count={5} prefix="live" size="lg" />}
									</Row>
								)}
							</div>
						</section>

						{/* Filmes */}
						<section aria-label="Filmes">
							<SectionTitle title="Filmes" count={movies.length || undefined} />
							<div className="mt-[11px] overflow-hidden px-[98px]">
								<Row
									tileWidth={POSTER_W}
									tileGap={POSTER_GAP}
									count={Math.max(movies.length, 5)}
									focusedIndex={focus.section === 'films' ? focus.col : -1}
								>
									{movies.length
										? movies.map((m, i) => (
											<div
												key={m.id}
												ref={registerTileRef(`films:0:${i}`)}
												data-fkey={`films:0:${i}`}
												style={{marginRight: i === movies.length - 1 ? 0 : POSTER_GAP}}
											>
												<PosterTile
													item={m}
													kind="movie"
													size="md"
													focused={focus.section === 'films' && focus.col === i}
													enter={(item) => playMovie(item as MovieItem)}
												/>
											</div>
										))
										: <SkeletonTiles count={5} prefix="films" size="md" />}
								</Row>
							</div>
						</section>

						{/* Séries */}
						<section aria-label="Séries">
							<SectionTitle title="Séries" count={series.length || undefined} />
							<div className="mt-[11px] overflow-hidden px-[98px]">
								<Row
									tileWidth={POSTER_W}
									tileGap={POSTER_GAP}
									count={Math.max(series.length, 5)}
									focusedIndex={focus.section === 'series' ? focus.col : -1}
								>
									{series.length
										? series.map((s, i) => (
											<div
												key={s.id}
												ref={registerTileRef(`series:0:${i}`)}
												data-fkey={`series:0:${i}`}
												style={{marginRight: i === series.length - 1 ? 0 : POSTER_GAP}}
											>
												<PosterTile
													item={s}
													kind="series"
													size="md"
													focused={focus.section === 'series' && focus.col === i}
													enter={(item) => openSeriesPicker(item as SeriesItem)}
												/>
											</div>
										))
										: <SkeletonTiles count={5} prefix="series" size="md" />}
								</Row>
							</div>
						</section>
							</>
						) : (
							<section aria-label="Configurar IPTV">
								<div className="px-[98px] pt-[8px]">
									<p className="text-[18px] font-medium text-white/60">Sem IPTV configurado — abra Ajustes para conectar sua lista.</p>
								</div>
							</section>
						)}

						{/* Apps */}
						<section aria-label="Aplicativos">
							<SectionTitle title="Apps" count={visibleApps.length || undefined} />
							<div className="mt-[19px] flex items-center justify-center" aria-label="Aplicativos favoritos">
								<div className="flex items-center gap-8">
									{appsRows[0]?.map((app, colIdx) => (
										<div key={app.id} ref={registerTileRef(`apps:0:${colIdx}`)} data-fkey={`apps:0:${colIdx}`}>
											<AppCard
												app={app}
												focused={!inHeader && focus.section === 'apps' && focus.row === 0 && focus.col === colIdx}
												reordering={reordering && focus.section === 'apps' && focus.row === 0 && focus.col === colIdx}
											/>
										</div>
									))}
								</div>
							</div>
							<div className="mt-[29px] flex w-full flex-col items-center gap-[29px] pb-12">
								{appsRows.slice(1).map((gridRow, rowOffset) => {
									const rowIdx = rowOffset + 1;
									return (
										<div key={rowIdx} className="flex items-center justify-center gap-6">
											{gridRow.map((app, colIdx) => (
												<div key={app.id} ref={registerTileRef(`apps:${rowIdx}:${colIdx}`)} data-fkey={`apps:${rowIdx}:${colIdx}`}>
													<AppCard
														app={app}
														focused={focus.section === 'apps' && focus.row === rowIdx && focus.col === colIdx}
														reordering={reordering && focus.section === 'apps' && focus.row === rowIdx && focus.col === colIdx}
													/>
												</div>
											))}
										</div>
									);
								})}
							</div>
						</section>
					</div>
				</main>

				{settingsOpen && (
					<Settings
						onClose={() => setSettingsOpen(false)}
						onOrderReset={() => {
							setApps(DEFAULT_AT4K_APPS);
							saveOrder(DEFAULT_AT4K_APPS.map((a) => a.id));
						}}
						apps={apps}
						hidden={hidden}
						onToggleHide={(id) => {
							setHidden((prev) => {
								const next = new Set(prev);
								if (next.has(id)) next.delete(id);
								else next.add(id);
								saveHidden(next);
								return next;
							});
						}}
						clock24={clock24}
						onClock24={(v) => {
							setClock24(v);
							saveClock24(v);
						}}
						fps={fps}
						onFps={handleFps}
						iptvConfig={iptvConfig}
						onSaveIptv={handleSaveIptv}
					/>
				)}

				{picker && (
					<SeriesPicker series={picker} onClose={() => setPicker(null)} onPlay={(ep) => playEpisode(picker, ep)} />
				)}

				{play && (
					<Suspense fallback={null}>
						<Player item={play.item} onClose={() => setPlay(null)} onZap={handleZap} onEnter={() => setPlay(null)} />
					</Suspense>
				)}

				{!settingsOpen && (
					<div
						className="pointer-events-none absolute bottom-9 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 px-7 py-3 text-[16px] font-medium text-white shadow-xl backdrop-blur-xl"
						style={{
							background: 'rgba(13,20,31,0.9)',
							opacity: toast ? 1 : 0,
							transform: `translateX(-50%) translateY(${toast ? 0 : 10}px)`,
							transitionProperty: 'opacity, transform',
							transitionDuration: '220ms',
							transitionTimingFunction: 'ease-out'
						}}
					>
						{toast}
					</div>
				)}
				{fps && <FpsMeter />}
			</div>
		</>
	);
}
