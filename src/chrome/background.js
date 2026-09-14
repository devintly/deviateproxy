"use strict";

importScripts(
  "pac-parse.js",
  "tlds.js",
  "list-update.js",
  "list-ingest.js",
  "host-rules.js",
  "proxy-config.js",
  "generate-pac.js",
  "list-store.js",
  "tab-tracker.js"
);

const PROBE_HOST = "cp.cloudflare.com";

let proxyConfig = ProxyConfig.emptyConfig();
let proxyServers = [];
let proxyRules = [];
let directRules = [];
let extensionEnabled = false;
let disabledByConflict = false;
let maps = HostRules.rebuildMaps([], [], []);

let proxyMutex = Promise.resolve();
let initPromise = null;
let initialized = false;
let offscreenCreatePromise = null;
let proxyApplyError = "";
let proxyApplyErrorCode = "";
let pacCache = { key: "", code: "" };

const tabs = TabTracker.create({
  api: chrome,
  isProxied: host => HostRules.hostIsProxied(host, extensionEnabled, maps),
  badgeDelay: 80,
  countEnabled: () => extensionEnabled,
  ready: () => ensureInit()
});

const lists = ListStore.create({
  api: chrome,
  ingest: ingestOffscreen,
  withFetchRoute: withFetchRoute,
  onChanged: async () => {
    rebuildMaps();
    await applyProxySettings();
  },
  afterRun: closeOffscreenDocument,
  onUpdated: () => tabs.refreshActiveBadge(),
  onImport: async settings => {
    syncStateFromSettings(settings);
    rebuildMaps();
    try { await applyProxySettings(); } catch (_) {}
  }
});

function rebuildMaps() {
  const next = HostRules.rebuildMaps(proxyRules, directRules, lists.all());
  if (next === maps) return;
  maps = next;
  tabs.recount();
}

// Импортированные настройки приводятся к текущему формату прямо в объекте:
// ListStore сохранит именно его, поэтому память и storage не разъезжаются.
function syncStateFromSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  if (settings.proxyServers || settings.proxyConfig) {
    proxyServers = ProxyConfig.migrateProxyServers(settings.proxyServers, settings.proxyConfig);
    proxyConfig = ProxyConfig.configFromServers(proxyServers);
    settings.proxyServers = proxyServers;
    settings.proxyConfig = proxyConfig;
  }
  if (settings.proxyRules) proxyRules = settings.proxyRules;
  if (settings.directRules) directRules = settings.directRules;
  if (settings.extensionEnabled !== undefined) {
    extensionEnabled = !!settings.extensionEnabled && !!proxyConfig.host;
    settings.extensionEnabled = extensionEnabled;
  } else if (extensionEnabled && !proxyConfig.host) {
    extensionEnabled = false;
    settings.extensionEnabled = false;
  }
}

// Все записи в chrome.proxy.settings идут через эту очередь: окно временной
// маршрутизации загрузки списка удерживает её, чтобы маршрут не перезатёрли.
function withProxyLock(fn) {
  const task = proxyMutex.then(fn, fn);
  proxyMutex = task.then(() => {}, () => {});
  return task;
}

function proxyCallbackError() {
  const error = chrome.runtime.lastError;
  if (!error) return null;
  return ListUpdate.codedError("error_proxy_apply", error.message);
}

// PAC больших списков весит десятки мегабайт, и каждая установка заставляет
// Chrome разбирать его заново, поэтому последний применённый текст запоминается.
// null — состояние настроек ещё неизвестно, пустая строка — прокси снят.
let appliedPac = null;

function setProxyPac(data) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({
      value: { mode: "pac_script", pacScript: { data, mandatory: false } },
      scope: "regular"
    }, () => {
      const error = proxyCallbackError();
      if (error) {
        appliedPac = "";
        reject(error);
        return;
      }
      appliedPac = data;
      resolve();
    });
  });
}

function clearProxy() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      appliedPac = "";
      const error = proxyCallbackError();
      if (error) reject(error);
      else resolve();
    });
  });
}

// PAC для больших списков занимает мегабайты, поэтому его текст кэшируется
// и пересобирается только при смене правил, списков или самого прокси.
function activePacCode() {
  const proxyString = ProxyConfig.pacProxyString(proxyConfig);
  const probes = ProxyConfig.buildProbeMap(proxyServers);
  const key = `${maps.signature}|${proxyString}|${JSON.stringify(probes)}`;
  if (pacCache.key !== key) {
    pacCache = { key, code: GeneratePac.generatePacScript(proxyString, maps, probes) };
  }
  return pacCache.code;
}

