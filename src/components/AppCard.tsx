import {memo} from 'react';
import type {AT4KAppItem} from '../lib/at4k-data';
import AppLogo from './AppLogo';

interface AppCardProps {
	app: AT4KAppItem;
	focused: boolean;
	reordering?: boolean;
	// Magic Remote pointer mode: hovering moves focus, clicking launches.
	onSelect?: () => void;
	onHover?: () => void;
}

// App tile. Geometry and focus treatment are owned by the tvOS overlay
// (theme/tvos-theme.css): it targets `.h-[90px].w-[160px].rounded-[14px]` and
// resizes it to the Sketch reference (250x150, r30). The inline styles here are
// the pre-theme baseline, kept so the app still looks right if the overlay is
// not injected. Flat brand gel at idle — no per-tile blur, because the TV GPU
// cannot hold 60fps with 18 backdrop blurs.
//
// KEEP the class names above intact: the overlay matches on them.

export default memo(function AppCard ({app, focused, reordering = false, onSelect, onHover}: AppCardProps) {
	const label = app.label || app.title;
	return (
		<div
			className="relative shrink-0 cursor-pointer"
			data-focused={focused ? 'true' : 'false'}
			onClick={onSelect}
			onMouseEnter={onHover}
			aria-label={label}
			style={{
				transform: focused ? 'scale(1.12) translateY(-12px)' : 'scale(1) translateY(0)',
				transformOrigin: 'center bottom',
				zIndex: focused ? 30 : 1,
				transitionProperty: 'transform',
				transitionDuration: '180ms',
				transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)'
			}}
		>
			<div
				className="relative flex h-[90px] w-[160px] items-center justify-center overflow-hidden rounded-[14px]"
				style={{
					background: focused
						? `linear-gradient(163deg, ${app.cardBg}CC 0%, ${app.cardBg}66 48%, ${app.cardBg}26 80%, rgba(4,8,12,0.9) 135%)`
						: `linear-gradient(165deg, ${app.cardBg}8F 0%, ${app.cardBg}38 58%, rgba(4,8,12,0.88) 135%)`,
					WebkitBackdropFilter: focused ? 'blur(24px) saturate(1.8)' : undefined,
					backdropFilter: focused ? 'blur(24px) saturate(1.8)' : undefined,
					border: reordering
						? '3px dashed rgba(255,255,255,0.9)'
						: focused
							? '1.5px solid rgba(255,255,255,0.95)'
							: '1px solid rgba(255,255,255,0.22)',
					boxShadow: focused
						? '0 30px 60px -20px rgba(0,0,0,0.88), 0 0 56px rgba(255,255,255,0.35), inset 0 2px 2px rgba(255,255,255,0.7), inset 0 -4px 8px rgba(0,0,0,0.5)'
						: '0 14px 28px -20px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.35)',
					transitionProperty: 'background, border-color, box-shadow',
					transitionDuration: '180ms',
					transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)'
				}}
			>
				{/* Rich material mounts ONLY on focus — idle tiles stay flat for 60fps. */}
				{focused && (
					<div
						className="pointer-events-none absolute inset-0"
						style={{
							background: `radial-gradient(85% 70% at 50% 24%, ${app.cardBg}cc, ${app.cardBg}00 72%)`,
							filter: 'blur(26px) saturate(1.6)',
							opacity: 0.85
						}}
					/>
				)}
				{focused && (
					<div
						className="pointer-events-none absolute inset-0"
						style={{background: 'radial-gradient(58% 44% at 50% 20%, rgba(255,255,255,0.3), rgba(255,255,255,0.05) 58%, transparent 78%)'}}
					/>
				)}
				{focused && (
					<div
						className="pointer-events-none absolute inset-0"
						style={{
							background: 'linear-gradient(118deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.2) 24%, rgba(255,255,255,0.03) 36%, rgba(255,255,255,0) 43%)'
						}}
					/>
				)}
				<div
					className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
					style={{background: 'linear-gradient(0deg, rgba(255,255,255,0.14), rgba(255,255,255,0))'}}
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
					className="block truncate text-center text-[19px] font-semibold tracking-tight text-white"
					style={{textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.8)'}}
				>
					{label}
				</span>
			</div>
		</div>
	);
});
