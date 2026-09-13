const browser = globalThis.browser || globalThis.chrome;

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof I18n !== "undefined") await I18n.init(browser);
  const saveBtn = document.getElementById("saveBtn");
  const status = document.getElementById("status");

  function ruleHost(rule) {
    return String(rule || "").trim().toLowerCase().replace(/^\*\./, "");
  }

  function parseRules(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const parsedLines = [];
    const invalid = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const raw = line.trim();
      if (!raw) {
        parsedLines.push({ lineNum, raw: "", normalized: "", host: "" });
        return;
      }
      const normalized = HostRules.normalizeRule(raw);
      if (!normalized) {
        invalid.push(lineNum);
        parsedLines.push({ lineNum, raw, normalized: "", host: "" });
      } else {
        const host = ruleHost(normalized);
        parsedLines.push({ lineNum, raw, normalized, host });
      }
    });

    const uniqueRules = [];
    parsedLines.forEach(item => {
      if (item.normalized && !uniqueRules.includes(item.normalized)) {
        uniqueRules.push(item.normalized);
      }
    });

    return { lines: parsedLines, rules: uniqueRules, invalid };
  }

  function compareRules(a, b) {
    const hostA = ruleHost(a);
    const hostB = ruleHost(b);
    const isIpA = HostRules.isIpHost ? HostRules.isIpHost(hostA) : /^\d+\.\d+\.\d+\.\d+$/.test(hostA);
    const isIpB = HostRules.isIpHost ? HostRules.isIpHost(hostB) : /^\d+\.\d+\.\d+\.\d+$/.test(hostB);

    // Group IPs after domain names
    if (isIpA !== isIpB) return isIpA ? 1 : -1;
    if (isIpA && isIpB) {
      return hostA.localeCompare(hostB, undefined, { numeric: true });
    }

    // Sort domain names directly left-to-right
    const cmp = hostA.localeCompare(hostB);
    if (cmp !== 0) return cmp;

    // If same host, wildcard comes first (*.example.com before example.com)
    const wildA = a.startsWith("*.");
    const wildB = b.startsWith("*.");
    if (wildA !== wildB) return wildA ? -1 : 1;

    return a.localeCompare(b);
  }

  function sortRules(rules) {
    return rules.slice().sort(compareRules);
  }

  function pruneRedundantWithinList(rules) {
    const wildHosts = new Set();
    rules.forEach(r => {
      if (r.startsWith("*.")) wildHosts.add(ruleHost(r));
    });
    const filtered = rules.filter(r => {
      if (!r.startsWith("*.") && wildHosts.has(ruleHost(r))) {
        return false;
      }
      return true;
    });
    return sortRules(filtered);
  }

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

  function flash(text, error) {
    status.style.color = error ? "#ff6b6b" : "#57f287";
    status.textContent = text;
    setTimeout(() => { if (status.textContent === text) status.textContent = ""; }, 3000);
  }

  function createEditor(textareaId, gutterId, backdropId, containerId) {
    const textarea = document.getElementById(textareaId);
    const gutter = document.getElementById(gutterId);
    const backdrop = document.getElementById(backdropId);
    const container = document.getElementById(containerId);
    let invalidSet = new Set();
    let rafId = null;

    function renderLines() {
      const lines = textarea.value.replace(/\r\n/g, "\n").split("\n");
      const count = Math.max(lines.length, 1);
      const gutterFrag = document.createDocumentFragment();
      const backdropFrag = document.createDocumentFragment();

      for (let i = 0; i < count; i++) {
        const lineNum = i + 1;
        const isInvalid = invalidSet.has(lineNum);
        
        const gDiv = document.createElement("div");
        gDiv.className = `gutter-line${isInvalid ? " invalid" : ""}`;
        gDiv.textContent = String(lineNum);
        gutterFrag.appendChild(gDiv);

        const bDiv = document.createElement("div");
        bDiv.className = `hl-line${isInvalid ? " invalid" : ""}`;
        backdropFrag.appendChild(bDiv);
      }

      gutter.textContent = "";
      gutter.appendChild(gutterFrag);
      backdrop.textContent = "";
      backdrop.appendChild(backdropFrag);
      container.classList.toggle("has-error", invalidSet.size > 0);
      syncScroll();
    }

    function syncScroll() {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    }

    function setHighlightedLines(lineNumbers) {
      invalidSet = new Set(lineNumbers);
      renderLines();
    }

    function parse() {
      return parseRules(textarea.value);
    }

    textarea.addEventListener("input", () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        validateAll();
      });
    });

    textarea.addEventListener("scroll", syncScroll, { passive: true });

    return {
      textarea,
      parse,
      renderLines,
      setHighlightedLines,
      syncScroll
    };
  }

  const proxyEditor = createEditor("proxyEditor", "proxyGutter", "proxyBackdrop", "proxyContainer");
  const directEditor = createEditor("directEditor", "directGutter", "directBackdrop", "directContainer");

  function validateAll() {
    const directParsed = directEditor.parse();
    const proxyParsed = proxyEditor.parse();
    const { directConflicts, proxyConflicts } = findCrossConflicts(directParsed, proxyParsed);

    const directErrors = new Set([...directParsed.invalid, ...directConflicts]);
    const proxyErrors = new Set([...proxyParsed.invalid, ...proxyConflicts]);

    directEditor.setHighlightedLines(directErrors);
    proxyEditor.setHighlightedLines(proxyErrors);

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
  const initialDirect = pruneRedundantWithinList(Array.isArray(res.directRules) ? res.directRules : []);
  const initialProxy = pruneRedundantWithinList(Array.isArray(res.proxyRules) ? res.proxyRules : []);

  proxyEditor.textarea.value = initialProxy.join("\n");
  directEditor.textarea.value = initialDirect.join("\n");
  validateAll();

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

    const nextDirect = pruneRedundantWithinList(validation.directParsed.rules);
    const nextProxy = pruneRedundantWithinList(validation.proxyParsed.rules);

    await browser.storage.local.set({ proxyRules: nextProxy, directRules: nextDirect });
    proxyEditor.textarea.value = nextProxy.join("\n");
    directEditor.textarea.value = nextDirect.join("\n");
    validateAll();
    flash(typeof I18n !== "undefined" ? I18n.t("list_editor_saved") : "Сохранено");
  });

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveBtn.click();
    }
  });
});
