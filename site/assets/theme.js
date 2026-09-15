/* Quavern theme bootstrap.
 *
 * It must load from assets/ (deploy.sh:106-110 only discovers assets|locales|docs)
 * and must be referenced without a query string (scripts/site-check.mjs:73 and
 * deploy.sh:108 both stop matching at "?"). It must be a parser-blocking classic
 * script in <head>, above all body content, so the attribute is stamped before
 * anything paints. On the twelve static pages it also sits ahead of the first
 * <link rel="stylesheet">; the four Next routes emit Next's own stylesheet link
 * first, which is harmless because both are render-blocking.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "quavern-theme";
  var root = document.documentElement;
  var query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function read() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") return stored;
      if (stored !== null) window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Storage is unavailable in a private window or with site data blocked.
      // Following the system is the honest result, not a failure.
    }
    return "system";
  }

  function store(preference) {
    try {
      if (preference === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, preference);
    } catch (error) {
      // The in-memory preference still governs this document.
    }
  }

  function resolve(preference) {
    if (preference === "light" || preference === "dark") return preference;
    return query && query.matches ? "dark" : "light";
  }

  // A static <meta name="theme-color" media="..."> can only track the system.
  // When the reader overrides it, retarget the pair so the chosen one matches
  // unconditionally and the other never does.
  function paintMeta(preference, resolved) {
    var light = document.querySelector('meta[name="theme-color"][data-theme-color="light"]');
    var dark = document.querySelector('meta[name="theme-color"][data-theme-color="dark"]');
    if (!light || !dark) return;
    if (preference === "system") {
      light.setAttribute("media", "(prefers-color-scheme: light)");
      dark.setAttribute("media", "(prefers-color-scheme: dark)");
      return;
    }
    light.setAttribute("media", resolved === "light" ? "all" : "not all");
    dark.setAttribute("media", resolved === "dark" ? "all" : "not all");
  }

  // The icon pair is media-qualified too, so an override would otherwise leave
  // the tab mark drawn for the other field. Re-evaluation is UA-dependent:
  // where a UA does not re-read the link this is a no-op.
  function paintIcon(preference, resolved) {
    var icons = document.querySelectorAll('link[rel~="icon"][media]');
    for (var i = 0; i < icons.length; i += 1) {
      var icon = icons[i];
      if (!icon.dataset.themeIconMedia) icon.dataset.themeIconMedia = icon.getAttribute("media");
      var scheme = icon.dataset.themeIconMedia;
      if (preference === "system") icon.setAttribute("media", scheme);
      else icon.setAttribute("media", scheme.indexOf(resolved) === -1 ? "not all" : "all");
    }
  }

  function apply(preference, announce) {
    var resolved = resolve(preference);
    if (preference === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", preference);
    paintMeta(preference, resolved);
    paintIcon(preference, resolved);
    api.preference = preference;
    api.resolved = resolved;
    // The system signal, separate from the resolution: once a preference is
    // pinned they diverge, and only this one answers "what is your system?".
    api.systemDark = query ? query.matches : false;
    if (announce) {
      document.dispatchEvent(new CustomEvent("quavern:themechange", {
        detail: { preference: preference, resolved: resolved, systemDark: api.systemDark }
      }));
    }
  }

  var api = {
    storageKey: STORAGE_KEY,
    preference: "system",
    resolved: "light",
    systemDark: false,
    set: function (next) {
      var preference = next === "light" || next === "dark" ? next : "system";
      store(preference);
      apply(preference, true);
    }
  };

  window.QuavernTheme = api;
  apply(read(), false);

  if (query) {
    var onSystemChange = function () {
      // Re-apply either way: when following, the field changes; when pinned,
      // only the reported system signal does, and the control still says so.
      apply(api.preference, true);
    };
    if (query.addEventListener) query.addEventListener("change", onSystemChange);
    else if (query.addListener) query.addListener(onSystemChange);
  }
})();
