const ALL_WEB_URLS = ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"];
const PROBE_HOST = "cp.cloudflare.com";
// Проверка «свои страницы» идёт на каждый запрос, поэтому база берётся один раз.
const OWN_PAGE_BASE = browser.runtime.getURL("");
const DNS_CACHE_TTL_MS = 60000;
const DNS_CACHE_LIMIT = 512;

let proxyConfig = ProxyConfig.emptyConfig();
let proxyServers = [];
let proxyRules = [];
let directRules = [];
let extensionEnabled = false;
let disabledByConflict = false;
let maps = HostRules.rebuildMaps([], [], []);
let hasIps = false;
let ffProxy = { type: "direct" };
let initialized = false;

const dnsCache = new Map();
const pendingDns = new Map();
const fetchProxyHosts = {};
const fetchDirectHosts = {};
const proxyAuthTried = new Set();

function hostIsProxied(host) {
  return HostRules.hostIsProxied(host, extensionEnabled, maps);
}

const tabs = TabTracker.create({
  api: browser,
  isProxied: hostIsProxied,
  badgeDelay: 50,
  countEnabled: () => extensionEnabled,
  ready: () => initPromise,
  needsResolve: host => extensionEnabled && hasIps && !HostRules.isDirectHost(host, maps),
  resolveProxied: host => resolveDns(host).then(addresses => addresses.some(ip => {
    const value = String(ip || "").replace(/^\[|\]$/g, "");
    return !HostRules.isDirectHost(value, maps) && HostRules.isProxiedHost(value, maps);
  }))
});

const lists = ListStore.create({
  api: browser,
  ingest: (url, text) => ListIngest.ingestRemoteAsync(url, text, browser.runtime.getURL("list-ingest-worker.js")),
  withFetchRoute: withFetchRoute,
  onChanged: async () => { rebuildMaps(); },
  onUpdated: () => tabs.refreshActiveBadge()
});

// Если правила и списки не изменились, HostRules возвращает те же карты —
// тогда пересборка ограничивается маршрутом прокси и пересчёт не нужен.
function applyMaps(next) {
  ffProxy = PacParse.userProxyToFirefox(proxyConfig);
  if (next === maps) return false;
  maps = next;
  hasIps = HostRules.hasIpRules(maps);
  return true;
}

function rebuildMaps() {
  if (applyMaps(HostRules.rebuildMaps(proxyRules, directRules, lists.all()))) tabs.recount();
}

function decideProxySync(host, tabId) {
  const route = ListUpdate.fetchRouteOverride(host, tabId, fetchDirectHosts, fetchProxyHosts);
  if (route === "direct") return { type: "direct" };
  if (route === "proxy") return ffProxy;
  if (!extensionEnabled) return { type: "direct" };
  if (HostRules.isDirectHost(host, maps)) return { type: "direct" };
  if (HostRules.isProxiedHost(host, maps)) return ffProxy;
  return null;
}

function resolveDns(host) {
  const now = Date.now();
  const hit = dnsCache.get(host);
  if (hit && now - hit.t < DNS_CACHE_TTL_MS) return Promise.resolve(hit.addrs);
  if (pendingDns.has(host)) return pendingDns.get(host);
  const promise = browser.dns.resolve(host).then(rec => {
    const addrs = (rec && rec.addresses) || [];
    if (dnsCache.size >= DNS_CACHE_LIMIT) dnsCache.delete(dnsCache.keys().next().value);
    dnsCache.set(host, { t: Date.now(), addrs });
    return addrs;
  }).catch(() => {
    dnsCache.set(host, { t: Date.now(), addrs: [] });
    return [];
  }).finally(() => pendingDns.delete(host));
  pendingDns.set(host, promise);
  return promise;
}

function handleProxyRequest(requestInfo) {
  if (HostRules.isOwnPage(requestInfo && requestInfo.url, OWN_PAGE_BASE)) return { type: "direct" };
  let host = "", parsed = null;
  try {
    parsed = new URL(requestInfo.url);
    host = parsed.hostname.toLowerCase();
  } catch (_) { return { type: "direct" }; }
  if (!host) return { type: "direct" };

  if (host === PROBE_HOST) {
    const probeId = parsed.searchParams.get("__deviate_probe");
    if (probeId) {
      const target = proxyServers.find(p => String(p.id) === String(probeId));
      if (target && target.host && target.port) return PacParse.userProxyToFirefox(target);
      return { type: "http", host: "127.0.0.1", port: 0 };
    }
  }

  const tabId = requestInfo.tabId;
  const isMainFrame = requestInfo.type === "main_frame" && tabId != null && tabId >= 0;
  if (isMainFrame && !HostRules.isIgnoredHost(host)) {
    tabs.handleTabUpdate(tabId, { url: requestInfo.url }, null);
  }

  const sync = decideProxySync(host, tabId);
  if (sync) {
    tabs.remember(tabId, host, sync.type !== "direct");
    return sync;
  }
  if (!hasIps || PacParse.IPV4_RE.test(host) || host.indexOf(":") >= 0) {
    tabs.remember(tabId, host, false);
    return { type: "direct" };
  }
  return resolveDns(host).then(addrs => {
    for (let i = 0; i < addrs.length; i++) {
      const hit = decideProxySync(String(addrs[i] || "").replace(/^\[|\]$/g, ""), tabId);
      if (hit) {
        tabs.remember(tabId, host, hit.type !== "direct");
        return hit;
      }
    }
    tabs.remember(tabId, host, false);
    return { type: "direct" };
  });
}

