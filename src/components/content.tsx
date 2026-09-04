import {memo, useState, type ReactNode} from 'react';
import type {LiveChannel, MovieItem, SeriesItem, EpgProgram} from '../lib/iptv';

export function monogram (name: string): string {
	const words = name.replace(/\[.*?\]/g, '').trim().split(/\s+/).filter(Boolean);
	const letters = words.slice(0, 2).map((w) => w[0].toUpperCase());
	return letters.join('') || name.slice(0, 2).toUpperCase();
}

// Generic tvOS-style carousel row: translates horizontally to keep the focused
// tile centered within the 1528px content gutter. Wrapped in React.memo to prevent
// unnecessary re-renders when other sections update.
export const Row = memo(function Row ({
	tileWidth,
	tileGap,
	count,
	focusedIndex,
	children
}: {
	tileWidth: number;
	tileGap: number;
	count: number;
	focusedIndex: number;
	children: ReactNode;
}) {
	const gutter = 98;
	const viewport = (typeof window !== "undefined" ? window.innerWidth : 800) - gutter * 2;
	const rowW = count * (tileWidth + tileGap) - tileGap;
	let scroll = focusedIndex * (tileWidth + tileGap) - (viewport - tileWidth) / 2;
	scroll = Math.max(0, Math.min(scroll, Math.max(0, rowW - viewport)));

	return (
		<div
			className="relative flex items-center"
			style={{
				transform: `translate3d(${-scroll}px, 0, 0)`,
				transitionProperty: 'transform',
				transitionDuration: '180ms',
				transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
			}}
		>
			{children}
		</div>
	);
});

