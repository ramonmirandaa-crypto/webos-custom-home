import {useEffect, useMemo, useRef, useState} from 'react';
import {fetchEpisodes, readCachedEpisodes, type EpisodeItem, type SeriesItem} from '../lib/iptv';

// tvOS-style episode browser: season pills + episode grid inside a blur panel.
export function SeriesPicker ({
	series,
	onClose,
	onPlay
}: {
	series: SeriesItem;
	onClose: () => void;
	onPlay: (ep: EpisodeItem) => void;
}) {
	const [state, setState] = useState<'loading' | 'ready' | 'error'>(() =>
		readCachedEpisodes(series.id) ? 'ready' : 'loading'
	);
	const [episodes, setEpisodes] = useState(() => readCachedEpisodes(series.id)?.episodes ?? []);
	const [seasons, setSeasons] = useState(() => readCachedEpisodes(series.id)?.seasons ?? []);
	const [season, setSeason] = useState(1);
	const [zone, setZone] = useState<'pills' | 'grid'>('pills');
	const [col, setCol] = useState(0);

	useEffect(() => {
		fetchEpisodes(series.id)
			.then((r) => {
				setEpisodes(r.episodes);
				setSeasons(r.seasons);
				const first = r.seasons[0]?.n || 1;
				setSeason(first);
				setState('ready');
			})
			.catch(() => setState('error'));
	}, [series.id]);

	const seasonEps = useMemo(() => episodes.filter((e) => e.season === season), [episodes, season]);
	const gridRef = useRef<HTMLDivElement | null>(null);

	const goLeft = () => setCol((c) => Math.max(0, c - 1));
	const goRight = () => setCol((c) => Math.min(seasonEps.length - 1, c + 1));
	const goDown = () => {
		if (zone === 'pills') {
			setZone('grid');
		} else {
			setCol((c) => Math.min(seasonEps.length - 1, c + 8));
		}
	};
	const goUp = () => {
		if (zone === 'grid') {
			setCol((c) => Math.max(0, c - 8));
			if (Math.max(0, col - 8) < 8) setZone('pills');
		}
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.keyCode === 461 || e.key === 'GoBack' || e.key === 'Escape' || e.key === 'Backspace') {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key === 'ArrowLeft') { e.preventDefault(); goLeft(); }
			else if (e.key === 'ArrowRight') { e.preventDefault(); goRight(); }
			else if (e.key === 'ArrowDown') { e.preventDefault(); goDown(); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); goUp(); }
			else if (e.key === 'Enter') {
				e.preventDefault();
				if (e.repeat) return;
				if (zone === 'pills') {
					const s = seasons[Math.min(col, seasons.length - 1)];
					if (s) {
						setSeason(s.n);
						setCol(0);
						setZone('grid');
					}
					return;
				}
				const ep = seasonEps[Math.min(col, seasonEps.length - 1)];
				if (ep) onPlay(ep);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [zone, col, seasonEps, onPlay, onClose]);

	useEffect(() => {
		const el = gridRef.current?.querySelector(`[data-ep="${col}"]`);
		el?.scrollIntoView({block: 'nearest'});
	}, [col, zone, season]);

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[110px] backdrop-blur-2xl select-none">
			<div className="relative w-[1664px] max-h-[820px] overflow-hidden rounded-[30px] border border-white/14 bg-[#101318]/92 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.95)]">
				<div className="flex items-center gap-8 px-10 pt-10 pb-6">
					<div className="h-[150px] w-[100px] shrink-0 overflow-hidden rounded-[12px] bg-[#1A1E27]">
						{series.cover && <img src={series.cover} alt="" className="h-full w-full object-cover" draggable={false} />}
					</div>
					<div className="min-w-0">
						<p className="text-[30px] font-bold tracking-tight text-white">{series.name}</p>
						<p className="mt-1.5 flex items-center gap-3 text-[15px] font-medium text-white/55">
							{series.year && <span>{series.year}</span>}
							{series.rating > 0 && <span className="text-[#FFD60A]">★ {series.rating.toFixed(1)}</span>}
							<span>{episodes.length} episódios</span>
						</p>
						{series.plot && <p className="mt-2 line-clamp-2 max-w-[1250px] text-[15px] leading-snug text-white/70">{series.plot}</p>}
					</div>
				</div>

				<div className="flex items-center gap-3 px-10 pb-5" data-focus-zone="pills">
					{seasons.map((s) => {
						const active = s.n === season;
						return (
							<button
								type="button"
								key={s.n}
								tabIndex={-1}
								data-pill={s.n}
								onClick={() => { setSeason(s.n); setCol(0); }}
								className="rounded-full px-5 py-2 text-[15px] font-semibold whitespace-nowrap"
								style={{
									background: zone === 'pills' && col === seasons.indexOf(s)
										? 'rgba(255,255,255,0.95)'
										: active
											? 'rgba(255,255,255,0.22)'
											: 'rgba(255,255,255,0.08)',
									color: zone === 'pills' && col === seasons.indexOf(s) ? '#0b0c0f' : 'rgba(255,255,255,0.92)',
									transform: zone === 'pills' && col === seasons.indexOf(s) ? 'scale(1.06)' : 'scale(1)',
									transitionProperty: 'background, color, transform',
									transitionDuration: '160ms',
									transitionTimingFunction: 'ease-out'
								}}
							>
								{s.name}
							</button>
						);
					})}
				</div>

				<div ref={gridRef} className="grid max-h-[480px] grid-cols-8 gap-3 overflow-y-auto px-10 pb-10" data-focus-zone="grid" style={{scrollbarWidth: 'none'}}>
					{state === 'loading' && (
						<p className="col-span-8 py-8 text-center text-[16px] text-white/55">Carregando episódios…</p>
					)}
					{state === 'error' && (
						<p className="col-span-8 py-8 text-center text-[16px] text-[#FF8F86]">Não foi possível carregar os episódios</p>
					)}
					{state === 'ready' && seasonEps.map((ep, i) => {
						const focused = zone === 'grid' && col === i;
						return (
							<button
								type="button"
								key={`${ep.season}-${ep.epNum}`}
								tabIndex={-1}
								data-ep={i}
								onClick={() => onPlay(ep)}
								className="rounded-[14px] border px-4 py-3 text-left"
								style={{
									borderColor: focused ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)',
									background: focused ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
									transform: focused ? 'scale(1.05)' : 'scale(1)',
									transitionProperty: 'border-color, background, transform',
									transitionDuration: '160ms',
									transitionTimingFunction: 'ease-out'
								}}
							>
								<p className="text-[12.5px] font-semibold text-white/45 tabular-nums">
									E{String(ep.epNum).padStart(2, '0')}
									{ep.duration ? <span className="ml-2 font-medium">· {ep.duration}min</span> : null}
								</p>
								<p className="mt-1 truncate text-[14px] font-semibold text-white">{ep.title}</p>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