function onProxyRequest(requestInfo) {
  if (!initialized) return initPromise.then(() => handleProxyRequest(requestInfo));
  return handleProxyRequest(requestInfo);
}

async function syncToolbarIcon() {
  try {
    await browser.action.setIcon({ path: ProxyConfig.iconPaths(ProxyConfig.toolbarIconOn(extensionEnabled, proxyConfig)) });
  } catch (_) {}
}

// Загрузка списка на время скачивания принудительно направляется мимо правил:
// счётчик держит окно, внутри которого onRequest отвечает нужным маршрутом.
async function withFetchRoute(url, viaProxy, fn) {
  if (viaProxy && (!proxyConfig.host || !(Number(proxyConfig.port) > 0))) {
    throw ListUpdate.codedError("power_setup", "Сначала добавьте прокси");
  }
  const bucket = viaProxy ? fetchProxyHosts : fetchDirectHosts;
  bucket["*"] = (bucket["*"] || 0) + 1;
  try { return await fn(); }
  finally {
    bucket["*"]--;
    if (bucket["*"] <= 0) delete bucket["*"];
  }
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
  const results = {};
  (await Promise.all(targets.map(pingServer))).forEach(res => {
    if (res && res.id != null) results[res.id] = { success: res.success, latency: res.latency };
  });
  return results;
}

async function handleConflictControl(level) {
  const isBlocked = ProxyConfig.isProxyControlBlocked(level);
  if (isBlocked) {
    if (extensionEnabled) {
      extensionEnabled = false;
      disabledByConflict = true;
      await browser.storage.local.set({ extensionEnabled: false, disabledByConflict: true });
      await syncToolbarIcon();
      await tabs.refreshActiveBadge();
    }
  } else if (disabledByConflict) {
    disabledByConflict = false;
    if (proxyConfig.host && Number(proxyConfig.port) > 0) {
      extensionEnabled = true;
      await browser.storage.local.set({ extensionEnabled: true, disabledByConflict: false });
      rebuildMaps();
      await syncToolbarIcon();
      await tabs.refreshActiveBadge();
    } else {
      await browser.storage.local.set({ disabledByConflict: false });
    }
  }
  return isBlocked;
}

browser.proxy.onRequest.addListener(onProxyRequest, { urls: ALL_WEB_URLS });

try {
  browser.webRequest.onAuthRequired.addListener(
    details => {
      if (!details.isProxy) return {};
      const ch = details.challenger || {};
      const srv = ProxyConfig.findAuthServer(proxyServers, proxyConfig, ch.host, ch.port);
      if (!srv) return {};
      const id = details.requestId;
      if (proxyAuthTried.has(id)) return { cancel: true };
      if (proxyAuthTried.size > 200) proxyAuthTried.clear();
      proxyAuthTried.add(id);
      return { authCredentials: { username: srv.username, password: srv.password } };
    },
    { urls: ALL_WEB_URLS },
    ["blocking"]
  );
} catch (_) {}

browser.tabs.onRemoved.addListener(tabId => tabs.forget(tabId));

browser.tabs.onActivated.addListener(async info => {
  try {
    const tab = await browser.tabs.get(info.tabId);
    tabs.seed(info.tabId, tab && tab.url);
  } catch (_) {}
  tabs.updateBadge(info.tabId);
});

