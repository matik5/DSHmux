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

  var SUITS = ["♠", "♥", "♦", "♣"];

  function newSolitaire(random) {
    var deck = [];
    for (var suit = 0; suit < 4; suit++) {
      for (var rank = 1; rank <= 13; rank++) deck.push({ suit: suit, rank: rank, faceUp: false });
    }
    for (var i = deck.length - 1; i > 0; i--) {
      var swap = boundedRandomIndex(random, i + 1);
      var card = deck[i];
      deck[i] = deck[swap];
      deck[swap] = card;
    }
    var tableau = [[], [], [], [], [], [], []];
    for (var column = 0; column < 7; column++) {
      for (var row = 0; row <= column; row++) {
        var dealt = deck.pop();
        dealt.faceUp = row === column;
        tableau[column].push(dealt);
      }
    }
    return {
      stock: deck,
      waste: [],
      foundations: [[], [], [], []],
      tableau: tableau,
      selected: null,
      won: false,
      moves: 0,
    };
  }

  function solitaireCardKey(card) {
    return card.suit + ":" + card.rank;
  }

  function oppositeColor(a, b) {
    return (a.suit === 1 || a.suit === 2) !== (b.suit === 1 || b.suit === 2);
  }

  function canPlaceTableau(card, target) {
    return target ? !!target.faceUp && oppositeColor(card, target) && card.rank + 1 === target.rank : card.rank === 13;
  }

  function canPlaceFoundation(card, foundation) {
    if (!foundation.length) return card.rank === 1;
    var top = foundation[foundation.length - 1];
    return top.suit === card.suit && card.rank === top.rank + 1;
  }

  function finishSolitaireMove(state) {
    state.selected = null;
    state.moves += 1;
    state.won = state.foundations.reduce(function (sum, pile) { return sum + pile.length; }, 0) === 52;
    return true;
  }

  function drawSolitaireStock(state) {
    state.selected = null;
    if (state.stock.length) {
      var card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
      state.moves += 1;
      return true;
    }
    if (!state.waste.length) return false;
    while (state.waste.length) {
      var recycled = state.waste.pop();
      recycled.faceUp = false;
      state.stock.push(recycled);
    }
    state.moves += 1;
    return true;
  }

  function flipSolitaireTableau(state, column) {
    var pile = state.tableau[column];
    if (!pile || !pile.length || pile[pile.length - 1].faceUp) return false;
    pile[pile.length - 1].faceUp = true;
    return finishSolitaireMove(state);
  }

  function moveSolitaireWaste(state, destinationKind, destination) {
    var card = state.waste[state.waste.length - 1];
    if (!card) return false;
    if (destinationKind === "tableau") {
      var targetPile = state.tableau[destination];
      if (!targetPile || !canPlaceTableau(card, targetPile[targetPile.length - 1])) return false;
      targetPile.push(state.waste.pop());
      return finishSolitaireMove(state);
    }
    var foundation = state.foundations[destination];
    if (!foundation || destination !== card.suit || !canPlaceFoundation(card, foundation)) return false;
    foundation.push(state.waste.pop());
    return finishSolitaireMove(state);
  }

  function validTableauRun(cards) {
    if (!cards.length || !cards[0].faceUp) return false;
    for (var i = 1; i < cards.length; i++) {
      if (!cards[i].faceUp || !oppositeColor(cards[i - 1], cards[i]) || cards[i - 1].rank !== cards[i].rank + 1) return false;
    }
    return true;
  }

  function moveSolitaireTableau(state, fromColumn, fromIndex, toColumn) {
    if (fromColumn === toColumn) return false;
    var source = state.tableau[fromColumn];
    var target = state.tableau[toColumn];
    if (!source || !target || fromIndex < 0 || fromIndex >= source.length) return false;
    var moving = source.slice(fromIndex);
    if (!validTableauRun(moving) || !canPlaceTableau(moving[0], target[target.length - 1])) return false;
    state.tableau[toColumn] = target.concat(moving);
    source.splice(fromIndex);
    return finishSolitaireMove(state);
  }

  function moveSolitaireTableauToFoundation(state, column, foundationIndex) {
    var source = state.tableau[column];
    var card = source && source[source.length - 1];
    var foundation = state.foundations[foundationIndex];
    if (!card || !card.faceUp || !foundation || foundationIndex !== card.suit || !canPlaceFoundation(card, foundation)) return false;
    foundation.push(source.pop());
    return finishSolitaireMove(state);
  }

  function moveSolitaireFoundationToTableau(state, foundationIndex, column) {
    var foundation = state.foundations[foundationIndex];
    var target = state.tableau[column];
    var card = foundation && foundation[foundation.length - 1];
    if (!card || !target || !canPlaceTableau(card, target[target.length - 1])) return false;
    target.push(foundation.pop());
    return finishSolitaireMove(state);
  }

  function snapshotSolitaire(state) {
    if (!state || state.won) return null;
    function copyPile(pile) {
      return pile.map(function (card) { return { suit: card.suit, rank: card.rank, faceUp: !!card.faceUp }; });
    }
    return {
      stock: copyPile(state.stock),
      waste: copyPile(state.waste),
      foundations: state.foundations.map(copyPile),
      tableau: state.tableau.map(copyPile),
      selected: null,
      won: false,
      moves: Math.max(0, Math.floor(Number(state.moves) || 0)),
    };
  }

  function restoreSolitaire(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || snapshot.won) return null;
    if (!Array.isArray(snapshot.stock) || !Array.isArray(snapshot.waste)
      || !Array.isArray(snapshot.foundations) || snapshot.foundations.length !== 4
      || !Array.isArray(snapshot.tableau) || snapshot.tableau.length !== 7) return null;
    var piles = [snapshot.stock, snapshot.waste].concat(snapshot.foundations, snapshot.tableau);
    var seen = new Set();
    var count = 0;
    for (var p = 0; p < piles.length; p++) {
      if (!Array.isArray(piles[p])) return null;
      for (var c = 0; c < piles[p].length; c++) {
        var card = piles[p][c];
        if (!card || !Number.isInteger(card.suit) || card.suit < 0 || card.suit > 3
          || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13) return null;
        var key = solitaireCardKey(card);
        if (seen.has(key)) return null;
        seen.add(key);
        count += 1;
      }
    }
    if (count !== 52) return null;
    var restored = snapshotSolitaire({
      stock: snapshot.stock,
      waste: snapshot.waste,
      foundations: snapshot.foundations,
      tableau: snapshot.tableau,
      won: false,
      moves: snapshot.moves,
    });
    return restored;
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
      open: strings.open || "Play while DSH works",
      close: strings.close || "Close Mux Arcade",
      title: strings.title || "Mux Arcade",
      trail: strings.trail || "Mux Trail",
      solitaire: strings.solitaire || "Solitaire",
      description: strings.description || "Choose Mux Trail or Solitaire while DSH works.",
      score: strings.score || "Score {score} · Best {maxScore}",
      solitaireProgress: strings.solitaireProgress || "Home {count}/52",
      instructions: strings.instructions || "Arrows / WASD · Esc closes",
      solitaireInstructions: strings.solitaireInstructions || "Select a card, then its destination. Click a covered card to turn it.",
      ready: strings.ready || "Choose a direction to start",
      gameOver: strings.gameOver || "Signal lost",
      won: strings.won || "Grid complete",
      solitaireWon: strings.solitaireWon || "All suits are home",
      restart: strings.restart || "Play again",
      newDeal: strings.newDeal || "New deal",
      stock: strings.stock || "Stock",
      waste: strings.waste || "Waste",
      foundation: strings.foundation || "Foundation",
      invalidMove: strings.invalidMove || "That card cannot go there",
    };
    var style;
    var launcher;
    var overlay;
    var dialog;
    var trailTab;
    var solitaireTab;
    var canvas;
    var solitaireBoard;
    var scoreLabel;
    var statusLabel;
    var restartButton;
    var resizeObserver;
    var tickTimer;
    var game;
    var solitaireGame;
    var storage;
    var storedState = { version: 1, maxScore: 0, rounds: {}, solitaireRounds: {}, selectedGames: {} };
    var activeSessionKey;
    var activeGameType = "trail";
    var solitaireMessage = "";
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
        storedState.solitaireRounds = value.solitaireRounds && typeof value.solitaireRounds === "object" ? value.solitaireRounds : {};
        storedState.selectedGames = value.selectedGames && typeof value.selectedGames === "object" ? value.selectedGames : {};
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
      if (!game && !solitaireGame) return;
      if (game) storedState.maxScore = Math.max(storedState.maxScore, game.score);
      if (activeSessionKey) {
        if (game) {
          var trailSnapshot = snapshotGame(game);
          if (trailSnapshot) storedState.rounds[activeSessionKey] = trailSnapshot;
          else delete storedState.rounds[activeSessionKey];
        }
        if (solitaireGame) {
          var solitaireSnapshot = snapshotSolitaire(solitaireGame);
          if (solitaireSnapshot) storedState.solitaireRounds[activeSessionKey] = solitaireSnapshot;
          else delete storedState.solitaireRounds[activeSessionKey];
        }
        storedState.selectedGames[activeSessionKey] = activeGameType;
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

    function restoredSolitaireForSession() {
      if (!activeSessionKey) return null;
      var restored = restoreSolitaire(storedState.solitaireRounds[activeSessionKey]);
      if (!restored && storedState.solitaireRounds[activeSessionKey]) {
        delete storedState.solitaireRounds[activeSessionKey];
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
        ".dshmux-mux-game-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:0 0 8px}.dshmux-mux-game-tab{min-width:0;padding:5px 8px;border:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder));border-radius:5px;background:var(--vscode-button-secondaryBackground,var(--vscode-editorWidget-background));color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));font:12px var(--vscode-font-family);cursor:pointer}.dshmux-mux-game-tab[aria-selected=true]{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}",
        ".dshmux-mux-trail-canvas{display:block;width:100%;max-height:min(58vh,360px);aspect-ratio:1;border:1px solid var(--vscode-contrastBorder,var(--vscode-widget-border));border-radius:6px;background:var(--vscode-editor-background)}",
        ".dshmux-solitaire{display:grid;gap:8px;min-height:300px}.dshmux-solitaire[hidden],.dshmux-mux-trail-canvas[hidden]{display:none!important}.dshmux-solitaire-top,.dshmux-solitaire-tableau{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.dshmux-solitaire-tableau{min-height:250px}.dshmux-solitaire-pile{position:relative;min-width:0;min-height:48px}.dshmux-solitaire-slot,.dshmux-solitaire-card{width:100%;height:48px;box-sizing:border-box;border:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder));border-radius:5px;padding:3px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font:bold 12px/1 var(--vscode-editor-font-family,var(--vscode-font-family));cursor:pointer}.dshmux-solitaire-slot{color:var(--vscode-descriptionForeground);background:color-mix(in srgb,var(--vscode-editor-background) 82%,var(--vscode-foreground));border-style:dashed}.dshmux-solitaire-card{position:absolute;left:0;top:0;text-align:left;box-shadow:0 2px 3px rgba(0,0,0,.3)}.dshmux-solitaire-card.red{color:var(--vscode-errorForeground,#d33)}.dshmux-solitaire-card.covered{color:var(--vscode-button-foreground);border-color:var(--vscode-focusBorder);background:repeating-linear-gradient(135deg,var(--vscode-button-background) 0 4px,var(--vscode-button-hoverBackground,var(--vscode-focusBorder)) 4px 8px);box-shadow:inset 0 3px 0 color-mix(in srgb,var(--vscode-button-foreground) 45%,transparent),0 2px 3px rgba(0,0,0,.35)}.dshmux-solitaire-card.stock{text-align:center;font-size:15px}.dshmux-solitaire-card.selected{outline:3px solid var(--vscode-focusBorder);outline-offset:1px}.dshmux-solitaire-slot.foundation{font-size:18px;text-align:center;border:2px dashed var(--vscode-focusBorder);background:color-mix(in srgb,var(--vscode-editor-background) 88%,var(--vscode-focusBorder))}.dshmux-solitaire-empty{position:absolute;inset:0}",
        ".dshmux-mux-trail-foot{display:flex;align-items:center;gap:8px;min-height:30px;margin-top:8px}.dshmux-mux-trail-status{min-width:0;flex:1;color:var(--vscode-descriptionForeground);font-size:11px;line-height:1.35}.dshmux-mux-trail-restart{border:0;border-radius:4px;padding:5px 9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font:12px var(--vscode-font-family);cursor:pointer}",
        "@media(max-width:260px){.dshmux-mux-trail{padding:6px}.dshmux-mux-trail-dialog{width:calc(100vw - 12px);padding:8px}.dshmux-mux-trail-head{gap:4px}.dshmux-mux-trail-title{font-size:13px}.dshmux-mux-trail-foot{align-items:flex-start;flex-direction:column}}",
        "@media(prefers-reduced-motion:reduce){#dshmux-mux-trail-launch,.dshmux-mux-trail{transition:none;animation:none}}",
        "@media(forced-colors:active){#dshmux-mux-trail-launch,.dshmux-mux-trail-dialog,.dshmux-mux-trail-canvas,.dshmux-solitaire-card,.dshmux-solitaire-slot{border:1px solid CanvasText}.dshmux-mux-trail{forced-color-adjust:auto}}",
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
      title.textContent = text.title;
      scoreLabel = addClass(doc.createElement("span"), "dshmux-mux-trail-score");
      var closeButton = button(text.close, "dshmux-mux-trail-close");
      closeButton.textContent = "×";
      closeButton.addEventListener("click", function () { closeDialog(true); });
      head.appendChild(title);
      head.appendChild(scoreLabel);
      head.appendChild(closeButton);

      var tabs = addClass(doc.createElement("div"), "dshmux-mux-game-tabs");
      tabs.setAttribute("role", "tablist");
      trailTab = button(text.trail, "dshmux-mux-game-tab");
      trailTab.textContent = text.trail;
      trailTab.setAttribute("role", "tab");
      trailTab.addEventListener("click", function () { switchGame("trail"); });
      solitaireTab = button(text.solitaire, "dshmux-mux-game-tab");
      solitaireTab.textContent = text.solitaire;
      solitaireTab.setAttribute("role", "tab");
      solitaireTab.addEventListener("click", function () { switchGame("solitaire"); });
      tabs.appendChild(trailTab);
      tabs.appendChild(solitaireTab);

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

      solitaireBoard = addClass(doc.createElement("div"), "dshmux-solitaire");
      solitaireBoard.setAttribute("aria-label", text.solitaire);
      solitaireBoard.hidden = true;

      var foot = addClass(doc.createElement("div"), "dshmux-mux-trail-foot");
      statusLabel = addClass(doc.createElement("div"), "dshmux-mux-trail-status");
      restartButton = button(text.restart, "dshmux-mux-trail-restart");
      restartButton.textContent = text.restart;
      restartButton.hidden = true;
      restartButton.addEventListener("click", restartGame);
      foot.appendChild(statusLabel);
      foot.appendChild(restartButton);

      dialog.appendChild(head);
      dialog.appendChild(tabs);
      dialog.appendChild(description);
      dialog.appendChild(canvas);
      dialog.appendChild(solitaireBoard);
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

    function renderTrail() {
      if (!open || activeGameType !== "trail" || !game || !canvas) return;
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

    function solitaireRank(rank) {
      return rank === 1 ? "A" : rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : String(rank);
    }

    function solitaireCardLabel(card) {
      return solitaireRank(card.rank) + SUITS[card.suit];
    }

    function solitaireSelected(kind, pile, index) {
      var selected = solitaireGame && solitaireGame.selected;
      return !!selected && selected.kind === kind && selected.pile === pile
        && (index === undefined || selected.index === index);
    }

    function afterSolitaireAction(changed) {
      if (!changed) return false;
      solitaireMessage = "";
      persistGame();
      render();
      return true;
    }

    function selectSolitaire(value) {
      solitaireMessage = "";
      solitaireGame.selected = value;
      render();
    }

    function rejectSolitaireMove() {
      solitaireMessage = text.invalidMove;
      render();
    }

    function beginSolitaireDrag(event, value) {
      solitaireMessage = "";
      solitaireGame.selected = value;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "dshmux-solitaire");
      }
      if (event.currentTarget && event.currentTarget.classList) event.currentTarget.classList.add("selected");
    }

    function makeSolitaireDropTarget(node, kind, pile) {
      node.addEventListener("dragover", function (event) {
        if (!solitaireGame.selected) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      node.addEventListener("drop", function (event) {
        event.preventDefault();
        if (!trySolitaireDestination(kind, pile)) rejectSolitaireMove();
      });
    }

    function trySolitaireDestination(kind, pile) {
      var selected = solitaireGame.selected;
      if (!selected) return false;
      var moved = false;
      if (selected.kind === "waste") moved = moveSolitaireWaste(solitaireGame, kind, pile);
      else if (selected.kind === "tableau" && kind === "tableau") {
        moved = moveSolitaireTableau(solitaireGame, selected.pile, selected.index, pile);
      } else if (selected.kind === "tableau" && kind === "foundation") {
        var sourcePile = solitaireGame.tableau[selected.pile];
        if (sourcePile && selected.index === sourcePile.length - 1) {
          moved = moveSolitaireTableauToFoundation(solitaireGame, selected.pile, pile);
        }
      } else if (selected.kind === "foundation" && kind === "tableau") {
        moved = moveSolitaireFoundationToTableau(solitaireGame, selected.pile, pile);
      }
      return afterSolitaireAction(moved);
    }

    function solitaireCardButton(card, className) {
      var node = button(solitaireCardLabel(card), "dshmux-solitaire-card " + className);
      node.textContent = card.faceUp ? solitaireCardLabel(card) : "";
      if (!card.faceUp) node.setAttribute("aria-label", text.stock);
      return node;
    }

    function renderSolitaire() {
      if (!open || activeGameType !== "solitaire" || !solitaireGame || !solitaireBoard) return;
      if (typeof solitaireBoard.replaceChildren === "function") solitaireBoard.replaceChildren();
      else solitaireBoard.textContent = "";

      var top = addClass(doc.createElement("div"), "dshmux-solitaire-top");
      for (var slotIndex = 0; slotIndex < 7; slotIndex++) {
        var slot = addClass(doc.createElement("div"), "dshmux-solitaire-pile");
        if (slotIndex === 0) {
          var stock = button(
            text.stock + " " + String(solitaireGame.stock.length),
            solitaireGame.stock.length ? "dshmux-solitaire-card covered stock" : "dshmux-solitaire-slot"
          );
          stock.textContent = solitaireGame.stock.length ? "◆ " + String(solitaireGame.stock.length) : (solitaireGame.waste.length ? "↻" : "");
          stock.addEventListener("click", function () { afterSolitaireAction(drawSolitaireStock(solitaireGame)); });
          slot.appendChild(stock);
        } else if (slotIndex === 1) {
          var wasteCard = solitaireGame.waste[solitaireGame.waste.length - 1];
          if (wasteCard) {
            var waste = solitaireCardButton(wasteCard, solitaireSelected("waste", 0) ? "selected" : "");
            waste.addEventListener("click", function () { selectSolitaire({ kind: "waste", pile: 0 }); });
            waste.draggable = true;
            waste.addEventListener("dragstart", function (event) { beginSolitaireDrag(event, { kind: "waste", pile: 0 }); });
            waste.addEventListener("dblclick", function () {
              var topWaste = solitaireGame.waste[solitaireGame.waste.length - 1];
              if (topWaste) afterSolitaireAction(moveSolitaireWaste(solitaireGame, "foundation", topWaste.suit));
            });
            slot.appendChild(waste);
          } else {
            var wasteSlot = button(text.waste, "dshmux-solitaire-slot");
            wasteSlot.textContent = "";
            slot.appendChild(wasteSlot);
          }
        } else if (slotIndex >= 3) {
          (function (foundationIndex) {
            var foundation = solitaireGame.foundations[foundationIndex];
            var topCard = foundation[foundation.length - 1];
            var foundationNode = topCard
              ? solitaireCardButton(topCard, solitaireSelected("foundation", foundationIndex) ? "selected" : "")
              : button(text.foundation + " " + SUITS[foundationIndex], "dshmux-solitaire-slot foundation");
            if (!topCard) foundationNode.textContent = SUITS[foundationIndex];
            foundationNode.addEventListener("click", function () {
              if (trySolitaireDestination("foundation", foundationIndex)) return;
              if (topCard) selectSolitaire({ kind: "foundation", pile: foundationIndex });
              else if (solitaireGame.selected) rejectSolitaireMove();
            });
            makeSolitaireDropTarget(foundationNode, "foundation", foundationIndex);
            if (topCard) {
              foundationNode.draggable = true;
              foundationNode.addEventListener("dragstart", function (event) {
                beginSolitaireDrag(event, { kind: "foundation", pile: foundationIndex });
              });
            }
            slot.appendChild(foundationNode);
          })(slotIndex - 3);
        }
        top.appendChild(slot);
      }

      var tableau = addClass(doc.createElement("div"), "dshmux-solitaire-tableau");
      for (var column = 0; column < 7; column++) {
        (function (columnIndex) {
          var pile = solitaireGame.tableau[columnIndex];
          var pileNode = addClass(doc.createElement("div"), "dshmux-solitaire-pile");
          makeSolitaireDropTarget(pileNode, "tableau", columnIndex);
          if (!pile.length) {
            var empty = button(text.solitaire, "dshmux-solitaire-slot dshmux-solitaire-empty");
            empty.textContent = "";
            empty.addEventListener("click", function () {
              if (!trySolitaireDestination("tableau", columnIndex) && solitaireGame.selected) rejectSolitaireMove();
            });
            makeSolitaireDropTarget(empty, "tableau", columnIndex);
            pileNode.appendChild(empty);
          }
          var offset = 0;
          for (var cardIndex = 0; cardIndex < pile.length; cardIndex++) {
            (function (index, topOffset) {
              var card = pile[index];
              var selectedClass = solitaireSelected("tableau", columnIndex, index) ? " selected" : "";
              var colorClass = card.faceUp && (card.suit === 1 || card.suit === 2) ? "red" : card.faceUp ? "" : "covered";
              var cardNode = solitaireCardButton(card, colorClass + selectedClass);
              cardNode.style.top = topOffset + "px";
              cardNode.style.zIndex = String(index + 1);
              cardNode.draggable = !!card.faceUp;
              if (card.faceUp) {
                cardNode.addEventListener("dragstart", function (event) {
                  beginSolitaireDrag(event, { kind: "tableau", pile: columnIndex, index: index });
                });
              }
              cardNode.addEventListener("click", function () {
                if (!card.faceUp) {
                  if (index === pile.length - 1) afterSolitaireAction(flipSolitaireTableau(solitaireGame, columnIndex));
                  return;
                }
                var selected = solitaireGame.selected;
                if (selected && !(selected.kind === "tableau" && selected.pile === columnIndex && selected.index === index)) {
                  if (!trySolitaireDestination("tableau", columnIndex)) rejectSolitaireMove();
                  return;
                }
                if (selected) {
                  selectSolitaire(null);
                  return;
                }
                selectSolitaire({ kind: "tableau", pile: columnIndex, index: index });
              });
              cardNode.addEventListener("dblclick", function () {
                if (card.faceUp && index === pile.length - 1) {
                  afterSolitaireAction(moveSolitaireTableauToFoundation(solitaireGame, columnIndex, card.suit));
                }
              });
              pileNode.appendChild(cardNode);
            })(cardIndex, offset);
            offset += pile[cardIndex].faceUp ? 21 : 14;
          }
          pileNode.style.minHeight = Math.max(48, offset + 48) + "px";
          tableau.appendChild(pileNode);
        })(column);
      }
      solitaireBoard.appendChild(top);
      solitaireBoard.appendChild(tableau);
      var homeCount = solitaireGame.foundations.reduce(function (sum, pile) { return sum + pile.length; }, 0);
      scoreLabel.textContent = interpolate(text.solitaireProgress, { count: String(homeCount) });
      statusLabel.textContent = solitaireGame.won ? text.solitaireWon : (solitaireMessage || text.solitaireInstructions);
      restartButton.textContent = text.newDeal;
      restartButton.hidden = false;
    }

    function render() {
      if (!open) return;
      var trailActive = activeGameType === "trail";
      if (trailTab) trailTab.setAttribute("aria-selected", trailActive ? "true" : "false");
      if (solitaireTab) solitaireTab.setAttribute("aria-selected", trailActive ? "false" : "true");
      if (canvas) canvas.hidden = !trailActive;
      if (solitaireBoard) solitaireBoard.hidden = trailActive;
      if (trailActive) {
        restartButton.textContent = text.restart;
        renderTrail();
      } else renderSolitaire();
    }

    function clearTick() {
      if (tickTimer !== undefined) win.clearTimeout(tickTimer);
      tickTimer = undefined;
    }

    function scheduleTick() {
      clearTick();
      if (!open || activeGameType !== "trail" || !game || !game.started || game.over || doc.visibilityState === "hidden") return;
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
      if (activeGameType === "solitaire") solitaireGame = newSolitaire(random);
      else game = createGame(random, DEFAULT_COLUMNS, DEFAULT_ROWS);
      persistGame();
      render();
      dialog.focus();
    }

    function switchGame(kind) {
      if (!open || (kind !== "trail" && kind !== "solitaire") || kind === activeGameType) return;
      clearTick();
      if (solitaireGame) solitaireGame.selected = null;
      persistGame();
      activeGameType = kind;
      persistGame();
      render();
      if (kind === "trail") scheduleTick();
      dialog.focus();
    }

    function openDialog() {
      if (!gate.state().offered || !ensureDom()) return;
      clearTick();
      activeGameType = activeSessionKey && storedState.selectedGames[activeSessionKey] === "solitaire" ? "solitaire" : "trail";
      game = restoredGameForSession() || createGame(random, DEFAULT_COLUMNS, DEFAULT_ROWS);
      solitaireGame = restoredSolitaireForSession() || newSolitaire(random);
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
      solitaireGame = undefined;
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
      if (event.key === "Enter" && ((activeGameType === "trail" && game && game.over)
        || (activeGameType === "solitaire" && solitaireGame && solitaireGame.won))) {
        event.preventDefault();
        event.stopPropagation();
        restartGame();
        return;
      }
      if (activeGameType !== "trail") return;
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
          activeGame: activeGameType,
          solitaireWon: solitaireGame ? solitaireGame.won : false,
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
    SUITS: SUITS,
    newSolitaire: newSolitaire,
    canPlaceTableau: canPlaceTableau,
    canPlaceFoundation: canPlaceFoundation,
    drawSolitaireStock: drawSolitaireStock,
    flipSolitaireTableau: flipSolitaireTableau,
    moveSolitaireWaste: moveSolitaireWaste,
    moveSolitaireTableau: moveSolitaireTableau,
    moveSolitaireTableauToFoundation: moveSolitaireTableauToFoundation,
    moveSolitaireFoundationToTableau: moveSolitaireFoundationToTableau,
    snapshotSolitaire: snapshotSolitaire,
    restoreSolitaire: restoreSolitaire,
    createOfferGate: createOfferGate,
    install: install,
  };
});
