/* =========================================================
   Isopedia Mobile Filter Cleanup
   Save as: isopedia/assets/mobile-filters.js

   This does not replace your existing filter system.
   It syncs mobile dropdowns to the existing desktop buttons.
   ========================================================= */
(function () {
  "use strict";

  const MOBILE_MAX_WIDTH = 768;
  const organismSelectId = "mobileOrganismSelect";
  const groupSelectId = "mobileGroupSelect";
  const organismButtonsId = "organismButtons";
  const genusButtonsId = "genusButtons";

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function normal(value) {
    return clean(value).toLowerCase();
  }

  function getButtonValue(button, attrName) {
    return clean(button.getAttribute(attrName) || button.dataset.value || button.textContent);
  }

  function getActiveValue(buttons, attrName) {
    const active = buttons.find((button) => button.classList.contains("active") || button.getAttribute("aria-pressed") === "true");
    return active ? getButtonValue(active, attrName) : "All";
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label || value;
    select.appendChild(option);
  }

  function populateSelectFromButtons(select, buttons, attrName) {
    if (!select) return;

    const previous = select.value || "All";
    const activeValue = getActiveValue(buttons, attrName);
    const values = [];

    buttons.forEach((button) => {
      const value = getButtonValue(button, attrName);
      if (value && !values.some((existing) => normal(existing) === normal(value))) {
        values.push(value);
      }
    });

    select.innerHTML = "";

    if (!values.some((value) => normal(value) === "all")) {
      values.unshift("All");
    }

    values.forEach((value) => addOption(select, value, value));

    const preferred = values.find((value) => normal(value) === normal(activeValue))
      || values.find((value) => normal(value) === normal(previous))
      || values.find((value) => normal(value) === "all")
      || values[0]
      || "All";

    select.value = preferred;
    select.disabled = values.length <= 1;
  }

  function clickMatchingButton(buttons, attrName, value) {
    const target = buttons.find((button) => normal(getButtonValue(button, attrName)) === normal(value));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }

  function syncDropdownsFromButtons() {
    const organismSelect = $("#" + organismSelectId);
    const groupSelect = $("#" + groupSelectId);
    const organismButtons = $all("#" + organismButtonsId + " .organism-btn");
    const genusButtons = $all("#" + genusButtonsId + " .genus-btn");

    if (!organismSelect || !groupSelect) return;

    if (organismButtons.length) {
      populateSelectFromButtons(organismSelect, organismButtons, "data-type");
    }

    if (genusButtons.length) {
      populateSelectFromButtons(groupSelect, genusButtons, "data-genus");
    }
  }

  function bindDropdowns() {
    const organismSelect = $("#" + organismSelectId);
    const groupSelect = $("#" + groupSelectId);
    if (!organismSelect || !groupSelect || organismSelect.dataset.mobileFilterReady === "true") return;

    organismSelect.dataset.mobileFilterReady = "true";

    organismSelect.addEventListener("change", function () {
      const organismButtons = $all("#" + organismButtonsId + " .organism-btn");
      clickMatchingButton(organismButtons, "data-type", organismSelect.value);

      // The existing app rebuilds the group/genus buttons after category changes.
      // Give it a moment, then rebuild the group dropdown and default it to All.
      window.setTimeout(function () {
        syncDropdownsFromButtons();
        const groupButtons = $all("#" + genusButtonsId + " .genus-btn");
        const allButton = groupButtons.find((button) => normal(getButtonValue(button, "data-genus")) === "all");
        if (allButton) {
          groupSelect.value = getButtonValue(allButton, "data-genus");
        }
      }, 120);
    });

    groupSelect.addEventListener("change", function () {
      const genusButtons = $all("#" + genusButtonsId + " .genus-btn");
      clickMatchingButton(genusButtons, "data-genus", groupSelect.value);
      window.setTimeout(syncDropdownsFromButtons, 50);
    });
  }

  function watchButtonChanges() {
    const organismWrap = $("#" + organismButtonsId);
    const genusWrap = $("#" + genusButtonsId);

    const observer = new MutationObserver(function () {
      window.setTimeout(syncDropdownsFromButtons, 30);
    });

    [organismWrap, genusWrap].filter(Boolean).forEach((wrap) => {
      observer.observe(wrap, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed"]
      });
    });

    document.addEventListener("click", function (event) {
      if (event.target.closest(".organism-btn") || event.target.closest(".genus-btn")) {
        window.setTimeout(syncDropdownsFromButtons, 40);
      }
    });
  }

  function init() {
    if (!$("#" + organismSelectId) || !$("#" + groupSelectId)) return;

    bindDropdowns();
    watchButtonChanges();

    // Retry for a short window because the main app builds filters dynamically.
    let tries = 0;
    const timer = window.setInterval(function () {
      tries += 1;
      syncDropdownsFromButtons();
      if (tries >= 30 || ($all("#" + organismButtonsId + " .organism-btn").length && $all("#" + genusButtonsId + " .genus-btn").length)) {
        window.clearInterval(timer);
        syncDropdownsFromButtons();
      }
    }, 150);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
