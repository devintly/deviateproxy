const browser = globalThis.browser || globalThis.chrome;

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof I18n !== "undefined") await I18n.init(browser);
  const saveBtn = document.getElementById("saveBtn");
  const toastContainer = document.getElementById("toastContainer");

  const pruneRedundant = HostRules.pruneRedundant;

  function findCrossConflicts(directParsed, proxyParsed) {
    const directHostMap = new Map();
    directParsed.lines.forEach(item => {
      if (item.host) {
        if (!directHostMap.has(item.host)) directHostMap.set(item.host, []);
        directHostMap.get(item.host).push(item.lineNum);
      }
    });

    const proxyHostMap = new Map();
    proxyParsed.lines.forEach(item => {
      if (item.host) {
        if (!proxyHostMap.has(item.host)) proxyHostMap.set(item.host, []);
        proxyHostMap.get(item.host).push(item.lineNum);
      }
    });

    const directConflicts = new Set();
    const proxyConflicts = new Set();

    directHostMap.forEach((dLines, host) => {
      if (proxyHostMap.has(host)) {
        dLines.forEach(ln => directConflicts.add(ln));
        proxyHostMap.get(host).forEach(ln => proxyConflicts.add(ln));
      }
    });

    return { directConflicts, proxyConflicts };
  }

  let activeToast = null;
  let toastHideTimer = null;

  function dismissToast(el) {
    if (!el) return;
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 250);
  }

  function flash(text, error) {
    if (!text || !toastContainer) return;
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
      toastHideTimer = null;
    }
    if (activeToast) {
      dismissToast(activeToast);
      activeToast = null;
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${error ? "error" : "success"}`;
    toast.textContent = text;
    toastContainer.appendChild(toast);
    activeToast = toast;
    void toast.offsetHeight;
    toast.classList.add("toast-in");
    toastHideTimer = setTimeout(() => {
      if (activeToast === toast) activeToast = null;
      dismissToast(toast);
    }, 2800);
  }

  function createEditor(prefix) {
    return RuleEditor.create({
      textarea: document.getElementById(`${prefix}Editor`),
      gutter: document.getElementById(`${prefix}Gutter`),
      backdrop: document.getElementById(`${prefix}Backdrop`),
      container: document.getElementById(`${prefix}Container`),
      onChange: () => validateAll()
    });
  }

  const proxyEditor = createEditor("proxy");
  const directEditor = createEditor("direct");

  function validateAll() {
    const directParsed = directEditor.parse();
    const proxyParsed = proxyEditor.parse();
    const { directConflicts, proxyConflicts } = findCrossConflicts(directParsed, proxyParsed);

    const directErrors = new Set([...directParsed.invalid, ...directConflicts]);
    const proxyErrors = new Set([...proxyParsed.invalid, ...proxyConflicts]);

    directEditor.setInvalidLines(directErrors);
    proxyEditor.setInvalidLines(proxyErrors);

    return {
      directParsed,
      proxyParsed,
      directConflicts,
      proxyConflicts,
      hasSyntaxErrors: directParsed.invalid.length > 0 || proxyParsed.invalid.length > 0,
      hasConflicts: directConflicts.size > 0 || proxyConflicts.size > 0
    };
  }

  const res = await browser.storage.local.get(["proxyRules", "directRules"]);
  proxyEditor.setValue(pruneRedundant(Array.isArray(res.proxyRules) ? res.proxyRules : []).join("\n"));
  directEditor.setValue(pruneRedundant(Array.isArray(res.directRules) ? res.directRules : []).join("\n"));
  validateAll();

  function appendEditorText(editor, text) {
    if (!editor.appendText(text)) return;
    validateAll();
    editor.textarea.focus();
    editor.syncScroll();
  }

  function setupImport(prefix, editor) {
    const onText = text => appendEditorText(editor, text);
    FileImport.attachPicker(
      document.getElementById(`import${prefix}Btn`),
      document.getElementById(`import${prefix}File`),
      onText
    );
    FileImport.attachDropZone(document.getElementById(`${prefix.toLowerCase()}Container`), onText);
  }

  setupImport("Proxy", proxyEditor);
  setupImport("Direct", directEditor);

  window.addEventListener("resize", () => {
    proxyEditor.syncScroll();
    directEditor.syncScroll();
  });

  saveBtn.addEventListener("click", async () => {
    const validation = validateAll();
    if (validation.hasSyntaxErrors) {
      const invalid = validation.directParsed.invalid.concat(validation.proxyParsed.invalid);
      flash(I18n.t("msg_invalid_rules", { lines: invalid.join(", ") }), true);
      return;
    }
    if (validation.hasConflicts) {
      flash(I18n.t("msg_conflict_rules"), true);
      return;
    }

    const nextDirect = pruneRedundant(validation.directParsed.rules);
    const nextProxy = pruneRedundant(validation.proxyParsed.rules);

    await browser.storage.local.set({ proxyRules: nextProxy, directRules: nextDirect });
    proxyEditor.setValue(nextProxy.join("\n"));
    directEditor.setValue(nextDirect.join("\n"));
    validateAll();
    flash(I18n.t("msg_saved"));
  });

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveBtn.click();
    }
  });
});
