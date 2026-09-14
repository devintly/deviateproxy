(function (root) {
  "use strict";

  function getHostRules() {
    if (typeof HostRules !== "undefined") return HostRules;
    if (root && root.HostRules) return root.HostRules;
    if (typeof globalThis !== "undefined" && globalThis.HostRules) return globalThis.HostRules;
    return null;
  }

  function isValidProxyHost(h) {
    var raw = String(h || "").trim();
    if (!raw) return false;
    var clean = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^\[|\]$/g, "");
    if (!clean) return false;
    if (clean.toLowerCase() === "localhost") return true;
    var hr = getHostRules();
    if (hr) {
      return hr.isIpHost(clean) || hr.isAcceptableHost(clean);
    }
    // Fallback if HostRules is not loaded in current scope
    if (/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(clean)) return true;
    if (clean.indexOf(":") >= 0) {
      try {
        var u = new URL("http://[" + clean.replace(/^\[|\]$/g, "") + "]/");
        return !!(u.hostname && u.hostname.indexOf(":") >= 0);
      } catch (e) {
        return false;
      }
    }
    if (clean.length > 253 || clean.indexOf(".") < 0 || clean.indexOf("..") >= 0) return false;
    return clean.split(".").every(function (label) {
      return label.length > 0 && label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label);
    });
  }

  function isValidProxyPort(p) {
    var n = Number(p);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  }

  function emptyConfig() {
    return { type: "socks", host: "", port: 0, username: "", password: "" };
  }

  function configFromServers(list) {
    var on = (list || []).find(function (p) { return p.enabled && p.host && Number(p.port) > 0; });
    if (!on) return emptyConfig();
    var host = String(on.host).trim();
    return {
      type: on.type || "socks",
      host: host,
      port: Number(on.port),
      username: on.username || "",
      password: on.password || ""
    };
  }

  function proxyKey(p) {
    p = p || {};
    return [
      String(p.type || "socks").toLowerCase(),
      String(p.host || "").trim().toLowerCase(),
      Number(p.port) || 0,
      String(p.username || ""),
      String(p.password || "")
    ].join("|");
  }

  function uniqueId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function withActiveProxy(list, activeId) {
    var out = (list || []).map(function (p) { return Object.assign({}, p, { enabled: false }); });
    if (!out.length) return out;
    var has = activeId != null && out.some(function (p) { return p.id === activeId; });
    var id = has ? activeId : out[0].id;
    out.forEach(function (p) { p.enabled = p.id === id; });
    return out;
  }

  function migrateProxyServers(servers, fallback) {
    var list = Array.isArray(servers) ? servers.map(function (p) { return Object.assign({}, p); }) : [];
    if (!list.length && fallback && fallback.host) {
      list = [{
        id: Date.now(),
        type: fallback.type || "socks",
        host: fallback.host,
        port: Number(fallback.port) || 1080,
        username: fallback.username || "",
        password: fallback.password || "",
        enabled: true
      }];
    }
    var keep = (list.find(function (p) { return p.enabled; }) || list[0] || {}).id;
    return withActiveProxy(list, keep);
  }

  function findAuthServer(servers, config, host, port) {
    var hostLower = String(host || "").toLowerCase();
    var isLocal = hostLower === "localhost" || hostLower === "127.0.0.1";
    var srv = host && port && (servers || []).find(function (p) {
      var pH = String(p.host || "").toLowerCase();
      var matchHost = pH === hostLower || (isLocal && (pH === "localhost" || pH === "127.0.0.1"));
      return matchHost && Number(p.port) === port;
    });
    if (srv && srv.username && srv.password) return srv;
    if (config && config.username && config.password) return config;
    return null;
  }

  function pacProxyString(cfg) {
    if (!cfg || !cfg.host || !cfg.port) return "DIRECT";
    var type = String(cfg.type || "socks").toLowerCase();
    var host = String(cfg.host).trim();
    var port = Number(cfg.port);
    if (type === "socks" || type === "socks5") return "SOCKS5 " + host + ":" + port + "; SOCKS " + host + ":" + port + "; DIRECT";
    if (type === "https") return "HTTPS " + host + ":" + port + "; DIRECT";
    return "PROXY " + host + ":" + port + "; DIRECT";
  }

  function pacProbeString(p) {
    if (!p || !p.host || !p.port) return "PROXY 0.0.0.0:0";
    var type = String(p.type || "socks").toLowerCase();
    var host = String(p.host).trim();
    var port = Number(p.port);
    if (type === "socks" || type === "socks5") return "SOCKS5 " + host + ":" + port + "; SOCKS " + host + ":" + port;
    if (type === "https") return "HTTPS " + host + ":" + port;
    return "PROXY " + host + ":" + port;
  }

  function buildProbeMap(servers) {
    var map = {};
    (servers || []).forEach(function (p) {
      if (p && p.id != null) map[p.id] = pacProbeString(p);
    });
    return map;
  }

  function iconPaths(on) {
    var prefix = on ? "icons/icon_" : "icons/icon_off_";
    return { 32: prefix + "32.png", 64: prefix + "64.png", 128: prefix + "128.png", 256: prefix + "256.png" };
  }

  function toolbarIconOn(enabled, config) {
    return !!(enabled && config && config.host);
  }

  function badgeText(count) {
    if (!(count > 0)) return "";
    return count > 99 ? "99+" : String(count);
  }

  // Конфликт только если прокси реально заблокирован политикой или другим
  // расширением. Собственный PAC (controlled_by_this_extension) и свободный
  // слот (controllable_by_this_extension) конфликтом не являются.
  function isProxyControlBlocked(level) {
    return level === "controlled_by_other_extensions" || level === "not_controllable";
  }

  var api = {
    emptyConfig: emptyConfig,
    configFromServers: configFromServers,
    isValidProxyHost: isValidProxyHost,
    isValidProxyPort: isValidProxyPort,
    proxyKey: proxyKey,
    uniqueId: uniqueId,
    withActiveProxy: withActiveProxy,
    migrateProxyServers: migrateProxyServers,
    findAuthServer: findAuthServer,
    pacProxyString: pacProxyString,
    buildProbeMap: buildProbeMap,
    iconPaths: iconPaths,
    toolbarIconOn: toolbarIconOn,
    badgeText: badgeText,
    isProxyControlBlocked: isProxyControlBlocked
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ProxyConfig = api;
})(typeof self !== "undefined" ? self : this);
