import {execSync} from 'node:child_process';
import {readdirSync, rmSync} from 'node:fs';

const DEVICE = process.env.TV_DEVICE || 'tv';
const TV_IP = process.env.TV_IP || '192.168.0.126';
const SVC = '/media/developer/apps/usr/palm/services/br.com.customhome.lite.service';
const run = (cmd) => { console.log(`\n$ ${cmd}`); execSync(cmd, {stdio: 'inherit'}); };

run('npm run build');

for (const f of readdirSync('.').filter((f) => f.endsWith('.ipk'))) rmSync(f);
run('ares-package dist service -o . --no-minify');

const ipk = readdirSync('.').find((f) => f.endsWith('.ipk'));
run(`ares-install --device ${DEVICE} ${ipk}`);

try {
	run(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@${TV_IP} "sh ${SVC}/autostart.sh"`);
	console.log('\n✓ deployed; app launched + Home watcher re-armed');
} catch {
	console.log('\n✓ deployed (dev mode): abra "Home Lite" na barra de apps');
}
