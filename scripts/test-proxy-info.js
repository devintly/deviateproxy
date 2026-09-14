#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const filePath = fs.existsSync(path.join(ROOT, "src", "common", "pac-parse.js"))
  ? path.join(ROOT, "src", "common", "pac-parse.js")
  : path.join(ROOT, "pac-parse.js");
const code = fs.readFileSync(filePath, "utf8");
const sandbox = { console, module: { exports: {} }, btoa, unescape, encodeURIComponent };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "pac-parse.js" });
const api = sandbox.PacParse || sandbox.module.exports;
const proxyConfigPath = path.join(ROOT, "src", "common", "proxy-config.js");
const proxySandbox = { module: { exports: {} }, crypto: require("crypto").webcrypto, URL };
proxySandbox.exports = proxySandbox.module.exports;
vm.createContext(proxySandbox);
const tldsPath = path.join(ROOT, "src", "common", "tlds.js");
if (fs.existsSync(tldsPath)) {
  vm.runInContext(fs.readFileSync(tldsPath, "utf8"), proxySandbox, { filename: "tlds.js" });
}
const hostRulesPath = path.join(ROOT, "src", "common", "host-rules.js");
if (fs.existsSync(hostRulesPath)) {
  vm.runInContext(fs.readFileSync(hostRulesPath, "utf8"), proxySandbox, { filename: "host-rules.js" });
}
vm.runInContext(fs.readFileSync(proxyConfigPath, "utf8"), proxySandbox, { filename: "proxy-config.js" });
const proxyApi = proxySandbox.module.exports;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const none = api.userProxyToFirefox({ type: "socks", host: "", port: 2080 });
assert(none.type === "direct", "empty host must be direct");

const socks = api.userProxyToFirefox({
  type: "socks",
  host: "127.0.0.1",
  port: 2080,
  username: "user",
  password: "secret"
});
assert(socks.type === "socks", "socks type");
assert(socks.host === "127.0.0.1", "socks host");
assert(socks.port === 2080, "socks port");
assert(socks.proxyDNS === true, "socks proxyDNS");
assert(socks.username === "user", "socks username must be passed to Firefox");
assert(socks.password === "secret", "socks password must be passed to Firefox");

const socksNoAuth = api.userProxyToFirefox({ type: "socks", host: "127.0.0.1", port: 2080 });
assert(socksNoAuth.username == null && socksNoAuth.password == null, "omit empty socks auth");

const http = api.userProxyToFirefox({
  type: "http",
  host: "127.0.0.1",
  port: 2080,
  username: "user",
  password: "secret"
});
assert(http.type === "http", "http type");
assert(http.username == null && http.password == null, "http must not set socks username fields");
assert(http.proxyAuthorizationHeader === "Basic " + btoa("user:secret"), "http basic header");

const a = { host: "127.0.0.1", port: 2080, username: "u1", password: "p1" };
const b = { host: "127.0.0.1", port: 2080, username: "u2", password: "p2" };
const c = { host: "127.0.0.1", port: 2080, username: "u1", password: "p1", name: "Домашний", type: "http" };
assert(proxyApi.proxyKey(a) !== proxyApi.proxyKey(b), "same host/port with different login must not be a duplicate");
assert(proxyApi.proxyKey(a) !== proxyApi.proxyKey(c), "proxy type must affect duplicate key");
assert(proxyApi.proxyKey({ host: "127.0.0.1", port: 2080 }) !== proxyApi.proxyKey({ host: "127.0.0.1", port: 2080, username: "u", password: "p" }), "empty auth is not the same as filled auth");
assert(proxyApi.isValidProxyHost("localhost"), "localhost is valid proxy host");
assert(proxyApi.isValidProxyHost("127.0.0.1"), "valid ipv4 host");
assert(proxyApi.isValidProxyHost("proxy.example.com"), "valid domain host");
assert(proxyApi.isValidProxyHost("sub-domain.co.uk"), "valid multi-level domain");
assert(proxyApi.isValidProxyHost("[2001:db8::1]"), "valid ipv6 host");
assert(!proxyApi.isValidProxyHost("999.999.999.999"), "invalid ipv4 rejected");
assert(!proxyApi.isValidProxyHost("12345"), "plain digits rejected");
assert(!proxyApi.isValidProxyHost("word"), "plain word rejected");
assert(!proxyApi.isValidProxyHost(""), "empty host rejected");
assert(!proxyApi.isValidProxyHost("foo bar.com"), "host with space rejected");

assert(proxyApi.isValidProxyPort(80), "port 80 valid");
assert(proxyApi.isValidProxyPort(1080), "port 1080 valid");
assert(proxyApi.isValidProxyPort(65535), "port 65535 valid");
assert(proxyApi.isValidProxyPort("1080"), "string port '1080' valid");
assert(!proxyApi.isValidProxyPort(0), "port 0 invalid");
assert(!proxyApi.isValidProxyPort(-1), "negative port invalid");
assert(!proxyApi.isValidProxyPort(65536), "port 65536 invalid");
assert(!proxyApi.isValidProxyPort(99999), "port 99999 invalid");
assert(!proxyApi.isValidProxyPort("abc"), "non-numeric port invalid");

assert(proxyApi.isProxyControlBlocked("controlled_by_other_extensions"), "another extension is a conflict");
assert(proxyApi.isProxyControlBlocked("not_controllable"), "policy lock is a conflict");
assert(!proxyApi.isProxyControlBlocked("controlled_by_this_extension"), "own PAC is not a conflict");
assert(!proxyApi.isProxyControlBlocked("controllable_by_this_extension"), "free slot is not a conflict");
assert(!proxyApi.isProxyControlBlocked(""), "empty control level is not a conflict");

assert(Array.isArray(proxyApi.HOST_ORIGINS) && proxyApi.HOST_ORIGINS.length === 4, "HOST_ORIGINS has four web schemes");
assert(proxyApi.hostOriginsGranted(["<all_urls>"]), "<all_urls> covers required hosts");
assert(proxyApi.hostOriginsGranted(["*://*/*"]), "*://*/* covers required hosts");
assert(proxyApi.hostOriginsGranted(proxyApi.HOST_ORIGINS), "exact HOST_ORIGINS is granted");
assert(!proxyApi.hostOriginsGranted(["https://*/*"]), "https alone is not enough");
assert(!proxyApi.hostOriginsGranted([]), "empty origins are not granted");

console.log("test-proxy-info: ok");
