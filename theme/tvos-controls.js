/* ============================================================================
   tvOS controls — the runtime half of the theme.

   Everything here is functionality the CSS layer cannot express, injected on top
   of the shipped bundle (same mechanism as tvos-theme.css: a file referenced from
   index.html). It never rewrites the app's JavaScript; it drives the app the way
   the remote does and talks to the TV through the services the app itself may call.

     GREEN (keyCode 404)  open / close the panel
     arrows               move between tiles
     OK / Enter           activate the focused tile
     Back / Esc           close the panel (or leave the app grid inside it)

   TV services, measured from the launcher's own web-app context on the TV:
     com.webos.audio/getVolume|setVolume ............ allowed
     settingsservice get/setSystemSettings (sound) .. allowed
     settingsservice (picture, network, general) .... ACCESS DENIED
     applicationManager/listApps|listRunningApps .... DENIED
     service.tvpower/power/* ........................ DENIED
   So volume and sound output are driven directly; the app list, the running app
   list and launching go through the LAN helper on server-t5 (ares-backed), which
   is the same bridge the launcher itself falls back to. Power/picture would need a
   rooted TV - nothing here fakes them.
   ========================================================================== */
(function () {
  "use strict";

  var HELPER = "http://192.168.0.77:8108";
  var GREEN = 404;
  var APP_ID = "br.com.customhome.lite";
  var THEME_KEY = "tvos-theme"; // "dark" | "light", dark is the default

  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch (e) {
      return "dark";
    }
  }

  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.setAttribute("data-tvos-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-tvos-theme");
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }

  var SOUND_OUTPUTS = [
    ["tv_speaker", "Alto-falante da TV"],
    ["external_optical", "Óptico"],
    ["external_arc", "HDMI ARC"],
    ["bt_soundbar", "Bluetooth"],
    ["headphone", "Fone de ouvido"],
  ];

  var root = null;
  var grid = null;
  var status = null;
  var mode = "controls"; // "controls" | "apps"
  var focused = 0;
  var tiles = [];
  var apps = [];

  /* ------------------------------------------------------------- services */

  function luna(uri, params) {
    return new Promise(function (resolve) {
      var bridge = window.PalmServiceBridge;
      if (!bridge) return resolve(null);
      var done = false;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, 4000);
      try {
        var call = new bridge();
        call.onservicecallback = function (msg) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try {
            resolve(JSON.parse(msg));
          } catch (e) {
            resolve(null);
          }
        };
        call.call(uri, JSON.stringify(params || {}));
      } catch (e) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    });
  }

  function helper(path) {
    return fetch(HELPER + path, { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function getVolume() {
    return luna("luna://com.webos.audio/getVolume", {});
  }

  function setVolume(volume) {
    return luna("luna://com.webos.audio/setVolume", { volume: Math.max(0, Math.min(100, volume)) });
  }

  function getSoundOutput() {
    return luna("luna://com.webos.settingsservice/getSystemSettings", {
      category: "sound",
      keys: ["soundOutput"],
    });
  }

  function setSoundOutput(output) {
    return luna("luna://com.webos.settingsservice/setSystemSettings", {
      category: "sound",
      settings: { soundOutput: output },
    });
  }

  /* ----------------------------------------------------------- app driving */

  /* The launcher's grid only reacts to remote keys, so the panel launches apps
     the direct way: label -> app id -> luna launch, with the LAN helper as the
     fallback (the same order the launcher itself uses). The map mirrors the app
     list baked into the launcher's bundle. */
  var APP_IDS = {
    tvaovivo: "com.webos.app.livetv",
    livetv: "com.webos.app.livetv",
    globoplay: "globoplaywebos",
    crunchyroll: "com.crunchyroll.webos",
    youtube: "youtube.leanback.v4",
    stremio: "io.strem.tv",
    plutotv: "com.plutotv.app",
    aceplayer: "com.aceplayer.app",
    lgchannels: "com.webos.app.lgchannels",
    hdmi1: "com.webos.app.hdmi1",
    hdmi2: "com.webos.app.hdmi2",
    hdmi3: "com.webos.app.hdmi3",
    hdmi4: "com.webos.app.hdmi4",
    navegador: "com.webos.app.browser",
    browser: "com.webos.app.browser",
    homebrew: "org.webosbrew.hbchannel",
    lojalg: "com.webos.app.discovery",
    ajustes: "com.palm.app.settings",
    ajustesdatv: "com.palm.app.settings",
    configuraes: "com.palm.app.settings",
    settings: "com.palm.app.settings",
  };

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9+]/g, "");
  }

  function appKeys() {
    return Array.prototype.slice
      .call(document.querySelectorAll('[data-fkey^="apps:"]'))
      .map(function (el) {
        return el.getAttribute("data-fkey");
      });
  }

  function launch(appId) {
    return luna("luna://com.webos.applicationManager/launch", { id: appId }).then(function (res) {
      if (res && res.returnValue) return true;
      return helper("/launch?app=" + encodeURIComponent(appId)).then(function (fallback) {
        return !!(fallback && fallback.ok);
      });
    });
  }

  function launchApp(label) {
    var appId = APP_IDS[normalize(label)];
    if (!appId) {
      say('Sem id para "' + label + '" — ajuste APP_IDS');
      return;
    }
    closePanel();
    launch(appId).then(function (ok) {
      if (!ok) {
        openPanel();
        say("A TV recusou abrir " + label);
      }
    });
  }

  /* ------------------------------------------------------------------- view */

  function loadApps() {
    apps = appKeys().map(function (key) {
      var holder = document.querySelector('[data-fkey="' + key + '"]');
      var label = holder ? holder.querySelector("span") : null;
      return { key: key, label: label ? label.textContent.trim() : key };
    });
  }

  /* Glyphs in the Sketch control-center language: one accent glyph per tile. */
  var GLYPHS = {
    volume:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9.4 9.4 0 0 1 0 13"/></svg>',
    sound:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12" r="2"/><path d="M19.5 9.2a4.4 4.4 0 0 1 0 5.6"/></svg>',
    apps:
      '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
    hdmi:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    moon:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    power:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>',
  };

  function tile(label, value, action, hint, opts) {
    opts = opts || {};
    var el = document.createElement("button");
    el.type = "button";
    el.className = "tvos-tile" + (opts.large ? " tvos-tile--large" : "");
    if (opts.volume) el.setAttribute("data-volume", "true");
    el.innerHTML =
      (opts.glyph
        ? '<span class="tvos-tile__glyph' + (opts.glyphClass ? " " + opts.glyphClass : "") + '">' + opts.glyph + "</span>"
        : "") +
      '<span class="tvos-tile__label"></span>' +
      (value !== undefined && value !== null ? '<span class="tvos-tile__value"></span>' : "") +
      (hint ? '<span class="tvos-tile__hint"></span>' : "");
    el.querySelector(".tvos-tile__label").textContent = label;
    if (value !== undefined && value !== null) el.querySelector(".tvos-tile__value").textContent = value;
    if (hint) el.querySelector(".tvos-tile__hint").textContent = hint;
    el.addEventListener("click", function (event) {
      event.preventDefault();
      action();
    });
    return el;
  }

  function say(text) {
    if (status) status.textContent = text || "";
  }

  function paintControls() {
    grid.innerHTML = "";
    tiles = [];

    /* Sketch control-center layout: one large tile (volume, spans 2 rows),
       then wide tiles in a 2-column grid. */
    var volumeTile = tile(
      "Volume",
      "…",
      function () {
        nudgeVolume(1);
      },
      "← − · + →",
      { large: true, volume: true, glyph: GLYPHS.volume, glyphClass: "tvos-tile__glyph--blue" }
    );

    var sound = tile("Saída de som", "…", function () {
      cycleSound();
    }, null, { glyph: GLYPHS.sound, glyphClass: "tvos-tile__glyph--blue" });

    var power = tile("Desligar", "a TV", function () {
      var confirm = window.__tvosPanels && window.__tvosPanels.confirm;
      if (!confirm) {
        say("Desligando…");
        helper("/poweroff").then(function (res) {
          if (!(res && res.ok)) say("A TV recusou desligar");
        });
        return;
      }
      closePanel();
      confirm("Desligar a TV?", "A tela apaga na hora.", [
        { label: "Cancelar", fn: null },
        { label: "Desligar", danger: true, fn: function () {
          helper("/poweroff");
        } },
      ]);
    }, null, { glyph: GLYPHS.power });

    var appsTile = tile("Aplicativos", apps.length + " instalados", function () {
      mode = "apps";
      focused = 0;
      paintApps();
    }, null, { glyph: GLYPHS.apps });

    var hdmi1 = tile("HDMI 1", "Entrada", function () {
      launch("com.webos.app.hdmi1");
    }, null, { glyph: GLYPHS.hdmi });
    var hdmi2 = tile("HDMI 2", "Entrada", function () {
      launch("com.webos.app.hdmi2");
    }, null, { glyph: GLYPHS.hdmi });
    var hdmi3 = tile("HDMI 3", "Entrada", function () {
      launch("com.webos.app.hdmi3");
    }, null, { glyph: GLYPHS.hdmi });
    var hdmi4 = tile("HDMI 4", "Entrada", function () {
      launch("com.webos.app.hdmi4");
    }, null, { glyph: GLYPHS.hdmi });

    var themeTile = tile(
      "Aparência",
      getTheme() === "light" ? "Clara" : "Escura",
      function () {
        applyTheme(getTheme() === "light" ? "dark" : "light");
        paintControls();
      },
      null,
      { glyph: GLYPHS.moon, glyphClass: "tvos-tile__glyph--purple" }
    );

    tiles = [volumeTile, sound, power, appsTile, hdmi1, hdmi2, hdmi3, hdmi4, themeTile];
    tiles.forEach(function (el) {
      grid.appendChild(el);
    });
    refresh();
  }

  function nudgeVolume(delta) {
    getVolume().then(function (res) {
      setVolume(((res && res.volume) || 0) + delta).then(refresh);
    });
  }

  function paintApps() {
    grid.innerHTML = "";
    tiles = [];
    loadApps();
    var knownIds = {};
    Object.keys(APP_IDS).forEach(function (k) {
      knownIds[APP_IDS[k]] = true;
    });
    apps.forEach(function (app, index) {
      var el = tile(app.label, null, function () {
        launchApp(app.label);
      }, null, { glyph: GLYPHS.apps });
      el.setAttribute("data-app-index", String(index));
      tiles.push(el);
      grid.appendChild(el);
    });
    /* Extra tiles for real installed apps the bundle doesn't list. */
    loadHelperApps().then(function (helperApps) {
      if (mode !== "apps") return;
      var extra = helperApps.filter(function (a) {
        return !knownIds[a.id];
      });
      extra.forEach(function (a) {
        var id = a.id;
        var el = tile(a.title || id, null, function () {
          closePanel();
          launch(id);
        }, null, { glyph: GLYPHS.apps });
        tiles.push(el);
        grid.appendChild(el);
      });
      if (extra.length) {
        say(apps.length + extra.length + " aplicativos · OK abre");
        highlight();
      }
    });
    var back = tile("Voltar", null, function () {
      mode = "controls";
      focused = 0;
      paintControls();
    });
    tiles.push(back);
    grid.appendChild(back);
    say(apps.length + " aplicativos · OK abre");
    highlight();
  }

  function refresh() {
    var volumeTile = grid && grid.querySelector("[data-volume]");
    getVolume().then(function (res) {
      if (!volumeTile) return;
      var value = res && typeof res.volume === "number" ? res.volume : null;
      volumeTile.querySelector(".tvos-tile__label").textContent = "Volume";
      volumeTile.querySelector(".tvos-tile__value").textContent =
        value === null ? "—" : String(value);
    });
    var soundTile = grid && grid.querySelectorAll(".tvos-tile")[1];
    getSoundOutput().then(function (res) {
      if (!soundTile || !soundTile.querySelector(".tvos-tile__value")) return;
      var current =
        res && res.settings && res.settings.soundOutput ? res.settings.soundOutput : null;
      var match = SOUND_OUTPUTS.filter(function (pair) {
        return pair[0] === current;
      })[0];
      soundTile.querySelector(".tvos-tile__value").textContent = match
        ? match[1]
        : "indisponível";
    });
  }

  /* Apps the bundle doesn't know (e.g. sideloads), from the LAN helper. */
  var helperAppsCache = null;

  function loadHelperApps() {
    if (helperAppsCache) return Promise.resolve(helperAppsCache);
    return helper("/apps").then(function (res) {
      helperAppsCache =
        res && res.ok && res.apps
          ? res.apps.filter(function (a) {
              return a && a.id && a.id !== APP_ID;
            })
          : [];
      return helperAppsCache;
    });
  }

  function cycleSound() {
    getSoundOutput().then(function (res) {
      var current =
        res && res.settings && res.settings.soundOutput ? res.settings.soundOutput : null;
      var index = SOUND_OUTPUTS.map(function (pair) {
        return pair[0];
      }).indexOf(current);
      var next = SOUND_OUTPUTS[(index + 1) % SOUND_OUTPUTS.length];
      setSoundOutput(next[0]).then(function (ok) {
        say(ok && ok.returnValue ? "Saída: " + next[1] : "A TV recusou a troca de saída");
        setTimeout(refresh, 600);
      });
    });
  }

  function highlight() {
    tiles.forEach(function (el, index) {
      el.setAttribute("data-focused", index === focused ? "true" : "false");
    });
  }

  /* ------------------------------------------------------------------ panel */

  function build() {
    root = document.createElement("div");
    root.id = "tvos-controls";
    root.setAttribute("hidden", "hidden");
    root.innerHTML =
      '<div class="tvos-panel">' +
      '  <div class="tvos-panel__head"><span class="tvos-panel__title">Controles</span>' +
      '  <span class="tvos-panel__status"></span></div>' +
      '  <div class="tvos-panel__grid"></div>' +
      '  <div class="tvos-panel__foot">VERDE fecha · ← → ↑ ↓ navega · OK ativa</div>' +
      "</div>";
    document.querySelector(".launcher-shell").appendChild(root);
    grid = root.querySelector(".tvos-panel__grid");
    status = root.querySelector(".tvos-panel__status");
  }

  function openPanel() {
    mode = "controls";
    focused = 0;
    loadApps();
    paintControls();
    root.removeAttribute("hidden");
    highlight();
    say("");
  }

  function closePanel() {
    if (root) root.setAttribute("hidden", "hidden");
  }

  function isOpen() {
    return root && !root.hasAttribute("hidden");
  }

  /* ------------------------------------------------------------------- keys */

  function onKey(event) {
    var code = event.keyCode || event.which;
    var isGreen = code === GREEN || event.key === "Green" || event.keyIdentifier === "U+0047";

    if (!isOpen()) {
      if (isGreen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openPanel();
      }
      return;
    }

    // while the panel is open it owns the remote
    event.preventDefault();
    event.stopImmediatePropagation();

    if (isGreen || code === 461 || event.key === "Escape" || event.key === "Backspace") {
      if (mode === "apps") {
        mode = "controls";
        focused = 0;
        paintControls();
        return;
      }
      closePanel();
      return;
    }
    /* On the large volume tile, left/right adjusts the level. */
    if (
      mode === "controls" &&
      tiles[focused] &&
      tiles[focused].hasAttribute("data-volume") &&
      (code === 37 || code === 39)
    ) {
      nudgeVolume(code === 39 ? 1 : -1);
      return;
    }
    if (code === 40) focused = Math.min(tiles.length - 1, focused + 2);
    else if (code === 38) focused = Math.max(0, focused - 2);
    else if (code === 39) focused = Math.min(tiles.length - 1, focused + 1);
    else if (code === 37) focused = Math.max(0, focused - 1);
    else if (code === 13) {
      tiles[focused].click();
      return;
    } else return;

    highlight();
  }

  function start() {
    if (!document.querySelector(".launcher-shell")) return setTimeout(start, 400);
    if (document.getElementById("tvos-controls")) return;
    applyTheme(getTheme());
    build();
    document.addEventListener("keydown", onKey, true);
  }

  start();
  window.__tvosControls = {
    v: "1.1-lote",
    open: openPanel,
    close: closePanel,
    volume: getVolume,
    setVolume: setVolume,
    soundOutput: getSoundOutput,
    apps: appKeys,
    launch: launchApp,
    helper: helper,
    id: APP_ID,
    theme: getTheme,
    setTheme: applyTheme,
  };
})();
