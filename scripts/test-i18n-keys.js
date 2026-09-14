#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(path.join(root, "src"));
const sources = files.filter(f => /\.(js|html)$/.test(f)).map(f => ({
  rel: path.relative(root, f).replace(/\\/g, "/"),
  text: fs.readFileSync(f, "utf8")
}));

// Все скрипты должны парситься: опечатка в рефакторинге ломает фон целиком.
sources.filter(s => s.rel.endsWith(".js")).forEach(s => {
  new vm.Script(s.text, { filename: s.rel });
});

// Словари не экспортируются, поэтому литерал вычитывается из исходника.
const MESSAGES = (() => {
  const src = fs.readFileSync(path.join(root, "src/common/i18n.js"), "utf8");
  const marker = "const MESSAGES = ";
  const start = src.indexOf(marker);
  const end = src.indexOf("\n  };", start);
  assert(start >= 0 && end > start, "i18n.js: не найден литерал MESSAGES");
  return vm.runInNewContext("(" + src.slice(start + marker.length, end + 4).replace(/;$/, "") + ")");
})();

const en = MESSAGES.en;
const ru = MESSAGES.ru;
assert(en && ru, "i18n must provide both en and ru dictionaries");

const enKeys = Object.keys(en);
const ruKeys = Object.keys(ru);
const missingRu = enKeys.filter(k => !(k in ru));
const missingEn = ruKeys.filter(k => !(k in en));
assert(!missingRu.length, "keys missing in ru: " + missingRu.join(", "));
assert(!missingEn.length, "keys missing in en: " + missingEn.join(", "));

// Ключи с параметрами должны совпадать в обоих языках.
const params = value => (String(value).match(/\{[a-z_]+\}/gi) || []).sort().join(",");
const paramMismatch = enKeys.filter(k => params(en[k]) !== params(ru[k]));
assert(!paramMismatch.length, "placeholder mismatch between en and ru: " + paramMismatch.join(", "));

const used = new Set();
const dynamic = [];
sources.forEach(({ rel, text }) => {
  const patterns = [
    /I18n\.t\(\s*"([a-z0-9_]+)"/gi,
    /I18n\.error\(\s*"([a-z0-9_]+)"/gi,
    /codedError\(\s*"([a-z0-9_]+)"/gi,
    /data-i18n(?:-[a-z-]+)?="([a-z0-9_]+)"/gi,
    /i18nKey:\s*"([a-z0-9_]+)"/gi
  ];
  patterns.forEach(re => {
    let match;
    while ((match = re.exec(text))) used.add(match[1]);
  });
  if (/I18n\.t\(\s*[`'"]?\$?\{/.test(text) || /I18n\.t\(\s*[a-z]/i.test(text)) dynamic.push(rel);
});

const unknown = Array.from(used).filter(k => !(k in en));
assert(!unknown.length, "used but undefined i18n keys: " + unknown.join(", "));

// Динамические ключи собираются из префиксов, поэтому считаем их использованными.
const DYNAMIC_PREFIXES = ["error_", "msg_", "power_", "rule_", "status_", "unit_"];
const unused = enKeys.filter(k => !used.has(k) && !DYNAMIC_PREFIXES.some(p => k.startsWith(p)));
if (unused.length) {
  console.log("test-i18n-keys: возможно неиспользуемые ключи -> " + unused.join(", "));
}

// _locales используются только манифестом.
["chrome", "firefox"].forEach(target => {
  const manifest = fs.readFileSync(path.join(root, "src", target, "manifest.json"), "utf8");
  const msgKeys = (manifest.match(/__MSG_([A-Za-z0-9_]+)__/g) || []).map(m => m.slice(6, -2));
  ["en", "ru"].forEach(lang => {
    const file = path.join(root, "src/common/_locales", lang, "messages.json");
    const dict = JSON.parse(fs.readFileSync(file, "utf8"));
    msgKeys.forEach(key => assert(dict[key], `${target}/${lang}: manifest key ${key} missing in _locales`));
    Object.keys(dict).forEach(key => {
      assert(msgKeys.includes(key), `${lang}/messages.json: unused key ${key}`);
    });
  });
});

console.log(`test-i18n-keys: ok (${enKeys.length} ключей, ${used.size} использовано, динамика в ${dynamic.length} файлах)`);
