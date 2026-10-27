/* Everything that changes when this moves house.
 *
 * The product will not live at jesse372.github.io forever — it needs its own domain
 * before it can be sold to anyone. The point of this file is that moving is editing
 * one file, not hunting hostnames through five pages. Nothing else may hardcode a host.
 *
 * When the move happens (Cloudflare Pages, a real domain):
 *   - set apiBase to the deployed api Worker, or a /api route on the new domain
 *   - set siteBase to the new origin, so printed QR codes point at the right menu
 * The board, menu and printed menu all use relative paths, so they need no changes.
 */
(function (global) {
  "use strict";

  var cfg = {
    /* The accounts + per-brewery API (the api/ Worker). Empty means "not deployed
       yet": the editor then keeps working exactly as it does today, publishing a
       single board to GitHub. That is what keeps the shed board free forever. */
    apiBase: "",

    /* Where this is served from, used only for building printable QR codes.
       Blank means "work it out from the page", which is right until there is a
       custom domain in front of it. */
    siteBase: "",

    /* Local development points at wrangler dev without editing anything. */
    devApiBase: "http://127.0.0.1:8787"
  };

  function isLocal() {
    var h = global.location && global.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  cfg.api = function () {
    if (isLocal() && cfg.devApiBase) return cfg.devApiBase;
    return cfg.apiBase;
  };

  /* Accounts only exist once there is an API to hold them. Until then every page
     behaves as it did before, which keeps the free board free and unbroken. */
  cfg.accountsEnabled = function () {
    return !!cfg.api();
  };

  global.ONTAP = cfg;
})(this);
