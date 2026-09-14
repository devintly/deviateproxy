(function (root) {
  "use strict";

  var KEYS = ["proxyServers", "proxyConfig", "proxyRules", "directRules", "proxyLists", "extensionEnabled"];
  var URL_LIST_KEEP = {
    id: 1,
    name: 1,
    url: 1,
    format: 1,
    intervalHours: 1,
    viaProxy: 1,
    enabled: 1,
    type: 1
  };

  function listUrl(list) {
    var url = String(list && list.url || "").trim();
    if (url.indexOf("https://") === 0 || url.indexOf("http://") === 0) return url;
    return "";
  }

  // Подписка — это список с http(s) URL: в экспорт уходит ссылка и метаданные,
  // без содержимого PAC/TXT. Нет URL — локальный список, домены остаются.
  function sanitizeList(list) {
    if (!listUrl(list)) {
      if (!list || list.isLocal === undefined) return list;
      var local = Object.assign({}, list);
      delete local.isLocal;
      return local;
    }
    var copy = {
      domains: [],
      ips: [],
      cidrs: [],
      domainCount: 0,
      ipCount: 0
    };
    Object.keys(URL_LIST_KEEP).forEach(function (key) {
      if (list[key] !== undefined) copy[key] = list[key];
    });
    copy.url = listUrl(list);
    return copy;
  }

  function sanitizeLists(lists) {
    return lists.filter(function (item) {
      return !!item && typeof item === "object";
    }).map(sanitizeList);
  }

  // Файл может быть собран вручную, поэтому ключ с неожиданным типом
  // отбрасывается: иначе он попадёт в storage и сломает фон.
  var KEY_CHECK = {
    proxyServers: Array.isArray,
    proxyRules: Array.isArray,
    directRules: Array.isArray,
    proxyLists: Array.isArray,
    proxyConfig: function (v) { return !!v && typeof v === "object" && !Array.isArray(v); },
    extensionEnabled: function (v) { return typeof v === "boolean"; }
  };

  function payload(data) {
    var settings = {};
    if (!data || typeof data !== "object") return settings;
    KEYS.forEach(function (key) {
      if (data[key] === undefined) return;
      var value = data[key];
      if (!KEY_CHECK[key](value)) return;
      settings[key] = key === "proxyLists" ? sanitizeLists(value) : value;
    });
    return settings;
  }

  function parse(text) {
    var raw;
    try { raw = JSON.parse(String(text || "")); }
    catch (_) { return null; }
    if (!raw || typeof raw !== "object") return null;
    var source = raw.format === "deviateproxy-settings" && raw.settings && typeof raw.settings === "object"
      ? raw.settings
      : raw;
    var settings = payload(source);
    if (!Object.keys(settings).length) return null;
    return settings;
  }

  function exportBlob(data) {
    return {
      format: "deviateproxy-settings",
      version: 1,
      exportedAt: Date.now(),
      settings: payload(data)
    };
  }

  var api = {
    KEYS: KEYS,
    payload: payload,
    parse: parse,
    exportBlob: exportBlob
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SettingsIo = api;
})(typeof self !== "undefined" ? self : this);
