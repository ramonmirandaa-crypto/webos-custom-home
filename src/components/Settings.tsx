import {useEffect, useRef, useState} from 'react';
import {APP_VERSION} from '../lib/version';
import type {AT4KAppItem} from '../lib/at4k-data';
import type {IptvConfig} from '../lib/iptv';
import {BACK_KEYCODE} from '../service/luna';

const ACCENT = '#7ca8ff';

type Row =
	| {kind: 'choice'; label: string; values: string[]; labels: string[]; get: () => string; set: (v: string) => void}
	| {kind: 'action'; label: string; hint: string; action: 'reset' | 'apps' | 'iptv'}
	| {kind: 'info'; label: string; value: string};

const IPTV_FIELDS: {label: string; key: 'base' | 'user' | 'pass'; type: 'text' | 'url' | 'password'; hint: string}[] = [
	{label: 'URL base', key: 'base', type: 'url', hint: 'Ex.: https://painel.exemplo.com:8080'},
	{label: 'Usuário', key: 'user', type: 'text', hint: 'Usuário do painel Xtream'},
	{label: 'Senha', key: 'pass', type: 'password', hint: 'Senha do painel Xtream'}
];

/** Plain-HTTP panel base: allowed, but the credentials travel unencrypted. */
function isInsecureBase (base: string): boolean {
	return /^http:\/\//i.test(base.trim());
}

// Settings overlay.
//
// STRUCTURE IS A CONTRACT. The tvOS overlay (theme/tvos-theme.css) restyles this
// panel by matching its Tailwind classes:
//   .w-[740px]            -> the 480px Control Center panel (padding 24, r50)
//   .w-[740px] .gap-3     -> 2-column grid of 208px tiles
//   .gap-3 > div:nth-child(n) -> tile placement (1 = large, 4 = full width)
//   div[style*="0.12"]    -> the focused tile inverts to white + black text
//   .w-[740px] h2 / p     -> title and hint typography
// So: keep `w-[740px]`, keep the `gap-3` wrappers, keep rows as <div> children
// in order, and keep the focused background at exactly rgba(255,255,255,0.12).
// Pointer handling is done with handlers on those divs, not by changing the tag.

