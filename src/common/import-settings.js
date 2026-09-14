const browser = globalThis.browser || globalThis.chrome;

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof I18n !== "undefined") await I18n.init(browser);

  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const statusEl = document.getElementById("status");

  function setStatus(kind, text) {
    if (!statusEl) return;
    statusEl.className = `status ${kind}`;
    statusEl.textContent = text;
  }

  // Импорт ждёт, пока фон перекачает все списки по URL, поэтому второй файл до
  // конца обработки не принимается.
  let busy = false;

  async function processText(raw) {
    if (busy) return;
    const settings = SettingsIo.parse(raw);
    if (!settings) {
      setStatus("error", I18n.t("error_settings_import"));
      return;
    }
    busy = true;
    setStatus("progress", I18n.t("import_settings_progress"));
    try {
      const res = await browser.runtime.sendMessage({ action: "importSettings", settings });
      if (!res || res.success === false) {
        setStatus("error", I18n.error(res && res.error, res && res.code));
        return;
      }
      setStatus("success", I18n.t("import_settings_success"));
      setTimeout(() => {
        try { window.close(); } catch (_) {}
      }, 1200);
    } catch (err) {
      setStatus("error", I18n.error(err));
    } finally {
      busy = false;
    }
  }

  FileImport.attachFileInput(fileInput, processText);
  FileImport.attachDropZone(dropzone, processText);
});
