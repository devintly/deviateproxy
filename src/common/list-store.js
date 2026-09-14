(function (root) {
  "use strict";

  var FETCH_TIMEOUT_MS = 45000;
  var FETCH_HEADERS = { Accept: "application/x-ns-proxy-autoconfig, text/plain, application/javascript, */*" };
  var ALARM_NAME = "updateLists";

  function resolveModule(name) {
    if (root && root[name]) return root[name];
    if (typeof globalThis !== "undefined" && globalThis[name]) return globalThis[name];
    return null;
  }

  function noop() {}

  // Единое хранилище прокси-списков для Chrome и Firefox. Платформенные
  // различия (разбор в offscreen или воркере, пересборка PAC) передаются
  // через хуки в create.
  function create(options) {
    var api = options.api;
    var ingest = options.ingest;
    var withFetchRoute = options.withFetchRoute || function (url, viaProxy, fn) { return fn(); };
    var onChanged = options.onChanged || noop;
    var afterRun = options.afterRun || noop;
    var onUpdated = options.onUpdated || noop;
    var onImport = options.onImport;

    var ListUpdate = resolveModule("ListUpdate");
    var ListIngest = resolveModule("ListIngest");

    var lists = [];
    var queue = Promise.resolve();

    function fail(code, text) {
      return ListUpdate.codedError(code, text);
    }

    function persist() {
      return api.storage.local.set({ proxyLists: lists });
    }

    // Расписание пересчитывается здесь, а не по событию storage: список правит
    // только ListStore, и фон свои же записи не перечитывает.
    async function commitChange() {
      await persist();
      await onChanged();
      await scheduleAlarm();
    }

    function find(id) {
      return lists.find(function (item) { return item.id === id; });
    }

    function enqueue(fn) {
      var task = queue.then(fn, fn);
      queue = task.then(noop, noop);
      return task;
    }

    async function download(url, viaProxy) {
      return withFetchRoute(url, viaProxy, async function () {
        var response = await fetch(url, {
          cache: "no-store",
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        var text = await response.text();
        if (!response.ok) {
          throw new Error("HTTP " + response.status + ": " + text.replace(/\s+/g, " ").trim().slice(0, 160));
        }
        return text;
      });
    }

    async function fetchAndStore(url, existingId, msg) {
      url = String(url || "").trim();
      if (!ListUpdate.validListUrl(url)) throw fail("msg_invalid_url", "Введите корректный URL");
      if (ListUpdate.findListByUrl(lists, url, existingId)) {
        throw fail("msg_list_exists", "Список добавить нельзя, он уже существует");
      }
      var existing = existingId != null ? find(existingId) : null;
      var meta = ListUpdate.listMeta(msg || {}, existing);
      try {
        var body = await download(url, meta.viaProxy);
        var item = await ingest(url, body);
        var stored = ListUpdate.commitFetchedList(lists, item, meta, url, existingId, Date.now());
        await commitChange();
        return stored;
      } catch (e) {
        if (existingId != null) {
          var current = find(existingId);
          if (current) {
            ListUpdate.markFailure(current, e, Date.now());
            await persist();
          }
        }
        throw e;
      }
    }

    // Скачивание закрывается хуком afterRun: в Chrome он выключает offscreen.
    async function fetchTask(url, existingId, msg) {
      try { return await fetchAndStore(url, existingId, msg); }
      finally { await afterRun(); }
    }

    async function saveMeta(msg) {
      var target = find(msg.id);
      if (!target) throw fail("error_list_missing", "Список не найден");
      var url = String(msg.url || target.url || "").trim();
      if (!ListUpdate.validListUrl(url)) throw fail("msg_invalid_url", "Введите корректный URL");
      if (ListUpdate.findListByUrl(lists, url, msg.id)) {
        throw fail("msg_list_exists", "Список добавить нельзя, он уже существует");
      }
      var meta = ListUpdate.listMeta(msg, target);
      Object.assign(target, {
        name: meta.name,
        intervalHours: meta.intervalHours,
        viaProxy: meta.viaProxy,
        enabled: meta.enabled,
        type: "proxy",
        url: url
      });
      await commitChange();
    }

    async function saveLocal(msg) {
      var raw = Array.isArray(msg.domains) ? msg.domains.join("\n") : String(msg.domains || "");
      var domains = ListIngest.parseList(raw);
      var target = msg.id != null ? find(msg.id) : null;
      var isNew = !target;
      if (isNew) {
        target = { id: ListIngest.uniqueId(), enabled: msg.enabled !== false };
        lists.push(target);
      } else if (msg.enabled !== undefined) {
        target.enabled = msg.enabled !== false;
      }
      Object.assign(target, {
        name: String(msg.name || "").trim(),
        url: "",
        format: "txt",
        domains: domains,
        domainCount: domains.length,
        ips: [],
        cidrs: [],
        ipCount: 0,
        viaProxy: false,
        intervalHours: ListUpdate.DEFAULT_HOURS,
        updatedAt: Date.now(),
        updateError: "",
        updateErrorCode: "",
        updateFailCount: 0,
        type: "proxy"
      });
      await commitChange();
      return target;
    }

    async function setEnabled(id, enabled) {
      var target = find(id);
      if (!target) throw fail("error_list_missing", "Список не найден");
      target.enabled = !!enabled;
      await commitChange();
      if (target.enabled && target.url && ListUpdate.isDue(target, Date.now())) {
        try { await fetchTask(target.url, target.id, target); }
        catch (_) {}
      }
    }

    async function remove(id) {
      var before = lists.length;
      lists = lists.filter(function (item) { return item.id !== id; });
      if (lists.length === before) throw fail("error_list_missing", "Список не найден");
      await commitChange();
    }

    async function refresh(id) {
      var target = find(id);
      if (!target) throw fail("error_list_missing", "Список не найден");
      if (!target.url) return;
      await fetchTask(target.url, target.id, target);
    }

    async function updateListed(all) {
      var now = Date.now();
      var ids = lists.filter(function (list) {
        return list && list.url && list.enabled !== false && (all || ListUpdate.isDue(list, now));
      }).map(function (list) { return list.id; });
      var updated = 0, failed = 0;
      try {
        for (var i = 0; i < ids.length; i++) {
          var list = find(ids[i]);
          if (!list || !list.url || list.enabled === false) continue;
          if (!all && !ListUpdate.isDue(list, Date.now())) continue;
          try {
            await fetchAndStore(list.url, list.id, list);
            updated++;
          } catch (_) {
            failed++;
          }
        }
      } finally {
        await afterRun();
      }
      if (updated || all) await onUpdated();
      return { updated: updated, failed: failed };
    }

    function updateAll() { return enqueue(function () { return updateListed(true); }); }
    function updateDue() { return enqueue(function () { return updateListed(false); }); }

    // Настройки из файла приходят уже разобранными: списки по URL в них без
    // содержимого, поэтому после применения они сразу скачиваются заново.
    async function importSettings(settings) {
      var next = Object.assign({}, settings && typeof settings === "object" ? settings : {});
      if (Array.isArray(next.proxyLists)) {
        load(next.proxyLists);
        next.proxyLists = lists;
      }
      // onImport применяет настройки к состоянию фона и может нормализовать их
      // (например, собрать список серверов из старого proxyConfig) до записи.
      if (typeof onImport === "function") await onImport(next);
      else await onChanged();
      await api.storage.local.set(next);
      var result = await updateListed(true);
      await scheduleAlarm();
      return result;
    }

    async function scheduleAlarm() {
      try {
        var enabledLists = lists.filter(function (l) { return l.enabled !== false; });
        var when = ListUpdate.alarmWhen(enabledLists, Date.now());
        if (!when) {
          await api.alarms.clear(ALARM_NAME);
          return;
        }
        var existing = await api.alarms.get(ALARM_NAME);
        if (existing && !existing.periodInMinutes && Math.abs(existing.scheduledTime - when) < 15000) return;
        await api.alarms.create(ALARM_NAME, { when: when });
      } catch (_) {}
    }

    // Миграция затрагивает только эти поля, поэтому изменения определяются по
    // ним: сериализовать списки целиком на каждом старте слишком дорого.
    function needsMigration(list) {
      return !!list && (
        list.pacScript !== undefined ||
        list.pacIndex !== undefined ||
        list.lastError !== undefined ||
        list.isLocal !== undefined
      );
    }

    // Приводит сохранённые списки к актуальному формату и сообщает, нужно ли
    // их перезаписать и перекачать устаревшие PAC-списки.
    function load(rawLists) {
      var raw = Array.isArray(rawLists) ? rawLists : [];
      var stale = false;
      var changed = false;
      lists = raw.map(function (list) {
        if (ListUpdate.isStalePac(list)) stale = true;
        if (needsMigration(list)) changed = true;
        return ListUpdate.migrateList(Object.assign({}, list));
      });
      return { changed: changed, stale: stale };
    }

    function errorResponse(e) {
      return {
        success: false,
        error: String((e && e.message) || e || ""),
        code: (e && e.code) || ""
      };
    }

    function ok(task) {
      return Promise.resolve(task).then(function () { return { success: true }; }, errorResponse);
    }

    // Возвращает промис с ответом или null, если действие не относится к спискам.
    function handleMessage(msg) {
      var action = msg && msg.action;
      if (action === "fetchList") {
        return ok(enqueue(function () { return fetchTask(msg.url, msg.id, msg); }));
      }
      if (action === "saveListMeta") {
        return ok(enqueue(function () { return saveMeta(msg); }));
      }
      if (action === "saveLocalList") {
        return ok(enqueue(function () { return saveLocal(msg); }));
      }
      if (action === "setListEnabled") {
        return ok(enqueue(function () { return setEnabled(msg.id, msg.enabled); }));
      }
      if (action === "deleteList") {
        return ok(enqueue(function () { return remove(msg.id); }));
      }
      if (action === "refreshList") {
        return ok(enqueue(function () { return refresh(msg.id); }));
      }
      if (action === "refreshLists") {
        return updateAll().then(function (res) {
          return { success: true, updated: res.updated, failed: res.failed };
        }, errorResponse);
      }
      if (action === "importSettings") {
        return enqueue(function () { return importSettings(msg.settings); }).then(function (res) {
          return { success: true, updated: res.updated, failed: res.failed };
        }, errorResponse);
      }
      return null;
    }

    return {
      ALARM_NAME: ALARM_NAME,
      all: function () { return lists; },
      load: load,
      enqueue: enqueue,
      handleMessage: handleMessage,
      updateAll: updateAll,
      updateDue: updateDue,
      scheduleAlarm: scheduleAlarm
    };
  }

  var api = { create: create, ALARM_NAME: ALARM_NAME };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ListStore = api;
})(typeof self !== "undefined" ? self : this);
