(function (root) {
  "use strict";

  function readAsText(file, onText) {
    if (!file || typeof onText !== "function") return;
    var reader = new FileReader();
    reader.onload = function (e) {
      onText((e.target && e.target.result) || "");
    };
    reader.readAsText(file);
  }

  // Приём файла перетаскиванием: подсветка зоны и чтение первого файла.
  function attachDropZone(element, onText) {
    if (!element) return;
    ["dragenter", "dragover"].forEach(function (evt) {
      element.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        element.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      element.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove("drag-over");
      });
    });
    element.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) readAsText(dt.files[0], onText);
    });
  }

  function attachFileInput(input, onText) {
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (file) readAsText(file, onText);
    });
  }

  function attachPicker(button, input, onText) {
    if (!button || !input) return;
    button.addEventListener("click", function () {
      input.value = "";
      input.click();
    });
    attachFileInput(input, onText);
  }

  var api = {
    readAsText: readAsText,
    attachDropZone: attachDropZone,
    attachFileInput: attachFileInput,
    attachPicker: attachPicker
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FileImport = api;
})(typeof self !== "undefined" ? self : this);
