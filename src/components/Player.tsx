import {useEffect, useRef, useState} from 'react';
import Hls from 'hls.js';

export interface PlayItem {
	kind: 'live' | 'movie' | 'series';
	url: string;
	title: string;
	logo?: string;
	meta?: string; // group (live) or kind label
}

// Fullscreen HLS player — tvOS-style OSD bottom-left, auto-hide, zap on
// ArrowUp/ArrowDown for live, Back/Escape exits.
export function Player ({
	item,
	onClose,
	onZap,
	onEnter
}: {
	item: PlayItem;
	onClose: () => void;
	onZap: (delta: 1 | -1) => void;
	onEnter?: () => void;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const hlsRef = useRef<Hls | null>(null);
	const [osd, setOsd] = useState(true);
	const [logoFailed, setLogoFailed] = useState(false);
	const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');

	useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		const isHls = /\.m3u8(\?|$)/i.test(item.url) || item.url.includes('m3u8');
		if (isHls && Hls.isSupported()) {
			const hls = new Hls({enableWorker: true});
			hls.attachMedia(v);
			hls.on(Hls.Events.ERROR, (_ev, data) => {
				if (data.fatal) setState('error');
			});
			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				setState('playing');
				v.play().catch(() => {});
			});
			hls.on(Hls.Events.LEVEL_LOADED, () => setState('playing'));
			hls.loadSource(item.url);
			hlsRef.current = hls;
		} else if (isHls && v.canPlayType('application/vnd.apple.mpegurl')) {
			v.src = item.url;
			v.onloadedmetadata = () => {
				setState('playing');
				v.play().catch(() => {});
			};
			v.onerror = () => setState('error');
		} else {
			v.src = item.url;
			v.onloadedmetadata = () => {
				setState('playing');
				v.play().catch(() => {});
			};
			v.onerror = () => setState('error');
		}
		return () => {
			hlsRef.current?.destroy();
			hlsRef.current = null;
			v.onloadedmetadata = null;
			v.onerror = null;
		};
	}, [item.url]);

	// OSD + remote handling
	useEffect(() => {
		const wake = () => setOsd(true);
		const onKey = (e: KeyboardEvent) => {
			if (e.keyCode === 461 || e.key === 'GoBack' || e.key === 'Escape' || e.key === 'Backspace') {
				e.preventDefault();
				onClose();
				return;
			}
			wake();
			if (item.kind === 'live') {
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					onZap(1);
				} else if (e.key === 'ArrowDown') {
					e.preventDefault();
					onZap(-1);
				}
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				onEnter?.();
				return;
			}
		};
		const t = window.setTimeout(() => setOsd(false), 5000);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.clearTimeout(t);
		};
	}, [item.kind, onClose, onZap, onEnter]);

	const isLive = item.kind === 'live';
	const [clock, setClock] = useState(() => new Date());
	useEffect(() => {
		const id = window.setInterval(() => setClock(new Date()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	return (
		<div className="fixed inset-0 z-50 bg-black select-none">
			<video ref={videoRef} className="h-full w-full object-contain" autoPlay playsInline />

			{state === 'loading' && (
				<div className="absolute inset-x-0 bottom-14 flex justify-center">
					<span className="flex items-center gap-3 rounded-full bg-black/60 px-6 py-3 text-[15px] font-medium text-white/85 backdrop-blur-xl">
						<span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
						Conectando…
					</span>
				</div>
			)}

			{state === 'error' && (
				<div className="absolute inset-x-0 bottom-14 flex justify-center">
					<span className="rounded-full bg-[#3A1B1B]/80 px-6 py-3 text-[15px] font-medium text-[#FF8F86] backdrop-blur-xl">
						Não foi possível carregar este conteúdo
					</span>
				</div>
			)}

			<div
				className="absolute bottom-10 left-10 right-10 flex items-center gap-5 rounded-[26px] border border-white/12 bg-black/45 px-7 py-5 backdrop-blur-2xl"
				style={{
					opacity: osd ? 1 : 0,
					transform: osd ? 'translateY(0)' : 'translateY(8px)',
					transitionProperty: 'opacity, transform',
					transitionDuration: '240ms',
					transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
				}}
			>
				{!logoFailed && item.logo ? (
					<img
						src={item.logo}
						alt=""
						className="h-[44px] max-w-[120px] object-contain"
						draggable={false}
						onError={() => setLogoFailed(true)}
					/>
				) : (
					<span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-white/10 text-[22px]">▶</span>
				)}
				<div className="min-w-0 flex-1">
					<p className="truncate text-[24px] font-semibold tracking-tight text-white">{item.title}</p>
					<p className="mt-0.5 truncate text-[14px] font-medium text-white/55">{item.meta || ''}</p>
				</div>
				{isLive ? (
					<span className="flex shrink-0 items-center gap-2 rounded-full bg-[#FF453A]/15 px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.18em] text-[#FF6961]">
						<span className="h-2.5 w-2.5 rounded-full bg-[#FF453A] shadow-[0_0_12px_rgba(255,69,58,0.95)]" />
						Ao vivo
					</span>
				) : (
					<span className="shrink-0 text-[14px] font-semibold text-white/60 tabular-nums">
						{clock.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
					</span>
				)}
				<span className="shrink-0 text-[13px] font-medium text-white/40">
					{isLive ? '↑ ↓ trocar canal' : 'OK pausar · Voltar sair'}
				</span>
			</div>
		</div>
	);
}
