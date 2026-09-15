/* Quavern theme control.
 *
 * Builds the three-state control (AUTO / LIGHT / DARK) into every
 * [data-theme-toggle-mount]. The mount ships empty and styles.css keeps
 * .theme-toggle:not([data-theme-toggle]) invisible, so a control that cannot
 * work without JavaScript is never presented as though it could: setting
 * data-theme-toggle here is what reveals it.
 */
(() => {
  "use strict";

  const api = window.QuavernTheme;
  if (!api) return;

  const copy = {
    en: {
      group: "Page theme",
      legend: "Theme",
      system: { label: "AUTO", name: "AUTO — follow your system theme" },
      light: { label: "LIGHT", name: "LIGHT — always use the light theme" },
      dark: { label: "DARK", name: "DARK — always use the dark theme" },
      following: (resolved) =>
        `Following your system: ${resolved === "dark" ? "DARK" : "LIGHT"}`
    },
    fr: {
      group: "Thème de la page",
      legend: "Thème",
      system: { label: "AUTO", name: "AUTO — suivre le thème de votre système" },
      light: { label: "CLAIR", name: "CLAIR — toujours utiliser le thème clair" },
      dark: { label: "SOMBRE", name: "SOMBRE — toujours utiliser le thème sombre" },
      following: (resolved) =>
        `Selon votre système : ${resolved === "dark" ? "SOMBRE" : "CLAIR"}`
    }
  };

  const states = ["system", "light", "dark"];
  let groupCount = 0;

  function language() {
    return document.documentElement.lang === "fr" ? "fr" : "en";
  }

  function build(mount) {
    groupCount += 1;
    // Unique per instance: the rail and the mobile menu are two renderings of
    // one state, and a shared name would let the browser check only one.
    const name = `quavern-theme-${groupCount}`;

    const legend = document.createElement("span");
    legend.className = "theme-toggle__legend";
    legend.setAttribute("aria-hidden", "true");
    mount.append(legend);

    states.forEach((state) => {
      const option = document.createElement("label");
      option.className = "theme-toggle__option";

      const input = document.createElement("input");
      input.className = "theme-toggle__input";
      input.type = "radio";
      input.name = name;
      input.value = state;
      input.addEventListener("change", () => {
        if (input.checked) api.set(state);
      });

      const label = document.createElement("span");
      label.className = "theme-toggle__label";

      option.append(input, label);
      mount.append(option);
    });

    mount.setAttribute("role", "radiogroup");
    mount.dataset.themeToggle = "";
  }

  function paint() {
    const text = copy[language()];
    document.querySelectorAll("[data-theme-toggle]").forEach((group) => {
      group.setAttribute("aria-label", text.group);
      const legend = group.querySelector(".theme-toggle__legend");
      if (legend) legend.textContent = text.legend;

      group.querySelectorAll(".theme-toggle__option").forEach((option) => {
        const input = option.querySelector(".theme-toggle__input");
        const label = option.querySelector(".theme-toggle__label");
        const strings = input && text[input.value];
        if (!strings || !label) return;
        label.textContent = strings.label;
        // The accessible name begins with the visible code, so voice control
        // and WCAG 2.5.3 Label in Name hold with a four-character label.
        input.checked = api.preference === input.value;
        // AUTO carries the system signal in its accessible NAME, not a title:
        // a tooltip is not announced, and this is the one piece of state the
        // control exists to report. It names the system, never the pinned
        // preference — once a reader pins a theme the two diverge.
        if (input.value === "system") {
          const note = text.following(api.systemDark ? "dark" : "light");
          input.setAttribute("aria-label", strings.name + " — " + note);
          option.title = note;
          input.title = note;
        } else {
          input.setAttribute("aria-label", strings.name);
          option.removeAttribute("title");
          input.removeAttribute("title");
        }
      });
    });
  }

  document
    .querySelectorAll("[data-theme-toggle-mount]:not([data-theme-toggle])")
    .forEach(build);
  paint();

  document.addEventListener("quavern:themechange", paint);
  document.addEventListener("quavern:languagechange", paint);
})();
