import {useState} from 'react';
import {BUNDLED_ART, type AT4KAppItem} from '../lib/at4k-data';
import {monogram} from './content';

function TileArt ({src, title, onFail}: {src: string; title: string; onFail: () => void}) {
	return (
		<img
			src={src}
			alt={title}
			className="relative z-10 h-[64px] max-w-[128px] object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
			draggable={false}
			onError={onFail}
		/>
	);
}

export default function AppLogo ({app}: {app: AT4KAppItem}) {
	const [artFailed, setArtFailed] = useState(false);
	// Official art only, in priority order:
	// 1. the TV's own launch-point icon (exactly what's installed),
	// 2. the bundled official PNG (desktop browser, or TV icon missing),
	// 3. the plain title below — never an invented logo.
	const art = !artFailed ? (app.tvIcon || app.icon || BUNDLED_ART[app.logoType]) : undefined;
	if (art) {
		return <TileArt src={art} title={app.title} onFail={() => { setArtFailed(true); }} />;
	}
	if (app.logoType === 'generic') {
		return (
			<span className="font-sans text-[34px] font-black tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
				{monogram(app.title)}
			</span>
		);
	}
	switch (app.logoType) {
		case 'hdmi':
			return (
				<div className="flex flex-col items-center gap-1.5">
					<span className="relative flex items-center justify-center">
						<svg className="h-8 w-8 fill-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]" viewBox="0 0 24 24">
							<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6.5l.65 2H15a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h1.85l.65-2H5a2 2 0 0 1-2-2V5zm2 0v10h14V5H5z"/>
						</svg>
						<span className="absolute bottom-[-2px] right-[-3px] flex h-[19px] min-w-[19px] items-center justify-center rounded-[5px] bg-white px-[4px] text-[13px] font-extrabold leading-none text-[#111] shadow-[0_2px_6px_rgba(0,0,0,0.75)]">
							{app.title.replace(/\D/g, '')}
						</span>
					</span>
				</div>
			);
		case 'browser':
			return (
				<div className="flex items-center gap-2.5">
					<svg className="h-7 w-7 fill-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]" viewBox="0 0 24 24">
						<path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8zm4.83-11.83-6 2a1 1 0 0 0-.6.6l-2 6a1 1 0 0 0 1.26 1.26l6-2a1 1 0 0 0 .6-.6l2-6a1 1 0 0 0-1.26-1.26zm-4.12 4.12a1 1 0 1 1 1.41-1.41 1 1 0 0 1-1.41 1.41z"/>
					</svg>
					<span className="font-sans text-[20px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">Navegador</span>
				</div>
			);
		case 'homebrew':
			return (
				<div className="flex items-center gap-2.5">
					<svg className="h-8 w-8 fill-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]" viewBox="0 0 24 24">
						<path d="M19 4h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1H5a3 3 0 0 0-3 3v2a6 6 0 0 0 5 5.91V17a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-2.09A6 6 0 0 0 22 9V7a3 3 0 0 0-3-3zm1 5a4 4 0 0 1-3 3.86V6h3v3zM4 9V6h3v6.86A4 4 0 0 1 4 9zm11 8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1h6v1zm0-3H9V4h6v10z"/>
					</svg>
					<span className="font-sans text-[20px] font-bold tracking-tight text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]">Homebrew</span>
				</div>
			);
		case 'settings':
			return (
				<div className="flex items-center gap-2.5">
					<svg className="h-7 w-7 fill-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]" viewBox="0 0 24 24">
						<path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
					</svg>
					<span className="font-sans text-[20px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]">Ajustes</span>
				</div>
			);
		default:
			return (
				<span className="font-sans text-[22px] font-bold text-white tracking-tight">{app.title}</span>
			);
	}
}
