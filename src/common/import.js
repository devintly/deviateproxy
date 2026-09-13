const browser = globalThis.browser || globalThis.chrome;

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof I18n !== "undefined") await I18n.init(browser);

  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const statusEl = document.getElementById("status");

  function processFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target && e.target.result ? String(e.target.result).trim() : "";
      if (!text) {
        if (statusEl) {
          statusEl.className = "status error";
          statusEl.textContent = I18n.t("error_parse");
        }
        return;
      }

      try {
        const res = await browser.storage.local.get(["popupUiDraft"]);
        const draft = res.popupUiDraft || {
          activeTabId: "tabLists",
          listForm: {
            editingListId: null,
            name: "",
            url: "",
            interval: "12",
            viaProxy: false,
            manualDomains: [],
            domainsModalOpen: true,
            domainsModalInput: ""
          }
        };

        if (!draft.listForm) {
          draft.listForm = {
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

        const existingInput = String(draft.listForm.domainsModalInput || "").trim();
        draft.listForm.domainsModalInput = existingInput ? (existingInput + "\n" + text) : text;
        draft.listForm.domainsModalOpen = true;
        draft.activeTabId = "tabLists";

        await browser.storage.local.set({ popupUiDraft: draft });

        if (statusEl) {
          statusEl.className = "status success";
          statusEl.textContent = I18n.t("import_success");
        }

        setTimeout(() => {
          try { window.close(); } catch (_) {}
        }, 1200);
      } catch (err) {
        if (statusEl) {
          statusEl.className = "status error";
          statusEl.textContent = String((err && err.message) || err);
        }
      }
    };
    reader.readAsText(file);
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      processFile(file);
    });
  }

  if (dropzone) {
    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("drag-over");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        processFile(dt.files[0]);
      }
    });
  }
});
