// Minimal ambient types for the official webOSTV.js library (v1.2.13), loaded
// from public/lib/ before the bundle. Only the surface this launcher actually
// touches is declared — extend it when a new call site appears.
// Reference: https://webostv.developer.lge.com/develop/references/webostvjs-webos

export {};

declare global {
	interface WebOSServiceRequestOptions {
		method: string;
		parameters?: Record<string, unknown>;
		onSuccess?: (res: Record<string, unknown>) => void;
		onFailure?: (res: Record<string, unknown>) => void;
		subscribe?: boolean;
	}

	interface WebOSDeviceInfo {
		modelName: string;
		version: string;
		versionMajor: number;
		versionMinor: number;
		versionDot: number;
		sdkVersion: string;
		screenWidth: number;
		screenHeight: number;
		uhd: boolean;
		uhd8K: boolean;
		oled?: boolean;
		hdr10: boolean;
		dolbyVision: boolean;
		dolbyAtmos: boolean;
		brandName: string;
		manufacturer: string;
		tuner: boolean;
	}

	interface WebOSDevLaunchOptions {
		id: string;
		params?: Record<string, unknown>;
		onSuccess?: (res: Record<string, unknown>) => void;
		onFailure?: (res: Record<string, unknown>) => void;
	}

	interface WebOSApi {
		libVersion: string;
		platform: {tv?: boolean};
		platformBack: () => void;
		deviceInfo: (callback: (info: WebOSDeviceInfo) => void) => void;
		fetchAppId: () => string;
		fetchAppRootPath: () => string;
		systemInfo: (callback: (info: Record<string, unknown>) => void) => void;
		keyboard: {isShowing: () => boolean | undefined};
		service: {request: (service: string, options: WebOSServiceRequestOptions) => {cancel: () => void}};
	}

	interface WebOSDevApi {
		launch: (options: WebOSDevLaunchOptions) => void;
		launchParams: () => Record<string, unknown>;
	}

	interface Window {
		webOS?: WebOSApi;
		webOSDev?: WebOSDevApi;
		PalmSystem?: {
			isKeyboardVisible?: boolean;
			identifier?: string;
			activate?: () => void;
		};
	}
}