browser.tabs.onUpdated.addListener((tabId, change, tab) => tabs.handleTabUpdate(tabId, change, tab));

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  initPromise.then(async () => {
    const listTask = lists.handleMessage(msg);
    if (listTask) {
      sendResponse(await listTask);
      return;
    }
    if (msg.action === "pingAllProxies") {
      sendResponse({ success: true, results: await pingAllServers(msg.servers) });
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
    if (msg.action === "getTabTarget") {
      sendResponse(tabs.targetInfo(msg.tabId));
      return;
    }
    if (msg.action === "getTabDomains") {
      sendResponse({ domains: await tabs.domains(msg.tabId) });
      return;
    }
    if (msg.action === "checkProxyControl") {
      if (browser.proxy.settings && typeof browser.proxy.settings.get === "function") {
        try {
          const details = await browser.proxy.settings.get({});
          const level = (details && details.levelOfControl) || "";
          sendResponse({ levelOfControl: level, isBlocked: await handleConflictControl(level) });
        } catch (_) {
          sendResponse({ levelOfControl: "", isBlocked: false });
        }
      } else {
        sendResponse({ levelOfControl: "", isBlocked: false });
      }
      return;
    }
    sendResponse({});
  }).catch(e => sendResponse({ success: false, error: String((e && e.message) || e) }));
  return true;
});

try {
  if (browser.proxy.settings && browser.proxy.settings.onChange) {
    browser.proxy.settings.onChange.addListener(details => {
      initPromise
        .then(() => handleConflictControl((details && details.levelOfControl) || ""))
        .catch(() => {});
    });
  }
} catch (_) {}

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== ListStore.ALARM_NAME) return;
  initPromise.then(lists.updateDue).finally(lists.scheduleAlarm);
});

async function handleStorageChanges(changes) {
  let need = false;
  if (changes.disabledByConflict) disabledByConflict = !!changes.disabledByConflict.newValue;
  if (changes.proxyServers) {
    proxyServers = Array.isArray(changes.proxyServers.newValue) ? changes.proxyServers.newValue : [];
    proxyConfig = ProxyConfig.configFromServers(ProxyConfig.migrateProxyServers(proxyServers, null));
    if (!proxyConfig.host && extensionEnabled) {
      extensionEnabled = false;
      browser.storage.local.set({ extensionEnabled: false });
    }
    need = true;
  } else if (changes.proxyConfig) {
    proxyConfig = changes.proxyConfig.newValue || proxyConfig;
    need = true;
  }
  if (changes.proxyRules) { proxyRules = changes.proxyRules.newValue || []; need = true; }
  if (changes.directRules) { directRules = changes.directRules.newValue || []; need = true; }
  if (changes.proxyLists) {
    lists.replace(changes.proxyLists.newValue);
    need = true;
    lists.scheduleAlarm();
  }
  if (changes.extensionEnabled) {
    extensionEnabled = !!changes.extensionEnabled.newValue && !!proxyConfig.host;
    need = true;
  }
  if (need) {
    rebuildMaps();
    await syncToolbarIcon();
    await tabs.refreshActiveBadge();
  }
}

browser.storage.onChanged.addListener(changes => {
  initPromise.then(() => handleStorageChanges(changes)).catch(() => {});
});

async function initBackground() {
  const res = await browser.storage.local.get(["proxyConfig", "proxyServers", "proxyRules", "directRules", "proxyLists", "extensionEnabled", "disabledByConflict"]);
  proxyServers = ProxyConfig.migrateProxyServers(res.proxyServers, res.proxyConfig);
  proxyConfig = ProxyConfig.configFromServers(proxyServers);
  extensionEnabled = (res.extensionEnabled == null ? !!proxyConfig.host : !!res.extensionEnabled) && !!proxyConfig.host;
  disabledByConflict = !!res.disabledByConflict;
  proxyRules = Array.isArray(res.proxyRules) ? res.proxyRules : [];
  directRules = Array.isArray(res.directRules) ? res.directRules : [];

  const loaded = lists.load(res.proxyLists);

  const persist = {};
  if (JSON.stringify(proxyServers) !== JSON.stringify(res.proxyServers || [])) {
    persist.proxyServers = proxyServers;
    persist.proxyConfig = proxyConfig;
  }
  if (res.extensionEnabled !== extensionEnabled) persist.extensionEnabled = extensionEnabled;
  if (loaded.changed) persist.proxyLists = lists.all();
  if (Object.keys(persist).length) await browser.storage.local.set(persist);

  await tabs.restoreSession();

  applyMaps(HostRules.rebuildMaps(proxyRules, directRules, lists.all()));
  await syncToolbarIcon();
  await tabs.refreshActiveBadge();
  initialized = true;

  tabs.seedOpenTabs();

  if (browser.proxy.settings && typeof browser.proxy.settings.get === "function") {
    browser.proxy.settings.get({}).then(async details => {
      await handleConflictControl((details && details.levelOfControl) || "");
    }).catch(() => {});
  }

  if (loaded.stale) await lists.updateAll();
  else await lists.updateDue();
  await lists.scheduleAlarm();
}

const initPromise = initBackground();
