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

  function emptyListForm() {
    return {
      editingListId: null,
      name: "",
      url: "",
      interval: "12",
      viaProxy: false,
      manualDomains: [],
      domainsModalOpen: true,
      domainsModalInput: ""
    };
  }

  async function processText(raw) {
    const text = String(raw || "").trim();
    if (!text) {
      setStatus("error", I18n.t("error_parse"));
      return;
    }
    try {
      const res = await browser.storage.local.get(["popupUiDraft"]);
      const draft = res.popupUiDraft || {};
      if (!draft.listForm) draft.listForm = emptyListForm();
      const existingInput = String(draft.listForm.domainsModalInput || "").trim();
      draft.listForm.domainsModalInput = existingInput ? `${existingInput}\n${text}` : text;
      draft.listForm.domainsModalOpen = true;
      draft.activeTabId = "tabLists";

      await browser.storage.local.set({ popupUiDraft: draft });
      setStatus("success", I18n.t("import_success"));
      setTimeout(() => {
        try { window.close(); } catch (_) {}
      }, 1200);
    } catch (err) {
      setStatus("error", String((err && err.message) || err));
    }
  }

  FileImport.attachFileInput(fileInput, processText);
  FileImport.attachDropZone(dropzone, processText);
});
