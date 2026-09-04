import {useEffect, useState} from 'react';
import {APP_VERSION} from '../lib/version';
import type {AT4KAppItem} from '../lib/at4k-data';
import type {IptvConfig} from '../lib/iptv';

const ACCENT = '#7ca8ff';

type Row =
	| {kind: 'choice'; label: string; values: string[]; labels: string[]; get: () => string; set: (v: string) => void}
	| {kind: 'action'; label: string; hint: string; action: 'reset' | 'apps' | 'iptv'}
	| {kind: 'info'; label: string; value: string};

const IPTV_FIELDS: {label: string; key: 'base' | 'user' | 'pass'; type: 'text' | 'password'}[] = [
	{label: 'URL base', key: 'base', type: 'text'},
	{label: 'Usuário', key: 'user', type: 'text'},
	{label: 'Senha', key: 'pass', type: 'password'}
];

// Import credentials from a short paste.rs code (typed on a phone, read here):
// the paste holds JSON, base|user|pass, a full Xtream URL, or 3 lines.
// Fetched through a CORS proxy; failure just reports 'fail', never throws.
async function fetchImportConfig (code: string): Promise<IptvConfig | null> {
	const id = code.trim();
	if (!/^[a-zA-Z0-9]{4,12}$/.test(id)) return null;
	try {
		const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://paste.rs/' + id));
		if (!r.ok) return null;
		const text = (await r.text()).trim();
		if (!text || text.length > 500) return null;
		if (text.startsWith('{')) {
			const o = JSON.parse(text);
			if (o && typeof o.base === 'string' && typeof o.user === 'string' && o.base && o.user) {
				return {base: o.base.trim(), user: o.user.trim(), pass: typeof o.pass === 'string' ? o.pass.trim() : ''};
			}
			return null;
		}
		if (text.includes('|')) {
			const [base = '', user = '', pass = ''] = text.split('|').map((s) => s.trim());
			return base && user ? {base, user, pass} : null;
		}
		const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
		const urlLine = lines.find((l) => /^https?:\/\//i.test(l));
		if (urlLine) {
			const u = new URL(urlLine);
			const user = u.searchParams.get('username') || '';
			if (user) return {base: u.origin, user, pass: u.searchParams.get('password') || ''};
		}
		if (lines.length >= 3) return {base: lines[0], user: lines[1], pass: lines[2]};
		return null;
	} catch {
		return null;
	}
}

function AppsPane ({apps, hidden, row}: {apps: AT4KAppItem[]; hidden: Set<string>; row: number}) {
	return (
		<div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pr-2">
			{apps.map((app, i) => {
				const focused = i === row;
				const shown = !hidden.has(app.id);
				return (
					<div
						key={app.id}
						className="flex items-center justify-between rounded-xl px-6 py-3 transition-colors"
						style={{
							background: focused ? `${ACCENT}22` : 'rgba(255,255,255,0.03)',
							border: `1px solid ${focused ? `${ACCENT}88` : 'transparent'}`
						}}
					>
						<span className="text-lg font-medium" style={{color: shown ? '#FFFFFF' : 'rgba(255,255,255,0.35)'}}>
							{app.title}
						</span>
						<span className="text-sm font-semibold" style={{color: shown ? '#38BDF8' : 'rgba(255,255,255,0.3)'}}>
							{shown ? 'VISÍVEL' : 'OCULTO'}
						</span>
					</div>
				);
			})}
		</div>
	);
}

export default function Settings ({onClose, onOrderReset, apps, hidden, onToggleHide, clock24, onClock24, fps, onFps, iptvConfig, onSaveIptv}: {
	onClose: () => void;
	onOrderReset: () => void;
	apps: AT4KAppItem[];
	hidden: Set<string>;
	onToggleHide: (id: string) => void;
	clock24: boolean;
	onClock24: (v: boolean) => void;
	fps: boolean;
	onFps: (v: boolean) => void;
	iptvConfig: IptvConfig;
	onSaveIptv: (cfg: IptvConfig) => void;
}) {
	const [pane, setPane] = useState<'main' | 'apps' | 'iptv'>('main');
	const [row, setRow] = useState(0);
	const [resetDone, setResetDone] = useState(false);
	const [iptvDraft, setIptvDraft] = useState<IptvConfig>({base: iptvConfig.base, user: iptvConfig.user, pass: iptvConfig.pass});
	const [editField, setEditField] = useState<number | null>(null);
	const [importMode, setImportMode] = useState(false);
	const [importCode, setImportCode] = useState('');
	const [importMsg, setImportMsg] = useState<string | null>(null);

	const ROWS: Row[] = [
		{
			kind: 'choice', label: 'Formato do relógio', values: ['12', '24'], labels: ['12 horas', '24 horas'],
			get: () => (clock24 ? '24' : '12'), set: (v) => onClock24(v === '24')
		},
		{
			kind: 'choice', label: 'Medidor de FPS', values: ['off', 'on'], labels: ['Oculto', 'Visível'],
			get: () => (fps ? 'on' : 'off'), set: (v) => onFps(v === 'on')
		},
		{kind: 'action', label: 'Gerenciar aplicativos', hint: 'OK para abrir', action: 'apps'},
		{kind: 'action', label: 'Configurar IPTV', hint: 'OK para abrir', action: 'iptv'},
		{kind: 'action', label: 'Restaurar layout original', hint: 'OK para restaurar', action: 'reset'},
		{kind: 'info', label: 'Versão do Launcher', value: `AT4K v${APP_VERSION}`}
	];

	const manageable = apps.filter((a) => a.launchType !== 'internal');
	const rowCount = pane === 'main' ? ROWS.length : (pane === 'apps' ? manageable.length : IPTV_FIELDS.length + 2);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const isBack = e.keyCode === 461 || e.key === 'GoBack' || e.key === 'Escape' || e.key === 'Backspace';
			e.preventDefault();
			e.stopPropagation();

			if (pane === 'iptv') {
				if (importMode) {
					if (e.key === 'Backspace') {
						setImportCode((c) => c.slice(0, -1));
						return;
					}
					if (e.key === 'Enter') {
						void fetchImportConfig(importCode).then((cfg) => {
							if (cfg) {
								setIptvDraft(cfg);
								setImportMsg('ok');
							} else {
								setImportMsg('fail');
							}
							setImportMode(false);
						});
						return;
					}
					if (e.key === 'GoBack' || e.key === 'Escape' || e.keyCode === 461) {
						setImportMode(false);
						setImportMsg(null);
						return;
					}
					if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key) && importCode.length < 12) {
						setImportCode((c) => c + e.key);
					}
					return;
				}
				if (editField !== null) {
					if (e.key === 'Backspace') {
						setIptvDraft((d) => {
							const next = {...d};
							const field = IPTV_FIELDS[editField].key;
							next[field] = next[field].slice(0, -1);
							return next;
						});
						return;
					}
					if (e.key === 'Enter' || e.key === 'GoBack' || e.key === 'Escape' || e.keyCode === 461) {
						setEditField(null);
						return;
					}
					if (e.key.length === 1) {
						setIptvDraft((d) => {
							const next = {...d};
							const field = IPTV_FIELDS[editField].key;
							next[field] = next[field] + e.key;
							return next;
						});
					}
					return;
				}
				if (isBack) {
					setPane('main');
					setRow(ROWS.findIndex((r) => r.kind === 'action' && r.action === 'iptv'));
					return;
				}
				if (e.key === 'ArrowUp') { setRow((r) => Math.max(0, r - 1)); return; }
				if (e.key === 'ArrowDown') { setRow((r) => Math.min(IPTV_FIELDS.length + 1, r + 1)); return; }
				if (e.key === 'Enter') {
					if (row < IPTV_FIELDS.length) setEditField(row);
					else if (row === IPTV_FIELDS.length) {
						setImportMode(true);
						setImportCode('');
						setImportMsg(null);
					}
					else {
						onSaveIptv(iptvDraft);
						setPane('main');
						setRow(ROWS.findIndex((r) => r.kind === 'action' && r.action === 'iptv'));
					}
				}
				return;
			}

			if (isBack) {
				if (pane === 'apps') {
					setPane('main');
					setRow(ROWS.findIndex((r) => r.kind === 'action' && r.action === 'apps'));
				} else {
					onClose();
				}
				return;
			}

			if (e.key === 'ArrowUp') { setRow((r) => Math.max(0, r - 1)); return; }
			if (e.key === 'ArrowDown') { setRow((r) => Math.min(rowCount - 1, r + 1)); return; }
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;

			if (pane === 'apps') {
				const app = manageable[row];
				if (app && e.key === 'Enter') onToggleHide(app.id);
				return;
			}

			const def = ROWS[row];
			if (def.kind === 'info') return;
			if (def.kind === 'action') {
				if (e.key !== 'Enter') return;
				if (def.action === 'reset') { onOrderReset(); setResetDone(true); }
				else if (def.action === 'iptv') {
					setIptvDraft({base: iptvConfig.base, user: iptvConfig.user, pass: iptvConfig.pass});
					setEditField(null);
					setImportMode(false);
					setImportCode('');
					setImportMsg(null);
					setPane('iptv');
					setRow(0);
				}
				else { setPane('apps'); setRow(0); }
				return;
			}
			const cur = def.values.indexOf(def.get());
			const step = e.key === 'ArrowLeft' ? -1 : 1;
			const next = def.values[(cur + step + def.values.length) % def.values.length];
			def.set(next);
		};

		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [pane, row, rowCount, onClose, onOrderReset, manageable, onToggleHide, clock24, onClock24, fps, onFps, editField, iptvDraft, iptvConfig, onSaveIptv]);

	const title = pane === 'main' ? 'Ajustes do Launcher' : (pane === 'apps' ? 'Gerenciar aplicativos' : 'Configurar IPTV');
	const hint = pane === 'apps'
		? '↑↓ navegar · OK mostrar/ocultar · Back voltar'
		: pane === 'iptv'
			? '↑↓ navegar · OK editar/importar · Back voltar'
			: '↑↓ navegar · ‹ › alterar · OK selecionar · Back fechar';

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
			<div className="w-[740px] rounded-[36px] border border-white/10 bg-slate-900/95 px-12 py-10 shadow-2xl">
				<h2 className="mb-8 text-3xl font-semibold tracking-tight text-white">{title}</h2>

				{pane === 'apps' ? (
					<AppsPane apps={manageable} hidden={hidden} row={row} />
				) : pane === 'iptv' ? (
					<div className="flex flex-col gap-3">
						{IPTV_FIELDS.map((f, i) => {
							const focused = row === i || editField === i;
							return (
								<div
									key={f.key}
									className="flex flex-col gap-2 rounded-2xl px-6 py-3 transition-colors"
									style={{
										background: focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
										border: `1.5px solid ${focused ? 'rgba(255,255,255,0.3)' : 'transparent'}`
									}}
								>
									<span className="text-sm font-medium text-white/60">{f.label}</span>
									<input
										type={f.type}
										readOnly
										autoComplete="off"
										value={iptvDraft[f.key]}
										className="w-full rounded-xl px-4 py-3 text-[20px] text-white outline-none"
										style={{
											background: focused ? 'rgba(124,168,255,0.12)' : 'rgba(255,255,255,0.05)',
											border: `1px solid ${focused ? '#7ca8ff' : 'rgba(255,255,255,0.15)'}`
										}}
									/>
								</div>
							);
						})}
						<div
							className="flex flex-col gap-2 rounded-2xl px-6 py-4 transition-colors"
							style={{
								background: row === IPTV_FIELDS.length ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
								border: `1.5px solid ${row === IPTV_FIELDS.length ? 'rgba(255,255,255,0.3)' : 'transparent'}`
							}}
						>
							<div className="flex items-center justify-between">
								<span className="text-xl font-medium text-white/90">Importar via código</span>
								<span className="text-lg font-medium" style={{color: row === IPTV_FIELDS.length ? '#38BDF8' : 'rgba(255,255,255,0.5)'}}>
									{importMode ? (importCode || 'digite…') : (importMsg === 'ok' ? 'Importado ✓' : importMsg === 'fail' ? 'Código inválido' : 'OK para importar')}
								</span>
							</div>
							<span className="text-sm font-medium text-white/40">Cole a lista num paste (paste.rs) no celular e digite só o código aqui</span>
						</div>
						<div
							className="flex items-center justify-between rounded-2xl px-6 py-4 transition-colors"
							style={{
								background: row === IPTV_FIELDS.length + 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
								border: `1.5px solid ${row === IPTV_FIELDS.length + 1 ? 'rgba(255,255,255,0.3)' : 'transparent'}`
							}}
						>
							<span className="text-xl font-medium text-white/90">Salvar</span>
							<span className="text-lg font-medium" style={{color: row === IPTV_FIELDS.length + 1 ? '#38BDF8' : 'rgba(255,255,255,0.5)'}}>
								OK para salvar
							</span>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{ROWS.map((def, i) => {
							const focused = i === row;
							return (
								<div
									key={def.label}
									className="flex items-center justify-between rounded-2xl px-6 py-4 transition-colors"
									style={{
										background: focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
										border: `1.5px solid ${focused ? 'rgba(255,255,255,0.3)' : 'transparent'}`
									}}
								>
									<span className="text-xl font-medium text-white/90">{def.label}</span>
									{def.kind === 'choice' ? (
										<span className="flex items-center gap-3 text-lg" style={{color: focused ? '#38BDF8' : 'rgba(255,255,255,0.5)'}}>
											{focused && <span className="opacity-70">‹</span>}
											<span className="min-w-[104px] text-center font-medium">{def.labels[def.values.indexOf(def.get())]}</span>
											{focused && <span className="opacity-70">›</span>}
										</span>
									) : def.kind === 'info' ? (
										<span className="text-lg font-medium text-white/40">{def.value}</span>
									) : (
										<span className="text-lg font-medium" style={{color: focused ? '#38BDF8' : 'rgba(255,255,255,0.5)'}}>
											{def.action === 'reset' && resetDone ? 'Restaurado ✓' : def.hint}
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}

				<p className="mt-8 text-center text-sm font-medium text-white/40">{hint}</p>
			</div>
		</div>
	);
}
