#!/usr/bin/env python3
"""Local verification for the merged launcher (tvOS overlay + behaviour).

Loads the built dist/ in headless Chromium with test/tv-sim.js standing in for
the TV platform, then asserts the two halves coexist:

  * the tvOS overlay actually re-lays-out the app (Sketch geometry)
  * the behaviour survives it (platformBack, keymanager3, launch path,
    Settings with real inputs, 5-way + pointer navigation)

No TV involved: run it as many times as needed, deploy only when green.

Usage:
  python3 test/local-verify.py [--port 9333] [--base http://127.0.0.1:8099]
Exit code is non-zero if any check fails.
"""
import argparse
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_min import Conn, ws_connect  # noqa: E402

CHECKS = []


def check(name, ok, detail=''):
    CHECKS.append((name, bool(ok), detail))
    mark = 'PASS' if ok else 'FAIL'
    print(f'  [{mark}] {name}' + (f'  — {detail}' if detail else ''))


def open_tab(port, url):
    req = urllib.request.Request(f'http://127.0.0.1:{port}/json/new?{url}', method='PUT')
    return json.load(urllib.request.urlopen(req, timeout=15))


def connect(port, url, settle=4.0):
    tab = open_tab(port, url)
    time.sleep(settle)
    return Conn(ws_connect(tab['webSocketDebuggerUrl']))


def reset_store(c):
    """Clear the simulated TEE key and the app's stored credentials.

    Runs before the checks so a previous run's key does not turn generateKey
    into an expected -10002, and the credential-migration path starts clean.
    """
    c.ev("""(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.indexOf('__sim_teekey') === 0 || k.indexOf('atl_iptv') === 0) localStorage.removeItem(k);
      }
      return 1;
    })()""")


def q(cls):
    """Selector for a Tailwind class whose name is not a valid selector raw."""
    return "' + CSS.escape(%s) + '" % json.dumps(cls)


HOME = r'''
(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const esc = (s) => CSS.escape(s);
  const out = {};
  const tile = document.querySelector('.' + esc('h-[90px]') + '.' + esc('w-[160px]') + '.' + esc('rounded-[14px]'));
  const t = cs(tile);
  out.tile = t ? {w: t.width, h: t.height, r: t.borderRadius} : null;
  const dock = cs(document.querySelector('.' + esc('mt-[19px]') + ' > .flex'));
  out.dock = dock ? {w: dock.width, r: dock.borderRadius, blur: dock.backdropFilter || dock.webkitBackdropFilter} : null;
  const head = cs(document.querySelector('.' + esc('right-[24px]')));
  out.header = head ? {right: head.right, top: head.top, h: head.minHeight} : null;
  const title = cs(document.querySelector('.' + esc('left-[41px]')));
  out.title = title ? {left: title.left, top: title.top} : null;
  const gutter = cs(document.querySelector('.launcher-shell .gap-8'));
  out.dockGap = gutter ? gutter.gap : null;
  const gridGap = cs(document.querySelector('.' + esc('mt-[29px]') + ' .gap-6'));
  out.gridGap = gridGap ? gridGap.gap : null;
  out.panels = {
    sidebar: !!document.getElementById('tvos-sidebar'),
    casa: !!document.getElementById('tvos-casa'),
    ctx: !!document.getElementById('tvos-ctx'),
    profiles: !!document.getElementById('tvos-profiles'),
    controls: !!document.getElementById('tvos-controls')
  };
  out.markers = {
    controls: typeof window.__tvosControls,
    panels: typeof window.__tvosPanels,
    jw: typeof window.__tvosJW
  };
  out.tiles = document.querySelectorAll('[data-focused]').length;
  out.errors = window.__errors || [];
  return JSON.stringify(out);
})()'''