function AppsPane ({apps, hidden, row, onToggle, onFocusRow}: {
	apps: AT4KAppItem[];
	hidden: Set<string>;
	row: number;
	onToggle: (id: string) => void;
	onFocusRow: (r: number) => void;
}) {
	return (
		<div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pr-2" style={{scrollbarWidth: 'none'}}>
			{apps.map((app, i) => {
				const focused = i === row;
				const shown = !hidden.has(app.id);
				return (
					<div
						key={app.id}
						role="button"
						onClick={() => { onFocusRow(i); onToggle(app.id); }}
						onMouseEnter={() => onFocusRow(i)}
						className="flex cursor-pointer items-center justify-between rounded-xl px-6 py-3 transition-colors"
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

export default function Settings ({onClose, onOrderReset, apps, hidden, onToggleHide, clock24, onClock24, fps, onFps, iptvConfig, onSaveIptv, iptvPlaintextFallback}: {
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
	/** Keymanager3 refused to hold the key: stored in localStorage in the clear. */
	iptvPlaintextFallback: boolean;
}) {
	const [pane, setPane] = useState<'main' | 'apps' | 'iptv'>('main');
	const [row, setRow] = useState(0);
	const [resetDone, setResetDone] = useState(false);
	const [iptvDraft, setIptvDraft] = useState<IptvConfig>({base: iptvConfig.base, user: iptvConfig.user, pass: iptvConfig.pass});
	const [saved, setSaved] = useState(false);

	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
	const iptvRows = IPTV_FIELDS.length + 1;                       // fields + Salvar
	const rowCount = pane === 'main' ? ROWS.length : (pane === 'apps' ? manageable.length : iptvRows);

	// The TV raises its own virtual keyboard for the focused <input>. While a
	// field owns the keyboard, navigation keys belong to the field, not to us —
	// otherwise Back would close the panel mid-typing and OK would swallow space.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const isBack = e.keyCode === BACK_KEYCODE || e.key === 'GoBack' || e.key === 'Escape' || e.key === 'Backspace';
			const target = e.target as HTMLElement | null;
			const editingText = !!target && (target.tagName === 'INPUT' || target.isContentEditable);
			if (editingText && !isBack) return;      // the field and its keyboard own the key

			e.preventDefault();
			e.stopPropagation();

			if (editingText) {
				// Back leaves the field; the platform closes its keyboard.
				target?.blur();
				return;
			}

			if (pane === 'iptv') {
				if (isBack) {
					setPane('main');
					setRow(ROWS.findIndex((r) => r.kind === 'action' && r.action === 'iptv'));
					return;
				}
				if (e.key === 'ArrowUp') { e.preventDefault(); setRow((r) => Math.max(0, r - 1)); return; }
				if (e.key === 'ArrowDown') { e.preventDefault(); setRow((r) => Math.min(iptvRows - 1, r + 1)); return; }
				if (e.key === 'Enter') {
					if (e.repeat) return;
					if (row < IPTV_FIELDS.length) {
						inputRefs.current[row]?.focus();
						inputRefs.current[row]?.select();
					} else {
						onSaveIptv(iptvDraft);
						setSaved(true);
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
					setSaved(false);
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
	}, [pane, row, rowCount, iptvRows, onClose, onOrderReset, manageable, onToggleHide, clock24, onClock24, fps, onFps, iptvDraft, iptvConfig, onSaveIptv]);

	const title = pane === 'main' ? 'Ajustes do Launcher' : (pane === 'apps' ? 'Gerenciar aplicativos' : 'Configurar IPTV');
	const hint = pane === 'apps'
		? '↑↓ navegar · OK mostrar/ocultar · Voltar voltar'
		: pane === 'iptv'
			? '↑↓ navegar · OK editar campo · Voltar sai do campo'
			: '↑↓ navegar · ‹ › alterar · OK selecionar · Voltar fechar';

	// Focused rows must keep exactly this alpha: the overlay matches on it.
	const rowStyle = (focused: boolean) => ({
		background: focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
		border: `1.5px solid ${focused ? 'rgba(255,255,255,0.3)' : 'transparent'}`
	});

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
			<div className="w-[740px] max-h-[660px] overflow-y-auto rounded-[36px] border border-white/10 bg-slate-900/95 px-12 py-10 shadow-2xl" style={{scrollbarWidth: 'none'}}>
				<h2 className="mb-8 text-3xl font-semibold tracking-tight text-white">{title}</h2>

				{pane === 'apps' ? (
					<AppsPane apps={manageable} hidden={hidden} row={row} onToggle={onToggleHide} onFocusRow={setRow} />
				) : pane === 'iptv' ? (
					<>
						<div className="flex flex-col gap-3">
							{IPTV_FIELDS.map((f, i) => {
								const focused = row === i;
								return (
									<div
										key={f.key}
										onClick={() => { setRow(i); inputRefs.current[i]?.focus(); }}
										onMouseEnter={() => setRow(i)}
										className="flex flex-col gap-2 rounded-2xl px-6 py-3 transition-colors"
										style={rowStyle(focused)}
									>
										<span className="text-sm font-medium text-white/60">{f.label}</span>
										<input
											ref={(el) => { inputRefs.current[i] = el; }}
											type={f.type}
											inputMode={f.type === 'url' ? 'url' : 'text'}
											autoComplete="off"
											autoCorrect="off"
											spellCheck={false}
											placeholder={f.hint}
											value={iptvDraft[f.key]}
											onChange={(e) => setIptvDraft((d) => ({...d, [f.key]: e.target.value}))}
											onFocus={() => setRow(i)}
											className="w-full rounded-xl px-4 py-3 text-[20px] text-white outline-none placeholder:text-white/30"
											style={{
												background: focused ? 'rgba(124,168,255,0.12)' : 'rgba(255,255,255,0.05)',
												border: `1px solid ${focused ? '#7ca8ff' : 'rgba(255,255,255,0.15)'}`
											}}
										/>
									</div>
								);
							})}
							<div
								role="button"
								onClick={() => { setRow(IPTV_FIELDS.length); onSaveIptv(iptvDraft); setSaved(true); }}
								onMouseEnter={() => setRow(IPTV_FIELDS.length)}
								className="flex cursor-pointer flex-col gap-2 rounded-2xl px-6 py-4 transition-colors"
								style={rowStyle(row === IPTV_FIELDS.length)}
							>
								<span className="text-xl font-medium text-white/90">Salvar</span>
								<span className="text-lg font-medium" style={{color: 'rgba(255,255,255,0.5)'}}>
									{saved ? 'Salvo ✓' : 'OK para salvar'}
								</span>
							</div>
						</div>
						{isInsecureBase(iptvDraft.base) && (
							<p className="mt-4 text-sm font-medium text-[#FFB86B]">
								Endereço sem TLS: usuário e senha trafegam sem criptografia.
							</p>
						)}
						{iptvPlaintextFallback && (
							<p className="mt-2 text-sm font-medium text-[#FFB86B]">
								Keymanager3 indisponível: as credenciais ficam guardadas sem criptografia neste aparelho.
							</p>
						)}
					</>
				) : (
					<div className="flex flex-col gap-3">
						{ROWS.map((def, i) => {
							const focused = i === row;
							const activate = () => {
								setRow(i);
								if (def.kind === 'choice') {
									const cur = def.values.indexOf(def.get());
									def.set(def.values[(cur + 1) % def.values.length]);
								} else if (def.kind === 'action') {
									if (def.action === 'reset') { onOrderReset(); setResetDone(true); }
									else if (def.action === 'iptv') {
										setIptvDraft({base: iptvConfig.base, user: iptvConfig.user, pass: iptvConfig.pass});
										setSaved(false);
										setPane('iptv');
										setRow(0);
									} else { setPane('apps'); setRow(0); }
								}
							};
							return (
								<div
									key={def.label}
									role="button"
									onClick={activate}
									onMouseEnter={() => setRow(i)}
									className="flex cursor-pointer items-center justify-between rounded-2xl px-6 py-4 transition-colors"
									style={rowStyle(focused)}
								>
									<span className="text-xl font-medium text-white/90">{def.label}</span>
									{def.kind === 'choice' ? (
										<span className="flex items-center gap-3 text-lg" style={{color: 'rgba(255,255,255,0.5)'}}>
											{focused && <span className="opacity-70">‹</span>}
											<span className="min-w-[104px] text-center font-medium">{def.labels[def.values.indexOf(def.get())]}</span>
											{focused && <span className="opacity-70">›</span>}
										</span>
									) : def.kind === 'info' ? (
										<span className="text-lg font-medium text-white/40">{def.value}</span>
									) : (
										<span className="text-lg font-medium" style={{color: 'rgba(255,255,255,0.5)'}}>
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
