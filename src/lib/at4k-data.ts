export interface AT4KAppItem {
	id: string;
	title: string;
	label?: string;
	cardBg: string;
	textColor: string;
	icon?: string;
	logoType:
		| 'livetv'
		| 'globoplay'
		| 'youtube'
		| 'stremio'
		| 'aceplayer'
		| 'plutotv'
		| 'lgchannels'
		| 'hdmi'
		| 'browser'
		| 'discovery'
		| 'settings'
		| 'generic';
	badge?: string;
	launchType?: 'app' | 'input' | 'internal';
}

// Only apps actually installed on the TV (verified as root via
// applicationManager/listApps on 2026-09-15). Anything not installed is
// NOT listed here — dead tiles are worse than a shorter grid.
export const DEFAULT_AT4K_APPS: AT4KAppItem[] = [
	{ id: 'com.webos.app.livetv', icon: 'icons/livetv.png', title: 'TV ao vivo', cardBg: '#C62828', textColor: '#FFFFFF', logoType: 'livetv' },
	{ id: 'globoplaywebos', icon: 'icons/globoplay.png', title: 'Globoplay', cardBg: '#E23200', textColor: '#FFFFFF', logoType: 'globoplay' },
	{ id: 'youtube.leanback.v4', icon: 'icons/youtube.png', title: 'YouTube', cardBg: '#FF0000', textColor: '#FFFFFF', logoType: 'youtube' },
	{ id: 'io.strem.tv', icon: 'icons/stremio.png', title: 'Stremio', cardBg: '#6C3CE0', textColor: '#FFFFFF', logoType: 'stremio' },
	{ id: 'com.plutotv.app', icon: 'icons/plutotv.png', title: 'Pluto TV', cardBg: '#FFD400', textColor: '#FFFFFF', logoType: 'plutotv' },
	{ id: 'com.aceplayer.app', icon: 'icons/aceplayer.png', title: 'Ace Player', cardBg: '#1A1A1A', textColor: '#FFFFFF', logoType: 'aceplayer' },
	{ id: 'com.webos.app.lgchannels', icon: 'icons/lgchannels.png', title: 'LG Channels', cardBg: '#E31837', textColor: '#FFFFFF', logoType: 'lgchannels' },
	{ id: 'com.webos.app.hdmi1', icon: 'icons/hdmi1.png', title: 'HDMI 1', label: 'Console', badge: 'HDMI 1', cardBg: '#546E7A', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input' },
	{ id: 'com.webos.app.hdmi2', icon: 'icons/hdmi2.png', title: 'HDMI 2', label: 'Console', badge: 'HDMI 2', cardBg: '#607D8B', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input' },
	{ id: 'com.webos.app.hdmi3', icon: 'icons/hdmi3.png', title: 'HDMI 3', label: 'Entrada', badge: 'HDMI 3', cardBg: '#78909C', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input' },
	{ id: 'com.webos.app.hdmi4', icon: 'icons/hdmi4.png', title: 'HDMI 4', label: 'Entrada', badge: 'HDMI 4', cardBg: '#90A4AE', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input' },
	{ id: 'com.webos.app.browser', icon: 'icons/browser.png', title: 'Navegador', cardBg: '#1F6FEB', textColor: '#FFFFFF', logoType: 'browser' },
	{ id: 'com.webos.app.discovery', icon: 'icons/discovery.png', title: 'Loja LG', label: 'Loja de Apps', cardBg: '#A50034', textColor: '#FFFFFF', logoType: 'discovery' },
	{ id: 'com.palm.app.settings', icon: 'icons/settings.png', title: 'Configurações', label: 'Ajustes da TV', cardBg: '#5A6472', textColor: '#FFFFFF', logoType: 'settings' }
];

// Official art extracted from the TV itself (as root, 2026-09-15) into
// public/icons/*. Brands without a bundled PNG fall back to a plain title:
// never an invented logo.
// To add one: pull the official PNG from the TV into public/icons/ and extend
// this map.
export const BUNDLED_ART: Partial<Record<AT4KAppItem['logoType'], string>> = {
	livetv: 'icons/livetv.png',
	globoplay: 'icons/globoplay.png',
	youtube: 'icons/youtube.png',
	stremio: 'icons/stremio.png',
	aceplayer: 'icons/aceplayer.png',
	plutotv: 'icons/plutotv.png',
	lgchannels: 'icons/lgchannels.png',
	browser: 'icons/browser.png',
	discovery: 'icons/discovery.png',
	settings: 'icons/settings.png',
};
