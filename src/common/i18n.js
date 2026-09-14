"use strict";

(function (root) {
  const MESSAGES = {
    ru: {
      tabs_proxy: "Прокси",
      tabs_rules: "Правила",
      tabs_lists: "Списки",
      power_setup: "Сначала добавьте прокси",
      power_off: "Выключить расширение",
      power_on: "Включить расширение",
      search_domains: "Поиск домена",
      search_proxies: "Поиск по названию, IP или домену",
      search_lists: "Поиск по названию или ссылке",
      empty_domains: "Нет доменов. Откройте сайт и обновите страницу.",
      empty_proxies: "Прокси пока нет",
      empty_lists: "Списков пока нет",
      empty_generic: "Ничего не найдено",
      proxy_active: "Активный прокси",
      proxy_inactive: "Сделать активным",
      badge_active: "Активный",
      list_active: "Список включен",
      list_inactive: "Список выключен",
      btn_edit: "Редактировать",
      btn_refresh: "Обновить",
      btn_delete: "Удалить",
      btn_save: "Сохранить",
      btn_saving: "Сохранение...",
      btn_cancel: "Отмена",
      btn_close: "Закрыть",
      btn_add_proxy: "Добавить прокси",
      btn_add_list: "Добавить список",
      btn_update_all: "Обновить все",
      btn_ping_all: "Проверить доступность",
      lbl_protocol: "Тип прокси",
      lbl_host: "IP адрес / Хост",
      lbl_port: "Порт",
      lbl_username: "Логин",
      lbl_password: "Пароль",
      lbl_name: "Название",
      lbl_url: "URL списка (TXT / PAC)",
      lbl_interval: "Обновление (часы)",
      lbl_via_proxy: "Скачивать через прокси",
      lbl_scope_host: "Текущий",
      lbl_scope_apex: "Основной",
      btn_tab_domains: "Домены вкладки",
      btn_show_tree: "Показать дерево",
      loaded_domain: "Загружен на этой вкладке",
      btn_rule_editor: "Редактор правил",
      rule_proxy: "Проксировать",
      rule_direct: "Напрямую",
      btn_to_rules: "Создать правило",
      btn_remove_rule: "Удалить",
      wildcard_subdomains: "Включая поддомены",
      domain_placeholder: "example.com",
      status_none: "Нет правил",
      status_proxy_full: "Проксируется",
      status_direct_full: "Идёт напрямую",
      status_proxy_apex: "Проксируется правилом",
      status_direct_apex: "Идёт напрямую правилом",
      status_list_full: "Проксируется списком",
      status_list_apex: "Проксируется списком по правилу",
      hint_no_spaces: "Уберите пробелы",
      hint_latin_only: "Только латиница",
      hint_dot_required: "Нужна точка в домене",
      hint_invalid_tld: "Несуществующая доменная зона",
      hint_empty_rule: "Пустое правило",
      msg_proxy_added: "Прокси добавлен",
      msg_proxy_deleted: "Прокси удален",
      msg_fill_fields: "Заполните хост и порт",
      msg_invalid_proxy_host: "Введите корректный IP адрес или домен хоста",
      msg_invalid_proxy_port: "Введите допустимый порт (1-65535)",
      msg_proxy_exists: "Прокси добавить нельзя, он уже существует",
      msg_invalid_url: "Введите корректный URL",
      msg_list_exists: "Список добавить нельзя, он уже существует",
      msg_list_added: "Список добавлен",
      msg_no_lists: "Списков нет",
      msg_no_proxies: "Нет прокси для проверки",
      msg_pinging: "Проверка доступности...",
      msg_ping_done: "Проверка завершена",
      msg_active_saved: "Активный прокси выбран",
      msg_saved: "Сохранено",
      msg_deleted: "Удалено",
      msg_copied: "Домен скопирован",
      msg_added: "добавлено: {count}",
      msg_removed: "удалено: {count}",
      updated_never: "еще не обновлялся",
      lbl_updated: "Обновлён",
      lbl_changed: "Изменён",
      status_proxied_by_rule: "Проксируется правилом {rule}",
      status_direct_by_rule: "Идёт напрямую правилом {rule}",
      status_proxied_by_list: "Проксируется списком {name}",
      status_proxied_by_list_rule: "Проксируется списком {name} по правилу {rule}",
      mode_proxy_direct: "Проксировать / Напрямую",
      msg_timeout: "Таймаут",
      msg_updated: "Обновлено",
      msg_update_error: "Ошибка обновления",
      msg_error: "Ошибка",
      msg_updated_count: "Обновлено: {count}",
      msg_updated_failed: "Обновлено: {updated}, ошибок: {failed}",
      msg_rule_added: "Добавлено",
      msg_invalid_rules: "Исправьте некорректные строки: {lines}",
      msg_conflict_rules: "Конфликт правил в окнах: исправьте конфликтующие строки",
      not_available: "н/д",
      error_list_missing: "Список не найден",
      error_html_response: "Сервер вернул HTML вместо списка или PAC",
      error_not_pac: "Ответ не похож на PAC-файл",
      error_empty_pac: "Получен пустой PAC-файл",
      error_parse_timeout: "Разбор списка превысил время ожидания",
      error_parse: "Не удалось разобрать список",
      error_proxy_apply: "Не удалось применить настройки прокси",
      placeholder_list_url: "https://.../list.txt",
      placeholder_manual_domains: "example.com\n*.example.com",
      lbl_local_list: "Локальный список",
      btn_manual_domains: "Ввести домены вручную",
      modal_list_domains_title: "Домены списка",
      lbl_manual_domains_hint: "Каждый домен с новой строки",
      btn_apply: "Применить",
      btn_import_txt: "Импорт из TXT",
      import_tab_title: "Импорт списка доменов",
      import_tab_desc: "Выберите или перетащите файл .txt со списком доменов. Они будут сохранены в черновик и добавлены в открытый список.",
      import_drag_hint: "Перетащите файл .txt сюда или",
      import_select_file: "Выбрать файл TXT",
      import_success: "Файл успешно импортирован в черновик! Откройте расширение.",
      import_settings_title: "Импорт настроек",
      import_settings_desc: "Выберите или перетащите файл .json с экспортом настроек DeviateProxy. Они заменят текущие серверы, правила и списки.",
      import_settings_drag: "Перетащите файл .json сюда или",
      import_settings_select: "Выбрать файл JSON",
      import_settings_progress: "Применяю настройки и обновляю списки...",
      import_settings_success: "Настройки импортированы! Откройте расширение.",
      conflict_warning_title: "Конфликт расширений",
      conflict_warning_desc: "Другое расширение контролирует настройки прокси. Отключите конфликтующие VPN или прокси-расширения.",
      info_title: "О расширении",
      info_desc: "Проксирование сайтов через SOCKS/HTTP/HTTPS по пользовательским правилам с поддержкой импорта TXT/PAC списков.",
      btn_import_settings: "Импорт настроек",
      btn_export_settings: "Экспорт настроек",
      info_source: "Исходный код:",
      info_github: "DeviateProxy",
      info_inspired: "Вдохновлено:",
      info_inspired_megu: "MeguProxy",
      info_inspired_pac: "PAC Proxy Manager Extension",
      msg_settings_exported: "Настройки экспортированы",
      msg_settings_imported: "Настройки импортированы",
      error_settings_import: "Некорректный файл настроек"
    },
    en: {
      tabs_proxy: "Proxy",
      tabs_rules: "Rules",
      tabs_lists: "Lists",
      power_setup: "Configure proxy first",
      power_off: "Disable extension",
      power_on: "Enable extension",
      search_domains: "Search domain",
      search_proxies: "Search by name, IP, or domain",
      search_lists: "Search by name or URL",
      empty_domains: "No domains. Open a website and reload the page.",
      empty_proxies: "No proxies yet",
      empty_lists: "No lists yet",
      empty_generic: "Nothing found",
      proxy_active: "Active proxy",
      proxy_inactive: "Set as active",
      badge_active: "Active",
      list_active: "List enabled",
      list_inactive: "List disabled",
      btn_edit: "Edit",
      btn_refresh: "Update",
      btn_delete: "Delete",
      btn_save: "Save",
      btn_saving: "Saving...",
      btn_cancel: "Cancel",
      btn_close: "Close",
      btn_add_proxy: "Add Proxy",
      btn_add_list: "Add List",
      btn_update_all: "Update All",
      btn_ping_all: "Check availability",
      lbl_protocol: "Proxy type",
      lbl_host: "IP / Host",
      lbl_port: "Port",
      lbl_username: "Username",
      lbl_password: "Password",
      lbl_name: "Name",
      lbl_url: "List URL (TXT / PAC)",
      lbl_interval: "Update (hours)",
      lbl_via_proxy: "Download via proxy",
      lbl_scope_host: "Current",
      lbl_scope_apex: "Apex",
      btn_tab_domains: "Tab domains",
      btn_show_tree: "Show tree",
      loaded_domain: "Loaded on this tab",
      btn_rule_editor: "Rule editor",
      rule_proxy: "Proxy",
      rule_direct: "Direct",
      btn_to_rules: "Add rule",
      btn_remove_rule: "Remove",
      wildcard_subdomains: "Including subdomains",
      domain_placeholder: "example.com",
      status_none: "No rules",
      status_proxy_full: "Proxied",
      status_direct_full: "Direct",
      status_proxy_apex: "Proxied by rule",
      status_direct_apex: "Direct by rule",
      status_list_full: "Proxied by list",
      status_list_apex: "Proxied by list rule",
      hint_no_spaces: "Remove spaces",
      hint_latin_only: "Latin characters only",
      hint_dot_required: "Domain name and dot required",
      hint_invalid_tld: "Invalid top-level domain",
      hint_empty_rule: "Empty rule",
      msg_proxy_added: "Proxy added",
      msg_proxy_deleted: "Proxy deleted",
      msg_fill_fields: "Enter host and port",
      msg_invalid_proxy_host: "Enter a valid IP address or hostname",
      msg_invalid_proxy_port: "Enter a valid port (1-65535)",
      msg_proxy_exists: "Proxy already exists",
      msg_invalid_url: "Enter a valid URL",
      msg_list_exists: "List already exists",
      msg_list_added: "List added",
      msg_no_lists: "No lists",
      msg_no_proxies: "No proxies to check",
      msg_pinging: "Checking availability...",
      msg_ping_done: "Check complete",
      msg_active_saved: "Active proxy selected",
      msg_saved: "Saved",
      msg_deleted: "Deleted",
      msg_copied: "Domain copied",
      msg_added: "added: {count}",
      msg_removed: "removed: {count}",
      updated_never: "never updated",
      lbl_updated: "Updated",
      lbl_changed: "Changed",
      status_proxied_by_rule: "Proxied by rule {rule}",
      status_direct_by_rule: "Direct by rule {rule}",
      status_proxied_by_list: "Proxied by list {name}",
      status_proxied_by_list_rule: "Proxied by list {name} by rule {rule}",
      mode_proxy_direct: "Proxy / Direct",
      msg_timeout: "Timeout",
      msg_updated: "Updated",
      msg_update_error: "Update failed",
      msg_error: "Error",
      msg_updated_count: "Updated: {count}",
      msg_updated_failed: "Updated: {updated}, failed: {failed}",
      msg_rule_added: "Added",
      msg_invalid_rules: "Fix invalid lines: {lines}",
      msg_conflict_rules: "Rule conflict between panes: fix conflicting lines",
      not_available: "n/a",
      error_list_missing: "List not found",
      error_html_response: "The server returned HTML instead of a list or PAC",
      error_not_pac: "The response is not a PAC file",
      error_empty_pac: "The PAC response is empty",
      error_parse_timeout: "List parsing timed out",
      error_parse: "Could not parse the list",
      error_proxy_apply: "Could not apply proxy settings",
      placeholder_list_url: "https://.../list.txt",
      placeholder_manual_domains: "example.com\n*.example.com",
      lbl_local_list: "Local list",
      btn_manual_domains: "Enter domains manually",
      modal_list_domains_title: "List Domains",
      lbl_manual_domains_hint: "One domain per line",
      btn_apply: "Apply",
      btn_import_txt: "Import from TXT",
      import_tab_title: "Import Domain List",
      import_tab_desc: "Select or drop a .txt file containing domains. They will be saved to your draft and added to the list.",
      import_drag_hint: "Drop a .txt file here or",
      import_select_file: "Select TXT File",
      import_success: "File imported to draft successfully! Reopen the extension.",
      import_settings_title: "Import settings",
      import_settings_desc: "Select or drop a .json file exported from DeviateProxy. It will replace the current servers, rules, and lists.",
      import_settings_drag: "Drop a .json file here or",
      import_settings_select: "Select JSON File",
      import_settings_progress: "Applying settings and updating lists...",
      import_settings_success: "Settings imported! Reopen the extension.",
      conflict_warning_title: "Extension Conflict",
      conflict_warning_desc: "Another extension is controlling proxy settings. Please disable conflicting VPN or proxy extensions.",
      info_title: "About DeviateProxy",
      info_desc: "Website proxying via SOCKS/HTTP/HTTPS using custom rules with support for importing TXT/PAC lists.",
      btn_import_settings: "Import settings",
      btn_export_settings: "Export settings",
      info_source: "Source code:",
      info_github: "DeviateProxy",
      info_inspired: "Inspired by:",
      info_inspired_megu: "MeguProxy",
      info_inspired_pac: "PAC Proxy Manager Extension",
      msg_settings_exported: "Settings exported",
      msg_settings_imported: "Settings imported",
      error_settings_import: "Invalid settings file"
    }
  };

  let currentLang = "ru";

  function detectLang(browserApi) {
    let lang = "";
    try {
      if (browserApi && browserApi.i18n && typeof browserApi.i18n.getUILanguage === "function") {
        lang = browserApi.i18n.getUILanguage();
      }
    } catch (_) {}
    if (!lang && typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function") {
      try { lang = chrome.i18n.getUILanguage(); } catch (_) {}
    }
    if (!lang && typeof navigator !== "undefined") {
      lang = navigator.language || navigator.userLanguage || "";
    }
    const s = String(lang || "").toLowerCase();
    if (s.startsWith("ru") || s.startsWith("be") || s.startsWith("kk") || s.startsWith("uk")) {
      return "ru";
    }
    return "en";
  }

  function t(key, params) {
    const dict = MESSAGES[currentLang] || MESSAGES.en;
    let str = dict[key] || MESSAGES.en[key] || key;
    if (params) {
      Object.keys(params).forEach(p => {
        str = str.split(`{${p}}`).join(params[p]);
      });
    }
    return str;
  }

  function error(message, code) {
    if (code && MESSAGES.en[code]) return t(code);
    const text = String((message && message.message) || message || "").trim();
    return text.slice(0, 180) || t("msg_error");
  }

  function applyDom() {
    document.documentElement.lang = currentLang;
    const titleKey = document.documentElement.getAttribute("data-i18n-document-title");
    if (titleKey) document.title = `DeviateProxy — ${t(titleKey)}`;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.placeholder = t(key);
    });
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (key) {
        el.title = t(key);
        if (el.hasAttribute("aria-label")) el.setAttribute("aria-label", t(key));
      }
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (key) el.setAttribute("aria-label", t(key));
    });
  }

  async function init(browserApi) {
    currentLang = detectLang(browserApi);
    applyDom();
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  const I18n = { t, error, init, getLang };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = I18n;
  }
  root.I18n = I18n;
})(typeof self !== "undefined" ? self : this);
