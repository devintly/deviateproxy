(function (root) {
  "use strict";

  var SESSION_SAVE_DELAY_MS = 300;
  var BADGE_BG = "#6d6f78";
  var BADGE_FG = "#ffffff";

  function resolveModule(name) {
    if (root && root[name]) return root[name];
    if (typeof globalThis !== "undefined" && globalThis[name]) return globalThis[name];
    return null;
  }

  function isWebUrl(url) {
    return typeof url === "string" && (url.indexOf("http:") === 0 || url.indexOf("https:") === 0);
  }

  // Учёт хостов, загруженных вкладкой, и счётчик на иконке. Одинаков для
  // Chrome и Firefox; различаются только задержка бейджа, ожидание
  // инициализации и досчёт через DNS (только Firefox).
  function create(options) {
    var api = options.api;
    var isProxied = options.isProxied;
    var badgeDelay = options.badgeDelay || 80;
    var ready = options.ready || function () { return Promise.resolve(); };
    var needsResolve = options.needsResolve || null;
    var resolveProxied = options.resolveProxied || null;
    var countEnabled = options.countEnabled || function () { return true; };

    var HostRules = resolveModule("HostRules");
    var ProxyConfig = resolveModule("ProxyConfig");

    var hosts = {};
    var proxied = {};
    var apexes = {};
    var targets = {};
    var badgeWait = {};
    var badgeTextCache = {};
    var badgeColorsReady = false;
    var sessionSaveTimer = null;
    var recountGeneration = 0;

    var ownBase = null;

    function ownPageBase() {
      if (ownBase === null) {
        try { ownBase = api.runtime.getURL(""); } catch (_) { ownBase = ""; }
      }
      return ownBase;
    }

    function sessionAvailable() {
      try {
        return !!(api.storage && api.storage.session && typeof api.storage.session.get === "function");
      } catch (_) {
        return false;
      }
    }

    function persistSession() {
      if (!sessionAvailable() || sessionSaveTimer) return;
      sessionSaveTimer = setTimeout(async function () {
        sessionSaveTimer = null;
        try {
          var hostsObj = {};
          var apexObj = {};
          Object.keys(hosts).forEach(function (id) {
            var set = hosts[id];
            if (set && set.size) hostsObj[id] = Array.from(set);
            if (apexes[id]) apexObj[id] = apexes[id];
          });
          await api.storage.session.set({ tabHosts: hostsObj, tabApex: apexObj });
        } catch (_) {}
      }, SESSION_SAVE_DELAY_MS);
    }

    async function restoreSession() {
      if (!sessionAvailable()) return;
      try {
        var saved = await api.storage.session.get(["tabHosts", "tabApex"]);
        if (saved && saved.tabHosts && typeof saved.tabHosts === "object") {
          Object.keys(saved.tabHosts).forEach(function (id) {
            var arr = saved.tabHosts[id];
            if (Array.isArray(arr)) hosts[Number(id)] = new Set(arr);
          });
        }
        if (saved && saved.tabApex && typeof saved.tabApex === "object") {
          Object.assign(apexes, saved.tabApex);
        }
      } catch (_) {}
    }

    function getUrlHost(url) {
      if (!url) return "";
      try {
        var parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
        return parsed.hostname.toLowerCase();
      } catch (_) {
        return "";
      }
    }

    function scheduleBadge(tabId) {
      if (tabId == null || tabId < 0 || badgeWait[tabId]) return;
      badgeWait[tabId] = setTimeout(function () {
        delete badgeWait[tabId];
        updateBadge(tabId);
      }, badgeDelay);
    }

    function remember(tabId, host, knownProxied) {
      if (tabId == null || tabId < 0 || !host || HostRules.isIgnoredHost(host)) return;
      var canon = HostRules.canonHost(host);
      if (!canon) return;
      var known = hosts[tabId] && hosts[tabId].has(canon);
      var stored = HostRules.rememberHost(hosts, tabId, canon);
      if (!stored) return;
      var changed = !known;
      if (knownProxied || isProxied(stored)) {
        if (!proxied[tabId]) proxied[tabId] = new Set();
        if (!proxied[tabId].has(stored)) {
          proxied[tabId].add(stored);
          changed = true;
        }
      }
      if (changed) {
        delete badgeTextCache[tabId];
        scheduleBadge(tabId);
        persistSession();
      }
    }

    function reset(tabId, apex, url) {
      if (tabId == null || tabId < 0) return;
      hosts[tabId] = new Set();
      proxied[tabId] = new Set();
      delete badgeTextCache[tabId];
      if (apex) apexes[tabId] = apex;
      else delete apexes[tabId];
      if (url) {
        if (isWebUrl(url)) targets[tabId] = url;
        var host = getUrlHost(url);
        if (host && !HostRules.isIgnoredHost(host)) remember(tabId, host, false);
      }
      scheduleBadge(tabId);
      persistSession();
    }

    function seed(tabId, url) {
      if (tabId == null || tabId < 0 || !url || HostRules.isOwnPage(url, ownPageBase())) return;
      var host = getUrlHost(url);
      if (!host || HostRules.isIgnoredHost(host)) return;
      var apex = HostRules.apexDomain(host);
      if (!apexes[tabId]) {
        apexes[tabId] = apex;
      } else if (apex && apex !== apexes[tabId]) {
        reset(tabId, apex, url);
        return;
      }
      remember(tabId, host, false);
    }

    function forget(tabId) {
      delete hosts[tabId];
      delete proxied[tabId];
      delete apexes[tabId];
      delete targets[tabId];
      delete badgeTextCache[tabId];
      if (badgeWait[tabId]) {
        clearTimeout(badgeWait[tabId]);
        delete badgeWait[tabId];
      }
      persistSession();
    }

    // Пересчёт счётчика: хосты, чей адрес известен только после DNS, досчитываются
    // асинхронно, а generation отбрасывает результаты устаревших пересчётов.
    function recountTab(tabId, generation) {
      var next = new Set();
      var unresolved = [];
      (hosts[tabId] || []).forEach(function (host) {
        if (isProxied(host)) next.add(host);
        else if (needsResolve && needsResolve(host)) unresolved.push(host);
      });
      var before = proxied[tabId] ? proxied[tabId].size : 0;
      proxied[tabId] = next;
      // Счётчик зависит только от количества, поэтому бейдж трогаем лишь при
      // его изменении: иначе пересчёт сам себя вызывает по кругу.
      if (before !== next.size) {
        delete badgeTextCache[tabId];
        scheduleBadge(tabId);
      }
      if (!resolveProxied || !unresolved.length) return;
      unresolved.forEach(function (host) {
        resolveProxied(host).then(function (hit) {
          if (!hit || generation !== recountGeneration) return;
          if (!hosts[tabId] || !hosts[tabId].has(host)) return;
          if (!proxied[tabId] || proxied[tabId].has(host)) return;
          proxied[tabId].add(host);
          delete badgeTextCache[tabId];
          scheduleBadge(tabId);
        }, function () {});
      });
    }

    function recount() {
      var generation = ++recountGeneration;
      Object.keys(hosts).forEach(function (id) {
        recountTab(Number(id), generation);
      });
    }

    async function updateBadge(tabId) {
      if (tabId == null || tabId < 0) return;
      await ready();
      if (!hosts[tabId] || hosts[tabId].size === 0) {
        try {
          var tab = await api.tabs.get(tabId);
          if (tab) seed(tabId, tab.pendingUrl || tab.url);
        } catch (_) {}
      }
      var count = proxied[tabId] ? proxied[tabId].size : 0;
      var text = ProxyConfig.badgeText(countEnabled() ? count : 0);
      if (badgeTextCache[tabId] === text) return;
      badgeTextCache[tabId] = text;
      try {
        if (!badgeColorsReady) {
          await applyBadgeColors();
        }
        await api.action.setBadgeText({ tabId: tabId, text: text });
      } catch (_) {}
    }

    async function applyBadgeColors() {
      try {
        await api.action.setBadgeBackgroundColor({ color: BADGE_BG });
        try { await api.action.setBadgeTextColor({ color: BADGE_FG }); } catch (_) {}
        badgeColorsReady = true;
      } catch (_) {}
    }

    async function refreshActiveBadge() {
      try {
        var tabs = await api.tabs.query({ active: true, currentWindow: true });
        if (!tabs || !tabs.length) tabs = await api.tabs.query({ active: true });
        (tabs || []).forEach(function (tab) {
          if (tab && tab.id != null) scheduleBadge(tab.id);
        });
      } catch (_) {}
    }

    async function seedOpenTabs() {
      try {
        var tabs = await api.tabs.query({});
        (tabs || []).forEach(function (tab) {
          if (tab && tab.id != null && tab.url) seed(tab.id, tab.url);
        });
      } catch (_) {}
    }

    // Общая реакция на tabs.onUpdated: следит за сменой сайта во вкладке,
    // чтобы список доменов и счётчик не смешивали разные сайты.
    function handleTabUpdate(tabId, change, tab) {
      var explicitUrl = (change && change.url) || (tab && tab.pendingUrl) || "";
      if (isWebUrl(explicitUrl)) {
        targets[tabId] = explicitUrl;
      } else if (change && change.status === "complete" && tab && isWebUrl(tab.url)) {
        targets[tabId] = tab.url;
      }

      if (explicitUrl) {
        var targetHost = getUrlHost(explicitUrl);
        var targetApex = targetHost ? HostRules.apexDomain(targetHost) : "";
        if (targetApex && apexes[tabId] && targetApex !== apexes[tabId]) {
          reset(tabId, targetApex, explicitUrl);
          return;
        }
        if (change && change.status === "loading") {
          reset(tabId, targetApex || apexes[tabId] || "", explicitUrl);
          return;
        }
        seed(tabId, explicitUrl);
        scheduleBadge(tabId);
        return;
      }

      var status = change && change.status;
      var tabUrl = (tab && tab.url) || "";
      var tabHost = getUrlHost(tabUrl);
      var tabApex = tabHost ? HostRules.apexDomain(tabHost) : "";

      if (status === "loading") {
        if (tabApex && apexes[tabId] && tabApex !== apexes[tabId]) return;
        if (tabUrl && tabHost) seed(tabId, tabUrl);
        return;
      }

      if (status === "complete") {
        if (tabApex && apexes[tabId] && tabApex !== apexes[tabId]) {
          reset(tabId, tabApex, tabUrl);
          return;
        }
        if (tabUrl) seed(tabId, tabUrl);
        scheduleBadge(tabId);
      }
    }

    function targetInfo(tabId) {
      var url = targets[tabId] || "";
      var host = getUrlHost(url);
      return {
        targetUrl: url,
        targetHost: host,
        targetApex: host ? HostRules.apexDomain(host) : (apexes[tabId] || "")
      };
    }

    async function domains(tabId) {
      if ((!hosts[tabId] || hosts[tabId].size === 0) && tabId != null && tabId >= 0) {
        try {
          var tab = await api.tabs.get(tabId);
          if (tab) seed(tabId, tab.pendingUrl || tab.url);
        } catch (_) {}
      }
      var set = hosts[tabId];
      if (!set) return [];
      return Array.from(set).filter(function (d) { return !HostRules.isIgnoredHost(d); }).sort();
    }

    return {
      getUrlHost: getUrlHost,
      remember: remember,
      reset: reset,
      seed: seed,
      forget: forget,
      recount: recount,
      scheduleBadge: scheduleBadge,
      updateBadge: updateBadge,
      applyBadgeColors: applyBadgeColors,
      refreshActiveBadge: refreshActiveBadge,
      seedOpenTabs: seedOpenTabs,
      handleTabUpdate: handleTabUpdate,
      targetInfo: targetInfo,
      domains: domains,
      apexOf: function (tabId) { return apexes[tabId] || ""; },
      hostsOf: function (tabId) { return hosts[tabId] ? Array.from(hosts[tabId]) : []; },
      proxiedCount: function (tabId) { return proxied[tabId] ? proxied[tabId].size : 0; },
      restoreSession: restoreSession,
      persistSession: persistSession
    };
  }

  var api = { create: create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TabTracker = api;
})(typeof self !== "undefined" ? self : this);
