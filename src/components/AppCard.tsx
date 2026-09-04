import {memo} from 'react';
import type {AT4KAppItem} from '../lib/at4k-data';
import AppLogo from './AppLogo';

interface AppCardProps {
	app: AT4KAppItem;
	focused: boolean;
	reordering?: boolean;
}

// Liquid Glass tile (Apple tvOS 18 / WWDC26 language). The LG WebAppMgr renders
// backdrop-filter, but the effect alone reads as flat on TV — the material is
// composed of: a strong brand gel tint (dominant color, fading to shadow), a
// heavy blur+saturation of what's behind, an internal color bloom blurred with
// plain `filter` (always composited by the GPU), a sharp specular sheen, and
// bright-top/dark-bottom rim insets for bevel volume.
function relativeLuminance (hex: string): number {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex);
	if (!m) return 0.5;
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export default memo(function AppCard ({app, focused, reordering = false}: AppCardProps) {
	const label = app.label || app.title;
	const bright = relativeLuminance(app.cardBg) > 0.55;
	return (
		<div
			className="relative shrink-0"
			data-focused={focused ? 'true' : 'false'}
			aria-label={label}
			style={{
				transform: focused ? 'scale(1.1) translateY(-12px)' : 'scale(1) translateY(0)',
				transformOrigin: 'center bottom',
				zIndex: focused ? 30 : 1,
				transitionProperty: 'transform',
				transitionDuration: '200ms',
				transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
			}}
		>
			<div
				className="relative flex h-[90px] w-[160px] items-center justify-center overflow-hidden rounded-[14px]"
				style={{
					background: `linear-gradient(163deg, ${app.cardBg}B8 0%, ${app.cardBg}59 46%, ${app.cardBg}1f 78%, rgba(4,8,12,0.9) 132%)`,
					WebkitBackdropFilter: 'blur(36px) saturate(2.4) brightness(1.18)',
					backdropFilter: 'blur(36px) saturate(2.4) brightness(1.18)',
					border: reordering
						? '3px dashed rgba(255,255,255,0.9)'
						: focused
							? '1.5px solid rgba(255,255,255,0.96)'
							: '1px solid rgba(255,255,255,0.3)',
					boxShadow: focused
						? '0 30px 60px -20px rgba(0,0,0,0.88), 0 0 52px rgba(255,255,255,0.38), inset 0 2px 2px rgba(255,255,255,0.7), inset 0 -4px 8px rgba(0,0,0,0.5)'
						: '0 16px 32px -22px rgba(0,0,0,0.78), inset 0 2px 2px rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.38)',
					filter: focused ? 'brightness(1.12) saturate(1.15)' : `brightness(${bright ? 0.66 : 0.8}) saturate(0.95)`,
					transitionProperty: 'border-color, box-shadow, filter',
					transitionDuration: '200ms',
					transitionTimingFunction: 'ease-out'
				}}
			>
				{/* internal color bloom — blurred with plain filter so the GPU always
				    composites it (backdrop blur alone is unreliable on this engine) */}
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background: `radial-gradient(85% 70% at 50% 24%, ${app.cardBg}cc, ${app.cardBg}00 72%)`,
						filter: 'blur(26px) saturate(1.6)',
						opacity: 0.85
					}}
				/>
				{/* lens bloom — bright top-center */}
				<div
					className="pointer-events-none absolute inset-0"
					style={{background: 'radial-gradient(58% 44% at 50% 20%, rgba(255,255,255,0.28), rgba(255,255,255,0.05) 58%, transparent 78%)'}}
				/>
				{/* sharp specular sheen */}
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background: 'linear-gradient(118deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.2) 24%, rgba(255,255,255,0.03) 36%, rgba(255,255,255,0) 43%)',
						opacity: focused ? 1 : 0.7,
						transitionProperty: 'opacity',
						transitionDuration: '200ms',
						transitionTimingFunction: 'ease-out'
					}}
				/>
				{/* bottom refractive fringe */}
				<div
					className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
					style={{background: 'linear-gradient(0deg, rgba(255,255,255,0.18), rgba(255,255,255,0))'}}
				/>
				<div className="relative z-10">
					<AppLogo app={app} />
				</div>
			</div>

			{/* focus label — tvOS style */}
			<div
				className="pointer-events-none absolute left-1/2 top-full w-max max-w-[300px] -translate-x-1/2 pt-[7px]"
				style={{
					opacity: focused ? 1 : 0,
					transitionProperty: 'opacity',
					transitionDuration: '160ms',
					transitionTimingFunction: 'ease-out'
				}}
			>
				<span
					className="block truncate text-center text-[16.5px] font-medium tracking-tight text-white"
					style={{textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.8)'}}
				>
					{label}
				</span>
			</div>
		</div>
	);
});
