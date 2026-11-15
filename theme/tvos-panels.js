/* ============================================================================
   tvOS panels — sidebar, context menu, profiles, Casa (HA), alerts.

   Second runtime overlay for br.com.customhome.lite. It reuses the control
   panel's conventions (GREEN opens, arrows move, OK activates) and adds:

     BLUE  (keyCode 406)   sidebar: Casa + sections + profiles entry
     YELLOW (keyCode 405)  context menu on the focused bundle tile
     RED   (keyCode 403)   profiles (user switching)

   Menus follow the measured Sketch geometry in tvos-panels.css. Casa talks
   to Home Assistant through the tv-helper bridge on server-t5
   (GET /ha/snapshot, POST /ha/call): the LLAT bearer never leaves the
   server, the TV only sees curated entities and allowlisted services.
   ========================================================================== */
(function () {
  "use strict";

  var HELPER = "http://192.168.0.77:8108";
  var BLUE = 406;
  var YELLOW = 405;
  var RED = 403;
  var ENTER = 13;
  var BACK = 461;
  var PROFILE_KEY = "tvos-profile"; // active profile id, localStorage
  var PROFILES = [
    { id: "ramon", name: "Ramon", cap: "Principal" },
    { id: "alexandre", name: "Alexandre", cap: "Convidado" },
    { id: "visita", name: "Visita", cap: "Sessão" },
  ];

  var openPanel = null; // "sidebar" | "ctx" | "profiles" | "casa" | "alert"
  var tiles = [];
  var focused = 0;
  var els = {};
  var casaCache = { at: 0, items: [] };
  var CASA_TTL = 4000;

  /* ------------------------------------------------------------------ dom */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function glyphSVG(kind) {
    var P = {
      house:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/></svg>',
      homekit:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 14.5h5v5h-5z"/></svg>',
      grid:
        '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
      film:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4"/></svg>',
      tv:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
      bulb:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.3 2.2h4.6c.2-.9.6-1.6 1.3-2.2A6 6 0 0 0 12 3z"/></svg>',
      snow:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M4 6l16 12M20 6 4 18M12 6l-2-2m2 2 2-2M12 18l-2 2m2-2 2 2"/></svg>',
      fan:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 1.5-5.5 4-6 1.8 2 .5 5-2.5 6M14 12c3 0 5.5 1.5 6 4-2 1.8-5 .5-6-2.5M12 14c0 3-1.5 5.5-4 6-1.8-2-.5-5 2.5-6M10 12c-3 0-5.5-1.5-6-4 2-1.8 5-.5 6 2.5"/></svg>',
      cam:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h3L9 4h6l1.5 2h3A2.5 2.5 0 0 1 22 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
      user:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>',
      check:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>',
      eye:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
      eyeoff:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.5 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A16.4 16.4 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.9"/></svg>',
      pin:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/></svg>',
      info:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/></svg>',
    };
    return P[kind] || P.grid;
  }

  function glyph(kind) {
    var s = el("span", "tvos-tile__glyph");
    s.innerHTML = glyphSVG(kind);
    return s;
  }

  function setOpen(name, on, enterCls) {
    var n = els[name];
    if (!n) return;
    n.setAttribute("data-open", on ? "true" : "false");
    if (on && enterCls) {
      n.classList.remove("tvos-enter-right", "tvos-enter-left", "tvos-enter-pop", "tvos-enter-fade");
      void n.offsetWidth;
      n.classList.add(enterCls);
    }
  }

  function build() {
    var shell = document.querySelector(".launcher-shell");
    if (!shell) return false;

    els.scrim = el("div", "tvos-scrim");
    els.scrim.setAttribute("data-open", "false");
    els.scrim.addEventListener("click", closeAll);

    els.sidebar = el("div", null);
    els.sidebar.id = "tvos-sidebar";
    els.sidebar.setAttribute("data-open", "false");

    els.ctx = el("div", null);
    els.ctx.id = "tvos-ctx";
    els.ctx.setAttribute("data-open", "false");

    els.profiles = el("div", null);
    els.profiles.id = "tvos-profiles";
    els.profiles.setAttribute("data-open", "false");

    els.casa = el("div", null);
    els.casa.id = "tvos-casa";
    els.casa.setAttribute("data-open", "false");
    els.casa.innerHTML =
      '<div class="tvos-panel">' +
      '  <div class="tvos-panel__head"><span class="tvos-panel__title"><span class="tvos-casa__icon"></span>Casa</span>' +
      '  <span class="tvos-panel__status"></span></div>' +
      '  <div class="tvos-panel__grid"></div>' +
      '  <div class="tvos-panel__foot">OK liga/desliga · ← → brilho · VERDE fecha</div>' +
      "</div>";

    els.alert = el("div", null);
    els.alert.id = "tvos-alert";
    els.alert.setAttribute("data-open", "false");
    els.alertScrim = el("div", "tvos-scrim tvos-scrim--alert");
    els.alertScrim.setAttribute("data-open", "false");

    shell.appendChild(els.scrim);
    shell.appendChild(els.sidebar);
    shell.appendChild(els.ctx);
    shell.appendChild(els.profiles);
    shell.appendChild(els.casa);
    shell.appendChild(els.alertScrim);
    shell.appendChild(els.alert);
    return true;
  }

  function highlight(list) {
    (list || tiles).forEach(function (t, i) {
      t.setAttribute("data-focused", i === focused ? "true" : "false");
    });
  }

  function closeAll() {
    clearInterval(camTimer);
    camTimer = null;
    ["sidebar", "ctx", "profiles", "casa", "alert"].forEach(function (k) {
      setOpen(k, false);
    });
    setOpen("scrim", false);
    setOpen("alertScrim", false);
    openPanel = null;
    tiles = [];
    focused = 0;
  }

  function anyOpen() {
    return !!openPanel;
  }

  /* --------------------------------------------------------------- sidebar */
  var SECTIONS = [
    { id: "apps", label: "Aplicativos", glyph: "grid" },
    { id: "live", label: "Canais ao vivo", glyph: "tv" },
    { id: "films", label: "Filmes", glyph: "film" },
    { id: "series", label: "Séries", glyph: "film" },
    { id: "casa", label: "Casa", glyph: "homekit" },
  ];

  function paintSidebar() {
    els.sidebar.innerHTML = "";
    tiles = [];
    var head = el("div", "tvos-side__head");
    head.appendChild(el("div", "tvos-side__title", "Início"));
    head.appendChild(el("div", "tvos-side__sub", activeProfile().name));
    els.sidebar.appendChild(head);
    SECTIONS.forEach(function (s) {
      var b = el("button", "tvos-side__item");
      b.type = "button";
      b.appendChild(glyph(s.glyph));
      b.appendChild(el("span", null, s.label));
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        activateSidebarSection(s.id);
      });
      els.sidebar.appendChild(b);
      tiles.push(b);
    });
    var sep = el("div", "tvos-side__sep");
    els.sidebar.appendChild(sep);
    var pb = el("button", "tvos-side__item");
    pb.type = "button";
    pb.appendChild(glyph("user"));
    pb.appendChild(el("span", null, "Trocar usuário"));
    pb.addEventListener("click", function (ev) {
      ev.preventDefault();
      openProfiles();
    });
    els.sidebar.appendChild(pb);
    tiles.push(pb);
    focused = 0;
    highlight();
  }

  function activateSidebarSection(id) {
    if (id === "live") {
      closeAll();
      haGet("/launch?app=com.webos.app.livetv").then(function (res) {
        if (!(res && res.ok)) toast("Canais ao vivo", "A TV recusou abrir", "tv");
      });
      return;
    }
    if ((id === "films" || id === "series") && window.__tvosJW && window.__tvosJW.open) {
      closeAll();
      window.__tvosJW.open(id === "films" ? "movie" : "tv");
      return;
    }
    if (id === "casa") {
      openCasa();
      return;
    }
    closeAll();
    jumpToSection(id);
  }

  function openSidebar() {
    closeAll();
    openPanel = "sidebar";
    paintSidebar();
    setOpen("scrim", true, "tvos-enter-fade");
    setOpen("sidebar", true, "tvos-enter-left");
  }

  /* Drive the bundle grid the way the remote does: focus its first tile of
     the section via synthetic arrows is fragile, so instead dispatch the
     section through the bundle's own tab buttons when present. */
  function jumpToSection(section) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    var hit = tabs.filter(function (t) {
      return (t.textContent || "").toLowerCase().indexOf(
        section === "live" ? "vivo" : section === "films" ? "filme" : section === "series" ? "série" : "aplicativo"
      ) >= 0;
    })[0];
    if (hit) {
      hit.click();
      hit.focus();
      return;
    }
    var fkey = document.querySelector('[data-fkey="' + section + ':0:0"]');
    if (fkey) {
      fkey.scrollIntoView({ block: "start" });
      var inner = fkey.querySelector("button, [tabindex]") || fkey;
      if (inner.focus) inner.focus();
    }
  }

  /* ---------------------------------------------------------- context menu */

  function bundleFocusedTile() {
    return (
      document.querySelector('[data-focused="true"]') ||
      document.querySelector('[data-fkey]:focus-within') ||
      document.activeElement
    );
  }

  function tileLabel(node) {
    if (!node || !node.textContent) return "Item";
    return node.textContent.trim().split("\n")[0].slice(0, 40) || "Item";
  }

  function openCtx() {
    var node = bundleFocusedTile();
    var label = tileLabel(node);
    closeAll();
    openPanel = "ctx";
    els.ctx.innerHTML = "";
    tiles = [];
    els.ctx.appendChild(el("div", "tvos-ctx__head", label));
    var actions = [
      { label: "Abrir", glyph: "check", fn: function () { closeAll(); } },
      { label: "Favoritar", glyph: "pin", fn: function () { toggleFavorite(node, true); closeAll(); } },
      { label: "Ocultar", glyph: "eyeoff", fn: function () { toggleHidden(node, true); closeAll(); } },
      { label: "Detalhes", glyph: "info", fn: function () { closeAll(); activate(node); } },
    ];
    actions.forEach(function (a, i) {
      if (i === 3) els.ctx.appendChild(el("div", "tvos-ctx__div"));
      var b = el("button", "tvos-ctx__btn");
      b.type = "button";
      b.appendChild(el("span", null, a.label));
      var g = el("span", null);
      g.innerHTML = glyphSVG(a.glyph);
      g.firstChild && b.appendChild(g.firstChild);
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        a.fn();
      });
      els.ctx.appendChild(b);
      tiles.push(b);
    });
    els.ctx.appendChild(el("div", "tvos-ctx__div"));
    positionCtx(node);
    focused = 0;
    highlight();
    setOpen("scrim", true, "tvos-enter-fade");
    setOpen("ctx", true, "tvos-enter-pop");
  }

  function positionCtx(node) {
    var r = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    els.ctx.style.left = "460px";
    els.ctx.style.top = "200px";
    if (r && r.width) {
      var x = Math.min(1920 - 460 - 40, Math.max(440, Math.round(r.left + r.width + 24)));
      var y = Math.min(1080 - 420, Math.max(60, Math.round(r.top - 40)));
      els.ctx.style.left = x + "px";
      els.ctx.style.top = y + "px";
    }
  }

  function appIdOf(node) {
    if (!node) return null;
    var q = node.querySelector && node.querySelector("[data-app-id]");
    if (q) return q.getAttribute("data-app-id");
    var fk = node.getAttribute && node.getAttribute("data-fkey");
    return fk || null;
  }

  function toggleFavorite(node, on) {
    try {
      var key = "at4k-app-order-v2";
      var raw = localStorage.getItem(key);
      var order = raw ? JSON.parse(raw) : [];
      var id = appIdOf(node);
      if (id && order.indexOf(id) < 0) {
        order.unshift(id);
        localStorage.setItem(key, JSON.stringify(order));
      }
    } catch (e) {}
  }

  function toggleHidden(node, hide) {
    try {
      var key = "at4k-hidden-v2";
      var raw = localStorage.getItem(key);
      var set = new Set(raw ? JSON.parse(raw) : []);
      var id = appIdOf(node);
      if (!id) return;
      if (hide) set.add(id);
      else set.delete(id);
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  function activate(node) {
    if (!node) return;
    var b = node.querySelector ? node.querySelector("button") : null;
    (b || node).click();
  }

  /* -------------------------------------------------------------- profiles */

  function activeProfile() {
    var id = null;
    try {
      id = localStorage.getItem(PROFILE_KEY);
    } catch (e) {}
    return (
      PROFILES.filter(function (p) {
        return p.id === id;
      })[0] || PROFILES[0]
    );
  }

  function setProfile(id) {
    try {
      localStorage.setItem(PROFILE_KEY, id);
    } catch (e) {}
  }

  function paintProfiles() {
    els.profiles.innerHTML = "";
    tiles = [];
    var head = el("div", "tvos-panel__head");
    head.appendChild(el("span", "tvos-panel__title", "Quem está assistindo?"));
    head.appendChild(el("span", "tvos-panel__status", activeProfile().name));
    els.profiles.appendChild(head);
    var grid = el("div", "tvos-prof__grid");
    var active = activeProfile().id;
    PROFILES.forEach(function (p) {
      var b = el("button", "tvos-prof");
      b.type = "button";
      b.setAttribute("data-active", p.id === active ? "true" : "false");
      b.appendChild(el("div", "tvos-prof__avatar", p.name.charAt(0)));
      b.appendChild(el("div", "tvos-prof__name", p.name));
      b.appendChild(el("div", "tvos-prof__cap", p.cap));
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        setProfile(p.id);
        closeAll();
      });
      grid.appendChild(b);
      tiles.push(b);
    });
    els.profiles.appendChild(grid);
    var foot = el("div", "tvos-panel__foot", "OK troca · VERDE fecha");
    els.profiles.appendChild(foot);
    focused = 0;
    highlight();
  }

  function openProfiles() {
    closeAll();
    openPanel = "profiles";
    paintProfiles();
    setOpen("scrim", true, "tvos-enter-fade");
    setOpen("profiles", true, "tvos-enter-right");
  }

  /* ------------------------------------------------------------------ Casa */

  function casaGrid() {
    return els.casa.querySelector(".tvos-panel__grid");
  }

  function casaStatus() {
    return els.casa.querySelector(".tvos-panel__status");
  }

  function haGet(path) {
    return fetch(HELPER + path, { cache: "no-store" }).then(function (r) {
      return r.json();
    });
  }

  function haPost(body) {
    return fetch(HELPER + "/ha/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json();
    });
  }

  function haValue(e) {
    if (e.domain === "camera") return e.state === "idle" ? "Ao vivo" : e.state;
    if (e.domain === "light") return e.state === "on" ? "Acesa" : e.state === "off" ? "Apagada" : e.state;
    if (e.domain === "climate") {
      if (e.state === "off") return "Desligado";
      var t = e.temperature !== undefined ? Math.round(e.temperature) + "°" : "";
      return (e.state === "cool" ? "Frio " : e.state === "auto" ? "Auto " : e.state + " ") + t;
    }
    if (e.domain === "fan") return e.state === "on" ? (e.percentage !== undefined ? e.percentage + "%" : "Ligado") : "Desligado";
    if (e.domain === "media_player") {
      if (e.media_title) return String(e.media_title).slice(0, 24);
      return e.state === "playing" ? "Tocando" : e.state;
    }
    if (e.domain === "person") return e.state === "home" ? "Em casa" : "Fora";
    return e.state;
  }

  function haGlyph(e) {
    if (e.domain === "camera") return "cam";
    if (e.domain === "light") return "bulb";
    if (e.domain === "climate") return "snow";
    if (e.domain === "fan") return "fan";
    if (e.domain === "media_player") return "tv";
    if (e.domain === "person") return "user";
    return "grid";
  }

  function haWritable(e) {
    return e.domain === "light" || e.domain === "fan" || e.domain === "climate";
  }

  function paintCasa(items, loading) {
    var grid = casaGrid();
    grid.innerHTML = "";
    tiles = [];
    var cam = null;
    items.forEach(function (e) {
      if (e.domain === "camera" && !cam) {
        cam = e;
        return;
      }
      grid.appendChild(regularTile(e, loading));
    });
    if (cam) grid.insertBefore(cameraTile(cam, loading), grid.firstChild);
    focused = Math.min(focused, Math.max(0, tiles.length - 1));
    highlight();
  }

  function regularTile(e, loading) {
    var b = el("button", "tvos-tile" + (loading ? " tvos-loading" : ""));
    b.type = "button";
    b.setAttribute("data-ha-state", e.state || "");
    if (!haWritable(e)) b.setAttribute("data-ha-ro", "true");
    var dot = el("span", "tvos-tile__dot");
    b.appendChild(dot);
    b.appendChild(glyph(haGlyph(e)));
    b.appendChild(el("span", "tvos-tile__label", e.label));
    b.appendChild(el("span", "tvos-tile__value", haValue(e)));
    b.appendChild(el("span", "tvos-tile__hint", haWritable(e) ? "OK alterna" : "somente leitura"));
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      toggleHA(e);
    });
    tiles.push(b);
    return b;
  }

  function cameraTile(e, loading) {
    var b = el("button", "tvos-tile tvos-tile--cam" + (loading ? " tvos-loading" : ""));
    b.type = "button";
    b.setAttribute("data-ha-state", e.state || "");
    b.setAttribute("data-ha-ro", "true");
    var img = el("img", "tvos-cam__img");
    img.alt = "";
    img.src = HELPER + "/ha/camera?t=" + Date.now();
    b.appendChild(img);
    var body = el("div", "tvos-cam__body");
    var row = el("div", "tvos-cam__row");
    row.appendChild(glyph("cam"));
    row.appendChild(el("span", "tvos-tile__label", e.label || "Câmera"));
    var dot = el("span", "tvos-tile__dot");
    row.appendChild(dot);
    body.appendChild(row);
    body.appendChild(el("span", "tvos-tile__value", "OK amplia · ← → nada"));
    body.appendChild(el("span", "tvos-tile__hint", "OK amplia · VOLTA fecha"));
    b.appendChild(body);
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      openCamViewer(e);
    });
    tiles.push(b);
    return b;
  }


  function openCasa() {
    closeAll();
    openPanel = "sidebar+casa";
    setOpen("sidebar", true);
    focused = 0;
    var icon = els.casa.querySelector(".tvos-casa__icon");
    if (icon && !icon.innerHTML) icon.innerHTML = glyphSVG("homekit");
    paintCasa(casaCache.items.length ? casaCache.items : [{ label: "Carregando…", state: "", domain: "light" }], true);
    setOpen("casa", true, "tvos-enter-right");
    refreshCasa();
  }

  function refreshCasa() {
    var now = Date.now();
    if (casaCache.items.length && now - casaCache.at < CASA_TTL) {
      paintCasa(casaCache.items, false);
      return;
    }
    casaStatus().textContent = "";
    haGet("/ha/snapshot")
      .then(function (res) {
        if (openPanel !== "sidebar+casa" && openPanel !== "casa") return;
        if (res && res.ok && res.entities) {
          casaCache = { at: Date.now(), items: res.entities };
          paintCasa(res.entities, false);
        } else {
          casaStatus().textContent = "Casa indisponível";
          paintCasa([], false);
        }
      })
      .catch(function () {
        if (openPanel !== "sidebar+casa" && openPanel !== "casa") return;
        casaStatus().textContent = "Casa indisponível";
        paintCasa([], false);
      });
  }

  function toggleHA(e) {
    if (!haWritable(e)) return;
    var body;
    if (e.domain === "light") body = { domain: "light", service: "toggle", entity_id: e.id };
    else if (e.domain === "fan") body = { domain: "fan", service: "toggle", entity_id: e.id };
    else if (e.domain === "climate")
      body = {
        domain: "climate",
        service: "set_hvac_mode",
        entity_id: e.id,
        data: { hvac_mode: e.state === "off" ? "cool" : "off" },
      };
    else return;
    casaStatus().textContent = "Enviando…";
    haPost(body)
      .then(function (res) {
        casaCache.at = 0; // state changed server-side: bypass TTL
        if (res && (res.ok || (res.data && res.data.length !== undefined))) {
          setTimeout(refreshCasa, 700);
        } else {
          casaStatus().textContent = "A casa recusou";
          setTimeout(refreshCasa, 1200);
        }
      })
      .catch(function () {
        casaStatus().textContent = "A casa recusou";
      });
  }

  function nudgeHA(delta) {
    var t = tiles[focused];
    if (!t || (openPanel !== "sidebar+casa" && openPanel !== "casa")) return false;
    var e = casaCache.items[focused];
    if (!e) return false;
    if (e.domain === "light" && e.brightness !== undefined && e.brightness !== null) {
      var pct = Math.round(((e.brightness || 0) / 255) * 100) + delta * 10;
      pct = Math.max(1, Math.min(100, pct));
      haPost({ domain: "light", service: "turn_on", entity_id: e.id, data: { brightness_pct: pct } }).then(function () {
        casaCache.at = 0;
        setTimeout(refreshCasa, 700);
      });
      return true;
    }
    if (e.domain === "fan") {
      var p = (e.percentage || 0) + delta * 20;
      p = Math.max(0, Math.min(100, p));
      haPost({ domain: "fan", service: "set_percentage", entity_id: e.id, data: { percentage: p } }).then(function () {
        casaCache.at = 0;
        setTimeout(refreshCasa, 700);
      });
      return true;
    }
    if (e.domain === "climate") {
      var temp = (e.temperature || 24) + delta;
      temp = Math.max(16, Math.min(30, temp));
      haPost({ domain: "climate", service: "set_temperature", entity_id: e.id, data: { temperature: temp } }).then(function () {
        casaCache.at = 0;
        setTimeout(refreshCasa, 700);
      });
      return true;
    }
    return false;
  }

  /* ----------------------------------------------------------------- alert */

  var alertFocus = 0;
  var alertBtns = [];

  function confirmDlg(title, msg, buttons) {
    closeAll();
    openPanel = "alert";
    els.alert.innerHTML = "";
    var card = el("div", "tvos-alert__card tvos-enter-pop");
    card.appendChild(el("div", "tvos-alert__title", title));
    card.appendChild(el("div", "tvos-alert__msg", msg));
    var box = el("div", "tvos-alert__btns");
    alertBtns = [];
    buttons.forEach(function (b, i) {
      var btn = el("button", "tvos-alert__btn" + (b.danger ? " tvos-alert__btn--danger" : ""));
      btn.type = "button";
      btn.textContent = b.label;
      btn.setAttribute("data-focused", i === 0 ? "true" : "false");
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        closeAll();
        b.fn && b.fn();
      });
      box.appendChild(btn);
      alertBtns.push(btn);
    });
    card.appendChild(box);
    els.alert.appendChild(card);
    alertFocus = 0;
    tiles = alertBtns;
    focused = 0;
    setOpen("alertScrim", true, "tvos-enter-fade");
    setOpen("alert", true);
    window.__tvosAlert = closeAll;
  }

  /* ------------------------------------------------- camera viewer + toast */

  var camTimer = null;
  var toastTimer = null;
  var lastEventSeen = {};

  function openCamViewer(e) {
    closeAll();
    openPanel = "camview";
    els.alert.innerHTML = "";
    var card = el("div", "tvos-alert__card tvos-enter-pop tvos-camview");
    var title = el("div", "tvos-alert__title", e.label || "Câmera");
    card.appendChild(title);
    var img = el("img", "tvos-camview__img");
    img.alt = "";
    img.src = HELPER + "/ha/camera?t=" + Date.now();
    card.appendChild(img);
    card.appendChild(el("div", "tvos-alert__msg", "imagem ao vivo · atualiza a cada 6s · Back fecha"));
    els.alert.appendChild(card);
    setOpen("alertScrim", true, "tvos-enter-fade");
    setOpen("alert", true);
    camTimer = setInterval(function () {
      var cur = els.alert.querySelector(".tvos-camview__img");
      if (cur) cur.src = HELPER + "/ha/camera?t=" + Date.now();
    }, 6000);
  }

  function closeCamViewer() {
    if (camTimer) {
      clearInterval(camTimer);
      camTimer = null;
    }
    closeAll();
  }

  function toast(title, msg, glyphKind) {
    if (!els.toast) {
      els.toast = el("div", null);
      els.toast.id = "tvos-toast";
      els.toast.setAttribute("data-open", "false");
      document.querySelector(".launcher-shell").appendChild(els.toast);
    }
    els.toast.innerHTML = "";
    var g = el("span", "tvos-toast__glyph");
    g.innerHTML = glyphSVG(glyphKind || "cam");
    els.toast.appendChild(g);
    var box = el("div", null);
    box.appendChild(el("div", "tvos-toast__title", title));
    box.appendChild(el("div", "tvos-toast__msg", msg));
    els.toast.appendChild(box);
    setOpen("toast", true, "tvos-enter-fade");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      setOpen("toast", false);
    }, 6000);
  }

  function pollEvents() {
    haGet("/ha/events")
      .then(function (res) {
        if (!res || !res.ok || !res.events) return;
        var fired = res.events.filter(function (ev) {
          return ev.state === "on";
        });
        fired.forEach(function (ev) {
          if (lastEventSeen[ev.id] === ev.last_changed) return;
          lastEventSeen[ev.id] = ev.last_changed;
          var isPerson = ev.id.indexOf("person_detection") >= 0;
          toast(
            isPerson ? "Pessoa detectada" : "Movimento detectado",
            "Câmera da entrada · " + (ev.last_changed || "").slice(11, 19),
            "cam"
          );
        });
      })
      .catch(function () {});
  }

  setInterval(pollEvents, 5000);


  function isTypingTarget(ev) {
    var t = ev.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  function move(delta, cols) {
    focused = Math.min(tiles.length - 1, Math.max(0, focused + delta * (cols || 1)));
    highlight();
  }

  function onKey(event) {
    if (isTypingTarget(event)) return;
    var code = event.keyCode || event.which;
    var key = event.key || "";

    if (!anyOpen()) {
      if (code === BLUE) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openSidebar();
      } else if (code === YELLOW) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCtx();
      } else if (code === RED) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openProfiles();
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (code === BACK || key === "Escape" || key === "Backspace") {
      if (openPanel === "camview") { closeCamViewer(); return; }
      if (openPanel === "sidebar+casa") { openSidebar(); return; }
      if (openPanel === "casa" || openPanel === "alert") closeAll();
      else if (openPanel === "ctx" || openPanel === "profiles") openSidebar();
      else closeAll();
      return;
    }

    /* Casa: left/right on a dimmable light, fan or climate adjusts it. */
    if ((openPanel === "casa" || openPanel === "sidebar+casa") && (code === 37 || code === 39)) {
      if (nudgeHA(code === 39 ? 1 : -1)) return;
    }

    if (openPanel === "profiles") {
      if (code === 40) move(2, 1);
      else if (code === 38) move(-2, 1);
      else if (code === 39) move(1, 1);
      else if (code === 37) move(-1, 1);
      else if (code === ENTER) {
        tiles[focused] && tiles[focused].click();
        return;
      } else return;
      return;
    }

    if (code === 40) move(1, openPanel === "casa" || openPanel === "sidebar+casa" ? 3 : 1);
    else if (code === 38) move(-1, openPanel === "casa" || openPanel === "sidebar+casa" ? 3 : 1);
    else if (code === 39) move(1, 1);
    else if (code === 37) move(-1, 1);
    else if (code === ENTER) {
      if (openPanel === "sidebar") {
        if (focused < SECTIONS.length) {
          activateSidebarSection(SECTIONS[focused].id);
          return;
        }
        tiles[focused] && tiles[focused].click();
        return;
      }
      tiles[focused] && tiles[focused].click();
      return;
    } else if (code === BLUE && openPanel !== "sidebar") {
      openSidebar();
      return;
    } else if (code === RED && openPanel !== "profiles") {
      openProfiles();
      return;
    } else if (code === YELLOW && openPanel !== "ctx") {
      openCtx();
      return;
    } else return;
  }

  function start() {
    if (!document.querySelector(".launcher-shell")) return void setTimeout(start, 400);
    if (document.getElementById("tvos-sidebar")) return;
    if (!build()) return void setTimeout(start, 400);
    document.addEventListener("keydown", onKey, true);
  }

  start();
  window.__tvosPanels = {
    v: "1.4-casa875",
    sidebar: openSidebar,
    ctx: openCtx,
    profiles: openProfiles,
    casa: openCasa,
    cam: openCamViewer,
    toast: toast,
    events: pollEvents,
    confirm: confirmDlg,
    close: closeAll,
    profile: activeProfile,
    setProfile: setProfile,
  };
})();
