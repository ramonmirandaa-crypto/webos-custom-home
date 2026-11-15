/* ============================================================================
   tvOS JustWatch — "onde assistir" for the sidebar Filmes / Séries items.

   Third runtime overlay for br.com.customhome.lite. The bundle declares
   live/films/series sections but never renders them, so Filmes/Séries open
   this search instead (see the films/series seam in tvos-panels.js
   activateSidebarSection, which keeps its old behaviour when this file is
   absent).

   Conventions (same as tvos-panels.js):
     arrows move, OK activates, VOLTA walks back (detail -> search ->
     sidebar). Color keys are NOT handled here: BLUE/YELLOW/RED/GREEN keep
     switching to their panels, and a MutationObserver closes this sheet
     when any of them opens. Nothing fetches on boot or on focus — only
     on typed search / opened detail, through the tv-helper bridge
     (GET /jw/search, GET /jw/title), which owns the TMDB key and caches.
   ========================================================================== */
(function () {
  "use strict";

  var HELPER = "http://192.168.0.77:8108";
  var IMG = "https://image.tmdb.org/t/p/";
  var ENTER = 13;
  var BACK = 461;

  /* Launchable mapping comes from the server (PROV_APP in tv-helper.py);
     providers without an installed app carry app:null and render display-only. */
  var CATLABEL = {
    flatrate: "Assinatura",
    free: "Grátis",
    ads: "Com anúncios",
    rent: "Aluguel",
    buy: "Compra",
  };
  var CATS = ["flatrate", "free", "ads", "rent", "buy"];

  var KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
  var SEARCH_DEBOUNCE = 400;

  var jwOpen = false;
  var scope = "movie"; // "movie" | "tv"
  var view = "search"; // "search" | "detail"
  var query = "";
  var rows = [];
  var detail = null;
  var lastKb = 0;
  var zone = "keys"; // search: "keys" | "rows"; detail: "chips"
  var focused = 0;
  var els = {};
  var searchTimer = null;
  var reqSeq = 0;

  /* ------------------------------------------------------------------ dom */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function setOpen(on) {
    els.root.setAttribute("data-open", on ? "true" : "false");
  }

  function scopeTitle() {
    return scope === "movie" ? "Filmes" : "Séries";
  }

  function statusLine(msg) {
    var s = els.root.querySelector(".tvos-panel__status");
    if (s) s.textContent = msg;
  }

  function build() {
    var shell = document.querySelector(".launcher-shell");
    if (!shell) return false;
    els.root = el("div", null);
    els.root.id = "tvos-jw";
    els.root.setAttribute("data-open", "false");
    shell.appendChild(els.root);
    return true;
  }

  function focusables() {
    if (view === "detail") return chips();
    return zone === "keys" ? keyBtns() : rowBtns();
  }

  function keyBtns() {
    return Array.prototype.slice.call(els.root.querySelectorAll(".tvos-jw__key"));
  }

  function rowBtns() {
    return Array.prototype.slice.call(els.root.querySelectorAll(".tvos-jw__row"));
  }

  function chips() {
    return Array.prototype.slice.call(els.root.querySelectorAll(".tvos-jw__chip[data-go='true']"));
  }

  function highlight() {
    var list = focusables();
    list.forEach(function (b, i) {
      b.setAttribute("data-focused", i === focused ? "true" : "false");
    });
  }

  /* ---------------------------------------------------------------- search */

  function paintShell() {
    els.root.innerHTML = "";
    var panel = el("div", "tvos-panel");
    var head = el("div", "tvos-panel__head");
    head.appendChild(el("span", "tvos-panel__title", scopeTitle()));
    head.appendChild(el("span", "tvos-panel__status", ""));
    panel.appendChild(head);
    els.body = el("div", null);
    panel.appendChild(els.body);
    panel.appendChild(el("div", "tvos-panel__foot", "OK seleciona · VOLTA volta"));
    els.root.appendChild(panel);
  }

  function paintSearch() {
    els.body.innerHTML = "";
    var q = el("div", "tvos-jw__query" + (query ? "" : " tvos-jw__query--empty"));
    if (query) {
      q.textContent = query;
      var caret = el("span", "tvos-jw__caret", "▌");
      q.appendChild(caret);
    } else {
      q.textContent = "Digite o título…";
    }
    els.body.appendChild(q);

    var grid = el("div", "tvos-jw__keys");
    KEYS.forEach(function (k) {
      var b = el("button", "tvos-jw__key", k);
      b.type = "button";
      b.setAttribute("data-k", k);
      grid.appendChild(b);
    });
    var sp = el("button", "tvos-jw__key tvos-jw__key--wide", "ESPAÇO");
    sp.type = "button";
    sp.setAttribute("data-k", " ");
    grid.appendChild(sp);
    var bk = el("button", "tvos-jw__key", "⌫");
    bk.type = "button";
    bk.setAttribute("data-k", "\b");
    grid.appendChild(bk);
    var cl = el("button", "tvos-jw__key", "✕");
    cl.type = "button";
    cl.setAttribute("data-k", "\u0000");
    grid.appendChild(cl);
    els.body.appendChild(grid);

    els.rowsBox = el("div", "tvos-jw__rows");
    els.body.appendChild(els.rowsBox);
    paintRows();
    if (zone === "rows" && rows.length) focused = Math.min(focused, rows.length - 1);
    else { zone = "keys"; focused = Math.min(lastKb, KEYS.length + 2); }
    highlight();
  }

  function paintRows() {
    els.rowsBox.innerHTML = "";
    rows.forEach(function (r) {
      var b = el("button", "tvos-jw__row" + (r.poster ? "" : " tvos-jw__row--blank"));
      b.type = "button";
      var img = document.createElement("img");
      img.alt = "";
      if (r.poster) img.src = IMG + "w185" + r.poster;
      b.appendChild(img);
      var box = el("div", null);
      box.appendChild(el("b", null, r.title));
      box.appendChild(el("span", null, (r.year || "—") + " · ver onde assistir"));
      b.appendChild(box);
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        openDetail(r.type, r.id);
      });
      els.rowsBox.appendChild(b);
    });
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    if (query.length < 2) {
      rows = [];
      if (view === "search" && els.rowsBox) {
        paintRows();
        statusLine("Digite ao menos 2 letras");
      }
      return;
    }
    statusLine("Buscando…");
    searchTimer = setTimeout(doSearch, SEARCH_DEBOUNCE);
  }

  function doSearch() {
    var my = ++reqSeq;
    var url = HELPER + "/jw/search?q=" + encodeURIComponent(query);
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (my !== reqSeq || !jwOpen || view !== "search") return;
        if (!res || !res.ok) {
          statusLine("Sem conexão — tente de novo");
          return;
        }
        rows = res.results || [];
        paintRows();
        if (zone === "rows") focused = Math.min(focused, Math.max(0, rows.length - 1));
        highlight();
        statusLine(rows.length ? rows.length + " resultado" + (rows.length > 1 ? "s" : "") : "Nada encontrado");
      })
      .catch(function () {
        if (my !== reqSeq || !jwOpen || view !== "search") return;
        statusLine("Sem conexão — tente de novo");
      });
  }

  function pressKey(k) {
    if (k === "\u0000") query = "";
    else if (k === "\b") query = query.slice(0, -1);
    else if (query.length < 60) query += k;
    paintSearch();
    scheduleSearch();
  }

  /* ---------------------------------------------------------------- detail */

  function openDetail(type, id) {
    view = "detail";
    detail = null;
    paintShell();
    els.body.innerHTML = "";
    var loading = el("div", "tvos-jw__overview tvos-loading", "Carregando…");
    els.body.appendChild(loading);
    statusLine("");
    var my = ++reqSeq;
    fetch(HELPER + "/jw/title?type=" + type + "&id=" + id, { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (my !== reqSeq || !jwOpen || view !== "detail") return;
        if (!res || !res.ok) {
          els.body.innerHTML = "";
          els.body.appendChild(el("div", "tvos-jw__overview", "Sem conexão — VOLTA e tente de novo."));
          return;
        }
        detail = res;
        paintDetail();
      })
      .catch(function () {
        if (my !== reqSeq || !jwOpen || view !== "detail") return;
        els.body.innerHTML = "";
        els.body.appendChild(el("div", "tvos-jw__overview", "Sem conexão — VOLTA e tente de novo."));
      });
  }

  function paintDetail() {
    var t = detail.title || {};
    els.body.innerHTML = "";
    var wrap = el("div", "tvos-jw__detail");
    var img = document.createElement("img");
    img.alt = "";
    if (t.poster) img.src = IMG + "w342" + t.poster;
    wrap.appendChild(img);
    var meta = el("div", null);
    meta.appendChild(el("h3", null, t.title || ""));
    meta.appendChild(el("div", "tvos-jw__year", t.year || ""));
    if (t.overview) meta.appendChild(el("div", "tvos-jw__overview", t.overview));
    wrap.appendChild(meta);
    els.body.appendChild(wrap);

    var br = detail.br || {};
    var any = false;
    CATS.forEach(function (c) {
      var list = br[c];
      if (!list || !list.length) return;
      any = true;
      els.body.appendChild(el("div", "tvos-jw__cat", CATLABEL[c]));
      list.forEach(function (p) {
        var appId = p.app || null;
        var b = el("button", "tvos-jw__chip" + (appId ? "" : " tvos-jw__chip--ro"));
        b.type = "button";
        b.setAttribute("data-go", appId ? "true" : "false");
        if (appId) b.setAttribute("data-app", appId);
        var logo = document.createElement("img");
        logo.alt = "";
        if (p.logo) logo.src = IMG + "w92" + p.logo;
        b.appendChild(logo);
        b.appendChild(el("span", null, p.name));
        if (appId) {
          b.appendChild(el("em", null, "abrir"));
          b.addEventListener("click", function (ev) {
            ev.preventDefault();
            launchApp(appId);
          });
        }
        els.body.appendChild(b);
      });
    });
    if (!any) {
      els.body.appendChild(el("div", "tvos-jw__overview", "Sem oferta no Brasil no momento."));
    }
    els.body.appendChild(el("div", "tvos-jw__attr", "Dados JustWatch via TMDB"));
    var headTitle = els.root.querySelector(".tvos-panel__title");
    if (headTitle) headTitle.textContent = t.title || scopeTitle();
    zone = "chips";
    focused = 0;
    highlight();
  }

  function launchApp(appId) {
    statusLine("Abrindo…");
    fetch(HELPER + "/launch?app=" + encodeURIComponent(appId), { cache: "no-store" })
      .then(function () {
        close();
      })
      .catch(function () {
        close();
      });
  }

  /* ------------------------------------------------------------ open/close */

  function open(kind) {
    scope = kind === "tv" ? "tv" : "movie";
    if (!els.root && !build()) return;
    clearTimeout(searchTimer);
    reqSeq++;
    view = "search";
    query = "";
    rows = [];
    detail = null;
    zone = "keys";
    focused = 0;
    lastKb = 0;
    paintShell();
    paintSearch();
    statusLine("Digite ao menos 2 letras");
    jwOpen = true;
    setOpen(true);
  }

  function close() {
    clearTimeout(searchTimer);
    reqSeq++;
    jwOpen = false;
    if (els.root) setOpen(false);
  }

  function sidebar() {
    if (window.__tvosPanels && window.__tvosPanels.sidebar) {
      window.__tvosPanels.sidebar();
    }
  }

  /* ----------------------------------------------------------------- keys */

  function move(dRows, dCols) {
    if (view === "detail") {
      var n = chips().length;
      focused = Math.min(n - 1, Math.max(0, focused + dRows));
      highlight();
      return;
    }
    if (zone === "keys") {
      var total = KEYS.length + 3;
      var next = focused + dRows * 6 + dCols;
      if (dRows > 0 && next > total - 1) {
        if (rows.length) {
          lastKb = focused;
          zone = "rows";
          focused = 0;
        } else {
          focused = total - 1;
        }
      } else {
        focused = Math.min(total - 1, Math.max(0, next));
      }
    } else {
      var m = rows.length;
      var r = focused + dRows;
      if (r < 0) {
        zone = "keys";
        focused = lastKb;
      } else {
        focused = Math.min(m - 1, Math.max(0, r));
      }
    }
    highlight();
  }

  function onKey(event) {
    if (!jwOpen) return;
    var code = event.keyCode || event.which;
    var key = event.key || "";
    if (code >= 37 && code <= 40) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (code === 40) move(1, 0);
      else if (code === 38) move(-1, 0);
      else if (code === 39) move(0, 1);
      else move(0, -1);
      return;
    }
    if (code === ENTER) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var list = focusables();
      if (view === "search" && zone === "keys") {
        lastKb = focused;
        var kb = keyBtns()[focused];
        if (kb) pressKey(kb.getAttribute("data-k"));
        return;
      }
      if (list[focused]) list[focused].click();
      return;
    }
    if (code === BACK || key === "Escape" || key === "Backspace") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (view === "detail") {
        reqSeq++;
        view = "search";
        zone = rows.length ? "rows" : "keys";
        focused = zone === "rows" ? 0 : lastKb;
        paintShell();
        paintSearch();
        statusLine(rows.length ? rows.length + " resultado" + (rows.length > 1 ? "s" : "") : "Digite ao menos 2 letras");
      } else {
        close();
        sidebar();
      }
      return;
    }
  }

  /* Close when any sibling panel takes over (color keys keep switching). */
  function siblingOpen() {
    var ids = ["tvos-sidebar", "tvos-ctx", "tvos-profiles", "tvos-casa", "tvos-alert"];
    for (var i = 0; i < ids.length; i++) {
      var n = document.getElementById(ids[i]);
      if (n && n.getAttribute("data-open") === "true") return true;
    }
    var c = document.getElementById("tvos-controls");
    if (c && !c.hasAttribute("hidden")) return true;
    return false;
  }

  function watchSiblings() {
    var obs = new MutationObserver(function (muts) {
      if (!jwOpen) return;
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (t && t.id === "tvos-jw") continue;
        if (siblingOpen()) {
          close();
          return;
        }
      }
    });
    obs.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-open", "hidden"],
    });
  }

  function start() {
    if (!document.querySelector(".launcher-shell")) return void setTimeout(start, 400);
    document.addEventListener("keydown", onKey, true);
    watchSiblings();
  }

  start();
  window.__tvosJW = {
    v: "1.1-map",
    open: open,
    close: close,
    isOpen: function () {
      return jwOpen;
    },
  };
})();