async function applyProxyState() {
  try {
    if (!extensionEnabled || !proxyConfig.host || Number(proxyConfig.port) <= 0) {
      if (appliedPac !== "") await clearProxy();
    } else {
      const code = activePacCode();
      if (code !== appliedPac) await setProxyPac(code);
    }
    if (proxyApplyError || proxyApplyErrorCode) {
      proxyApplyError = "";
      proxyApplyErrorCode = "";
      await chrome.storage.local.remove(["proxyApplyError", "proxyApplyErrorCode"]);
    }
  } catch (error) {
    proxyApplyError = String(error && error.message || "").slice(0, 180);
    proxyApplyErrorCode = (error && error.code) || "error_proxy_apply";
    await chrome.storage.local.set({ proxyApplyError, proxyApplyErrorCode });
    await syncToolbarIcon();
    tabs.refreshActiveBadge();
    throw error;
  }
  await syncToolbarIcon();
  tabs.refreshActiveBadge();
}

function applyProxySettings() {
  return withProxyLock(applyProxyState);
}

async function syncToolbarIcon() {
  try {
    await chrome.action.setIcon({ path: ProxyConfig.iconPaths(ProxyConfig.toolbarIconOn(extensionEnabled, proxyConfig)) });
  } catch (_) {}
}

async function ensureOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    if (contexts.length) return;
  }
  if (!offscreenCreatePromise) {
    offscreenCreatePromise = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Разбор больших списков без блокировки service worker"
    }).catch(() => {}).finally(() => { offscreenCreatePromise = null; });
  }
  await offscreenCreatePromise;
}

async function closeOffscreenDocument() {
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}

async function ingestOffscreen(url, text) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ target: "offscreen", action: "ingestList", url, text });
  if (!response || !response.success) {
    throw ListUpdate.codedError((response && response.code) || "error_parse", response && response.error);
  }
  return response.item;
}

// На время скачивания списка публикуется PAC с точечным исключением для его
// хоста, после чего восстанавливаются обычные настройки.
async function withFetchRoute(url, viaProxy, fn) {
  if (viaProxy && (!proxyConfig.host || !(Number(proxyConfig.port) > 0))) {
    throw ListUpdate.codedError("power_setup", "Сначала добавьте прокси");
  }
  if (!viaProxy && (!extensionEnabled || !proxyConfig.host)) return fn();
  const host = new URL(url).hostname.toLowerCase();
  const temporary = Object.assign({}, maps, {
    dE: Object.assign({}, maps.dE),
    viaProxyHosts: Object.assign({}, maps.viaProxyHosts)
  });
  if (viaProxy) {
    temporary.viaProxyHosts[host] = 1;
    delete temporary.dE[host];
  } else {
    delete temporary.viaProxyHosts[host];
    temporary.dE[host] = 1;
  }
  return withProxyLock(async () => {
    await setProxyPac(GeneratePac.generatePacScript(
      ProxyConfig.pacProxyString(proxyConfig),
      temporary,
      ProxyConfig.buildProbeMap(proxyServers)
    ));
    try {
      return await fn();
    } finally {
      await applyProxyState();
    }
  });
}

async function pingServer(server) {
  if (!server || !server.host || !server.port) {
    return { id: server ? server.id : null, success: false, latency: null };
  }
  const probeUrl = `http://${PROBE_HOST}/generate_204?__deviate_probe=${server.id}&_t=${Date.now()}_${Math.random()}`;
  const start = performance.now();
  try {
    await fetch(probeUrl, { cache: "no-store", mode: "no-cors", signal: AbortSignal.timeout(5000) });
    return { id: server.id, success: true, latency: Math.max(1, Math.round(performance.now() - start)) };
  } catch (_) {
    return { id: server.id, success: false, latency: null };
  }
}

async function pingAllServers(serversToPing) {
  const targets = (serversToPing && serversToPing.length ? serversToPing : proxyServers).filter(p => p && p.host && p.port);
  if (!targets.length) return {};
  const wasDisabled = !extensionEnabled || !proxyConfig.host;
  if (wasDisabled) await setProxyPac(GeneratePac.generateProbePac(ProxyConfig.buildProbeMap(targets)));
  const results = {};
  try {
    (await Promise.all(targets.map(pingServer))).forEach(res => {
      if (res && res.id != null) results[res.id] = { success: res.success, latency: res.latency };
    });
  } finally {
    if (wasDisabled) {
      if (!extensionEnabled || !proxyConfig.host) await clearProxy();
      else await applyProxySettings();
    }
  }
  return results;
}

