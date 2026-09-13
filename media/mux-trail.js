// Mux Trail — a tiny, dependency-free waiting game for the embedded DSH UI.
//
// The factory exports a pure game engine under CommonJS for deterministic
// node:test coverage. In a browser it installs one lazy DOM controller at
// window.__DSH_MUX_TRAIL__; the transport bridge drives only beginWait/endWait.
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    try {
      var bridge = root.__DSH_BRIDGE__ || {};
      root.__DSH_MUX_TRAIL__ = api.install(root, bridge.muxTrail || {});
    } catch (error) {
      // The easter egg is strictly optional: never let it break the DSH page.
      if (root.console && typeof root.console.error === "function") {
        root.console.error("[dsh-mux-trail] failed to install", error);
      }
    }
  }
})(typeof window !== "undefined" ? window : undefined, function () {
  "use strict";

  var DEFAULT_COLUMNS = 18;
  var DEFAULT_ROWS = 18;
  var OFFER_DELAY_MS = 3000;
  var DIRECTIONS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    W: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    S: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    A: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
    D: { x: 1, y: 0 },
  };

  function cellKey(cell) {
    return cell.x + ":" + cell.y;
  }

  function boundedRandomIndex(random, length) {
    if (length <= 0) return -1;
    var value;
    try {
      value = Number(random());
    } catch (_error) {
      value = 0;
    }
    if (!Number.isFinite(value)) value = 0;
    value = Math.max(0, Math.min(0.999999999, value));
    return Math.floor(value * length);
  }

  function spawnPacket(trail, columns, rows, random) {
    var occupied = new Set(trail.map(cellKey));
    var free = [];
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < columns; x++) {
        if (!occupied.has(x + ":" + y)) free.push({ x: x, y: y });
      }
    }
    var index = boundedRandomIndex(random, free.length);
    return index === -1 ? null : free[index];
  }

  function createGame(random, columns, rows) {
    var cols = Math.max(6, Math.floor(columns || DEFAULT_COLUMNS));
    var rowCount = Math.max(6, Math.floor(rows || DEFAULT_ROWS));
    var headX = Math.floor(cols / 2);
    var headY = Math.floor(rowCount / 2);
    var trail = [
      { x: headX, y: headY },
      { x: headX - 1, y: headY },
      { x: headX - 2, y: headY },
    ];
    return {
      columns: cols,
      rows: rowCount,
      trail: trail,
      packet: spawnPacket(trail, cols, rowCount, random),
      direction: { x: 1, y: 0 },
      pendingDirection: null,
      turnQueued: false,
      started: false,
      over: false,
      won: false,
      score: 0,
    };
  }

  function sameCell(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y;
  }

  function queueDirection(game, direction) {
    if (!game || game.over || !direction || game.turnQueued) return false;
    var current = game.direction;
    if (current.x + direction.x === 0 && current.y + direction.y === 0) {
      return false;
    }
    game.pendingDirection = { x: direction.x, y: direction.y };
    game.turnQueued = true;
    game.started = true;
    return true;
  }

  function stepGame(game, random) {
    if (!game || game.over || !game.started) return game;
    if (game.pendingDirection) game.direction = game.pendingDirection;
    game.pendingDirection = null;
    game.turnQueued = false;

    var head = game.trail[0];
    var next = {
      x: (head.x + game.direction.x + game.columns) % game.columns,
      y: (head.y + game.direction.y + game.rows) % game.rows,
    };
    var grows = sameCell(next, game.packet);
    // Moving into the tail cell is legal when it vacates on this tick.
    var collisionLength = grows ? game.trail.length : game.trail.length - 1;
    for (var i = 0; i < collisionLength; i++) {
      if (sameCell(next, game.trail[i])) {
        game.over = true;
        return game;
      }
    }

    game.trail.unshift(next);
    if (grows) {
      game.score += 1;
      game.packet = spawnPacket(game.trail, game.columns, game.rows, random);
      if (!game.packet) {
        game.won = true;
        game.over = true;
      }
    } else {
      game.trail.pop();
    }
    return game;
  }

  function speedForScore(score) {
    return Math.max(70, 150 - Math.floor(Math.max(0, score) / 3) * 10);
  }

  function snapshotGame(game) {
    if (!game || game.over) return null;
    return {
      columns: game.columns,
      rows: game.rows,
      trail: game.trail.map(function (cell) { return { x: cell.x, y: cell.y }; }),
      packet: game.packet ? { x: game.packet.x, y: game.packet.y } : null,
      direction: { x: game.direction.x, y: game.direction.y },
      pendingDirection: game.pendingDirection
        ? { x: game.pendingDirection.x, y: game.pendingDirection.y }
        : null,
      turnQueued: !!game.turnQueued,
      started: !!game.started,
      over: false,
      won: false,
      score: game.score,
    };
  }

  function restoreGame(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || snapshot.over) return null;
    var columns = Number(snapshot.columns);
    var rows = Number(snapshot.rows);
    var score = Number(snapshot.score);
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 6 || rows < 6 || columns > 64 || rows > 64) return null;
    if (!Number.isInteger(score) || score < 0 || score > columns * rows) return null;
    if (!Array.isArray(snapshot.trail) || snapshot.trail.length < 1 || snapshot.trail.length > columns * rows) return null;

    function validCell(cell) {
      return cell && Number.isInteger(cell.x) && Number.isInteger(cell.y)
        && cell.x >= 0 && cell.x < columns && cell.y >= 0 && cell.y < rows;
    }
    function validDirection(direction) {
      return direction && Number.isInteger(direction.x) && Number.isInteger(direction.y)
        && Math.abs(direction.x) + Math.abs(direction.y) === 1;
    }

    var seen = new Set();
    var trail = [];
    for (var i = 0; i < snapshot.trail.length; i++) {
      var cell = snapshot.trail[i];
      if (!validCell(cell) || seen.has(cellKey(cell))) return null;
      seen.add(cellKey(cell));
      trail.push({ x: cell.x, y: cell.y });
    }
    if (!validDirection(snapshot.direction)) return null;
    if (snapshot.pendingDirection && !validDirection(snapshot.pendingDirection)) return null;
    if (!validCell(snapshot.packet) || seen.has(cellKey(snapshot.packet))) return null;

    return {
      columns: columns,
      rows: rows,
      trail: trail,
      packet: { x: snapshot.packet.x, y: snapshot.packet.y },
      direction: { x: snapshot.direction.x, y: snapshot.direction.y },
      pendingDirection: snapshot.pendingDirection
        ? { x: snapshot.pendingDirection.x, y: snapshot.pendingDirection.y }
        : null,
      turnQueued: !!snapshot.turnQueued,
      started: !!snapshot.started,
      over: false,
      won: false,
      score: score,
    };
  }

  /** A DOM-free delayed-offer state machine, also used directly by tests. */
  function createOfferGate(options) {
    var schedule = options.setTimeout;
    var cancel = options.clearTimeout;
    var onOffer = options.onOffer || function () {};
    var onDismiss = options.onDismiss || function () {};
    var delay = options.delayMs == null ? OFFER_DELAY_MS : options.delayMs;
    var timer;
    var waiting = false;
    var offered = false;
    var destroyed = false;
    var context;

    function clearTimer() {
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    }

    return {
      begin: function (value) {
        if (destroyed || waiting) return;
        waiting = true;
        context = value;
        timer = schedule(function () {
          timer = undefined;
          if (!waiting || destroyed) return;
          offered = true;
          onOffer(context);
        }, delay);
      },
      end: function (reason) {
        if (destroyed) return;
        var wasActive = waiting || offered;
        clearTimer();
        waiting = false;
        offered = false;
        context = undefined;
        if (wasActive) onDismiss(reason);
      },
      destroy: function () {
        if (destroyed) return;
        var wasActive = waiting || offered;
        clearTimer();
        waiting = false;
        offered = false;
        context = undefined;
        destroyed = true;
        if (wasActive) onDismiss("destroy");
      },
      state: function () {
        return { waiting: waiting, offered: offered, destroyed: destroyed, context: context };
      },
    };
  }

  function install(win, config) {
    var doc = win.document;
    var random = typeof config.random === "function" ? config.random : Math.random;
    var strings = config.strings || {};
    var text = {
      open: strings.open || "Play Mux Trail while DSH works",
      close: strings.close || "Close Mux Trail",
      description: strings.description || "Guide the signal and collect packets.",
      score: strings.score || "Score {score} · Best {maxScore}",
      instructions: strings.instructions || "Arrows / WASD · Esc closes",
      ready: strings.ready || "Choose a direction to start",
      gameOver: strings.gameOver || "Signal lost",
      won: strings.won || "Grid complete",
      restart: strings.restart || "Play again",
    };
    var style;
    var launcher;
    var overlay;
    var dialog;
    var canvas;
    var scoreLabel;
    var statusLabel;
    var restartButton;
    var resizeObserver;
    var tickTimer;
    var game;
    var storage;
    var storedState = { version: 1, maxScore: 0, rounds: {} };
    var activeSessionKey;
    var open = false;
    var destroyed = false;

    var gate = createOfferGate({
      setTimeout: win.setTimeout.bind(win),
      clearTimeout: win.clearTimeout.bind(win),
      delayMs: config.delayMs == null ? OFFER_DELAY_MS : config.delayMs,
      onOffer: function () {
        if (ensureDom()) launcher.hidden = false;
      },
      onDismiss: function () {
        if (launcher) launcher.hidden = true;
        closeDialog(false);
      },
    });

    function interpolate(template, values) {
      return template.replace(/\{(\w+)\}/g, function (match, key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
      });
    }

    function sessionKey(sessionId) {
      return sessionId === undefined || sessionId === null ? undefined : "session:" + String(sessionId);
    }

    function loadStoredState() {
      if (!storage || typeof storage.load !== "function") return;
      try {
        var value = storage.load();
        if (!value || value.version !== 1 || typeof value !== "object") return;
        var maxScore = Number(value.maxScore);
        storedState.maxScore = Number.isInteger(maxScore) && maxScore >= 0 ? maxScore : 0;
        storedState.rounds = value.rounds && typeof value.rounds === "object" ? value.rounds : {};
      } catch (error) {
        if (win.console && typeof win.console.error === "function") {
          win.console.error("[dsh-mux-trail] state load failed", error);
        }
      }
    }

    function writeStoredState() {
      if (!storage || typeof storage.save !== "function") return;
      try {
        storage.save(storedState);
      } catch (error) {
        if (win.console && typeof win.console.error === "function") {
          win.console.error("[dsh-mux-trail] state save failed", error);
        }
      }
    }

    function persistGame() {
      if (!game) return;
      storedState.maxScore = Math.max(storedState.maxScore, game.score);
      if (activeSessionKey) {
        var snapshot = snapshotGame(game);
        if (snapshot) storedState.rounds[activeSessionKey] = snapshot;
        else delete storedState.rounds[activeSessionKey];
      }
      writeStoredState();
    }

    function restoredGameForSession() {
      if (!activeSessionKey) return null;
      var restored = restoreGame(storedState.rounds[activeSessionKey]);
      if (!restored && storedState.rounds[activeSessionKey]) {
        delete storedState.rounds[activeSessionKey];
        writeStoredState();
      }
      return restored;
    }

    function addClass(node, className) {
      node.className = className;
      return node;
    }

    function button(label, className) {
      var node = addClass(doc.createElement("button"), className);
      node.type = "button";
      node.setAttribute("aria-label", label);
      node.title = label;
      return node;
    }

    function ensureDom() {
      if (destroyed || !doc.body) return false;
      if (launcher) return true;

      style = doc.createElement("style");
      style.id = "dshmux-mux-trail-style";
      style.textContent = [
        "#dshmux-mux-trail-launch{position:fixed;right:12px;bottom:92px;z-index:8998;width:30px;height:30px;padding:0;border:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));border-radius:8px;background:var(--vscode-button-secondaryBackground,var(--vscode-editorWidget-background));color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));font:18px/1 var(--vscode-font-family);box-shadow:0 2px 10px rgba(0,0,0,.22);cursor:pointer}",
        "#dshmux-mux-trail-launch:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}",
        "#dshmux-mux-trail-launch:focus-visible,.dshmux-mux-trail button:focus-visible,.dshmux-mux-trail-dialog:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}",
        ".dshmux-mux-trail[hidden],#dshmux-mux-trail-launch[hidden]{display:none!important}",
        ".dshmux-mux-trail{position:fixed;inset:0;z-index:8999;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:color-mix(in srgb,var(--vscode-editor-background) 76%,transparent);backdrop-filter:blur(2px);font-family:var(--vscode-font-family);color:var(--vscode-foreground)}",
        ".dshmux-mux-trail-dialog{width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder));border-radius:10px;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));box-shadow:0 8px 30px rgba(0,0,0,.35)}",
        ".dshmux-mux-trail-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.dshmux-mux-trail-title{min-width:0;flex:1;margin:0;font-size:14px;line-height:24px}.dshmux-mux-trail-score{color:var(--vscode-descriptionForeground);font-size:12px;white-space:nowrap}",
        ".dshmux-mux-trail-close{width:28px;height:28px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--vscode-foreground);font:18px/1 var(--vscode-font-family);cursor:pointer}.dshmux-mux-trail-close:hover{background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}",
        ".dshmux-mux-trail-canvas{display:block;width:100%;max-height:min(58vh,360px);aspect-ratio:1;border:1px solid var(--vscode-contrastBorder,var(--vscode-widget-border));border-radius:6px;background:var(--vscode-editor-background)}",
        ".dshmux-mux-trail-foot{display:flex;align-items:center;gap:8px;min-height:30px;margin-top:8px}.dshmux-mux-trail-status{min-width:0;flex:1;color:var(--vscode-descriptionForeground);font-size:11px;line-height:1.35}.dshmux-mux-trail-restart{border:0;border-radius:4px;padding:5px 9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font:12px var(--vscode-font-family);cursor:pointer}",
        "@media(max-width:260px){.dshmux-mux-trail{padding:6px}.dshmux-mux-trail-dialog{width:calc(100vw - 12px);padding:8px}.dshmux-mux-trail-head{gap:4px}.dshmux-mux-trail-title{font-size:13px}.dshmux-mux-trail-foot{align-items:flex-start;flex-direction:column}}",
        "@media(prefers-reduced-motion:reduce){#dshmux-mux-trail-launch,.dshmux-mux-trail{transition:none;animation:none}}",
        "@media(forced-colors:active){#dshmux-mux-trail-launch,.dshmux-mux-trail-dialog,.dshmux-mux-trail-canvas{border:1px solid CanvasText}.dshmux-mux-trail{forced-color-adjust:auto}}",
      ].join("");

      launcher = button(text.open, "");
      launcher.id = "dshmux-mux-trail-launch";
      launcher.textContent = "◇";
      launcher.hidden = true;
      launcher.addEventListener("click", openDialog);

      overlay = addClass(doc.createElement("div"), "dshmux-mux-trail");
      overlay.hidden = true;
      overlay.addEventListener("pointerdown", function (event) {
        if (event.target === overlay) closeDialog(true);
      });

      dialog = addClass(doc.createElement("section"), "dshmux-mux-trail-dialog");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "dshmux-mux-trail-title");
      dialog.setAttribute("aria-describedby", "dshmux-mux-trail-description");
      dialog.tabIndex = -1;
      dialog.addEventListener("keydown", onKeyDown);

      var head = addClass(doc.createElement("div"), "dshmux-mux-trail-head");
      var title = addClass(doc.createElement("h2"), "dshmux-mux-trail-title");
      title.id = "dshmux-mux-trail-title";
      title.textContent = "Mux Trail";
      scoreLabel = addClass(doc.createElement("span"), "dshmux-mux-trail-score");
      var closeButton = button(text.close, "dshmux-mux-trail-close");
      closeButton.textContent = "×";
      closeButton.addEventListener("click", function () { closeDialog(true); });
      head.appendChild(title);
      head.appendChild(scoreLabel);
      head.appendChild(closeButton);

      var description = doc.createElement("p");
      description.id = "dshmux-mux-trail-description";
      description.textContent = text.description;
      description.style.position = "absolute";
      description.style.width = "1px";
      description.style.height = "1px";
      description.style.padding = "0";
      description.style.margin = "-1px";
      description.style.overflow = "hidden";
      description.style.clip = "rect(0,0,0,0)";

      canvas = addClass(doc.createElement("canvas"), "dshmux-mux-trail-canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", text.description);

      var foot = addClass(doc.createElement("div"), "dshmux-mux-trail-foot");
      statusLabel = addClass(doc.createElement("div"), "dshmux-mux-trail-status");
      restartButton = button(text.restart, "dshmux-mux-trail-restart");
      restartButton.textContent = text.restart;
      restartButton.hidden = true;
      restartButton.addEventListener("click", restartGame);
      foot.appendChild(statusLabel);
      foot.appendChild(restartButton);

      dialog.appendChild(head);
      dialog.appendChild(description);
      dialog.appendChild(canvas);
      dialog.appendChild(foot);
      overlay.appendChild(dialog);
      doc.head.appendChild(style);
      doc.body.appendChild(launcher);
      doc.body.appendChild(overlay);

      if (typeof win.ResizeObserver === "function") {
        resizeObserver = new win.ResizeObserver(function () { render(); });
        resizeObserver.observe(canvas);
      }
      return true;
    }

    function color(styleDeclaration, name, fallback) {
      var value = styleDeclaration && styleDeclaration.getPropertyValue
        ? styleDeclaration.getPropertyValue(name).trim()
        : "";
      return value || fallback;
    }

    function render() {
      if (!open || !game || !canvas) return;
      var rect = canvas.getBoundingClientRect();
      var cssSize = Math.max(180, Math.floor(Math.min(rect.width || 320, rect.height || rect.width || 320)));
      var ratio = Math.max(1, Math.min(2, Number(win.devicePixelRatio) || 1));
      var pixels = Math.floor(cssSize * ratio);
      if (canvas.width !== pixels || canvas.height !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      var ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      var computed = typeof win.getComputedStyle === "function" ? win.getComputedStyle(dialog) : null;
      var background = color(computed, "--vscode-editor-background", "#1e1e1e");
      var foreground = color(computed, "--vscode-editor-foreground", "#d4d4d4");
      var accent = color(computed, "--vscode-button-background", "#0e639c");
      var focus = color(computed, "--vscode-focusBorder", "#75beff");
      var grid = color(computed, "--vscode-widget-border", "#3c3c3c");
      var cellWidth = cssSize / game.columns;
      var cellHeight = cssSize / game.rows;

      ctx.fillStyle = background;
      ctx.fillRect(0, 0, cssSize, cssSize);
      ctx.strokeStyle = grid;
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 0.5;
      for (var x = 1; x < game.columns; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellWidth, 0);
        ctx.lineTo(x * cellWidth, cssSize);
        ctx.stroke();
      }
      for (var y = 1; y < game.rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellHeight);
        ctx.lineTo(cssSize, y * cellHeight);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (var i = game.trail.length - 1; i >= 0; i--) {
        var segment = game.trail[i];
        var inset = Math.max(1, cellWidth * 0.14);
        ctx.fillStyle = i === 0 ? focus : accent;
        ctx.fillRect(
          segment.x * cellWidth + inset,
          segment.y * cellHeight + inset,
          cellWidth - inset * 2,
          cellHeight - inset * 2
        );
        if (i === 0) {
          ctx.strokeStyle = foreground;
          ctx.lineWidth = Math.max(1, cellWidth * 0.08);
          ctx.strokeRect(
            segment.x * cellWidth + inset,
            segment.y * cellHeight + inset,
            cellWidth - inset * 2,
            cellHeight - inset * 2
          );
        }
      }

      if (game.packet) {
        var centerX = (game.packet.x + 0.5) * cellWidth;
        var centerY = (game.packet.y + 0.5) * cellHeight;
        var radius = Math.min(cellWidth, cellHeight) * 0.34;
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = foreground;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.strokeStyle = focus;
        ctx.lineWidth = Math.max(1, cellWidth * 0.09);
        ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      }

      scoreLabel.textContent = interpolate(text.score, {
        score: String(game.score),
        maxScore: String(Math.max(storedState.maxScore, game.score)),
      });
      if (game.over) {
        statusLabel.textContent = game.won ? text.won : text.gameOver;
        restartButton.hidden = false;
      } else if (!game.started) {
        statusLabel.textContent = text.ready + " · " + text.instructions;
        restartButton.hidden = true;
      } else {
        statusLabel.textContent = text.instructions;
        restartButton.hidden = true;
      }
    }

    function clearTick() {
      if (tickTimer !== undefined) win.clearTimeout(tickTimer);
      tickTimer = undefined;
    }

    function scheduleTick() {
      clearTick();
      if (!open || !game || !game.started || game.over || doc.visibilityState === "hidden") return;
      tickTimer = win.setTimeout(function () {
        tickTimer = undefined;
        stepGame(game, random);
        persistGame();
        render();
        if (!game.over) scheduleTick();
      }, speedForScore(game.score));
    }

    function restartGame() {
      if (!open || !gate.state().offered) return;
      clearTick();
      game = createGame(random, DEFAULT_COLUMNS, DEFAULT_ROWS);
      persistGame();
      render();
      dialog.focus();
    }

    function openDialog() {
      if (!gate.state().offered || !ensureDom()) return;
      clearTick();
      game = restoredGameForSession() || createGame(random, DEFAULT_COLUMNS, DEFAULT_ROWS);
      open = true;
      launcher.hidden = true;
      overlay.hidden = false;
      render();
      dialog.focus();
      scheduleTick();
    }

    function closeDialog(restoreFocus) {
      clearTick();
      if (!open) return;
      persistGame();
      open = false;
      game = undefined;
      if (overlay) overlay.hidden = true;
      if (launcher) launcher.hidden = !gate.state().offered;
      if (restoreFocus && launcher && !launcher.hidden) launcher.focus();
    }

    function onKeyDown(event) {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeDialog(true);
        return;
      }
      if (event.key === "Enter" && game && game.over) {
        event.preventDefault();
        event.stopPropagation();
        restartGame();
        return;
      }
      var direction = DIRECTIONS[event.key];
      if (!direction || !game) return;
      event.preventDefault();
      event.stopPropagation();
      if (queueDirection(game, direction)) {
        persistGame();
        render();
        scheduleTick();
      }
    }

    function onVisibilityChange() {
      if (doc.visibilityState === "hidden") clearTick();
      else scheduleTick();
    }

    function onWindowBlur() {
      clearTick();
    }

    function onWindowFocus() {
      scheduleTick();
    }

    function onWindowResize() {
      render();
    }

    function onMessage(event) {
      if (event.data && event.data.type === "theme-preference") render();
    }

    function destroy() {
      if (destroyed) return;
      persistGame();
      gate.destroy();
      clearTick();
      destroyed = true;
      if (resizeObserver) resizeObserver.disconnect();
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      win.removeEventListener("blur", onWindowBlur);
      win.removeEventListener("focus", onWindowFocus);
      win.removeEventListener("resize", onWindowResize);
      win.removeEventListener("message", onMessage);
      win.removeEventListener("pagehide", destroy);
      if (overlay) overlay.remove();
      if (launcher) launcher.remove();
      if (style) style.remove();
    }

    doc.addEventListener("visibilitychange", onVisibilityChange);
    win.addEventListener("blur", onWindowBlur);
    win.addEventListener("focus", onWindowFocus);
    win.addEventListener("resize", onWindowResize);
    win.addEventListener("message", onMessage);
    win.addEventListener("pagehide", destroy, { once: true });
    if (!doc.body) {
      doc.addEventListener("DOMContentLoaded", function () {
        if (gate.state().offered && ensureDom()) launcher.hidden = false;
      }, { once: true });
    }

    return {
      attachStorage: function (adapter) {
        storage = adapter;
        loadStoredState();
      },
      beginWait: function (sessionId) {
        activeSessionKey = sessionKey(sessionId);
        gate.begin(sessionId);
      },
      endWait: function (reason) { gate.end(reason); },
      destroy: destroy,
      state: function () {
        var offer = gate.state();
        return {
          waiting: offer.waiting,
          offered: offer.offered,
          destroyed: offer.destroyed,
          open: open,
          score: game ? game.score : 0,
          maxScore: storedState.maxScore,
          gameOver: game ? game.over : false,
        };
      },
    };
  }

  return {
    DEFAULT_COLUMNS: DEFAULT_COLUMNS,
    DEFAULT_ROWS: DEFAULT_ROWS,
    OFFER_DELAY_MS: OFFER_DELAY_MS,
    DIRECTIONS: DIRECTIONS,
    createGame: createGame,
    queueDirection: queueDirection,
    stepGame: stepGame,
    spawnPacket: spawnPacket,
    speedForScore: speedForScore,
    snapshotGame: snapshotGame,
    restoreGame: restoreGame,
    createOfferGate: createOfferGate,
    install: install,
  };
});
