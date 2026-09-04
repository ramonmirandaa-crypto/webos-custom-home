import {useEffect, useState} from 'react';

export default function Header ({
	clock24,
	focusedButton,
	onOpenSettings
}: {
	clock24: boolean;
	focusedButton?: 'settings' | 'filters' | null;
	onOpenSettings: () => void;
}) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const ms = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
		const id = window.setTimeout(() => setNow(new Date()), ms);
		return () => window.clearTimeout(id);
	}, [now]);

	const h = now.getHours();
	const hh = clock24 ? String(h).padStart(2, '0') : String(((h + 11) % 12) + 1).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	const suffix = clock24 ? '' : (h < 12 ? ' AM' : ' PM');

	const glassCircle = (focused: boolean) => ({
		background: focused
			? 'linear-gradient(150deg, rgba(255,255,255,0.92), rgba(255,255,255,0.72))'
			: 'linear-gradient(150deg, rgba(255,255,255,0.2), rgba(255,255,255,0.07))',
		WebkitBackdropFilter: 'blur(18px) saturate(1.6)',
		backdropFilter: 'blur(18px) saturate(1.6)',
		border: focused ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.3)',
		boxShadow: focused
			? '0 8px 28px -8px rgba(0,0,0,0.6), 0 0 22px rgba(255,255,255,0.45), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.25)'
			: '0 6px 18px -10px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(255,255,255,0.12)',
		transform: focused ? 'scale(1.12)' : 'scale(1)',
		transitionProperty: 'transform, background, border-color, box-shadow',
		transitionDuration: '180ms',
		transitionTimingFunction: 'ease-out'
	});

	return (
		<header className="absolute right-[24px] top-[14px] z-40 flex items-center gap-5">
			<span className="min-w-[72px] text-right text-[18px] font-medium tracking-tight text-white tabular-nums" style={{textShadow: '0 1px 6px rgba(0,0,0,0.8)'}}>
				{hh}:{mm}{suffix}
			</span>

			<svg className="h-[12px] w-[12px] fill-white/70 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98A16.88 16.88 0 0 0 12 4zm0 2.9c3.8 0 7.23 1.54 9.73 4.04L12 20.67 2.27 10.94C4.77 8.44 8.2 6.9 12 6.9z"/>
			</svg>

			<button
				type="button"
				tabIndex={-1}
				aria-label="Abrir ajustes"
				onClick={onOpenSettings}
				className="flex h-10 w-10 items-center justify-center rounded-full p-0"
				style={glassCircle(focusedButton === 'settings')}
			>
				<svg
					className="h-[15px] w-[15px]"
					style={{fill: focusedButton === 'settings' ? '#0A101A' : 'rgba(255,255,255,0.85)', filter: focusedButton === 'settings' ? 'none' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))'}}
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
				</svg>
			</button>

			<button
				type="button"
				tabIndex={-1}
				aria-label="Abrir preferências"
				onClick={onOpenSettings}
				className="flex h-10 w-10 items-center justify-center rounded-full p-0"
				style={glassCircle(focusedButton === 'filters')}
			>
				<svg
					className="h-[15px] w-[15px]"
					style={{fill: focusedButton === 'filters' ? '#0A101A' : 'rgba(255,255,255,0.85)', filter: focusedButton === 'filters' ? 'none' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))'}}
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
				</svg>
			</button>
		</header>
	);
}