async function readProxySettings() {
  const attempts = [
    () => chrome.proxy.settings.get({ incognito: false }),
    () => chrome.proxy.settings.get({}),
    () => new Promise(resolve => {
      chrome.proxy.settings.get({ incognito: false }, s => resolve(chrome.runtime.lastError ? null : s));
    }),
    () => new Promise(resolve => {
      chrome.proxy.settings.get({}, s => resolve(chrome.runtime.lastError ? null : s));
    })
  ];
  for (const attempt of attempts) {
    try {
      const settings = await attempt();
      if (settings) return settings;
    } catch (_) {}
  }
  return null;
}

async function getProxyStatus() {
  const settings = await readProxySettings();
  const level = (settings && settings.levelOfControl) || "";
  return {
    isActive: extensionEnabled,
    levelOfControl: level,
    isBlocked: ProxyConfig.isProxyControlBlocked(level),
    settings: settings || {}
  };
}

async function handleConflictControl(isBlocked) {
  if (isBlocked) {
    if (extensionEnabled) {
      extensionEnabled = false;
      disabledByConflict = true;
      await chrome.storage.local.set({ extensionEnabled: false, disabledByConflict: true });
      await syncToolbarIcon();
      tabs.refreshActiveBadge();
    }
  } else if (disabledByConflict) {
    disabledByConflict = false;
    if (proxyConfig.host && Number(proxyConfig.port) > 0) {
      // Настройки могло переписать другое расширение, поэтому PAC ставим заново.
      appliedPac = null;
      extensionEnabled = true;
      await chrome.storage.local.set({ extensionEnabled: true, disabledByConflict: false });
      rebuildMaps();
      await applyProxySettings();
    } else {
      await chrome.storage.local.set({ disabledByConflict: false });
    }
  }
  return !!isBlocked;
}

chrome.webRequest.onAuthRequired.addListener(
  (details, callbackFn) => {
    ensureInit().then(() => {
      if (!details.isProxy) {
        callbackFn({});
        return;
      }
      const ch = details.challenger || {};
      const srv = ProxyConfig.findAuthServer(proxyServers, proxyConfig, ch.host, ch.port);
      callbackFn(srv ? { authCredentials: { username: srv.username, password: srv.password } } : {});
    }).catch(() => callbackFn({}));
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (details.tabId == null || details.tabId < 0) return;
    let host = "";
    // ws:// и wss:// тоже учитываются, поэтому хост берётся напрямую из URL.
    try { host = new URL(details.url).hostname.toLowerCase(); } catch (_) { return; }
    if (!host || HostRules.isIgnoredHost(host)) return;
    const record = () => {
      if (details.type === "main_frame") tabs.handleTabUpdate(details.tabId, { url: details.url }, null);
      else tabs.remember(details.tabId, host, false);
    };
    // После инициализации запросы обрабатываются сразу, без лишнего промиса.
    if (initialized) record();
    else ensureInit().then(record).catch(() => {});
  },
  { urls: ProxyConfig.HOST_ORIGINS.slice() }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  ensureInit().then(() => tabs.handleTabUpdate(tabId, changeInfo, tab)).catch(() => {});
});

chrome.tabs.onRemoved.addListener(tabId => tabs.forget(tabId));

chrome.tabs.onActivated.addListener(async info => {
  if (info.tabId == null || info.tabId < 0) return;
  await ensureInit();
  try {
    const tab = await chrome.tabs.get(info.tabId);
    if (tab && tab.url) tabs.seed(info.tabId, tab.url);
  } catch (_) {}
  tabs.scheduleBadge(info.tabId);
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ListStore.ALARM_NAME) return;
  await ensureInit();
  await lists.updateDue();
  await lists.scheduleAlarm();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.target === "offscreen") return false;
  if (msg && msg.action === "getTabTarget") {
    sendResponse(tabs.targetInfo(msg.tabId));
    return true;
  }
  if (msg && (msg.action === "getProxyStatus" || msg.action === "checkProxyControl")) {
    ensureInit().then(() => getProxyStatus()).then(async status => {
      const isBlocked = await handleConflictControl(status.isBlocked);
      sendResponse(Object.assign({}, status, { isBlocked }));
    }).catch(err => {
      sendResponse({ levelOfControl: "", isBlocked: false, error: String(err) });
    });
    return true;
  }
  ensureInit().then(async () => {
    const listTask = lists.handleMessage(msg);
    if (listTask) {
      sendResponse(await listTask);
      return;
    }
    if (msg.action === "pingAllProxies") {
      const results = await lists.enqueue(() => pingAllServers(msg.servers));
      sendResponse({ success: true, results });
      return;
    }
    if (msg.action === "coverInfoMany") {
      sendResponse({ covers: HostRules.coverMany(msg.hosts, maps.compiledLists) });
      return;
    }
    if (msg.action === "coverInfo") {
      sendResponse(HostRules.coverPayload(msg.host || "", maps.compiledLists));
      return;
    }
    if (msg.action === "getTabDomains") {
      sendResponse({ domains: await tabs.domains(msg.tabId) });
      return;
    }
    if (msg.action === "getProxyError") {
      sendResponse({ error: proxyApplyError });
      return;
    }
    sendResponse({});
  }).catch(e => sendResponse({ success: false, error: String((e && e.message) || e) }));
  return true;
});

