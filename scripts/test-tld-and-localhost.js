"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const COMMON = path.join(ROOT, "src", "common");

function load(file, sandbox) {
  vm.runInContext(fs.readFileSync(path.join(COMMON, file), "utf8"), sandbox, { filename: file });
}

const sandbox = { console, module: { exports: {} }, self: {}, URL, Set };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
load("pac-parse.js", sandbox);
load("tlds.js", sandbox);
load("host-rules.js", sandbox);
load("proxy-config.js", sandbox);

const HR = sandbox.self.HostRules || sandbox.HostRules;
const PC = sandbox.self.ProxyConfig || sandbox.ProxyConfig;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

// 1. Localhost proxy checks
assert(PC.isValidProxyHost("localhost"), "localhost is valid proxy host");
assert(PC.isValidProxyHost("LocalHost"), "LocalHost is valid proxy host");
assert(PC.isValidProxyHost("127.0.0.1"), "127.0.0.1 is valid proxy host");
assert(PC.isValidProxyHost("example.com"), "example.com is valid proxy host");
assert(!PC.isValidProxyHost("99999"), "99999 is invalid proxy host");
assert(!PC.isValidProxyHost("someword"), "someword is invalid proxy host");
assert(!PC.isValidProxyHost("example.fakezone12345"), "example.fakezone12345 is invalid proxy host");

const cfg = PC.configFromServers([{ enabled: true, host: "localhost", port: 8080, type: "socks" }]);
assert(cfg.host === "localhost", "localhost kept as localhost in configFromServers, got: " + cfg.host);
assert(PC.pacProxyString(cfg).indexOf("localhost:8080") >= 0, "PAC string keeps localhost");

// 2. Domain TLD validation checks
assert(HR.isAcceptableHost("example.com"), "example.com is acceptable");
assert(HR.isAcceptableHost("google.ru"), "google.ru is acceptable");
assert(HR.isAcceptableHost("*.site.org"), "*.site.org is acceptable");
assert(HR.isAcceptableHost("sub.domain.co.uk"), "sub.domain.co.uk is acceptable");
assert(HR.isAcceptableHost("127.0.0.1"), "127.0.0.1 is acceptable host");
assert(HR.isAcceptableHost("::1"), "::1 is acceptable host");

assert(!HR.isAcceptableHost("example.nonexistenttld123"), "nonexistent tld is rejected");
assert(!HR.isAcceptableHost("example.fake"), "example.fake is rejected");
assert(!HR.isAcceptableHost("justletters"), "single word without dot is rejected");

assert(HR.normalizeRule("example.com") === "example.com", "normalizeRule example.com");
assert(HR.normalizeRule("*.example.com") === "*.example.com", "normalizeRule *.example.com");
assert(HR.normalizeRule("example.fakezone") === "", "normalizeRule with fakezone returns empty");
assert(HR.normalizeRule("*.example.fakezone") === "", "normalizeRule wildcard with fakezone returns empty");

console.log("test-tld-and-localhost: ok");
