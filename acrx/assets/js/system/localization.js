/**
 * localization.js  —  /acrx/system/localization
 * Handles: language, timezone, date/time format, currency
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('localization-form');
  const saveBtn = document.getElementById('localization-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const data = await System.getSection('localization');
    System.populateForm(form, {
      language:   data.language   ?? 'en',
      timezone:   data.timezone   ?? 'UTC',
      dateFormat: data.dateFormat ?? 'DD/MM/YYYY',
      timeFormat: data.timeFormat ?? '24h',
      currency:   data.currency   ?? 'USD',
    });
  } catch (err) {
    System.showToast('Could not load localization settings.', 'error');
    console.error('[Localization] load:', err);
  }
(() => {
  const input = document.getElementById("dateFormat");
  if (!input) return;

  const OPTIONS = [
    "DD/MM/YYYY",
    "MM-DD-YYYY",
    "YYYY-MM-DD"
  ];

  const ALLOWED_CHARS = ["D", "M", "Y", "/", "-", "."];

  function sanitize(value) {
    return value
      .toUpperCase()
      .split("")
      .filter(ch => ALLOWED_CHARS.includes(ch))
      .join("");
  }

  // ------------------- DROPDOWN -------------------
  const dropdown = document.createElement("div");
  dropdown.className = "date-format-dropdown";
  dropdown.style.position = "absolute";
  dropdown.style.zIndex = "9999";
  dropdown.style.display = "none";

  let activeIndex = -1;

  function renderOptions(filtered) {
    dropdown.innerHTML = "";

    filtered.forEach((opt, index) => {
      const item = document.createElement("div");
      item.className = "date-format-option";
      item.innerText = opt;

      if (index === activeIndex) {
        item.classList.add("active");
      }

      item.addEventListener("mousedown", () => {
        input.value = opt;
        hideDropdown();
      });

      dropdown.appendChild(item);
    });
  }

  document.body.appendChild(dropdown);

  function positionDropdown() {
    const rect = input.getBoundingClientRect();
    dropdown.style.left = rect.left + "px";
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.width = rect.width + "px";
  }

  function showDropdown() {
    positionDropdown();
    dropdown.style.display = "block";
  }

  function hideDropdown() {
    dropdown.style.display = "none";
    activeIndex = -1;
  }

  function normalize(val) {
    return val.replace(/[^DMY]/g, "");
  }

  function getFilteredOptions(value) {
    return OPTIONS.filter(opt =>
      opt.startsWith(value) ||
      normalize(opt).startsWith(normalize(value))
    );
  }

  let currentOptions = [...OPTIONS];

  // ------------------- INPUT -------------------
  input.addEventListener("input", () => {
    input.value = sanitize(input.value);

    currentOptions = getFilteredOptions(input.value);
    activeIndex = -1;

    renderOptions(currentOptions);
  });

  input.addEventListener("focus", () => {
    currentOptions = [...OPTIONS];
    renderOptions(currentOptions);
    showDropdown();
  });

  input.addEventListener("blur", () => {
    setTimeout(hideDropdown, 150);
  });

  // ------------------- KEYBOARD CONTROL -------------------
  input.addEventListener("keydown", (e) => {
    const key = e.key;

    // allow control keys
    if (
      key === "Backspace" ||
      key === "Delete" ||
      key === "ArrowLeft" ||
      key === "Tab"
    ) return;

    // 🔒 block invalid typing
    if (!ALLOWED_CHARS.includes(key.toUpperCase()) &&
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "ArrowRight" &&
        key !== "Enter"
    ) {
      e.preventDefault();
      return;
    }

    // ------------------- NAVIGATION -------------------

    if (key === "ArrowDown") {
      e.preventDefault();
      if (!currentOptions.length) return;

      activeIndex = (activeIndex + 1) % currentOptions.length;
      renderOptions(currentOptions);
    }

    if (key === "ArrowUp") {
      e.preventDefault();
      if (!currentOptions.length) return;

      activeIndex =
        (activeIndex - 1 + currentOptions.length) % currentOptions.length;

      renderOptions(currentOptions);
    }

    // ------------------- AUTO COMPLETE -------------------

    if (key === "ArrowRight") {
      if (currentOptions.length === 1) {
        e.preventDefault();
        input.value = currentOptions[0];
        hideDropdown();
      }
    }

    if (key === "Enter") {
      if (currentOptions.length === 1) {
        e.preventDefault();
        input.value = currentOptions[0];
        hideDropdown();
        return;
      }

      if (activeIndex >= 0) {
        e.preventDefault();
        input.value = currentOptions[activeIndex];
        hideDropdown();
      }
    }
  });

  // ------------------- PASTE -------------------
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    input.value = sanitize(text);
  });

  window.addEventListener("resize", positionDropdown);
  window.addEventListener("scroll", positionDropdown);
})();
(function () {
  const input = document.querySelector("#timezone");
  if (!input) return;

  // ------------------- WRAPPER -------------------
  const dropdownWrapper = document.createElement("div");
  dropdownWrapper.className = "tz-wrapper is-closed";

  const dropdown = document.createElement("div");
  dropdown.className = "tz-dropdown";

  dropdownWrapper.appendChild(dropdown);
  document.body.appendChild(dropdownWrapper);

  // ------------------- DATA -------------------
  let OPTIONS;
  try {
    OPTIONS = Intl.supportedValuesOf("timeZone");
  } catch {
    // Fallback for older browsers that don't support Intl.supportedValuesOf
    OPTIONS = [
      "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai",
      "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland"
    ];
  }

  let currentOptions = [...OPTIONS];
  let activeIndex = -1;

  // ------------------- POSITION -------------------
  function positionDropdown() {
    const rect = input.getBoundingClientRect();

    dropdownWrapper.style.position = "absolute";
    dropdownWrapper.style.top = rect.bottom + window.scrollY + "px";
    dropdownWrapper.style.left = rect.left + window.scrollX + "px";
    dropdownWrapper.style.width = rect.width + "px";
  }

  // ------------------- STATE CONTROL -------------------
  function showDropdown() {
    dropdownWrapper.classList.add("is-open");
    dropdownWrapper.classList.remove("is-closed");
    positionDropdown();
  }

  function hideDropdown() {
    dropdownWrapper.classList.add("is-closed");
    dropdownWrapper.classList.remove("is-open");
    activeIndex = -1;
  }

  // ------------------- SANITIZE -------------------
  function sanitize(value) {
    return value.replace(/[^A-Za-z0-9/_\-]/g, "");
  }

  // ------------------- FILTER -------------------
function getFilteredOptions(query) {
  const q = (query || "").trim().toLowerCase();

  // 🔥 ALWAYS FULL GLOBAL DATA SOURCE
  const all = OPTIONS;

  // ------------------- PRIORITY LOGIC -------------------
  const isEmptyOrUTC =
    q === "" ||
    q === "utc" ||
    q === "gmt" ||
    q === "z";

  let filtered;

  if (isEmptyOrUTC) {
    filtered = [...all];
  } else {
    filtered = all.filter(tz =>
      tz.toLowerCase().includes(q)
    );
  }

  // ------------------- PRIORITY SORTING -------------------

  const utcFirst = [];
  const rest = [];

  for (const tz of filtered) {
    if (
      tz === "UTC" ||
      tz === "Etc/UTC" ||
      tz === "Etc/GMT"
    ) {
      utcFirst.push(tz);
    } else {
      rest.push(tz);
    }
  }

  // ------------------- FINAL OUTPUT -------------------
  return [...utcFirst, ...rest].slice(0, 50);
}

  // ------------------- ANIMATED RENDER -------------------
  function renderOptions(options) {
    const existing = Array.from(dropdown.children);

    existing.forEach(el => el.classList.add("exit"));

    setTimeout(() => {
      dropdown.innerHTML = "";

      options.forEach((opt, i) => {
        const div = document.createElement("div");
        div.className = "tz-option enter";
        if (i === activeIndex) div.classList.add("active");

        div.textContent = opt;

        div.addEventListener("mousedown", () => {
          input.value = opt;
          hideDropdown();
        });

        dropdown.appendChild(div);

        requestAnimationFrame(() => {
          div.classList.add("show");
        });
      });
    }, 120);
  }

  // ------------------- INPUT -------------------
  input.addEventListener("input", () => {
    input.value = sanitize(input.value);

    currentOptions = getFilteredOptions(input.value);
    activeIndex = -1;

    renderOptions(currentOptions);
    showDropdown();
  });

  input.addEventListener("focus", () => {
    currentOptions = [...OPTIONS].slice(0, 50);
    renderOptions(currentOptions);
    showDropdown();
  });

  input.addEventListener("blur", () => {
    setTimeout(hideDropdown, 150);
  });

  // ------------------- KEYBOARD -------------------
  input.addEventListener("keydown", (e) => {
    const key = e.key;

    if (
      key === "Backspace" ||
      key === "Delete" ||
      key === "ArrowLeft" ||
      key === "Tab"
    ) return;

    if (
      !/^[a-zA-Z0-9/_\-]$/.test(key) &&
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "Enter"
    ) {
      e.preventDefault();
      return;
    }

    if (key === "ArrowDown") {
      e.preventDefault();
      if (!currentOptions.length) return;

      activeIndex = (activeIndex + 1) % currentOptions.length;
      renderOptions(currentOptions);
    }

    if (key === "ArrowUp") {
      e.preventDefault();
      if (!currentOptions.length) return;

      activeIndex =
        (activeIndex - 1 + currentOptions.length) %
        currentOptions.length;

      renderOptions(currentOptions);
    }

    if (key === "Enter") {
      if (currentOptions.length === 1) {
        e.preventDefault();
        input.value = currentOptions[0];
        hideDropdown();
        return;
      }

      if (activeIndex >= 0) {
        e.preventDefault();
        input.value = currentOptions[activeIndex];
        hideDropdown();
      }
    }
  });

  // ------------------- PASTE -------------------
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");

    input.value = sanitize(text);
    currentOptions = getFilteredOptions(input.value);

    renderOptions(currentOptions);
    showDropdown();
  });

  // ------------------- POSITION EVENTS -------------------
  window.addEventListener("resize", positionDropdown);
  window.addEventListener("scroll", positionDropdown);
})();
  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateSection('localization', {
        language:   flat.language,
        timezone:   flat.timezone,
        dateFormat: flat.dateFormat,
        timeFormat: flat.timeFormat,
        currency:   flat.currency,
      });
      System.showToast('Localization settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
  
});
