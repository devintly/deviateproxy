#!/usr/bin/env node
"use strict";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

const ListUpdate = require("../src/common/list-update");
const ListIngest = require("../src/common/list-ingest");
globalThis.ListUpdate = ListUpdate;
globalThis.ListIngest = ListIngest;
const ListStore = require("../src/common/list-store");

const stored = {};
const calls = { changed: 0, after: 0, updated: 0, routes: [] };
let fetchBody = "example.com\nfoo.org\n";
let fetchOk = true;

globalThis.fetch = () => Promise.resolve({
  ok: fetchOk,
  status: fetchOk ? 200 : 503,
  text: () => Promise.resolve(fetchBody)
});

const api = {
  storage: { local: { set: obj => { Object.assign(stored, obj); return Promise.resolve(); } } },
  alarms: {
    clear: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    create: () => Promise.resolve()
  }
};

const lists = ListStore.create({
  api,
  ingest: (url, text) => {
    const domains = ListIngest.parseList(text);
    return Promise.resolve({
      id: ListIngest.uniqueId(),
      domains,
      domainCount: domains.length,
      ips: [],
      cidrs: [],
      ipCount: 0,
      format: "txt",
      pacScript: "должен быть выброшен"
    });
  },
  withFetchRoute: (url, viaProxy, fn) => {
    calls.routes.push({ url, viaProxy: !!viaProxy });
    return fn();
  },
  onChanged: () => { calls.changed++; },
  afterRun: () => { calls.after++; },
  onUpdated: () => { calls.updated++; }
});

const send = msg => {
  const task = lists.handleMessage(msg);
  assert(task, `handleMessage must claim ${msg.action}`);
  return task;
};

(async () => {
  // Локальный список: домены разбираются, состояние сохраняется в storage.
  let res = await send({ action: "saveLocalList", name: "  Мой  ", domains: "a.com\n# комментарий\nb.com\n" });
  assert(res.success, "saveLocalList must succeed");
  assert(lists.all().length === 1, "local list must be stored");
  const local = lists.all()[0];
  assert(local.name === "Мой" && local.isLocal === true, "local list meta must be normalized");
  assert(local.domains.join(",") === "a.com,b.com", "comments must be dropped from a local list");

  assert(Array.isArray(stored.proxyLists) && stored.proxyLists.length === 1, "lists must be persisted");
  assert(calls.changed === 1, "onChanged must fire once per mutation");

  // Локальный список сохраняет маски ровно в том виде, в котором их ввели.
  res = await send({ action: "saveLocalList", id: local.id, name: "Маски", domains: ["*.example.com", "plain.org"] });
  assert(res.success, "local list with masks must save");
  assert(lists.all()[0].domains.join(",") === "*.example.com,plain.org", "masks must survive the save, got " + lists.all()[0].domains.join(","));
  assert(stored.proxyLists[0].domains[0] === "*.example.com", "masks must reach storage");

  // Скачивание: маршрут запрашивается явно, offscreen/воркер закрывается после.
  res = await send({ action: "fetchList", url: "https://lists.test/pac.txt", viaProxy: true, intervalHours: 6 });
  assert(res.success, "fetchList must succeed: " + res.error);
  assert(calls.routes.length === 1 && calls.routes[0].viaProxy === true, "fetch must honour viaProxy");
  assert(calls.after === 1, "afterRun must close the parser context");
  const remote = lists.all()[1];
  assert(remote.domains.join(",") === "example.com,foo.org", "remote list must keep parsed domains");
  assert(remote.pacScript === undefined, "pacScript must never be stored");
  assert(remote.intervalHours === 6 && remote.viaProxy === true, "remote list meta must be applied");

  // Повторный URL отклоняется кодом, а не текстом.
  res = await send({ action: "fetchList", url: "https://lists.test/pac.txt" });
  assert(!res.success && res.code === "msg_list_exists", "duplicate url must be rejected with a code");

  res = await send({ action: "fetchList", url: "ftp://lists.test/pac.txt" });
  assert(!res.success && res.code === "msg_invalid_url", "non-http url must be rejected with a code");

  // Ошибка сети помечает список, но не удаляет его.
  fetchOk = false;
  res = await send({ action: "refreshList", id: remote.id });
  assert(!res.success, "failed refresh must report an error");
  assert(lists.all()[1].updateFailCount === 1, "failure must be counted on the list");
  assert(lists.all()[1].updateError, "failure text must be stored");
  fetchOk = true;

  res = await send({ action: "refreshList", id: remote.id });
  assert(res.success && lists.all()[1].updateFailCount === 0, "successful refresh must clear the failure");

  // Переключение и удаление.
  res = await send({ action: "setListEnabled", id: local.id, enabled: false });
  assert(res.success && lists.all()[0].enabled === false, "setListEnabled must toggle the list");

  res = await send({ action: "deleteList", id: "нет такого" });
  assert(!res.success && res.code === "error_list_missing", "deleting an unknown list must return a code");

  res = await send({ action: "deleteList", id: local.id });
  assert(res.success && lists.all().length === 1, "deleteList must drop the list");

  // refreshLists возвращает счётчики и дергает onUpdated.
  const before = calls.updated;
  res = await send({ action: "refreshLists" });
  assert(res.success && res.updated === 1 && res.failed === 0, "refreshLists must report counters");
  assert(calls.updated === before + 1, "onUpdated must fire after a bulk refresh");

  assert(lists.handleMessage({ action: "pingAllProxies" }) === null, "unrelated actions must not be claimed");

  // load(): чистит устаревший формат и сообщает о PAC-списках, требующих перекачки.
  const loaded = lists.load([
    { id: "1", url: "https://a.test/list.pac", format: "pac", domains: [], pacScript: "x" },
    { id: "2", isLocal: true, domains: ["a.com"], lastError: "старая ошибка" }
  ]);
  assert(loaded.stale === true, "stale pac lists must be detected");
  assert(loaded.changed === true, "migration must be reported");
  assert(lists.all()[0].pacScript === undefined, "pacScript must be dropped on load");
  assert(lists.all()[1].updateError === "старая ошибка", "lastError must migrate to updateError");

  console.log("test-list-store: ok");
})().catch(err => {
  console.error("test-list-store: FAIL", err && err.message);
  process.exit(1);
});
