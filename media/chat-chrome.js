(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document && root.__DSHMUX_CHROME_INIT__) api.mount(root);
})(typeof window === "object" ? window : undefined, function () {
  "use strict";

  function normalizedSessions(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(function (item) {
        return item && typeof item.sessionId === "string" && typeof item.title === "string";
      })
      .map(function (item) {
        return {
          sessionId: item.sessionId,
          title: item.title,
          updatedAt: item.updatedAt,
          archived: item.archived === true,
        };
      })
      .sort(function (a, b) {
        return timestampOf(b.updatedAt) - timestampOf(a.updatedAt);
      });
  }

  function timestampOf(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    var parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function filterSessions(items, query) {
    var needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return normalizedSessions(items);
    return normalizedSessions(items).filter(function (item) {
      return item.title.toLocaleLowerCase().includes(needle);
    });
  }

  function relativeTime(value, now, nowLabel) {
    var timestamp = timestampOf(value);
    if (!timestamp) return "";
    var minutes = Math.max(0, Math.floor(((now || Date.now()) - timestamp) / 60000));
    if (minutes < 1) return nowLabel;
    if (minutes < 60) return minutes + "m";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h";
    var days = Math.floor(hours / 24);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  }

  function sessionIdFromStorage(value) {
    try {
      var parsed = JSON.parse(value || "null");
      return parsed && typeof parsed.sessionId === "string" ? parsed.sessionId : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  function template(text, values) {
    return Object.keys(values || {}).reduce(function (out, key) {
      return out.split("{" + key + "}").join(String(values[key]));
    }, String(text || ""));
  }

  function mount(win) {
    var doc = win.document;
    var init = win.__DSHMUX_CHROME_INIT__;
    var copy = init.copy;
    var vscode = win.__DSHMUX_VSCODE_API__ || win.acquireVsCodeApi();
    win.__DSHMUX_VSCODE_API__ = vscode;

    function byId(id) {
      var element = doc.getElementById(id);
      if (!element) throw new Error("Missing DSHmux chrome element: " + id);
      return element;
    }

    var title = byId("dshmux-current-title");
    var sessionsButton = byId("dshmux-sessions");
    var newButton = byId("dshmux-new-session");
    var moreButton = byId("dshmux-more");
    var sessionBackdrop = byId("dshmux-session-backdrop");
    var sessionDialog = byId("dshmux-session-dialog");
    var search = byId("dshmux-session-search");
    var activeTab = byId("dshmux-active-tab");
    var archivedTab = byId("dshmux-archived-tab");
    var sessionMessage = byId("dshmux-session-message");
    var sessionList = byId("dshmux-session-list");
    var emptyNew = byId("dshmux-empty-new");
    var overflow = byId("dshmux-overflow");
    var stopButton = byId("dshmux-stop");
    var updateLatest = byId("dshmux-update-latest");
    var updateNext = byId("dshmux-update-next");
    var statusDetail = byId("dshmux-status-detail");
    var overlay = byId("dshmux-overlay");
    var overlayMessage = byId("dshmux-overlay-message");
    var progress = byId("dshmux-progress");
    var startButton = byId("dshmux-start");
    var overlayDoctor = byId("dshmux-overlay-doctor");
    var toast = byId("dshmux-toast");

    var sessions = [];
    var archivedSessions = [];
    var currentSessionId = init.currentSessionId;
    var sessionMode = "active";
    var editingSessionId;
    var newPending = false;
    var sessionLoading = init.initialSessionLoading === true;
    var serverState = init.serverState || "stopped";
    var doctorState = init.doctorState;
    var latestVersion = init.latestVersion;
    var nextVersion = init.nextVersion;
    var toastTimer;
    var readyObserver;
    var readyTimer;

    function labelButton(button, label) {
      button.title = label;
      button.setAttribute("aria-label", label);
    }

    title.textContent = init.currentTitle;
    title.title = init.currentTitle;
    labelButton(sessionsButton, copy.sessions);
    labelButton(newButton, copy.newSession);
    labelButton(moreButton, copy.more);
    overflow.setAttribute("aria-label", copy.more);
    search.placeholder = copy.searchSessions;
    search.setAttribute("aria-label", copy.searchSessions);
    activeTab.textContent = copy.active;
    archivedTab.textContent = copy.archived;
    emptyNew.textContent = copy.newSession;
    byId("dshmux-state-label").textContent = copy.status;
    byId("dshmux-extension-label").textContent = copy.extensionVersion;
    byId("dshmux-dsh-label").textContent = copy.dshVersion;
    startButton.textContent = copy.start;
    overlayDoctor.textContent = copy.openDoctor;

    var menuCopy = {
      "open-in-editor": copy.openInEditor,
      "open-settings": copy.openSettings,
      "open-doctor": copy.openDoctor,
      "show-status": copy.statusVersions,
      stop: copy.stop,
    };
    Array.prototype.forEach.call(overflow.querySelectorAll("[data-command]"), function (button) {
      var command = button.getAttribute("data-command");
      if (menuCopy[command]) button.textContent = menuCopy[command];
    });

    function post(message) {
      vscode.postMessage(message);
    }

    function showToast(message) {
      if (toastTimer) win.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = win.setTimeout(function () {
        toast.hidden = true;
      }, 5000);
    }

    function setTitle(next) {
      if (!next) return;
      title.textContent = next;
      title.title = next;
    }

    function selectedTitle() {
      var all = sessions.concat(archivedSessions);
      for (var i = 0; i < all.length; i += 1) {
        if (all[i].sessionId === currentSessionId) return all[i].title;
      }
      return undefined;
    }

    function focusable(container) {
      return Array.prototype.filter.call(
        container.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])"),
        function (element) { return !element.hidden && element.offsetParent !== null; }
      );
    }

    function trapFocus(event, container, close) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusable(container);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function closeOverflow(restore) {
      overflow.hidden = true;
      moreButton.setAttribute("aria-expanded", "false");
      if (restore) moreButton.focus();
    }

    function closeSessions(restore) {
      sessionBackdrop.hidden = true;
      sessionsButton.setAttribute("aria-expanded", "false");
      if (restore) sessionsButton.focus();
    }

    function switchMode(mode) {
      sessionMode = mode;
      activeTab.setAttribute("aria-pressed", mode === "active" ? "true" : "false");
      archivedTab.setAttribute("aria-pressed", mode === "archived" ? "true" : "false");
      renderSessions();
    }

    function visibleOpenButtons() {
      return Array.prototype.slice.call(sessionList.querySelectorAll(".dshmux-session-open"));
    }

    function moveSessionFocus(event) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      var buttons = visibleOpenButtons();
      if (!buttons.length) return;
      event.preventDefault();
      var index = buttons.indexOf(doc.activeElement);
      var delta = event.key === "ArrowDown" ? 1 : -1;
      if (index < 0) index = delta > 0 ? -1 : 0;
      buttons[(index + delta + buttons.length) % buttons.length].focus();
    }

    function iconAction(label, glyph, onClick) {
      var button = doc.createElement("button");
      button.type = "button";
      button.className = "dshmux-icon-button";
      button.textContent = glyph;
      labelButton(button, label);
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    function beginRename(row, item, openButton, actions) {
      editingSessionId = item.sessionId;
      var input = doc.createElement("input");
      input.className = "dshmux-session-rename-input";
      input.value = item.title;
      input.placeholder = copy.renamePlaceholder;
      input.setAttribute("aria-label", copy.rename);
      openButton.hidden = true;
      actions.hidden = true;
      row.insertBefore(input, actions);
      var finished = false;

      function finish(save) {
        if (finished) return;
        finished = true;
        var next = input.value.trim();
        var submitted = save && next && next !== item.title;
        if (submitted) {
          post({ type: "rename-session", sessionId: item.sessionId, title: next });
        } else {
          editingSessionId = undefined;
        }
        input.remove();
        openButton.hidden = false;
        actions.hidden = false;
        openButton.focus();
      }

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", function () { finish(false); });
      input.focus();
      input.select();
    }

    function renderSessions() {
      if (sessionBackdrop.hidden) return;
      // Background polling must not replace the row and blur an active rename.
      if (editingSessionId) return;
      sessionList.textContent = "";
      sessionMessage.textContent = "";
      emptyNew.hidden = true;
      var source = sessionMode === "archived" ? archivedSessions : sessions;
      var items = filterSessions(source, search.value);
      if (!items.length) {
        sessionMessage.textContent = copy.empty;
        emptyNew.hidden = sessionMode !== "active";
        return;
      }

      items.forEach(function (item) {
        var row = doc.createElement("div");
        row.className = "dshmux-session-row";

        var openButton = doc.createElement("button");
        openButton.type = "button";
        openButton.className = "dshmux-session-open";
        openButton.setAttribute("role", "option");
        openButton.setAttribute("aria-selected", item.sessionId === currentSessionId ? "true" : "false");
        if (item.sessionId === currentSessionId) openButton.setAttribute("aria-current", "true");

        var name = doc.createElement("span");
        name.className = "dshmux-session-name";
        name.textContent = item.title;
        var time = doc.createElement("span");
        time.className = "dshmux-session-time";
        time.textContent = relativeTime(item.updatedAt, Date.now(), copy.timeNow);
        openButton.appendChild(name);
        openButton.appendChild(time);
        openButton.addEventListener("click", function () {
          closeSessions(false);
          post({ type: "open-session", sessionId: item.sessionId });
        });
        openButton.addEventListener("keydown", moveSessionFocus);

        var actions = doc.createElement("div");
        actions.className = "dshmux-session-actions";
        actions.appendChild(iconAction(copy.rename, "✎", function () {
          beginRename(row, item, openButton, actions);
        }));
        if (!item.archived) {
          actions.appendChild(iconAction(copy.archive, "⊟", function () {
            post({ type: "archive-session", sessionId: item.sessionId });
          }));
        }
        row.appendChild(openButton);
        row.appendChild(actions);
        sessionList.appendChild(row);
      });
    }

    function openSessions() {
      if (sessionsButton.disabled) return;
      closeOverflow(false);
      sessionBackdrop.hidden = false;
      sessionsButton.setAttribute("aria-expanded", "true");
      search.value = "";
      switchMode("active");
      win.requestAnimationFrame(function () { search.focus(); });
      post({ type: "refresh-sessions" });
    }

    function openOverflow() {
      closeSessions(false);
      overflow.hidden = false;
      moreButton.setAttribute("aria-expanded", "true");
      var first = focusable(overflow)[0];
      if (first) first.focus();
    }

    function stateText(state, message) {
      if (state === "ready") return copy.ready;
      if (state === "starting") return copy.starting;
      if (state === "stopping") return copy.stopping;
      if (state === "error") return template(copy.errorTemplate, { message: message || "unknown" });
      return copy.stopped;
    }

    function applyServerStatus(message) {
      serverState = message.state || serverState;
      doctorState = message.doctorState || doctorState;
      if (Object.prototype.hasOwnProperty.call(message, "latestVersion")) {
        latestVersion = message.latestVersion;
      }
      if (Object.prototype.hasOwnProperty.call(message, "nextVersion")) {
        nextVersion = message.nextVersion;
      }
      var ready = serverState === "ready";
      sessionsButton.disabled = !ready;
      newButton.disabled = !ready || newPending;
      stopButton.hidden = !ready;
      updateLatest.hidden = !latestVersion;
      updateLatest.textContent = latestVersion
        ? template(copy.updateLatestTemplate, { version: latestVersion })
        : "";
      updateNext.hidden = !nextVersion;
      updateNext.textContent = nextVersion
        ? template(copy.updateNextTemplate, { version: nextVersion })
        : "";

      if (!ready && sessionLoading) {
        sessionLoading = false;
        stopReadyWatch();
      }
      if (sessionLoading && ready) {
        overlay.dataset.mode = "session";
        overlay.hidden = false;
        overlayMessage.textContent = copy.loadingSession;
        progress.hidden = false;
        startButton.hidden = true;
        overlayDoctor.hidden = true;
        doc.body.setAttribute("aria-busy", "true");
        return;
      }

      if (ready && !sessionLoading) {
        overlay.hidden = true;
        doc.body.removeAttribute("aria-busy");
        return;
      }

      overlay.hidden = false;
      overlay.removeAttribute("data-mode");
      progress.hidden = serverState !== "starting" && serverState !== "stopping";
      startButton.hidden = true;
      overlayDoctor.hidden = true;
      if (serverState === "starting" || serverState === "stopping") {
        doc.body.setAttribute("aria-busy", "true");
      } else {
        doc.body.removeAttribute("aria-busy");
      }
      overlayMessage.textContent = stateText(serverState, message.message);
      if (serverState === "stopped" || serverState === "error") {
        var doctorRequired = doctorState && doctorState !== "ready";
        startButton.textContent = serverState === "error" ? copy.retry : copy.start;
        startButton.hidden = doctorRequired;
        overlayDoctor.hidden = false;
      }
    }

    function applySnapshot(message) {
      sessions = normalizedSessions(message.items);
      archivedSessions = normalizedSessions(message.archivedItems).map(function (item) {
        item.archived = true;
        return item;
      });
      if (typeof message.currentSessionId === "string") currentSessionId = message.currentSessionId;
      var nextTitle = selectedTitle();
      if (nextTitle) setTitle(nextTitle);
      renderSessions();
      if (message.error) sessionMessage.textContent = message.error;
    }

    function applyOperation(message) {
      if (message.operation === "rename" && message.state !== "pending") {
        editingSessionId = undefined;
        renderSessions();
      }
      if (message.operation === "new") {
        newPending = message.state === "pending";
        newButton.disabled = serverState !== "ready" || newPending;
        newButton.setAttribute("aria-busy", newPending ? "true" : "false");
      }
      if (message.state === "error") {
        var error = template(copy.actionFailedTemplate, { message: message.message || "unknown" });
        showToast(error);
        if (!sessionBackdrop.hidden) sessionMessage.textContent = error;
      }
    }

    sessionsButton.addEventListener("click", function () {
      if (sessionBackdrop.hidden) openSessions();
      else closeSessions(true);
    });
    newButton.addEventListener("click", function () {
      if (!newButton.disabled) post({ type: "new-session" });
    });
    emptyNew.addEventListener("click", function () { post({ type: "new-session" }); });
    moreButton.addEventListener("click", function () {
      if (overflow.hidden) openOverflow();
      else closeOverflow(true);
    });
    search.addEventListener("input", renderSessions);
    search.addEventListener("keydown", moveSessionFocus);
    activeTab.addEventListener("click", function () { switchMode("active"); });
    archivedTab.addEventListener("click", function () { switchMode("archived"); });
    sessionBackdrop.addEventListener("pointerdown", function (event) {
      if (event.target === sessionBackdrop) closeSessions(true);
    });
    sessionDialog.addEventListener("keydown", function (event) {
      trapFocus(event, sessionDialog, closeSessions);
    });
    startButton.addEventListener("click", function () { post({ type: "start" }); });
    overlayDoctor.addEventListener("click", function () { post({ type: "open-doctor" }); });

    overflow.addEventListener("keydown", function (event) {
      trapFocus(event, overflow, closeOverflow);
    });
    overflow.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("[data-command]");
      if (!button) return;
      var command = button.getAttribute("data-command");
      if (command !== "show-status") closeOverflow(true);
      if (command === "upgrade-latest") post({ type: "upgrade", channel: "latest" });
      else if (command === "upgrade-next") post({ type: "upgrade", channel: "next" });
      else if (command === "show-status") post({ type: "show-status" });
      else post({ type: command });
    });
    doc.addEventListener("pointerdown", function (event) {
      if (!overflow.hidden && !overflow.contains(event.target) && !moreButton.contains(event.target)) {
        closeOverflow(false);
      }
    });

    function stopReadyWatch() {
      if (readyObserver) readyObserver.disconnect();
      readyObserver = undefined;
      if (readyTimer) win.clearTimeout(readyTimer);
      readyTimer = undefined;
    }

    function watchForRenderedSession() {
      function scheduleReady() {
        var rootElement = doc.getElementById("root");
        if (!rootElement || !rootElement.firstElementChild || rootElement.querySelector("[data-dsh-boot]")) {
          if (readyTimer) win.clearTimeout(readyTimer);
          readyTimer = undefined;
          return;
        }
        if (readyTimer) win.clearTimeout(readyTimer);
        readyTimer = win.setTimeout(function () {
          win.requestAnimationFrame(function () {
            win.requestAnimationFrame(function () {
              sessionLoading = false;
              stopReadyWatch();
              applyServerStatus({ state: serverState });
            });
          });
        }, 450);
      }
      readyObserver = new win.MutationObserver(scheduleReady);
      readyObserver.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      win.addEventListener("load", scheduleReady, { once: true });
      scheduleReady();
    }

    win.addEventListener("message", function (event) {
      var message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "server-status") applyServerStatus(message);
      else if (message.type === "session-loading") {
        sessionLoading = message.loading !== false;
        if (sessionLoading) {
          overlay.dataset.mode = "session";
          overlay.hidden = false;
          overlayMessage.textContent = copy.loadingSession;
          progress.hidden = false;
          startButton.hidden = true;
          overlayDoctor.hidden = true;
          doc.body.setAttribute("aria-busy", "true");
        } else {
          applyServerStatus({ state: serverState });
        }
      } else if (message.type === "sessions-snapshot") applySnapshot(message);
      else if (message.type === "session-operation") applyOperation(message);
      else if (message.type === "status-detail") {
        byId("dshmux-state-value").textContent = stateText(message.state, message.message);
        byId("dshmux-extension-value").textContent = message.extensionVersion || copy.notAvailable;
        byId("dshmux-dsh-value").textContent = message.dshVersion || copy.notAvailable;
        statusDetail.hidden = false;
      }
    });

    var storageKey = "dsh.sessions.current";
    var lastStoredSessionId = sessionIdFromStorage(win.localStorage.getItem(storageKey));
    var nativeSetItem = win.Storage && win.Storage.prototype.setItem;
    if (nativeSetItem) {
      win.Storage.prototype.setItem = function (key, value) {
        nativeSetItem.apply(this, arguments);
        if (this === win.localStorage && key === storageKey) notifyStoredSession(value);
      };
    }
    function notifyStoredSession(value) {
      var nextId = sessionIdFromStorage(value);
      if (!nextId || nextId === lastStoredSessionId) return;
      lastStoredSessionId = nextId;
      currentSessionId = nextId;
      post({ type: "active-session-changed", sessionId: nextId });
    }
    win.addEventListener("storage", function (event) {
      if (event.key === storageKey) notifyStoredSession(event.newValue);
    });

    applyServerStatus({
      state: serverState,
      doctorState: doctorState,
      latestVersion: latestVersion,
      nextVersion: nextVersion,
    });
    if (sessionLoading) watchForRenderedSession();
    post({ type: "chrome-ready" });
  }

  return {
    filterSessions: filterSessions,
    normalizedSessions: normalizedSessions,
    relativeTime: relativeTime,
    timestampOf: timestampOf,
    sessionIdFromStorage: sessionIdFromStorage,
    template: template,
    mount: mount,
  };
});
