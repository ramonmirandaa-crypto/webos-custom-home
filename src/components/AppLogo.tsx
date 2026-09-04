import {useState} from 'react';
import type {AT4KAppItem} from '../lib/at4k-data';
import {monogram} from './content';

export default function AppLogo ({app}: {app: AT4KAppItem}) {
	const [iconFailed, setIconFailed] = useState(false);
	// Known brands render their own logo; the TV-provided icon is only used for
	// generic launch points (keeps e.g. the TV's VLC-cone icon off YouTube).
	// A missing or broken icon falls back to a monogram — never an empty tile.
	if (app.logoType === 'generic') {
		if (!app.icon || iconFailed) {
			return (
				<span className="font-sans text-[34px] font-black tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
					{monogram(app.title)}
				</span>
			);
		}
		return (
			<div className="relative flex h-[80px] w-[80px] items-center justify-center">
				<img
					src={app.icon}
					alt=""
					className="h-[74px] w-[74px] object-contain brightness-0 invert drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]"
					onError={() => { setIconFailed(true); }}
				/>
			</div>
		);
	}
	switch (app.logoType) {
		case 'netflix':
			return (
				<span className="font-sans text-[26px] font-black tracking-wider text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
					NETFLIX
				</span>
			);
		case 'youtube':
			return (
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-11 items-center justify-center rounded-xl bg-white shadow-md">
						<div className="ml-0.5 h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-[#FF0000]" />
					</div>
					<span className="font-sans text-[24px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">YouTube</span>
				</div>
			);
		case 'prime':
			return (
				<div className="flex flex-col items-center">
					<span className="font-sans text-[26px] font-bold lowercase tracking-tight text-white leading-none">prime video</span>
					<svg className="mt-1 h-[8px] w-[74px]" viewBox="0 0 74 8" aria-hidden="true">
						<path d="M2 1.5c18 7 49 7 70 0-17 8.5-50 8.5-70 0Z" fill="rgba(255,255,255,0.9)" />
					</svg>
				</div>
			);
		case 'appletv':
			return (
				<div className="flex items-center gap-2.5">
					<svg className="h-8 w-8 fill-white" viewBox="0 0 170 170">
						<path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.08-7.7-7.87-12-14.35-6.75-10.14-12.06-21.72-15.93-34.73-3.87-13.01-5.81-25.2-5.81-36.57 0-14.15 3.56-26.06 10.68-35.73 7.12-9.67 16.08-14.65 26.88-14.94 4.58 0 9.77 1.25 15.58 3.76 5.81 2.5 9.71 3.82 11.71 3.96 1.63-.14 5.76-1.55 12.38-4.24 6.62-2.69 12.03-3.89 16.24-3.6 12.2.66 21.76 5.2 28.69 13.62-10.89 6.63-16.22 15.82-16 27.56.28 9.3 3.89 17.07 10.83 23.31 6.94 6.24 15.11 9.7 24.51 10.37-2.3 6.93-5.26 14.16-8.87 21.69zM119.22 31.84c0-7.39 2.67-14.28 8.01-20.67 5.34-6.39 12-10.42 19.98-12.08.77 8.04-1.74 15.19-7.53 21.46-5.79 6.27-12.59 10.03-20.46 11.29z"/>
					</svg>
					<span className="font-sans text-[28px] font-semibold tracking-tight text-white">tv</span>
				</div>
			);
		case 'globoplay':
			return (
				<div className="flex items-center gap-2 whitespace-nowrap">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-md">
						<div className="ml-0.5 h-0 w-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-[#E23200]" />
					</div>
					<span className="font-sans text-[19px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">globoplay</span>
				</div>
			);
		case 'max':
			return (
				<span className="font-sans text-[36px] font-black tracking-tighter text-white">
					MAX
				</span>
			);
		case 'disney':
			return (
				<span className="font-serif text-[28px] font-extrabold italic tracking-tight text-white">
					Disney<span className="font-sans font-normal text-sky-400">+</span>
				</span>
			);
		case 'spotify':
			return (
				<div className="flex items-center gap-2.5">
					<svg className="h-8 w-8 fill-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]" viewBox="0 0 24 24">
						<path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.308-1.758-8.793-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.722 1.115.294.18.386.562.207.855zm1.227-2.73c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.849-.106-.976-.519-.126-.413.107-.849.52-.976 3.632-1.102 8.147-.568 11.236 1.332.366.226.481.707.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.494.15-1.017-.129-1.167-.624-.15-.495.13-1.017.625-1.167 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.444-.838.59-1.28.327z"/>
					</svg>
					<span className="font-sans text-[22px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">Spotify</span>
				</div>
			);
		case 'plex':
			return (
				<span className="font-sans text-[30px] font-black lowercase tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
					plex
				</span>
			);
		case 'ytmusic':
			return (
				<div className="flex items-center gap-2 whitespace-nowrap">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-md">
						<div className="ml-0.5 h-0 w-0 border-y-[4px] border-y-transparent border-l-[7px] border-l-[#E62117]" />
					</div>
					<span className="font-sans text-[17px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">YouTube Music</span>
				</div>
			);
		case 'deezer':
			return (
				<div className="flex items-center gap-2 whitespace-nowrap">
					<div className="flex items-end gap-0.5 h-5">
						<div className="w-1 h-2 bg-[#C084FC] rounded-sm" />
						<div className="w-1 h-4 bg-[#C084FC] rounded-sm" />
						<div className="w-1 h-5 bg-[#C084FC] rounded-sm" />
						<div className="w-1 h-3 bg-[#C084FC] rounded-sm" />
					</div>
					<span className="font-sans text-[20px] font-bold tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">Deezer</span>
				</div>
			);
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
