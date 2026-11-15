#!/usr/bin/env node
// Inject the vendored tvOS overlay into a built app tree.
//
// The overlay restyles the bundle from the outside: it matches the Tailwind
// class names the components emit (see theme/README.md) and adds the panels
// (Control Centre, sidebar, context menu, profiles, Casa, Just Watch) as
// separate DOM the runtime scripts own. Nothing here patches the bundle's own
// JavaScript, and nothing here touches source — it runs on dist/ after Vite.
//
// Usage:
//   node scripts/inject-theme.mjs [--tree dist] [--theme theme]
//
// Idempotent: any previous injection of the same asset is dropped before the
// fresh tags are appended, so re-running never stacks duplicates.

import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
	const i = args.indexOf(flag);
	return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const tree = resolve(argOf('--tree', 'dist'));
const themeDir = resolve(argOf('--theme', 'theme'));
const assetsDir = join(tree, 'assets');
const indexFile = join(tree, 'index.html');

if (!existsSync(indexFile)) {
	console.error(`inject-theme: no index.html at ${indexFile} — run the build first`);
	process.exit(1);
}

// Stylesheets first, then scripts — both after the bundle. Order matters within
// each group: the base theme, then the panels, then Just Watch.
const ASSETS = [
	{file: 'tvos-theme.css', tag: (dst) => `<link rel="stylesheet" href="./assets/${dst}">`},
	{file: 'tvos-panels.css', tag: (dst) => `<link rel="stylesheet" href="./assets/${dst}">`},
	{file: 'tvos-justwatch.css', tag: (dst) => `<link rel="stylesheet" href="./assets/${dst}">`},
	{file: 'tvos-controls.js', tag: (dst) => `<script defer src="./assets/${dst}"></script>`},
	{file: 'tvos-panels.js', tag: (dst) => `<script defer src="./assets/${dst}"></script>`},
	{file: 'tvos-justwatch.js', tag: (dst) => `<script defer src="./assets/${dst}"></script>`}
];

const missing = ASSETS.filter((a) => !existsSync(join(themeDir, a.file)));
if (missing.length) {
	console.error(`inject-theme: missing in ${themeDir}: ${missing.map((m) => m.file).join(', ')}`);
	process.exit(1);
}

mkdirSync(assetsDir, {recursive: true});

let html = readFileSync(indexFile, 'utf8');
const tags = [];

for (const asset of ASSETS) {
	copyFileSync(join(themeDir, asset.file), join(assetsDir, asset.file));

	// Drop a previous injection of this exact asset, then rebuild the tag list.
	const drop = new RegExp(`\\n?\\s*<[^>]+${basename(asset.file).replace(/\./g, '\\.')}[^>]*>`, 'g');
	html = html.replace(drop, '');
	tags.push('    ' + asset.tag(asset.file));
}

// Stylesheets go before </head> so they beat the bundle stylesheet on equal
// specificity; scripts go before </body> and run after the bundle defines the
// DOM they hang panels from.
const headTags = tags.filter((t) => t.includes('<link')).join('\n');
const bodyTags = tags.filter((t) => t.includes('<script')).join('\n');

html = html.replace('</head>', `${headTags}\n  </head>`);
html = html.replace('</body>', `${bodyTags}\n  </body>`);

writeFileSync(indexFile, html);
console.log(`inject-theme: ${ASSETS.length} assets -> ${assetsDir}`);
