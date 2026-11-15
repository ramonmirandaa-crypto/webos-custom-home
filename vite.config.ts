import {defineConfig} from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import browserslist from 'browserslist';
import {browserslistToTargets} from 'lightningcss';

// PLATFORM BASELINE — the target TV (50UR871C0SA, webOS TV 25) ships
// sdkVersion 10.3.1 == Chromium 120. The build target stays at `chrome >= 108`
// on purpose: that is the floor proven on this panel, and every newer engine
// runs 108-targeted output unchanged. Raising it buys nothing and risks
// emitting syntax an older set here can't parse. See:
// https://webostv.developer.lge.com/develop/tools/sdk-introduction
//
// PROVEN on the TV: downlevel Tailwind v4's oklch
// palette + color-mix opacity utilities to 108-safe fallbacks at build time.
// Do NOT remove — without it, colors break on the panel. See memory: tv-homescreen-stack.
const targets = browserslistToTargets(browserslist('chrome >= 108'));

export default defineConfig({
	base: './', // webOS apps load from a local file path — assets must be relative.
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {'@': path.resolve(__dirname, './src')}
	},
	css: {
		transformer: 'lightningcss',
		lightningcss: {targets}
	},
	build: {
		target: 'chrome108',
		cssMinify: 'lightningcss',
		outDir: 'dist'
	}
});
