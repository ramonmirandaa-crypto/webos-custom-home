import {execSync} from 'node:child_process';
import {readdirSync, rmSync} from 'node:fs';

const DEVICE = process.env.TV_DEVICE || 'tv';
const run = (cmd) => { console.log(`\n$ ${cmd}`); execSync(cmd, {stdio: 'inherit'}); };

// `npm run build` already runs scripts/inject-theme.mjs, so dist/ comes out
// with the tvOS overlay in place. Never package dist/ without it: the overlay
// is what supplies the tvOS geometry and the panels.
run('npm run build');

for (const f of readdirSync('.').filter((f) => f.endsWith('.ipk'))) rmSync(f);
// `dist` only: the dev-mode build is a plain web app. The LunaService in
// `service/` needs root (Homebrew Channel) to register meaningfully — see
// service/service.js for the rationale.
run('ares-package dist -o . --no-minify');

const ipk = readdirSync('.').find((f) => f.endsWith('.ipk'));
if (!ipk) {
	console.error('\n✗ ares-package produced no .ipk');
	process.exit(1);
}
// Surface the manifest the TV will actually read, so a packaging mistake
// (wrong version, missing icons) is visible here instead of on the panel.
run(`ares-package --info-detail ${ipk}`);
run(`ares-install --device ${DEVICE} ${ipk}`);
console.log('\n✓ deployed — abra "Home Lite" na barra de apps');