try {
  if (chrome.proxy.settings.onChange) {
    chrome.proxy.settings.onChange.addListener(() => {
      ensureInit()
        .then(() => getProxyStatus())
        .then(status => handleConflictControl(status.isBlocked))
        .catch(() => {});
    });
  }
} catch (_) {}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  await ensureInit();
  let needRebuild = false;
  if (changes.disabledByConflict) disabledByConflict = !!changes.disabledByConflict.newValue;
  if (changes.proxyServers) {
    proxyServers = Array.isArray(changes.proxyServers.newValue) ? changes.proxyServers.newValue : [];
    proxyConfig = ProxyConfig.configFromServers(proxyServers);
    if (!proxyConfig.host && extensionEnabled) {
      extensionEnabled = false;
      chrome.storage.local.set({ extensionEnabled: false });
    }
    needRebuild = true;
  }
  if (changes.proxyConfig && !changes.proxyServers) {
    proxyConfig = Object.assign({}, proxyConfig, changes.proxyConfig.newValue || {});
    needRebuild = true;
  }
  if (changes.proxyRules) { proxyRules = Array.isArray(changes.proxyRules.newValue) ? changes.proxyRules.newValue : []; needRebuild = true; }
  if (changes.directRules) { directRules = Array.isArray(changes.directRules.newValue) ? changes.directRules.newValue : []; needRebuild = true; }
  // proxyLists пишет только ListStore, он же пересобирает карты и будильник,
  // поэтому эхо собственной записи здесь игнорируется.
  if (changes.extensionEnabled) {
    extensionEnabled = !!changes.extensionEnabled.newValue && !!proxyConfig.host;
    needRebuild = true;
  }
  if (needRebuild) {
    rebuildMaps();
    try { await applyProxySettings(); } catch (_) {}
  }
});

async function initBackground() {
  const res = await chrome.storage.local.get(["proxyConfig", "proxyServers", "proxyRules", "directRules", "proxyLists", "extensionEnabled", "disabledByConflict", "proxyApplyError"]);
  proxyServers = ProxyConfig.migrateProxyServers(res.proxyServers, res.proxyConfig);
  proxyConfig = ProxyConfig.configFromServers(proxyServers);
  proxyRules = Array.isArray(res.proxyRules) ? res.proxyRules : [];
  directRules = Array.isArray(res.directRules) ? res.directRules : [];
  extensionEnabled = (res.extensionEnabled === undefined ? !!proxyConfig.host : !!res.extensionEnabled) && !!proxyConfig.host;
  disabledByConflict = !!res.disabledByConflict;
  proxyApplyError = String(res.proxyApplyError || "");

  const loaded = lists.load(res.proxyLists);

  const persist = {};
  if (!res.proxyServers || !res.proxyServers.length) persist.proxyServers = proxyServers;
  if (res.extensionEnabled !== extensionEnabled) persist.extensionEnabled = extensionEnabled;
  if (loaded.changed) persist.proxyLists = lists.all();
  if (Object.keys(persist).length) await chrome.storage.local.set(persist);

  await tabs.restoreSession();
  await tabs.applyBadgeColors();
  await tabs.seedOpenTabs();

  rebuildMaps();
  initialized = true;
  try { await applyProxySettings(); } catch (_) {}

  try {
    const status = await getProxyStatus();
    await handleConflictControl(status.isBlocked);
  } catch (_) {}

  if (loaded.stale) await lists.updateAll();
  else await lists.updateDue();
  await lists.scheduleAlarm();
}

function ensureInit() {
  if (!initPromise) initPromise = initBackground();
  return initPromise;
}

ensureInit();
