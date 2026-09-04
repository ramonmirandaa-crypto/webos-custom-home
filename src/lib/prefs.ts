const CLOCK_KEY = 'home-clock24-v1';

export function loadClock24 (): boolean {
	try { return localStorage.getItem(CLOCK_KEY) === '1'; }
	catch { return false; }
}

export function saveClock24 (v: boolean): void {
	try { localStorage.setItem(CLOCK_KEY, v ? '1' : '0'); } catch { /* noop */ }
}
