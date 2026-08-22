// src/utils/dateUtil.js
// Centralized date/time formatting utilities for Acroxa CMS.
// Uses settings-localized formatting instead of scattered ad-hoc logic.

/**
 * Format a date according to the given format string and timezone.
 *
 * @param {Date|string|number} date - The date to format
 * @param {object} options
 * @param {string} options.dateFormat - Format string: "DD/MM/YYYY", "MM-DD-YYYY", "YYYY-MM-DD"
 * @param {string} options.timeFormat - "12h" or "24h"
 * @param {string} options.timezone - IANA timezone string (e.g. "UTC", "America/New_York")
 * @param {string} options.locale - BCP 47 locale (e.g. "en-US")
 * @returns {string} Formatted date string
 */
function formatDate(date, options = {}) {
  const {
    dateFormat = "DD/MM/YYYY",
    timeFormat = "24h",
    timezone = "UTC",
    locale = "en-US",
  } = options;

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";

  // Format date part
  const parts = {};
  try {
    const df = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    for (const { type, value } of df.formatToParts(d)) {
      parts[type] = value;
    }
  } catch {
    // Fallback if timezone is invalid
    parts.year = String(d.getUTCFullYear());
    parts.month = String(d.getUTCMonth() + 1).padStart(2, "0");
    parts.day = String(d.getUTCDate()).padStart(2, "0");
  }

  const DD = parts.day || "01";
  const MM = parts.month || "01";
  const YYYY = parts.year || "1970";

  let dateStr;
  switch (dateFormat) {
    case "MM-DD-YYYY":
      dateStr = `${MM}-${DD}-${YYYY}`;
      break;
    case "YYYY-MM-DD":
      dateStr = `${YYYY}-${MM}-${DD}`;
      break;
    case "DD/MM/YYYY":
    default:
      dateStr = `${DD}/${MM}/${YYYY}`;
      break;
  }

  // Format time part
  let timeStr = "";
  try {
    const tf = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat === "12h",
    });
    timeStr = tf.format(d);
  } catch {
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    if (timeFormat === "12h") {
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      timeStr = `${h12}:${m} ${period}`;
    } else {
      timeStr = `${String(h).padStart(2, "0")}:${m}`;
    }
  }

  return timeStr ? `${dateStr} ${timeStr}` : dateStr;
}

/**
 * Get a preview of how the current date/time would look with given settings.
 * @param {object} options - Same as formatDate options
 * @returns {string} Preview string
 */
function getDateTimePreview(options = {}) {
  return formatDate(new Date(), options);
}

/**
 * Get the list of supported timezones with a fallback.
 * @returns {string[]}
 */
function getSupportedTimezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "UTC",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Europe/London", "Europe/Paris", "Europe/Berlin",
      "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata",
      "Australia/Sydney", "Pacific/Auckland",
    ];
  }
}

/**
 * Validate a timezone string.
 * @param {string} tz
 * @returns {boolean}
 */
function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  formatDate,
  getDateTimePreview,
  getSupportedTimezones,
  isValidTimezone,
};
