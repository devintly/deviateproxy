(function (root) {
  "use strict";

  function getHostRules() {
    if (typeof HostRules !== "undefined") return HostRules;
    return (root && root.HostRules) || null;
  }

  function splitLines(text) {
    return String(text || "").replace(/\r\n/g, "\n").split("\n");
  }

  // Разбирает содержимое редактора: возвращает построчную разметку, список
  // уникальных нормализованных правил и номера некорректных строк.
  function parseRuleLines(text) {
    var hr = getHostRules();
    var lines = [];
    var rules = [];
    var seen = Object.create(null);
    var invalid = [];
    splitLines(text).forEach(function (line, index) {
      var lineNum = index + 1;
      var raw = line.trim();
      if (!raw) {
        lines.push({ lineNum: lineNum, raw: "", normalized: "", host: "" });
        return;
      }
      var normalized = hr ? hr.normalizeRule(raw) : raw;
      if (!normalized) {
        invalid.push(lineNum);
        lines.push({ lineNum: lineNum, raw: raw, normalized: "", host: "" });
        return;
      }
      lines.push({
        lineNum: lineNum,
        raw: raw,
        normalized: normalized,
        host: hr ? hr.ruleHost(normalized) : normalized
      });
      if (!seen[normalized]) {
        seen[normalized] = 1;
        rules.push(normalized);
      }
    });
    return { lines: lines, rules: rules, invalid: invalid };
  }

  // Текстовое поле с нумерацией строк и подсветкой ошибок: нумерация и фон
  // рисуются отдельными слоями, которые прокручиваются вместе с textarea.
  function create(options) {
    var textarea = options.textarea;
    var gutter = options.gutter;
    var backdrop = options.backdrop;
    var container = options.container;
    var onChange = options.onChange;
    var invalidLines = new Set();
    var rafId = null;

    function syncScroll() {
      if (!textarea) return;
      if (backdrop) {
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
      }
      if (gutter) gutter.scrollTop = textarea.scrollTop;
    }

    function render() {
      if (!textarea || !gutter || !backdrop) return;
      var count = Math.max(splitLines(textarea.value).length, 1);
      var gutterFrag = document.createDocumentFragment();
      var backdropFrag = document.createDocumentFragment();
      for (var i = 1; i <= count; i++) {
        var suffix = invalidLines.has(i) ? " invalid" : "";
        var gDiv = document.createElement("div");
        gDiv.className = "gutter-line" + suffix;
        gDiv.textContent = String(i);
        gutterFrag.appendChild(gDiv);
        var bDiv = document.createElement("div");
        bDiv.className = "hl-line" + suffix;
        backdropFrag.appendChild(bDiv);
      }
      gutter.textContent = "";
      gutter.appendChild(gutterFrag);
      backdrop.textContent = "";
      backdrop.appendChild(backdropFrag);
      if (container) container.classList.toggle("has-error", invalidLines.size > 0);
      syncScroll();
    }

    function setInvalidLines(lineNumbers) {
      invalidLines = new Set(lineNumbers || []);
      render();
    }

    function parse() {
      return parseRuleLines(textarea ? textarea.value : "");
    }

    function setValue(text) {
      if (textarea) textarea.value = String(text == null ? "" : text);
    }

    function appendText(text) {
      if (!textarea) return false;
      var incoming = String(text || "").trim();
      if (!incoming) return false;
      var current = textarea.value.trim();
      textarea.value = current ? current + "\n" + incoming : incoming;
      return true;
    }

    if (textarea) {
      textarea.addEventListener("input", function () {
        if (!onChange) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(onChange);
      });
      textarea.addEventListener("scroll", syncScroll, { passive: true });
    }

    return {
      textarea: textarea,
      parse: parse,
      render: render,
      setInvalidLines: setInvalidLines,
      setValue: setValue,
      appendText: appendText,
      syncScroll: syncScroll
    };
  }

  var api = { create: create, parseRuleLines: parseRuleLines };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RuleEditor = api;
})(typeof self !== "undefined" ? self : this);
