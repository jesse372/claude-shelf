/* Shared rules for the board, the phone menu and the printed menu.
 *
 * These three pages must agree about money, pour sizes and when happy hour is on. They
 * used to carry three copies of that logic, which is the same mistake that let an old
 * preview page drift out of step for a day without anyone noticing. One copy now.
 *
 * Deliberately plain ES5 with no build step: the board runs on Fire TV's Silk browser,
 * which is an old Chromium.
 */
(function (global) {
  "use strict";

  var DEFAULT_SIZES = [
    { id: "s1", name: "Middy",    ml: 285 },
    { id: "s2", name: "Schooner", ml: 425 },
    { id: "s3", name: "Pint",     ml: 570 }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Blank means "not entered" — leave it off rather than printing an empty label. */
  function has(v) {
    return String(v == null ? "" : v).trim() !== "";
  }

  /** A zero IBU or SRM tells nobody anything. A zero ABV is a real claim, so it stays. */
  function nonZero(v) {
    if (!has(v)) return false;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? true : n !== 0;
  }

  /** $13 rather than $13.00, but $7.50 keeps its cents — how a menu is written. */
  function money(cur, v) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    return (cur || "$") + (n % 1 === 0 ? String(n) : n.toFixed(2));
  }

  function pricing(data) {
    var p = (data && data.pricing) || {};
    return {
      on: !!p.on,
      currency: p.currency || "$",
      sizes: (p.sizes && p.sizes.length) ? p.sizes : DEFAULT_SIZES,
      happy: p.happy || null
    };
  }

  /* Minutes past midnight, so a window running 22:00-01:00 is simply start > end
     rather than needing date arithmetic. */
  function hhmmToMin(v) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function prettyTime(v) {
    var mins = hhmmToMin(v);
    if (mins === null) return "";
    var h = Math.floor(mins / 60), m = mins % 60;
    return ((h % 12) || 12) + (m ? ":" + (m < 10 ? "0" + m : m) : "") + (h >= 12 ? "pm" : "am");
  }

  function happyActive(data) {
    var h = pricing(data).happy;
    if (!h || !h.on) return false;
    var from = hhmmToMin(h.from), to = hhmmToMin(h.to);
    if (from === null || to === null || from === to) return false;
    var now = new Date();
    /* An empty day list means every day. Days are 0 = Sunday, as JS gives them. */
    if (h.days && h.days.length && h.days.indexOf(now.getDay()) === -1) return false;
    var mins = now.getHours() * 60 + now.getMinutes();
    return (from < to) ? (mins >= from && mins < to) : (mins >= from || mins < to);
  }

  function happyPrice(data, sizeId) {
    var h = pricing(data).happy;
    if (!h || !h.prices) return null;
    var v = h.prices[sizeId];
    return (v == null || String(v).trim() === "") ? null : v;
  }

  /* Whole days from today until an ISO yyyy-mm-dd date.
     Parsed by parts on purpose: Fire TV's Silk cannot be relied on to read
     "2026-08-07T00:00:00", and a null here would silently drop the countdown. */
  function daysUntil(iso) {
    if (!has(iso)) return null;
    var parts = String(iso).split("-");
    if (parts.length !== 3) return null;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  function comingText(t) {
    var n = daysUntil(t && t.ready);
    if (n === null) return "Coming Soon";
    if (n > 1)   return "Ready in " + n + " days";
    if (n === 1) return "Ready tomorrow";
    if (n === 0) return "Ready today";
    return "Ready now";
  }

  global.TapLib = {
    DEFAULT_SIZES: DEFAULT_SIZES,
    esc: esc, has: has, nonZero: nonZero, money: money,
    pricing: pricing, hhmmToMin: hhmmToMin, prettyTime: prettyTime,
    happyActive: happyActive, happyPrice: happyPrice,
    daysUntil: daysUntil, comingText: comingText
  };
})(this);
