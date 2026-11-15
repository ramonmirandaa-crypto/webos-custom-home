import {useEffect, useRef, useState} from 'react';
import type Hls from 'hls.js';

export interface PlayItem {
	kind: 'live' | 'movie' | 'series';
	url: string;
	title: string;
	logo?: string;
	meta?: string; // group (live) or kind label
}

const OSD_TIMEOUT = 5000;

// Fullscreen player. Its visual vocabulary is the pre-theme baseline; the tvOS
// overlay (theme/tvos-theme.css) restyles these classes (.bg-black/45,
// .rounded-[26px], .text-[13px]/[14px] ...). Keep them intact.
// tvOS-style OSD at the bottom, auto-hide, zap on
// ArrowUp/ArrowDown for live, Enter toggles play/pause, Back exits.
//
// Playback follows the official media guidance: prefer the platform's native
// HLS (Safari/webOS can play m3u8 itself) and only load hls.js when the panel
// cannot. Switching clips always goes through load(), which resets readyState
// on webOS TV 3.0+ — without it the new source is ignored.
// https://webostv.developer.lge.com/develop/guides/backward-compatibility
export function Player ({
	item,
	onClose,
	onZap
}: {
	item: PlayItem;
	onClose: () => void;
	onZap: (delta: 1 | -1) => void;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const hlsRef = useRef<Hls | null>(null);
	const osdTimer = useRef<number>(0);
	const [osd, setOsd] = useState(true);
	const [logoFailed, setLogoFailed] = useState(false);
	const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'error'>('loading');
	const [clock, setClock] = useState(() => new Date());

	const isLive = item.kind === 'live';

	// ---------------------------------------------------------------- source
	useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		let disposed = false;
		setState('loading');

		const onLoaded = () => {
			if (disposed) return;
			setState('playing');
			v.play().catch(() => { /* autoplay policies — the OSD still shows play */ });
		};
		v.addEventListener('loadedmetadata', onLoaded);
		v.addEventListener('error', () => { if (!disposed) setState('error'); });

		const isHls = /\.m3u8(\?|$)/i.test(item.url);
		const nativeHls = v.canPlayType('application/vnd.apple.mpegurl') !== '';

		if (isHls && !nativeHls) {
			// hls.js is only pulled in when the panel cannot play m3u8 natively.
			void import('hls.js').then(({default: HlsCtor}) => {
				if (disposed) return;
				const hls = new HlsCtor({enableWorker: true});
				hls.attachMedia(v);
				hls.on(HlsCtor.Events.ERROR, (_ev, data) => {
					if (data.fatal) setState('error');
				});
				hls.on(HlsCtor.Events.MANIFEST_PARSED, onLoaded);
				hls.loadSource(item.url);
				hlsRef.current = hls;
			});
		} else {
			v.src = item.url;
			v.load();
		}

		return () => {
			disposed = true;
			hlsRef.current?.destroy();
			hlsRef.current = null;
			v.removeEventListener('loadedmetadata', onLoaded);
			v.pause();
			v.removeAttribute('src');
			v.load();
		};
	}, [item.url]);

	// -------------------------------------------------------------- remote
	useEffect(() => {
		const wake = () => {
			setOsd(true);
			window.clearTimeout(osdTimer.current);
			osdTimer.current = window.setTimeout(() => setOsd(false), OSD_TIMEOUT);
		};
		const togglePlay = () => {
			const v = videoRef.current;
			if (!v) return;
			if (v.paused) {
				v.play().then(() => setState('playing')).catch(() => { /* keep OSD honest */ });
			} else {
				v.pause();
				setState('paused');
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.keyCode === 461 || e.key === 'GoBack' || e.key === 'Escape' || e.key === 'Backspace') {
				e.preventDefault();
				onClose();
				return;
			}
			if (isLive && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				e.preventDefault();
				wake();
				onZap(e.key === 'ArrowUp' ? 1 : -1);
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				if (e.repeat) return;
				wake();
				togglePlay();
				return;
			}
			// Any other keypress brings the OSD back without stealing the key.
			wake();
		};

		wake();
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.clearTimeout(osdTimer.current);
		};
	}, [isLive, onClose, onZap]);

	// Keep the clock in the OSD fresh without re-rendering every second.
	useEffect(() => {
		const id = window.setInterval(() => setClock(new Date()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	// Suspend playback when the app loses the foreground: the system launcher or
	// the TV's own overlay taking over should not leave audio playing behind it.
	useEffect(() => {
		const suspend = () => {
			const v = videoRef.current;
			if (v && !v.paused) {
				v.pause();
				setState('paused');
			}
		};
		const onVisibility = () => { if (document.hidden) suspend(); };
		window.addEventListener('blur', suspend);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			window.removeEventListener('blur', suspend);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, []);

	const controlsVisible = osd || state === 'paused';

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
					opacity: controlsVisible ? 1 : 0,
					transform: controlsVisible ? 'translateY(0)' : 'translateY(10px)',
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
					<p className="mt-0.5 truncate text-[14px] font-medium text-white/55">
						{state === 'paused' ? 'Pausado · OK retoma' : (item.meta || '')}
					</p>
				</div>
				{isLive ? (
					<span className="flex shrink-0 items-center gap-2 rounded-full bg-[#FF453A]/15 px-4 py-1.5 text-[13px] font-bold uppercase tracking-[0.18em] text-[#FF6961]">
						<span className="h-2.5 w-2.5 rounded-full bg-[#FF453A]" />
						Ao vivo
					</span>
				) : (
					<span className="shrink-0 text-[14px] font-semibold text-white/60 tabular-nums">
						{clock.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
					</span>
				)}
				<span className="shrink-0 text-[13px] font-medium text-white/40">
					{isLive ? '↑ ↓ trocar canal · OK pausar' : 'OK pausar · Voltar sair'}
				</span>
			</div>
		</div>
	);
}
