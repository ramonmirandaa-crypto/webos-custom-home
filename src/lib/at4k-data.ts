export interface AT4KAppItem {
	id: string;
	title: string;
	label?: string;
	cardBg: string;
	textColor: string;
	icon?: string;
	// Runtime icon supplied by the TV itself (listLaunchPoints) — the official
	// art for what's actually installed. Always wins over bundled fallbacks.
	tvIcon?: string;
	logoType:
		| 'netflix'
		| 'youtube'
		| 'prime'
		| 'appletv'
		| 'globoplay'
		| 'max'
		| 'disney'
		| 'spotify'
		| 'plex'
		| 'hdmi'
		| 'browser'
		| 'homebrew'
		| 'ytmusic'
		| 'deezer'
		| 'settings'
		| 'generic';
	badge?: string;
	launchType?: 'app' | 'input' | 'internal';
}

export const DEFAULT_AT4K_APPS: AT4KAppItem[] = [
	{
		id: 'netflix', title: 'Netflix', cardBg: '#E50914', textColor: '#FFFFFF', logoType: 'netflix'
	},
	{
		id: 'youtube.leanback.v4', title: 'YouTube', cardBg: '#FF0000', textColor: '#FFFFFF', logoType: 'youtube'
	},
	{
		id: 'amazon', title: 'Prime Video', cardBg: '#00A8E1', textColor: '#FFFFFF', logoType: 'prime'
	},
	{
		id: 'com.apple.appletv', title: 'Apple TV', cardBg: '#1C1C22', textColor: '#FFFFFF', logoType: 'appletv'
	},
	{
		id: 'com.globo.globoplay', title: 'Globoplay', cardBg: '#E23200', textColor: '#FFFFFF', logoType: 'globoplay'
	},
	{
		id: 'com.wbd.stream', title: 'Max', cardBg: '#002BE7', textColor: '#FFFFFF', logoType: 'max'
	},
	{
		id: 'com.disney.disneyplus-prod', title: 'Disney+', cardBg: '#0C48D1', textColor: '#FFFFFF', logoType: 'disney'
	},
	{
		id: 'spotify-beehive', title: 'Spotify', cardBg: '#1DB954', textColor: '#FFFFFF', logoType: 'spotify'
	},
	{
		id: 'plex', title: 'Plex', cardBg: '#E5A00D', textColor: '#FFFFFF', logoType: 'plex'
	},
	{
		id: 'com.webos.app.hdmi1', title: 'HDMI 1', label: 'Console', badge: 'HDMI 1', cardBg: '#546E7A', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input'
	},
	{
		id: 'com.webos.app.hdmi2', title: 'HDMI 2', label: 'Console', badge: 'HDMI 2', cardBg: '#607D8B', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input'
	},
	{
		id: 'com.webos.app.hdmi3', title: 'HDMI 3', label: 'Entrada', badge: 'HDMI 3', cardBg: '#78909C', textColor: '#FFFFFF', logoType: 'hdmi', launchType: 'input'
	},
	{
		id: 'com.webos.app.browser', title: 'Navegador', cardBg: '#1F6FEB', textColor: '#FFFFFF', logoType: 'browser'
	},
	{
		id: 'org.webosbrew.hbchannel', title: 'Homebrew', cardBg: '#10B981', textColor: '#FFFFFF', logoType: 'homebrew'
	},
	{
		id: 'youtube.music', title: 'YouTube Music', cardBg: '#E62117', textColor: '#FFFFFF', logoType: 'ytmusic'
	},
	{
		id: 'com.deezer.webos', title: 'Deezer', cardBg: '#7B2FF2', textColor: '#FFFFFF', logoType: 'deezer'
	},
	{
		id: 'com.lennylxx.iptv', title: 'IPTV', label: 'IPTV Player', cardBg: '#4B2EDE', textColor: '#FFFFFF', logoType: 'generic', icon: './icons/iptv.png'
	},
	{
		id: 'internal.settings', title: 'Ajustes', cardBg: '#5A6472', textColor: '#FFFFFF', logoType: 'settings', launchType: 'internal'
	}
];

// Official bundled fallback art (public/icons/*). Used only when the TV hasn't
// supplied its own launch-point icon — e.g. in the desktop browser. Brands
// without a bundled PNG fall back to a plain title: never an invented logo.
// To add one: drop the official PNG in public/icons/ and extend this map.
export const BUNDLED_ART: Partial<Record<AT4KAppItem['logoType'], string>> = {
	netflix: 'icons/netflix.png',
	youtube: 'icons/youtube.png',
	prime: 'icons/prime.png',
	appletv: 'icons/appletv.png',
	max: 'icons/hbomax.png',
	disney: 'icons/disney.png',
	spotify: 'icons/spotify.png',
};