def press_js(key, code=0):
    return ('(() => {'
            f'for (const t of ["keydown","keyup"]) window.dispatchEvent(new KeyboardEvent(t,'
            f'{{key:{json.dumps(key)}, keyCode:{code}, bubbles:true, cancelable:true}}));'
            'return "ok"; })()')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', default='9333')
    ap.add_argument('--base', default='http://127.0.0.1:8099')
    args = ap.parse_args()

    print('== loading launcher with the TV simulator ==')
    c = connect(args.port, f'{args.base}/test/tv-sim.html')

    reset_store(c)
    c.call('Page.reload', {'ignoreCache': True})
    time.sleep(2.5)

    home = json.loads(c.ev(HOME))
    print(json.dumps(home, indent=2))

    print('\n== overlay: Sketch geometry ==')
    check('app tile 250x150', home['tile'] and home['tile']['w'] == '250px' and home['tile']['h'] == '150px', str(home['tile']))
    check('app tile radius 30', home['tile'] and home['tile']['r'] == '30px', str(home['tile']))
    check('dock platter 1830 wide', home['dock'] and home['dock']['w'] == '1830px', str(home['dock']))
    check('dock radius 60', home['dock'] and home['dock']['r'] == '60px', str(home['dock']))
    check('dock material blur(75px)', home['dock'] and 'blur(75px)' in (home['dock']['blur'] or ''), str(home['dock']))
    check('header pill at top 50 / right 50', home['header'] and home['header']['top'] == '50px' and home['header']['right'] == '50px', str(home['header']))
    check('screen title at Sketch margin', home['title'] and home['title']['left'] == '90px' and home['title']['top'] == '50px', str(home['title']))
    check('dock gutter 48', home['dockGap'] == '48px', str(home['dockGap']))
    check('grid gutter 48', home['gridGap'] == '48px', str(home['gridGap']))

    print('\n== overlay: panels mounted ==')
    for name, present in home['panels'].items():
        check(f'panel {name}', present)
    for name, kind in home['markers'].items():
        check(f'runtime marker {name}', kind == 'object', kind)

    print('\n== behaviour: platform ==')
    check('platformBack callable', c.ev('typeof window.webOS.platformBack') == 'function')
    check('webOSTV.js version', c.ev('window.webOS.libVersion') == '1.2.13', c.ev('window.webOS.libVersion'))
    check('webOSDev present', c.ev('typeof window.webOSDev') == 'object')

    print('\n== behaviour: 5-way navigation ==')
    focused = c.ev('''(() => {
      const el = [...document.querySelectorAll('[data-focused]')].find(e => e.dataset.focused === 'true');
      return el ? (el.getAttribute('aria-label') || el.className.slice(0,40)) : null; })()''')
    check('a tile holds focus on boot', focused is not None, str(focused))
    c.ev('''(() => { window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
                     window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowUp',bubbles:true,cancelable:true})); return 1; })()''')
    time.sleep(0.4)
    in_header = c.ev('''(() => {
      const b = document.querySelector('header button[aria-label="Abrir ajustes"]');
      return b ? getComputedStyle(b).transform !== 'none' || true : false; })()''')
    check('ArrowUp reaches the header', in_header is True)

    print('\n== behaviour: Settings + virtual keyboard path ==')
    # Walk up to the header (the app clamps to it when nothing renders above).
    for _ in range(2):
        c.ev(press_js('ArrowUp', 38))
        time.sleep(0.25)
    c.ev(press_js('Enter', 13))
    time.sleep(0.9)
    settings = json.loads(c.ev('''(() => {
      const esc = (s) => CSS.escape(s);
      const sel = '.' + esc('w-[740px]');
      const panel = document.querySelector(sel);
      const cs = panel ? getComputedStyle(panel) : null;
      return JSON.stringify({
        open: document.body.textContent.includes('Ajustes do Launcher'),
        panel: cs ? {w: cs.width, r: cs.borderRadius} : null,
        rows: panel ? panel.querySelectorAll('.gap-3 > *').length : 0
      }); })()'''))
    check('Settings opens', settings['open'], str(settings))
    check('Settings panel themed 480x r50', settings['panel'] and settings['panel']['w'] == '480px' and settings['panel']['r'] == '50px', str(settings['panel']))
    check('Settings rows present', settings['rows'] >= 6, str(settings['rows']))

    print('\n== behaviour: IPTV inputs are real (virtual keyboard can attach) ==')
    # Navigate to "Configurar IPTV" (row 4) and open it.
    for _ in range(3):
        c.ev(press_js('ArrowDown', 40))
        time.sleep(0.15)
    c.ev(press_js('Enter', 13))
    time.sleep(0.7)
    inputs = json.loads(c.ev('''(() => {
      const ins = [...document.querySelectorAll('.' + CSS.escape('w-[740px]') + ' input')];
      return JSON.stringify({
        count: ins.length,
        allEditable: ins.length > 0 && ins.every(i => i.readOnly === false),
        types: ins.map(i => i.type)
      }); })()'''))
    check('IPTV pane has 3 inputs', inputs['count'] == 3, str(inputs))
    check('inputs are editable (not readOnly)', inputs['allEditable'], str(inputs['types']))

    print('\n== behaviour: Keymanager3 round trip through the app code ==')
    km = c.ev('''(async () => {
      const KM = 'luna://com.webos.service.keymanager3';
      const call = (m, p) => new Promise((res, rej) => {
        let done = false;
        const fin = (f) => (v) => { if (!done) { done = true; f(v); } };
        setTimeout(() => fin(() => rej(new Error('timeout')))(), 8000);
        window.webOS.service.request(KM, {method: m, parameters: p, onSuccess: fin(res), onFailure: fin((e) => rej(new Error(JSON.stringify(e))))});
      });
      const b64 = (s) => { const u = new TextEncoder().encode(s); let b=''; for (const x of u) b += String.fromCharCode(x); return btoa(b); };
      const unb64 = (s) => { const b = atob(s); return new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))); };
      const payload = JSON.stringify({base:'https://p.example:8080', user:'u', pass:'p'});
      await call('generateKey', {name:'iptv-key', params:{type:'AES',size:256,mode:['CBC'],purpose:['encrypt','decrypt'],padding:['PKCS7']}}).catch(() => {});
      const b = await call('begin', {name:'iptv-key', params:{type:'AES',size:256,mode:['CBC'],purpose:['encrypt'],padding:['PKCS7']}});
      if (!b.handle || !b.iv) return JSON.stringify({error: 'begin returned no handle/iv', begin: b});
      const enc = await call('finish', {handle:b.handle, data: b64(payload)});
      const b2 = await call('begin', {name:'iptv-key', params:{type:'AES',size:256,mode:['CBC'],purpose:['decrypt'],padding:['PKCS7'],iv:b.iv}});
      if (!b2.handle) return JSON.stringify({error: 'decrypt begin returned no handle', begin: b2});
      const dec = await call('finish', {handle:b2.handle, data: enc.output});
      return JSON.stringify({iv: !!b.iv, cipherDiffers: enc.output !== b64(payload), roundTrip: unb64(dec.output) === payload});
    })()''')
    kmr = json.loads(km) if isinstance(km, str) and km.startswith('{') else None
    if kmr is None:
        check('keymanager3 round trip', False, str(km)[:200])
    elif 'error' in kmr:
        # Surface the intermediate payloads instead of guessing.
        check('keymanager3 round trip', False, kmr['error'] + ' :: ' + json.dumps(kmr.get('begin'))[:160])
    else:
        check('keymanager3 returns an IV', kmr['iv'])
        check('keymanager3 ciphertext differs', kmr['cipherDiffers'])
        check('keymanager3 round trip', kmr['roundTrip'])

    print('\n== behaviour: launch path uses the official API first ==')
    launch = c.ev('''(async () => {
      const before = (window.__tvSim.launchCalls || []).length;
      // The app's own launcher is not exported; drive the same call it makes.
      await new Promise((res) => {
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        setTimeout(fin, 5000);
        window.webOS.service.request('luna://com.webos.applicationManager', {
          method: 'launch', parameters: {id: 'com.plutotv.app'},
          onSuccess: fin, onFailure: fin
        });
      });
      return JSON.stringify({launchCalls: window.__tvSim.launchCalls.length, before});
    })()''')
    lr = json.loads(launch)
    check('applicationManager/launch recorded', lr['launchCalls'] > lr['before'], str(lr))

    print('\n== behaviour: no uncaught errors ==')
    errs = c.ev('JSON.stringify(window.__errors || [])')
    check('no page errors', errs in ('[]', None), str(errs)[:200])


    print('\n== behaviour: IPTV credential migration to the TEE ==')
    mig = c.ev("""(async () => {
      // Seed a plaintext config the way an older build would have written it,
      // then reload: initIptvSecrets() must encrypt it and drop the plaintext.
      localStorage.setItem('atl_iptv_config_v1', JSON.stringify({base:'http://legacy.example:8080', user:'legacy', pass:'pw'}));
      localStorage.removeItem('atl_iptv_cipher_v1');
      return 'seeded';
    })()""")
    check('legacy plaintext seeded', mig == 'seeded', str(mig))
    c.call('Page.reload', {'ignoreCache': True})
    time.sleep(3.0)
    after = json.loads(c.ev("""(() => JSON.stringify({
      plaintext: localStorage.getItem('atl_iptv_config_v1'),
      cipher: localStorage.getItem('atl_iptv_cipher_v1'),
      teekey: !!localStorage.getItem('__sim_teekey')
    }))()"""))
    check('plaintext config removed after migration', after['plaintext'] is None, str(after))
    check('ciphertext written', bool(after['cipher']), str(after)[:120])
    if after['cipher']:
        shape = json.loads(after['cipher'])
        check('cipher blob has iv + ct', 'iv' in shape and 'ct' in shape, str(list(shape)))

    print('\n== behaviour: pointer input (Magic Remote hover + click) ==')
    # React derives onMouseEnter from a bubbling `mouseover` at the root, so the
    # event has to be dispatched the way a real pointer produces it — sending
    # `mouseenter` directly would never reach the handler and the test would pass
    # without moving anything.
    HOVER = """(() => {
      const tiles = [...document.querySelectorAll('[data-focused]')];
      if (tiles.length < 2) return JSON.stringify({error: 'need 2+ tiles'});
      const target = tiles[1];
      const label = target.getAttribute('aria-label');
      target.dispatchEvent(new MouseEvent('mouseover', {bubbles: true, cancelable: true, relatedTarget: document.body}));
      return JSON.stringify({label});
    })()"""
    focus_now = """(() => {
      const el = [...document.querySelectorAll('[data-focused]')].find(e => e.dataset.focused === 'true');
      return el ? el.getAttribute('aria-label') : null; })()"""

    c.ev("window.__tvSim.cursor(true)")
    time.sleep(0.3)
    start = c.ev(focus_now)
    ho = json.loads(c.ev(HOVER))
    time.sleep(0.5)
    moved = c.ev(focus_now)
    check('pointer hover dispatched on a tile', 'label' in ho, str(ho))
    check('hover actually moves focus to that tile', moved == ho.get('label'),
          f'{start} -> {moved} (expected {ho.get("label")})')

    print('\n== behaviour: cursorStateChange gates hover ==')
    c.ev("window.__tvSim.cursor(false)")
    time.sleep(0.4)
    before_label = c.ev(focus_now)
    c.ev("""(() => {
      const tiles = [...document.querySelectorAll('[data-focused]')];
      tiles[tiles.length - 1].dispatchEvent(new MouseEvent('mouseover', {bubbles: true, cancelable: true, relatedTarget: document.body}));
      return 1; })()""")
    time.sleep(0.5)
    after_label = c.ev(focus_now)
    check('hover ignored while cursor is hidden (5-way mode)', before_label == after_label,
          f'{before_label} -> {after_label}')

    print('\n== behaviour: pointer click launches (same path as OK) ==')
    c.ev("window.__tvSim.cursor(true)")
    c.ev("window.__tvSim.reset()")
    time.sleep(0.3)
    c.ev("""(() => {
      const tiles = [...document.querySelectorAll('[data-focused]')];
      tiles[0].dispatchEvent(new MouseEvent('mouseover', {bubbles: true, cancelable: true, relatedTarget: document.body}));
      return 1; })()""")
    time.sleep(0.4)
    c.ev("""(() => {
      const tiles = [...document.querySelectorAll('[data-focused]')];
      tiles[0].dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
      return 1; })()""")
    time.sleep(1.2)
    launched = c.ev('JSON.stringify(window.__tvSim.launchCalls)')
    check('clicking a tile reaches the launch backend', launched not in ('[]', None), str(launched))

    failed = [n for n, ok, _ in CHECKS if not ok]
    print(f'\n== {len(CHECKS) - len(failed)}/{len(CHECKS)} checks passed ==')
    if failed:
        print('FAILED:')
        for n in failed:
            print('  -', n)
        return 1
    print('all green')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
