#!/usr/bin/env node
"use strict";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

const HostRules = require("../src/common/host-rules");
const ProxyConfig = require("../src/common/proxy-config");
globalThis.HostRules = HostRules;
globalThis.ProxyConfig = ProxyConfig;
const TabTracker = require("../src/common/tab-tracker");

const maps = HostRules.rebuildMaps(["*.rutracker.org", "instagram.com"], [], []);

const badgeCalls = [];
let dnsCalls = 0;

const tracker = TabTracker.create({
  api: {
    runtime: { getURL: () => "chrome-extension://test/" },
    tabs: { get: () => Promise.reject(new Error("no tab")), query: () => Promise.resolve([]) },
    action: { setBadgeText: opts => { badgeCalls.push(opts); return Promise.resolve(); } }
  },
  isProxied: host => HostRules.hostIsProxied(host, true, maps),
  badgeDelay: 10,
  needsResolve: () => true,
  resolveProxied: () => { dnsCalls++; return Promise.resolve(false); }
});

const hosts = tabId => tracker.hostsOf(tabId);
const has = (tabId, host) => hosts(tabId).indexOf(host) >= 0;

function loadSubrequests(tabId, subrequests) {
  (subrequests || []).forEach(sub => {
    try { tracker.remember(tabId, new URL(sub).hostname, false); } catch (_) {}
  });
}

// Полная навигация или перезагрузка: браузер присылает status "loading" с новым URL.
function simulateFullLoadOrReload(tabId, url, subrequests) {
  tracker.handleTabUpdate(tabId, { url, status: "loading" }, { url });
  loadSubrequests(tabId, subrequests);
  tracker.handleTabUpdate(tabId, { status: "complete" }, { url });
}

// Переход внутри SPA: URL меняется без status "loading".
function simulateSpaNavigation(tabId, url, subrequests) {
  tracker.handleTabUpdate(tabId, { url }, { url });
  loadSubrequests(tabId, subrequests);
}

// Случай 1: вход на страницу
simulateFullLoadOrReload(1, "https://rutracker.org/forum/index.php", []);
assert(has(1, "rutracker.org"), "Main domain must be tracked");
assert(tracker.proxiedCount(1) === 1, "Tab proxied count must be 1 for main domain alone");
assert(ProxyConfig.badgeText(tracker.proxiedCount(1)) === "1", "Badge text must be '1'");
assert(tracker.apexOf(1) === "rutracker.org", "Apex must be stored for the tab");
assert(tracker.targetInfo(1).targetHost === "rutracker.org", "Target host must follow navigation");

// Случай 2: подзапросы учитываются и делятся на прокси и direct
simulateFullLoadOrReload(2, "https://rutracker.org/", [
  "https://static.rutracker.org/logo.png",
  "https://api.rutracker.org/v1/ping",
  "https://google-analytics.com/collect"
]);
assert(has(2, "rutracker.org"), "Main domain must be present");
assert(has(2, "static.rutracker.org"), "Subdomain static must be present");
assert(has(2, "api.rutracker.org"), "Subdomain api must be present");
assert(has(2, "google-analytics.com"), "Direct host must be tracked too");
assert(tracker.proxiedCount(2) === 3, "Total proxied count must be 3 (main domain + 2 subdomains)");
assert(ProxyConfig.badgeText(tracker.proxiedCount(2)) === "3", "Badge text must be '3'");

// Случай 3: переход внутри SPA — прежние домены сохраняются, новые добавляются
simulateSpaNavigation(2, "https://rutracker.org/forum/viewtopic.php?t=123", [
  "https://cdn.rutracker.org/player.js"
]);
assert(has(2, "static.rutracker.org"), "Old subdomain static must remain on SPA navigation");
assert(has(2, "cdn.rutracker.org"), "New subdomain cdn must be added on SPA navigation");
assert(has(2, "google-analytics.com"), "Old direct host must remain on SPA navigation");
assert(tracker.proxiedCount(2) === 4, "Proxied count should accumulate during SPA navigation");

// Случай 4: перезагрузка страницы — домены собираются заново
simulateFullLoadOrReload(2, "https://rutracker.org/forum/viewtopic.php?t=123", [
  "https://static.rutracker.org/logo.png"
]);
assert(has(2, "static.rutracker.org"), "static.rutracker.org must be present");
assert(!has(2, "cdn.rutracker.org"), "Unused subdomain cdn must be cleared on full reload");
assert(tracker.proxiedCount(2) === 2, "Proxied count should be fresh (main + static)");

// Случай 5: переход на другой сайт
simulateFullLoadOrReload(2, "https://wikipedia.org/", []);
assert(!has(2, "static.rutracker.org"), "Old site subdomains must be cleared on cross-domain navigation");
assert(!has(2, "rutracker.org"), "Old site main domain must be cleared on cross-domain navigation");
assert(has(2, "wikipedia.org"), "New domain must be present");
assert(tracker.proxiedCount(2) === 0, "Direct new domain must have 0 proxied hosts");

// Свои страницы и не-web схемы не попадают в трекинг
tracker.seed(3, "chrome-extension://test/popup.html");
tracker.seed(3, "about:blank");
assert(hosts(3).length === 0, "Own pages and non-web URLs must be ignored");

// Закрытие вкладки чистит состояние
tracker.forget(2);
assert(hosts(2).length === 0 && tracker.proxiedCount(2) === 0, "forget must drop tab state");

// Вкладка без проксируемых хостов не должна крутить бесконечный пересчёт:
// раньше обновление бейджа само себя перезапускало каждые несколько десятков мс.
const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

(async () => {
  simulateFullLoadOrReload(9, "https://www.youtube.com/", [
    "https://i.ytimg.com/vi/x/hq.jpg",
    "https://rr3---sn-1.googlevideo.com/videoplayback",
    "https://fonts.gstatic.com/s/font.woff2"
  ]);
  assert(tracker.proxiedCount(9) === 0, "direct site must have no proxied hosts");

  await sleep(80);
  badgeCalls.length = 0;
  dnsCalls = 0;
  await tracker.updateBadge(9);
  await sleep(200);

  assert(badgeCalls.length <= 1, "badge must not be rewritten in a loop, got " + badgeCalls.length);
  assert(dnsCalls === 0, "idle badge refresh must not trigger DNS lookups, got " + dnsCalls);

  console.log("test-tab-seeding: ok");
})().catch(err => {
  console.error("test-tab-seeding: FAIL", err && err.message);
  process.exit(1);
});
