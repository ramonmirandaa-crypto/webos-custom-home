/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** LAN helper base URL (server-t5). Defaults to http://192.168.0.77:8108. */
	readonly VITE_TV_HELPER_URL?: string;
	/** Shared secret for the helper's POST /launch. Never committed — .env.local only. */
	readonly VITE_TV_HELPER_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
