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

  function normalizedPinnedIds(items) {
    if (!Array.isArray(items)) return [];
    var seen = Object.create(null);
    return items.filter(function (item) {
      if (typeof item !== "string" || !item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function pinnedSessions(active, archived, pinnedIds) {
    var byId = Object.create(null);
    normalizedSessions(active).concat(normalizedSessions(archived)).forEach(function (item) {
      byId[item.sessionId] = item;
    });
    return normalizedPinnedIds(pinnedIds).map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function groupedSearchResults(items, pinnedIds) {
    var pins = Object.create(null);
    normalizedPinnedIds(pinnedIds).forEach(function (id) { pins[id] = true; });
    var seen = Object.create(null);
    var groups = { pinned: [], active: [], archived: [] };
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || typeof item.sessionId !== "string" || typeof item.title !== "string" ||
          typeof item.snippet !== "string" || seen[item.sessionId]) return;
      seen[item.sessionId] = true;
      var normalized = {
        sessionId: item.sessionId,
        title: item.title,
        updatedAt: item.updatedAt,
        archived: item.archived === true,
        snippet: item.snippet,
      };
      if (pins[item.sessionId]) groups.pinned.push(normalized);
      else if (normalized.archived) groups.archived.push(normalized);
      else groups.active.push(normalized);
    });
    return groups;
  }

  function processActionFor(state, doctorState, copy) {
    if (state === "ready") return { command: "stop", label: copy.stop, disabled: false };
    if (state === "stopped") return { command: "start", label: copy.start, disabled: false };
    if (state === "error") {
      if (doctorState && doctorState !== "ready") {
        return { command: "open-doctor", label: copy.openDoctor, disabled: false };
      }
      return { command: "start", label: copy.retryDsh, disabled: false };
    }
    return {
      command: "",
      label: state === "stopping" ? copy.stopping : copy.starting,
      disabled: true,
    };
  }

  function isLatestSearchResult(requestId, activeRequestId) {
    return requestId === activeRequestId;
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

  function hiddenSidebarGridTemplate(value) {
    return String(value || "").replace(/^\s*-?\d+(?:\.\d+)?px\b/, "0px");
  }

  function dshShellFrame(anchor, root) {
    var element = anchor && anchor.parentElement;
    while (element && element !== root) {
      var template = element.style && element.style.gridTemplateColumns;
      if (template && hiddenSidebarGridTemplate(template) !== template) return element;
      element = element.parentElement;
    }
    return undefined;
  }

  function template(text, values) {
    return Object.keys(values || {}).reduce(function (out, key) {
      return out.split("{" + key + "}").join(String(values[key]));
    }, String(text || ""));
  }

  function dictationClickRequest(isTrusted, state) {
    if (!isTrusted) return undefined;
    if (state === "idle" || state === "error") return "dshmux-dictation-start";
    if (state === "preparing" || state === "listening") return "dshmux-dictation-stop";
    return undefined;
  }

  function dictationCancelRequest(isTrusted, key, state) {
    return isTrusted && key === "Escape" &&
      (state === "preparing" || state === "listening" || state === "stopping")
      ? "dshmux-dictation-cancel"
      : undefined;
  }

  function visibleText(element) {
    return String(element.innerText !== undefined ? element.innerText : element.textContent || "");
  }

  function insertComposerText(doc, transcript, schedule) {
    return new Promise(function (resolve) {
      var text = String(transcript || "").trim();
      var editor = doc.querySelector('[data-composer-input][contenteditable="true"]');
      if (!text || !editor) {
        resolve({ ok: false, code: "composer-unavailable" });
        return;
      }
      var before = visibleText(editor);
      var join = before && !/\s$/.test(before) && !/^[,.;:!?)}\]'\"]/.test(text) ? " " : "";
      var insertion = join + text;
      try {
        var selection = doc.getSelection ? doc.getSelection() : doc.defaultView.getSelection();
        if (!selection) throw new Error("selection unavailable");
        editor.focus();
        selection.removeAllRanges();
        selection.collapse(editor, editor.childNodes.length);
        if (!doc.execCommand("insertText", false, insertion)) {
          resolve({ ok: false, code: "composer-insert-failed" });
          return;
        }
      } catch (_err) {
        resolve({ ok: false, code: "composer-insert-failed" });
        return;
      }
      (schedule || function (callback) { setTimeout(callback, 0); })(function () {
        var after = visibleText(editor);
        resolve({
          ok: after.indexOf(before) === 0 && after.trimEnd().endsWith(text),
          code: "composer-insert-failed",
        });
      });
    });
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
    var fullText = byId("dshmux-full-text");
    var pinnedTab = byId("dshmux-pinned-tab");
    var activeTab = byId("dshmux-active-tab");
    var archivedTab = byId("dshmux-archived-tab");
    var sessionMessage = byId("dshmux-session-message");
    var sessionList = byId("dshmux-session-list");
    var emptyNew = byId("dshmux-empty-new");
    var overflow = byId("dshmux-overflow");
    var sidebarToggle = byId("dshmux-toggle-dsh-sidebar");
    var processButton = byId("dshmux-process-action");
    var updateLatest = byId("dshmux-update-latest");
    var updateNext = byId("dshmux-update-next");
    var statusDetail = byId("dshmux-status-detail");
    var overlay = byId("dshmux-overlay");
    var overlayMessage = byId("dshmux-overlay-message");
    var progress = byId("dshmux-progress");
    var startButton = byId("dshmux-start");
    var overlayDoctor = byId("dshmux-overlay-doctor");
    var toast = byId("dshmux-toast");
    var dictationToggle = doc.getElementById("dshmux-dictation-toggle");
    var dictationStatus = doc.getElementById("dshmux-dictation-status");

    var sessions = [];
    var archivedSessions = [];
    var pinnedSessionIds = normalizedPinnedIds(init.pinnedSessionIds);
    var currentSessionId = init.currentSessionId;
    var sessionMode = "active";
    var editingSessionId;
    var headerEditingSessionId;
    var pinPendingSessionId;
    var searchTimer;
    var searchRequestId = 0;
    var activeSearchRequestId = 0;
    var searchPending = false;
    var searchResults = [];
    var searchHasMore = false;
    var searchError = "";
    var newPending = false;
    var sessionLoading = init.initialSessionLoading === true;
    var serverState = init.serverState || "stopped";
    var doctorState = init.doctorState;
    var latestVersion = init.latestVersion;
    var nextVersion = init.nextVersion;
    var toastTimer;
    var readyObserver;
    var readyTimer;
    var viewState = typeof vscode.getState === "function" ? (vscode.getState() || {}) : {};
    var dshSidebarVisible = viewState.dshSidebarVisible === true;
    var dshSidebarFrame;
    var dshSidebarOccupant;
    var dshSidebarHandle;
    var dictationState = "idle";
    var dictationGeneration;
    var dictationCompleted = false;

    function labelButton(button, label) {
      button.title = label;
      button.setAttribute("aria-label", label);
    }

    title.textContent = init.currentTitle;
    title.title = init.currentTitle;
    title.setAttribute("aria-label", copy.rename);
    labelButton(sessionsButton, copy.sessions);
    labelButton(newButton, copy.newSession);
    labelButton(moreButton, copy.more);
    overflow.setAttribute("aria-label", copy.more);
    search.placeholder = copy.searchSessions;
    search.setAttribute("aria-label", copy.searchSessions);
    byId("dshmux-full-text-label").textContent = copy.fullTextSearch;
    fullText.setAttribute("aria-label", copy.fullTextSearch);
    pinnedTab.textContent = copy.pinned;
    activeTab.textContent = copy.active;
    archivedTab.textContent = copy.archived;
    emptyNew.textContent = copy.newSession;
    byId("dshmux-state-label").textContent = copy.status;
    byId("dshmux-extension-label").textContent = copy.extensionVersion;
    byId("dshmux-dsh-label").textContent = copy.dshVersion;
    startButton.textContent = copy.start;
    overlayDoctor.textContent = copy.openDoctor;
    if (dictationToggle) labelButton(dictationToggle, copy.dictationStart);

    var menuCopy = {
      "open-in-editor": copy.openInEditor,
      "open-settings": copy.openSettings,
      "open-doctor": copy.openDoctor,
      "show-status": copy.statusVersions,
    };
    Array.prototype.forEach.call(overflow.querySelectorAll("[data-command]"), function (button) {
      var command = button.getAttribute("data-command");
      if (menuCopy[command]) button.textContent = menuCopy[command];
    });

    function applyDshSidebar() {
      var rootElement = doc.getElementById("root");
      var overlayAnchor = doc.querySelector("#root [data-shell-overlay]");
      var frame = dshSidebarFrame || dshShellFrame(overlayAnchor, rootElement);
      if (!frame) return;
      if (frame !== dshSidebarFrame) {
        dshSidebarFrame = frame;
        dshSidebarOccupant = frame.firstElementChild;
        dshSidebarHandle = frame.querySelector(":scope > [data-side='sidebar']");
        sidebarObserver.disconnect();
        sidebarObserver.observe(frame, { attributes: true, attributeFilter: ["style"] });
      }
      if (dshSidebarVisible) {
        if (dshSidebarOccupant) dshSidebarOccupant.removeAttribute("data-dshmux-sidebar-occupant-hidden");
        if (dshSidebarHandle) dshSidebarHandle.removeAttribute("data-dshmux-sidebar-handle-hidden");
        if (frame.dataset.dshmuxSidebarGrid) {
          frame.style.gridTemplateColumns = frame.dataset.dshmuxSidebarGrid;
          delete frame.dataset.dshmuxSidebarGrid;
        }
      } else {
        var template = frame.style.gridTemplateColumns;
        var hiddenTemplate = hiddenSidebarGridTemplate(template);
        if (template && hiddenTemplate !== template) {
          frame.dataset.dshmuxSidebarGrid = template;
          frame.style.gridTemplateColumns = hiddenTemplate;
        }
        if (dshSidebarOccupant) dshSidebarOccupant.setAttribute("data-dshmux-sidebar-occupant-hidden", "true");
        if (dshSidebarHandle) dshSidebarHandle.setAttribute("data-dshmux-sidebar-handle-hidden", "true");
      }
      sidebarToggle.textContent = dshSidebarVisible ? copy.hideDshSidebar : copy.showDshSidebar;
      sidebarToggle.setAttribute("aria-pressed", dshSidebarVisible ? "true" : "false");
      doc.body.setAttribute("data-dshmux-dsh-sidebar", dshSidebarVisible ? "visible" : "hidden");
    }

    var sidebarObserver = new win.MutationObserver(applyDshSidebar);
    sidebarObserver.observe(doc.getElementById("root") || doc.documentElement, {
      childList: true,
      subtree: true,
    });
    applyDshSidebar();

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

    function renderDictationState(state, errorCode) {
      if (!dictationToggle || !dictationStatus) return;
      dictationState = state;
      var active = state === "preparing" || state === "listening" || state === "stopping";
      dictationToggle.setAttribute("aria-pressed", active ? "true" : "false");
      dictationToggle.disabled = state === "stopping";
      labelButton(dictationToggle, active ? copy.dictationStop : copy.dictationStart);
      dictationStatus.removeAttribute("data-state");
      if (state === "preparing") dictationStatus.textContent = copy.dictationPreparing;
      else if (state === "listening") dictationStatus.textContent = copy.dictationListening;
      else if (state === "stopping") dictationStatus.textContent = copy.dictationStopping;
      else if (state === "error") {
        dictationStatus.dataset.state = "error";
        dictationStatus.textContent = template(copy.dictationErrorTemplate, { code: errorCode || "unknown" });
      } else dictationStatus.textContent = "";
    }

    function scheduleComposerCheck(callback) {
      win.requestAnimationFrame(function () { win.requestAnimationFrame(callback); });
    }

    function applyDictationMessage(message) {
      if (!dictationToggle || !dictationStatus) return;
      if (message.type === "dshmux-dictation-state") {
        if (message.generation !== null &&
            (!Number.isInteger(message.generation) || message.generation < 1)) return;
        if (["idle", "preparing", "listening", "stopping", "error"].indexOf(message.state) < 0) return;
        if (message.generation !== null) {
          if (dictationGeneration !== undefined && message.generation < dictationGeneration) return;
          dictationGeneration = message.generation;
          if (message.state === "preparing") dictationCompleted = false;
        }
        renderDictationState(message.state, message.errorCode);
        return;
      }
      if (message.type !== "dshmux-dictation-transcript" ||
          !Number.isInteger(message.generation) ||
          message.generation !== dictationGeneration ||
          typeof message.text !== "string" ||
          (message.phase !== "interim" && message.phase !== "complete")) return;
      if (message.phase === "interim") {
        if (dictationState === "listening") dictationStatus.textContent = message.text;
        return;
      }
      if (dictationCompleted || dictationState !== "stopping") return;
      dictationCompleted = true;
      void insertComposerText(doc, message.text, scheduleComposerCheck).then(function (result) {
        if (!result.ok) {
          dictationStatus.dataset.state = "error";
          dictationStatus.textContent = copy.dictationComposerUnavailable;
        }
      });
    }

    function setTitle(next) {
      if (!next || headerEditingSessionId) return;
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

    function beginHeaderRename() {
      if (headerEditingSessionId || !currentSessionId || serverState !== "ready") return;
      var previous = selectedTitle() || title.textContent;
      if (!previous) return;
      var sessionId = currentSessionId;
      var input = doc.createElement("input");
      input.className = "dshmux-header-rename-input";
      input.value = previous;
      input.placeholder = copy.renamePlaceholder;
      input.setAttribute("aria-label", copy.rename);
      headerEditingSessionId = sessionId;
      title.textContent = "";
      title.appendChild(input);
      var finished = false;

      function finish(save) {
        if (finished) return;
        var next = input.value.trim();
        var submitted = save && next && next !== previous;
        finished = true;
        if (submitted) {
          input.disabled = true;
          post({ type: "rename-session", sessionId: sessionId, title: next });
          return;
        }
        headerEditingSessionId = undefined;
        setTitle(previous);
        title.focus();
      }

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", function () { finish(false); });
      input.focus();
      input.select();
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
      if (searchTimer) win.clearTimeout(searchTimer);
      searchTimer = undefined;
      activeSearchRequestId = ++searchRequestId;
      searchPending = false;
      sessionBackdrop.hidden = true;
      sessionsButton.setAttribute("aria-expanded", "false");
      if (restore) sessionsButton.focus();
    }

    function switchMode(mode) {
      sessionMode = mode;
      pinnedTab.setAttribute("aria-pressed", mode === "pinned" ? "true" : "false");
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

    function isPinned(sessionId) {
      return pinnedSessionIds.indexOf(sessionId) >= 0;
    }

    function appendSessionRow(item, showSnippet) {
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
      if (showSnippet) {
        var snippet = doc.createElement("span");
        snippet.className = "dshmux-session-snippet";
        snippet.textContent = item.snippet;
        openButton.appendChild(snippet);
      }
      openButton.addEventListener("click", function () {
        closeSessions(false);
        post({ type: "open-session", sessionId: item.sessionId });
      });
      openButton.addEventListener("keydown", moveSessionFocus);

      var actions = doc.createElement("div");
      actions.className = "dshmux-session-actions";
      var pinButton = iconAction(
        isPinned(item.sessionId) ? copy.unpin : copy.pin,
        isPinned(item.sessionId) ? "★" : "☆",
        function () { post({ type: "toggle-pin", sessionId: item.sessionId }); }
      );
      pinButton.disabled = pinPendingSessionId === item.sessionId;
      actions.appendChild(pinButton);
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
    }

    function appendSearchGroup(label, items) {
      if (!items.length) return;
      var heading = doc.createElement("div");
      heading.className = "dshmux-session-group";
      heading.textContent = label;
      sessionList.appendChild(heading);
      items.forEach(function (item) { appendSessionRow(item, true); });
    }

    function renderSessions() {
      if (sessionBackdrop.hidden) return;
      // Background polling must not replace the row and blur an active rename.
      if (editingSessionId) return;
      sessionList.textContent = "";
      sessionMessage.textContent = "";
      emptyNew.hidden = true;
      var fullTextActive = fullText.checked && String(search.value || "").trim();
      if (fullTextActive) {
        if (searchPending) {
          sessionMessage.textContent = copy.searching;
          return;
        }
        if (searchError) {
          sessionMessage.textContent = template(copy.actionFailedTemplate, { message: searchError });
          return;
        }
        var groups = groupedSearchResults(searchResults, pinnedSessionIds);
        appendSearchGroup(copy.pinned, groups.pinned);
        appendSearchGroup(copy.active, groups.active);
        appendSearchGroup(copy.archived, groups.archived);
        if (!groups.pinned.length && !groups.active.length && !groups.archived.length) {
          sessionMessage.textContent = searchHasMore ? copy.moreResults : copy.empty;
        } else if (searchHasMore) {
          sessionMessage.textContent = copy.moreResults;
        }
        return;
      }
      var source = sessionMode === "pinned"
        ? pinnedSessions(sessions, archivedSessions, pinnedSessionIds)
        : sessionMode === "archived" ? archivedSessions : sessions;
      var items = filterSessions(source, search.value);
      if (!items.length) {
        sessionMessage.textContent = copy.empty;
        emptyNew.hidden = sessionMode !== "active";
        return;
      }
      items.forEach(function (item) { appendSessionRow(item, false); });
    }

    function queueSearch() {
      if (searchTimer) win.clearTimeout(searchTimer);
      searchTimer = undefined;
      activeSearchRequestId = ++searchRequestId;
      searchPending = false;
      searchError = "";
      searchHasMore = false;
      searchResults = [];
      var query = String(search.value || "").trim();
      if (!fullText.checked || !query) {
        renderSessions();
        return;
      }
      searchPending = true;
      renderSessions();
      var requestId = activeSearchRequestId;
      searchTimer = win.setTimeout(function () {
        searchTimer = undefined;
        post({ type: "search-sessions", requestId: requestId, query: query });
      }, 250);
    }

    function openSessions() {
      if (sessionsButton.disabled) return;
      closeOverflow(false);
      sessionBackdrop.hidden = false;
      sessionsButton.setAttribute("aria-expanded", "true");
      search.value = "";
      switchMode(pinnedSessions(sessions, archivedSessions, pinnedSessionIds).length ? "pinned" : "active");
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
      var processAction = processActionFor(serverState, doctorState, copy);
      processButton.textContent = processAction.label;
      processButton.setAttribute("data-command", processAction.command);
      processButton.disabled = processAction.disabled;
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
      pinnedSessionIds = normalizedPinnedIds(message.pinnedSessionIds);
      if (typeof message.currentSessionId === "string") currentSessionId = message.currentSessionId;
      var nextTitle = selectedTitle();
      if (nextTitle) setTitle(nextTitle);
      renderSessions();
      if (message.error) sessionMessage.textContent = message.error;
    }

    function applyOperation(message) {
      if (message.operation === "rename" && message.state !== "pending") {
        editingSessionId = undefined;
        if (headerEditingSessionId === message.sessionId) {
          headerEditingSessionId = undefined;
          setTitle(selectedTitle() || init.currentTitle);
          title.focus();
        }
        renderSessions();
      }
      if (message.operation === "pin") {
        pinPendingSessionId = message.state === "pending" ? message.sessionId : undefined;
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

    function applySearchResult(message) {
      if (!isLatestSearchResult(message.requestId, activeSearchRequestId)) return;
      searchPending = false;
      searchResults = Array.isArray(message.items) ? message.items : [];
      searchHasMore = message.hasMore === true;
      searchError = typeof message.error === "string" ? message.error : "";
      renderSessions();
    }

    title.addEventListener("dblclick", beginHeaderRename);
    title.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !headerEditingSessionId) {
        event.preventDefault();
        beginHeaderRename();
      }
    });
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
    search.addEventListener("input", queueSearch);
    search.addEventListener("keydown", moveSessionFocus);
    fullText.addEventListener("change", queueSearch);
    pinnedTab.addEventListener("click", function () { switchMode("pinned"); });
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
    if (dictationToggle) {
      dictationToggle.addEventListener("click", function (event) {
        var type = dictationClickRequest(event.isTrusted, dictationState);
        if (type) post({ type: type });
      });
      doc.addEventListener("keydown", function (event) {
        var type = dictationCancelRequest(event.isTrusted, event.key, dictationState);
        if (!type) return;
        event.preventDefault();
        post({ type: type });
      });
    }

    overflow.addEventListener("keydown", function (event) {
      trapFocus(event, overflow, closeOverflow);
    });
    overflow.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("[data-command]");
      if (!button) return;
      var command = button.getAttribute("data-command");
      if (!command || button.disabled) return;
      if (command !== "show-status") closeOverflow(true);
      if (command === "upgrade-latest") post({ type: "upgrade", channel: "latest" });
      else if (command === "upgrade-next") post({ type: "upgrade", channel: "next" });
      else if (command === "toggle-dsh-sidebar") {
        dshSidebarVisible = !dshSidebarVisible;
        viewState.dshSidebarVisible = dshSidebarVisible;
        if (typeof vscode.setState === "function") vscode.setState(viewState);
        applyDshSidebar();
      }
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
      else if (message.type === "session-search-result") applySearchResult(message);
      else if (message.type === "dshmux-dictation-state" ||
               message.type === "dshmux-dictation-transcript") applyDictationMessage(message);
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
    normalizedPinnedIds: normalizedPinnedIds,
    pinnedSessions: pinnedSessions,
    groupedSearchResults: groupedSearchResults,
    processActionFor: processActionFor,
    isLatestSearchResult: isLatestSearchResult,
    relativeTime: relativeTime,
    timestampOf: timestampOf,
    sessionIdFromStorage: sessionIdFromStorage,
    hiddenSidebarGridTemplate: hiddenSidebarGridTemplate,
    dshShellFrame: dshShellFrame,
    template: template,
    dictationClickRequest: dictationClickRequest,
    dictationCancelRequest: dictationCancelRequest,
    insertComposerText: insertComposerText,
    mount: mount,
  };
});
