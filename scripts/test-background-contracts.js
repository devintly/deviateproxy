#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const chrome = read("src/chrome/background.js");
const firefox = read("src/firefox/background.js");
const listStore = read("src/common/list-store.js");
const tabTracker = read("src/common/tab-tracker.js");
new vm.Script(chrome, { filename: "chrome/background.js" });
new vm.Script(firefox, { filename: "firefox/background.js" });
new vm.Script(listStore, { filename: "common/list-store.js" });
new vm.Script(tabTracker, { filename: "common/tab-tracker.js" });

assert(/runtime\.lastError/.test(chrome), "Chrome proxy callbacks must inspect runtime.lastError");
assert(/offscreen\.createDocument/.test(chrome) && /target:\s*"offscreen"/.test(chrome), "Chrome must parse lists offscreen");

// Общая логика живёт в модулях, оба фона обязаны её использовать.
[["chrome", chrome], ["firefox", firefox]].forEach(([name, code]) => {
  assert(/ListStore\.create\(/.test(code), `${name} must build lists through ListStore`);
  assert(/TabTracker\.create\(/.test(code), `${name} must track tabs through TabTracker`);
  assert(/ListStore\.ALARM_NAME/.test(code), `${name} must use the shared alarm name`);
  assert(/isProxyControlBlocked/.test(code), `${name} must detect a foreign proxy controller`);
  assert(/withFetchRoute/.test(code), `${name} must route list downloads explicitly`);
});

assert(/queue\.then\(fn, fn\)/.test(listStore), "list updates must be serialized in ListStore");
assert(/saveLocalList/.test(listStore), "ListStore must support saveLocalList");
assert(/storage\.session/.test(tabTracker), "TabTracker must persist tab hosts in session storage");
assert(/pendingUrl/.test(tabTracker), "TabTracker must support pendingUrl from tabs.onUpdated");
assert(/ensureInit\(\)\.then/.test(chrome), "Chrome webRequest must await initialization before recording hosts");
assert(/initPromise\.then/.test(firefox), "Firefox listeners must await initialization");
assert(/function getProxyStatus\(/.test(chrome), "Chrome background must implement getProxyStatus");
assert(/isProxyControlBlocked/.test(chrome) && /isProxyControlBlocked/.test(firefox), "Both backgrounds must use shared conflict detection");
assert(!/foreignMode/.test(chrome), "Chrome must not treat its own PAC mode as a foreign conflict");

const chromeManifest = JSON.parse(read("src/chrome/manifest.json"));
assert(chromeManifest.permissions.includes("offscreen"), "Chrome offscreen permission missing");
assert(fs.existsSync(path.join(root, "src/chrome/offscreen.html")), "offscreen document missing");

// Фоновые скрипты Firefox подключаются вручную: общие модули должны быть в списке.
const firefoxManifest = JSON.parse(read("src/firefox/manifest.json"));
["list-store.js", "tab-tracker.js"].forEach(file => {
  assert(firefoxManifest.background.scripts.includes(file), `firefox manifest must load ${file}`);
});

// Chrome-фон грузит модули через importScripts.
["list-store.js", "tab-tracker.js"].forEach(file => {
  assert(chrome.includes(`"${file}"`), `chrome background must importScripts ${file}`);
});

console.log("test-background-contracts: ok");
