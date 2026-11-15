#!/usr/bin/env node
// Stage a testable copy of the built app under dist/test/.
//
// The harness (test/tv-sim.html) needs a stable bundle filename, because Vite's
// output name changes on every build. This copies the harness into dist/ and
// mirrors the real entry bundle under a fixed name, keeping every relative URL
// identical to what the TV loads.
//
// Usage: node test/stage-harness.mjs   (after `npm run build`)

import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const out = join(dist, 'test');

const shippedIndex = join(dist, 'index.html');
if (!existsSync(shippedIndex)) {
	console.error('stage-harness: dist/index.html missing — run `npm run build` first');
	process.exit(1);
}

const assets = join(dist, 'assets');
const entry = readdirSync(assets).find((f) => /^index-.*\.js$/.test(f));
if (!entry) {
	console.error('stage-harness: no index-*.js in dist/assets — run `npm run build` first');
	process.exit(1);
}
copyFileSync(join(assets, entry), join(assets, 'index-bundle.js'));

const css = readdirSync(assets).find((f) => /^index-.*\.css$/.test(f));
if (css) copyFileSync(join(assets, css), join(assets, 'index-bundle.css'));

rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
copyFileSync(join(here, 'tv-sim.js'), join(out, 'tv-sim.js'));

// Reuse the overlay tags the build injected, so the harness sees exactly what
// ships rather than a hand-maintained copy of the list. Each tag is extracted
// whole — a naive `[^>]+` match would stop at the first `>` inside `<script …>`
// and swallow the closing </script>. The harness lives one directory deeper
// than the shipped index.html, so `./assets/…` becomes `../assets/…`.
const shipped = readFileSync(shippedIndex, 'utf8');
const linkTags = shipped.match(/<link[^>]+tvos-[^>]*>/g) || [];
const scriptTags = shipped.match(/<script[^>]+tvos-[^>]*><\/script>/g) || [];
const fix = (tags) => tags.map((t) => t.replace(/="\.\/assets\//g, '="../assets/')).join('\n    ');

writeFileSync(
	join(out, 'tv-sim.html'),
	readFileSync(join(here, 'tv-sim.html'), 'utf8')
		.replace('</head>', `${fix(linkTags)}\n  </head>`)
		.replace('</body>', `${fix(scriptTags)}\n  </body>`)
);

console.log(`stage-harness: dist/test ready (bundle ${entry}, ${linkTags.length + scriptTags.length} overlay tags)`);
