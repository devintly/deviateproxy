#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "src/common/settings-io.js"), "utf8");
const sandbox = { console, module: { exports: {} }, self: {} };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "settings-io.js" });
const api = sandbox.SettingsIo || sandbox.self.SettingsIo || sandbox.module.exports;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(api.parse("") === null, "empty text");
assert(api.parse("{not json") === null, "invalid json");
assert(api.parse("{}") === null, "empty object");
assert(api.parse(JSON.stringify({ format: "other", settings: { proxyRules: [] } })) === null, "wrong format without keys at top");

const wrapped = api.parse(JSON.stringify({
  format: "deviateproxy-settings",
  version: 1,
  settings: { proxyRules: ["example.com"], extra: 1 }
}));
assert(wrapped && wrapped.proxyRules[0] === "example.com", "wrapped export");
assert(!Object.prototype.hasOwnProperty.call(wrapped, "extra"), "unknown keys dropped");

const raw = api.parse(JSON.stringify({ proxyLists: [], extensionEnabled: false }));
assert(raw && raw.extensionEnabled === false && Array.isArray(raw.proxyLists), "raw settings object");

// Файл, собранный вручную, не должен протащить в storage значения чужих типов.
const wrongTypes = api.parse(JSON.stringify({
  proxyRules: "example.com",
  proxyServers: { host: "1.1.1.1" },
  proxyConfig: [],
  extensionEnabled: "yes",
  directRules: ["ok.example"]
}));
assert(wrongTypes && Object.keys(wrongTypes).join(",") === "directRules", "invalid key types must be dropped");
assert(api.parse(JSON.stringify({ proxyRules: "example.com" })) === null, "a file with only invalid keys is rejected");
assert(api.parse(JSON.stringify({ proxyLists: [null, "x", { url: "" }] })).proxyLists.length === 1, "non-object lists are dropped");

const blob = api.exportBlob({ proxyRules: ["a.com"], ignored: true });
assert(blob.format === "deviateproxy-settings" && blob.version === 1, "export envelope");
assert(blob.settings.proxyRules[0] === "a.com", "export payload");
assert(!Object.prototype.hasOwnProperty.call(blob.settings, "ignored"), "export drops unknown keys");

const remote = {
  id: "r1",
  name: "Remote",
  url: "https://example.com/list.txt",
  format: "txt",
  intervalHours: 6,
  viaProxy: true,
  enabled: true,
  domains: ["huge.example"],
  extra: ["huge.example"],
  packed: { a: 1 },
  ips: ["1.1.1.1"],
  cidrs: ["10.0.0.0/8"],
  domainCount: 999,
  ipCount: 1,
  updatedAt: 123,
  lastAttemptAt: 123
};
const local = {
  id: "l1",
  name: "Local",
  isLocal: true,
  url: "",
  domains: ["keep.example"],
  domainCount: 1
};
const exported = api.exportBlob({ proxyLists: [remote, local] }).settings.proxyLists;
assert(exported[0].url === "https://example.com/list.txt", "remote list keeps url");
assert(exported[0].name === "Remote" && exported[0].viaProxy === true, "remote list keeps meta");
assert(exported[0].domains.length === 0 && exported[0].ips.length === 0, "remote list drops content");
assert(exported[0].packed === undefined && exported[0].updatedAt === undefined, "remote list drops fetch payload");
assert(exported[1].domains[0] === "keep.example", "local list keeps domains");
assert(exported[1].isLocal === undefined, "local list export has no isLocal flag");

const labeledLocal = Object.assign({}, remote, { isLocal: true, packed: { keep: false } });
const stripped = api.exportBlob({ proxyLists: [labeledLocal] }).settings.proxyLists[0];
assert(stripped.url === remote.url, "url list is remote even with isLocal");
assert(stripped.packed === undefined && stripped.domains.length === 0, "url list never exports fetched payload");
assert(stripped.isLocal === undefined, "isLocal is not part of the export");
assert(stripped.extra === undefined && stripped.threePart === undefined, "url list export has no extra PAC fields");

const parsed = api.parse(JSON.stringify({
  format: "deviateproxy-settings",
  settings: { proxyLists: [remote] }
}));
assert(parsed.proxyLists[0].domains.length === 0, "import also drops remote content");

console.log("test-settings-io: ok");