// Live channel tile — logo on glass, live pulse, program info (EPG) or group.
// Heavy GPU blur filters applied ONLY when focused to maintain 60fps on webOS TV.
export const ChannelTile = memo(function ChannelTile ({
	item,
	focused,
	epg,
	enter,
	size = 'lg'
}: {
	item: LiveChannel;
	focused: boolean;
	epg: EpgProgram | null;
	enter: (ch: LiveChannel) => void;
	size?: 'lg' | 'md';
}) {
	const [logoFailed, setLogoFailed] = useState(false);
	return (
		<div
			data-focused={focused ? 'true' : 'false'}
			className="relative shrink-0 cursor-pointer"
			style={{
				transform: focused ? 'scale(1.08)' : 'scale(1)',
				zIndex: focused ? 30 : 1,
				transitionProperty: 'transform',
				transitionDuration: '180ms',
				transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
			}}
		>
			<button
				type="button"
				tabIndex={-1}
				aria-label={item.name}
				onClick={() => enter(item)}
				className={`relative flex flex-col items-center justify-center overflow-hidden border ${
					size === 'md'
						? 'h-[64px] w-[112px] rounded-[8px]'
						: 'h-[90px] w-[160px] rounded-[11px]'
				}`}
				style={{
					background: focused
						? 'linear-gradient(150deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06) 55%, rgba(4,8,12,0.7))'
						: 'rgba(18, 24, 34, 0.72)',
					WebkitBackdropFilter: focused ? 'blur(12px) saturate(1.4)' : 'none',
					backdropFilter: focused ? 'blur(12px) saturate(1.4)' : 'none',
					borderColor: focused ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
					boxShadow: focused
						? '0 24px 48px -16px rgba(0,0,0,0.9), 0 0 36px rgba(255,255,255,0.22)'
						: '0 8px 20px -12px rgba(0,0,0,0.6)',
					transitionProperty: 'border-color, box-shadow, background, backdrop-filter',
					transitionDuration: '180ms',
					transitionTimingFunction: 'ease-out'
				}}
			>
				{!logoFailed && item.logo ? (
					<img
						src={item.logo}
						alt=""
						className={`object-contain ${
							size === 'md' ? 'h-[22px] max-w-[70px]' : 'h-[31px] max-w-[100px]'
						}`}
						loading="lazy"
						decoding="async"
						draggable={false}
						onError={() => setLogoFailed(true)}
					/>
				) : (
					<span
						className={`font-bold tracking-tight ${
							size === 'md' ? 'text-[16px]' : 'text-[22px]'
						}`}
						style={{color: 'rgba(255,255,255,0.88)'}}
					>
						{monogram(item.name)}
					</span>
				)}
				<span className="absolute right-2 top-2 flex items-center gap-1.5">
					<span className={`rounded-full bg-[#FF453A] shadow-[0_0_10px_rgba(255,69,58,0.9)] ${
						size === 'md' ? 'h-[4px] w-[4px]' : 'h-[5px] w-[5px]'
					}`} />
					<span className={`font-semibold uppercase tracking-[0.16em] text-white/75 ${
						size === 'md' ? 'text-[9px]' : 'text-[11px]'
					}`}>Live</span>
				</span>
			</button>
			<div
				className={`pointer-events-none absolute left-1/2 top-full w-max -translate-x-1/2 pt-[4px] ${
					size === 'md' ? 'max-w-[120px]' : 'max-w-[170px]'
				}`}
				style={{
					opacity: focused ? 1 : 0,
					transitionProperty: 'opacity',
					transitionDuration: '140ms',
					transitionTimingFunction: 'ease-out'
				}}
			>
				<p className={`truncate text-center font-semibold tracking-tight text-white ${
					size === 'md' ? 'text-[9px]' : 'text-[10px]'
				}`} style={{textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.8)'}}>
					{item.name}
				</p>
				<p className={`mt-0.5 truncate text-center font-medium text-white/55 ${
					size === 'md' ? 'text-[10px]' : 'text-[11px]'
				}`}>
					{epg ? `Agora: ${epg.title}` : item.group}
				</p>
			</div>
		</div>
	);
});

// Movie / series poster tile.
export const PosterTile = memo(function PosterTile ({
	item,
	kind,
	focused,
	enter,
	size = 'lg'
}: {
	item: MovieItem | SeriesItem;
	kind: 'movie' | 'series';
	focused: boolean;
	enter: (item: MovieItem | SeriesItem) => void;
	size?: 'lg' | 'md';
}) {
	const [imgFailed, setImgFailed] = useState(false);
	const title = item.name;
	return (
		<div
			data-focused={focused ? 'true' : 'false'}
			className="relative shrink-0 cursor-pointer"
			style={{
				transform: focused ? 'scale(1.08)' : 'scale(1)',
				zIndex: focused ? 30 : 1,
				transitionProperty: 'transform',
				transitionDuration: '180ms',
				transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
			}}
		>
			<button
				type="button"
				tabIndex={-1}
				aria-label={title}
				onClick={() => enter(item)}
				className={`relative flex flex-col overflow-hidden border bg-[#121822] ${
					size === 'md'
						? 'h-[90px] w-[60px] rounded-[6px]'
						: 'h-[120px] w-[80px] rounded-[8px]'
				}`}
				style={{
					borderColor: focused ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)',
					boxShadow: focused
						? '0 26px 48px -14px rgba(0,0,0,0.95), 0 0 32px rgba(255,255,255,0.2)'
						: '0 8px 20px -12px rgba(0,0,0,0.7)',
					transitionProperty: 'border-color, box-shadow',
					transitionDuration: '180ms',
					transitionTimingFunction: 'ease-out'
				}}
			>
				{!imgFailed ? (
					<img
						src={kind === 'movie' ? (item as MovieItem).poster : (item as SeriesItem).cover}
						alt=""
						className="absolute inset-0 h-full w-full object-cover"
						loading="lazy"
						decoding="async"
						draggable={false}
						onError={() => setImgFailed(true)}
					/>
				) : (
					<div className="absolute inset-0 flex items-center justify-center">
						<span className={`font-bold text-white/45 ${
							size === 'md' ? 'text-[28px]' : 'text-[40px]'
						}`}>{monogram(title)}</span>
					</div>
				)}
				<div className="pointer-events-none absolute inset-0" style={{background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.85) 100%)'}} />
				{item.rating > 0 && (
					<span className={`absolute left-1.5 top-1.5 rounded-full bg-black/60 py-0.5 font-semibold tracking-wide text-[#FFD60A] ${
						size === 'md' ? 'px-1.5 text-[8px]' : 'px-2 text-[10px]'
					}`}>
						★ {item.rating.toFixed(1)}
					</span>
				)}
				<p className={`absolute inset-x-1.5 bottom-1.5 truncate text-left font-semibold tracking-tight text-white ${
					size === 'md' ? 'text-[8px]' : 'text-[10px]'
				}`}>
					{title}
				</p>
			</button>
		</div>
	);
});
