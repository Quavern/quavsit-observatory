// SPDX-License-Identifier: LicenseRef-QOSL-1.0
// Copyright (c) 2026 Quavern
// This file is subject to the Quavern Open Source License, version 1.0.
// A copy is available at https://oss.quavern.com/licences/qosl/1.0/

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Pages of the Quavsit Observatory, served by GitHub Pages under
// https://oss.quavern.com/quavsit-observatory/. Everything comes from data/ and
// methodology/ in this repository. No dependency, no third-party request.
//
//   node site/build.mjs   → _site/

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "_site");
const origin = "https://oss.quavern.com";
const base = "/quavsit-observatory";
const repoUrl = "https://github.com/Quavern/quavsit-observatory";
const trialStart = "2026-09-15";

const copy = {
  en: {
    locale: "en-GB",
    ogLocale: "en_GB",
    name: "English",
    siteName: "Quavsit Observatory",
    skip: "Skip to content",
    languageNav: "Language",
    title: "What French transit data is worth when an engine reads it.",
    lede: (day, networks) =>
      `A daily record for ${networks} networks: when each timetable ends, whether its real-time feeds answer, and how much of their data matches the timetable. Latest day: ${day}.`,
    trial: (date) =>
      `Trial period since ${date}. The counting method may still change; when it does, the affected days are published again.`,
    partial: (taken, scheduled, generated) =>
      `This day was still being recorded when these pages were generated (${generated}): ${taken} of ${scheduled} samples.`,
    method: "How it is measured",
    data: "Latest day (JSON)",
    allData: "All data files",
    code: "Code",
    lowJoin: "A low join rate can come from the feed, from the timetable in use, or from Quavsit's matching.",
    notScore: "No figure here is a score or a ranking.",
    columns: ["Network", "Timetable", "Checked", "Trip updates", "Vehicles", "Alerts"],
    ledgerCaption: (region) => `Networks in ${region}`,
    regions: "Regions",
    runsTo: (date) => `runs to ${date}`,
    endsIn: (days) => (days === 0 ? "ends today" : `ends in ${days} day${days === 1 ? "" : "s"}`),
    ended: (date) => `ended ${date}`,
    notGtfs: "not a GTFS timetable",
    neverIngested: "never loaded",
    refreshFailing: "refresh failing",
    hoursAgo: (h) => `${h} h ago`,
    daysAgo: (d) => `${d} days ago`,
    changedAgo: (text) => `changed ${text}`,
    noneDeclared: "none declared",
    notMeasured: "not measured",
    noAnswer: "no valid answer",
    noTimetable: "no timetable",
    emptyFeed: "empty",
    joined: (n, of) => `${n} / ${of} joined`,
    withLine: (n, of) => `${n} / ${of} with a line`,
    alertsCount: (n, shown) => `${shown} alert${n === 1 ? "" : "s"}`,
    measuredWorking: "measured working this day",
    legend: "Feed measured working this day",
    scrollHint: "The tables scroll sideways; the network name stays in view.",
    networkBack: "All networks",
    latestDay: (date) => `Latest day: ${date}`,
    networkDescription: (name, city) =>
      `${name}${city ? ` (${city})` : ""}: the timetable and the real-time feeds as the Quavsit Observatory measured them, with the last 30 days.`,
    lessThanAnHour: "less than 1 h ago",
    facts: "Timetable",
    factLabels: {
      state: "State",
      refreshed: "Last change loaded",
      checked: "Last checked",
      source: "Downloaded from",
      ends: "Last day covered",
      counts: "Loaded",
      dataset: "Dataset",
      lastError: "Last refresh error"
    },
    states: { ok: "loaded", error: "last refresh failed, older data served", never_ingested: "never loaded" },
    sources: { operator: "the operator's server", transport_data_gouv_fr_copy: "transport.data.gouv.fr's copy (the operator's server does not answer Quavsit)" },
    countsText: (c) => `${c.lines ?? "—"} lines, ${c.stops ?? "—"} stops, ${c.trips ?? "—"} trips, ${c.stop_times ?? "—"} stop times`,
    kinds: { trip_updates: "Trip updates", vehicle_positions: "Vehicle positions", alerts: "Alerts" },
    members: {
      host: ["Host", "where the feed is published"],
      samples: ["Daytime samples", "samples taken between 06:00 and 22:00 local time"],
      ok: ["Valid answers", "HTTP 200 and a GTFS-Realtime message"],
      failures: ["Failures", "timeout, connection, HTTP 4xx, HTTP 5xx, not a feed, budget"],
      rate_limited: ["Rate limited", "HTTP 429 twice in a row"],
      samples_night: ["Night samples", "not counted in any rate"],
      header_age_seconds: ["Feed age", "median seconds between the feed's own timestamp and the read"],
      no_header_timestamp: ["No timestamp", "valid answers without a header timestamp"],
      entities: ["Entities", "median entities in a message"],
      trip_join: ["Trips found in the timetable", "runs (or vehicles) whose trip_id the timetable knows"],
      no_trip_id: ["Without a trip_id", "trip-update entities that name no trip"],
      stop_updates_timed: ["Stop updates with a time", "stop-time updates carrying a time or a delay"],
      cancelled: ["Cancelled", "runs marked CANCELED or DELETED"],
      with_position: ["With a position", "vehicles with a latitude and longitude"],
      with_trip_id: ["With a trip", "positioned vehicles naming a trip"],
      with_route_id: ["With a line", "positioned vehicles naming a line"],
      informed_resolved: ["Lines or stops found", "informed entities whose route or stop the timetable knows"]
    },
    engineObserved: "Sources reached by the engine itself",
    engineObservedNote: "These products need a contract or a key and are not sampled. Times are the engine's own last success and last error.",
    sourceStates: { ok: "reached", down: "last attempt failed", unknown: "no record" },
    lastOk: "last success",
    lastError: "last error",
    failureNames: { timeout: "timeout", connection: "connection", http_4xx: "HTTP 4xx", http_5xx: "HTTP 5xx", decode_error: "not a feed", budget: "budget" },
    errorReasons: { timeout: "timeout", connection: "connection", http_4xx: "HTTP 4xx", http_5xx: "HTTP 5xx", archive_invalid: "invalid archive", error: "other error" },
    realtime: "Real-time feeds",
    noRealtime: "This network declares no real-time feed, so only its timetable is measured.",
    history: "Last 30 days",
    historyCaption: (name) => `Last 30 days for ${name}`,
    historyDay: "Day",
    partialDay: "* still being recorded when these pages were generated",
    attribution: (text) => `Feeds published by ${text}. The measurements concern data published under that licence.`,
    corrections: "Report an error",
    correctionsMail: `or write to <a href="mailto:hello@quavern.com">hello@quavern.com</a>`,
    notFound: "This page does not exist.",
    notFoundBody: "The link may be incomplete, or the page has moved.",
    colophon: (sha, generated) =>
      `Measured by the Quavsit engine (code ${sha || "—"}), generated ${generated}. Measurements under CC BY 4.0, credit "Quavsit Observatory"; code under the Quavern Open Source License 1.0.`,
    help: "Help centre",
    legal: "Legal notice",
    privacy: "Privacy",
    oss: "Open source at Quavern",
    notDeclared: "—"
  },
  fr: {
    locale: "fr-FR",
    ogLocale: "fr_FR",
    name: "Français",
    siteName: "Observatoire Quavsit",
    skip: "Aller au contenu",
    languageNav: "Langue",
    title: "Ce que valent les données de transport françaises quand un moteur les lit.",
    lede: (day, networks) =>
      `Un relevé quotidien pour ${networks} réseaux : quand s’arrête chaque grille horaire, si ses flux temps réel répondent, et quelle part de leurs données correspond aux horaires. Dernier jour : ${day}.`,
    trial: (date) =>
      `Période de rodage depuis le ${date}. La méthode de comptage peut encore changer ; quand elle change, les jours concernés sont publiés à nouveau.`,
    partial: (taken, scheduled, generated) =>
      `Ce jour était encore en cours de relevé quand ces pages ont été générées (${generated}) : ${taken} relevés sur ${scheduled}.`,
    method: "Comment c’est mesuré",
    data: "Dernier jour (JSON)",
    allData: "Tous les fichiers de données",
    code: "Code",
    lowJoin: "Un taux de correspondance bas peut venir du flux, de la grille horaire utilisée ou de l’appariement de Quavsit.",
    notScore: "Aucun chiffre ici n’est une note ni un classement.",
    columns: ["Réseau", "Grille horaire", "Vérifiée", "Courses", "Véhicules", "Alertes"],
    ledgerCaption: (region) => `Réseaux : ${region}`,
    regions: "Régions",
    runsTo: (date) => `jusqu’au ${date}`,
    endsIn: (days) => (days === 0 ? "s’arrête aujourd’hui" : `s’arrête dans ${days} jour${days === 1 ? "" : "s"}`),
    ended: (date) => `arrêtée le ${date}`,
    notGtfs: "pas une grille GTFS",
    neverIngested: "jamais chargée",
    refreshFailing: "actualisation en échec",
    hoursAgo: (h) => `il y a ${h} h`,
    daysAgo: (d) => `il y a ${d} jours`,
    changedAgo: (text) => `modifiée ${text}`,
    noneDeclared: "aucun déclaré",
    notMeasured: "non mesuré",
    noAnswer: "pas de réponse valide",
    noTimetable: "pas de grille",
    emptyFeed: "vide",
    joined: (n, of) => `${n} / ${of} trouvées`,
    withLine: (n, of) => `${n} / ${of} avec une ligne`,
    alertsCount: (n, shown) => `${shown} alerte${n > 1 ? "s" : ""}`,
    measuredWorking: "mesuré en fonctionnement ce jour",
    legend: "Flux mesuré en fonctionnement ce jour",
    scrollHint: "Les tableaux défilent horizontalement ; le nom du réseau reste visible.",
    networkBack: "Tous les réseaux",
    latestDay: (date) => `Dernier jour : ${date}`,
    networkDescription: (name, city) =>
      `${name}${city ? ` (${city})` : ""} : la grille horaire et les flux temps réel tels que les a mesurés l’Observatoire Quavsit, avec les 30 derniers jours.`,
    lessThanAnHour: "il y a moins d’une heure",
    facts: "Grille horaire",
    factLabels: {
      state: "État",
      refreshed: "Dernière modification chargée",
      checked: "Dernière vérification",
      source: "Téléchargée depuis",
      ends: "Dernier jour couvert",
      counts: "Chargé",
      dataset: "Jeu de données",
      lastError: "Dernière erreur d’actualisation"
    },
    states: { ok: "chargée", error: "dernière actualisation en échec, données plus anciennes servies", never_ingested: "jamais chargée" },
    sources: { operator: "le serveur de l’opérateur", transport_data_gouv_fr_copy: "la copie de transport.data.gouv.fr (le serveur de l’opérateur ne répond pas à Quavsit)" },
    countsText: (c) => `${c.lines ?? "—"} lignes, ${c.stops ?? "—"} arrêts, ${c.trips ?? "—"} courses, ${c.stop_times ?? "—"} passages`,
    kinds: { trip_updates: "Mises à jour de courses", vehicle_positions: "Positions de véhicules", alerts: "Alertes" },
    members: {
      host: ["Hôte", "où le flux est publié"],
      samples: ["Relevés de journée", "relevés faits entre 6 h et 22 h, heure locale"],
      ok: ["Réponses valides", "HTTP 200 et un message GTFS-Realtime"],
      failures: ["Échecs", "délai dépassé, connexion, HTTP 4xx, HTTP 5xx, pas un flux, budget"],
      rate_limited: ["Limités", "HTTP 429 deux fois de suite"],
      samples_night: ["Relevés de nuit", "comptés dans aucun taux"],
      header_age_seconds: ["Âge du flux", "médiane en secondes entre l’horodatage du flux et la lecture"],
      no_header_timestamp: ["Sans horodatage", "réponses valides sans horodatage d’en-tête"],
      entities: ["Entités", "nombre médian d’entités par message"],
      trip_join: ["Courses trouvées dans la grille", "courses (ou véhicules) dont la grille connaît le trip_id"],
      no_trip_id: ["Sans trip_id", "entités de mise à jour qui ne nomment aucune course"],
      stop_updates_timed: ["Mises à jour d’arrêt horodatées", "mises à jour d’arrêt portant une heure ou un retard"],
      cancelled: ["Annulées", "courses marquées CANCELED ou DELETED"],
      with_position: ["Avec une position", "véhicules avec une latitude et une longitude"],
      with_trip_id: ["Avec une course", "véhicules positionnés qui nomment une course"],
      with_route_id: ["Avec une ligne", "véhicules positionnés qui nomment une ligne"],
      informed_resolved: ["Lignes ou arrêts trouvés", "entités informées dont la grille connaît la ligne ou l’arrêt"]
    },
    engineObserved: "Sources atteintes par le moteur lui-même",
    engineObservedNote: "Ces produits demandent un contrat ou une clé et ne sont pas échantillonnés. Les heures sont le dernier succès et la dernière erreur du moteur.",
    sourceStates: { ok: "atteinte", down: "dernière tentative en échec", unknown: "aucun relevé" },
    lastOk: "dernier succès",
    lastError: "dernière erreur",
    failureNames: { timeout: "délai dépassé", connection: "connexion", http_4xx: "HTTP 4xx", http_5xx: "HTTP 5xx", decode_error: "pas un flux", budget: "budget" },
    errorReasons: { timeout: "délai dépassé", connection: "connexion", http_4xx: "HTTP 4xx", http_5xx: "HTTP 5xx", archive_invalid: "archive invalide", error: "autre erreur" },
    realtime: "Flux temps réel",
    noRealtime: "Ce réseau ne déclare aucun flux temps réel : seule sa grille horaire est mesurée.",
    history: "30 derniers jours",
    historyCaption: (name) => `30 derniers jours pour ${name}`,
    historyDay: "Jour",
    partialDay: "* encore en cours de relevé quand ces pages ont été générées",
    attribution: (text) => `Flux publiés par ${text}. Les mesures portent sur des données publiées sous cette licence.`,
    corrections: "Signaler une erreur",
    correctionsMail: `ou écrire à <a href="mailto:hello@quavern.com">hello@quavern.com</a>`,
    notFound: "Cette page n’existe pas.",
    notFoundBody: "Le lien est peut-être incomplet, ou la page a été déplacée.",
    colophon: (sha, generated) =>
      `Mesuré par le moteur Quavsit (code ${sha || "—"}), généré le ${generated}. Mesures sous CC BY 4.0, citer « Observatoire Quavsit » ; code sous Licence open source Quavern 1.0.`,
    help: "Centre d’aide",
    legal: "Mentions légales",
    privacy: "Confidentialité",
    oss: "L’open source chez Quavern",
    notDeclared: "—"
  }
};

const KINDS = ["trip_updates", "vehicle_positions", "alerts"];
const JOIN_MEMBERS = ["trip_join", "informed_resolved"];
const RATE_MEMBERS = {
  trip_updates: ["trip_join", "stop_updates_timed", "cancelled"],
  vehicle_positions: ["with_position", "with_trip_id", "with_route_id", "trip_join"],
  alerts: ["informed_resolved"]
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const frenchSpacing = (text) =>
  String(text).replace(/ :/g, " :").replace(/ ([;!?»])/g, " $1").replace(/« /g, "« ");
const t = (lang, text) => (lang === "fr" ? frenchSpacing(text) : text);
// Names and credits come from the network descriptors with typewriter
// apostrophes; French pages set them as the rest of the French copy.
const named = (lang, text) => (lang === "fr" ? frenchSpacing(String(text ?? "").replace(/'/g, "’")) : String(text ?? ""));
const anchor = (text) =>
  String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const colon = (lang) => (lang === "fr" ? "\u00a0: " : ": ");
const num = (lang, value) => (value === null || value === undefined ? "—" : new Intl.NumberFormat(copy[lang].locale).format(value));
const longDate = (lang, iso) =>
  iso
    ? new Intl.DateTimeFormat(copy[lang].locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
    : "—";
const shortDate = (lang, iso) =>
  new Intl.DateTimeFormat(copy[lang].locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
const stamp = (lang, iso) =>
  iso
    ? new Intl.DateTimeFormat(copy[lang].locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(iso))
    : "—";
const rateText = (lang, value) => (!value ? "—" : value.of === 0 ? "—" : `${num(lang, value.n)} / ${num(lang, value.of)}`);
const home = (lang) => `${base}${lang === "fr" ? "/fr" : ""}/`;
const networkPath = (lang, slug) => `${base}${lang === "fr" ? "/fr" : ""}/networks/${slug}/`;
const methodPath = (lang) => `${base}${lang === "fr" ? "/fr" : ""}/methodology/`;

function renderInline(text) {
  const codes = [];
  const html = escapeHtml(text)
    .replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return ` ${codes.length - 1} `;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/ (\d+) /g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let title = "";
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) i += 1;
    else if (/^#\s/.test(line)) {
      title = line.replace(/^#\s+/, "");
      i += 1;
    } else if (/^##\s/.test(line)) {
      blocks.push(`<h2>${renderInline(line.replace(/^##\s+/, ""))}</h2>`);
      i += 1;
    } else if (/^-\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s/.test(lines[i])) items.push(`<li>${renderInline(lines[i++].replace(/^-\s+/, ""))}</li>`);
      blocks.push(`<ul>${items.join("")}</ul>`);
    } else {
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !/^(#|-\s)/.test(lines[i])) paragraph.push(lines[i++].trim());
      blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    }
  }
  return { title, html: blocks.join("\n") };
}

function shell({ lang, title, description, path, otherPath, main, latest, correction = "" }) {
  const c = copy[lang];
  const other = lang === "fr" ? "en" : "fr";
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${origin}${path}">
    <link rel="alternate" hreflang="${lang}" href="${origin}${path}">
    <link rel="alternate" hreflang="${other}" href="${origin}${otherPath}">
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f3eb" data-theme-color="light">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f0b07" data-theme-color="dark">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${c.siteName}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${origin}${path}">
    <meta property="og:locale" content="${c.ogLocale}">
    <link rel="icon" href="${base}/assets/logo/quavern-symbol-ink.svg" type="image/svg+xml">
    <link rel="icon" media="(prefers-color-scheme: dark)" href="${base}/assets/logo/quavern-symbol-reverse.svg" type="image/svg+xml">
    <link rel="preload" href="${base}/assets/fonts/LinealVF.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="${base}/assets/fonts/AtkinsonHyperlegibleNext-Latin.woff2" as="font" type="font/woff2" crossorigin>
    <script src="${base}/assets/theme.js"></script>
    <link rel="stylesheet" href="${base}/tokens.css">
    <link rel="stylesheet" href="${base}/observatory.css">
    <script src="${base}/assets/theme-control.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">${c.skip}</a>
    <div class="oss-shell">
      <header class="oss-header">
        <a class="oss-brand" href="${home(lang)}">
          <img class="oss-wordmark" src="${base}/assets/logo/quavern-primary-ink.svg" alt="Quavern" width="107" height="26">
          <span class="oss-brand-name">${c.siteName}</span>
        </a>
        <div class="oss-tools">
          <nav aria-label="${c.languageNav}">
            <a class="oss-language" href="${otherPath}" hreflang="${other}" lang="${other}">${copy[other].name}</a>
          </nav>
          <div class="theme-toggle" data-theme-toggle-mount></div>
        </div>
      </header>
      <p class="trial-note">${t(lang, c.trial(longDate(lang, trialStart)))}</p>
      <main id="main" tabindex="-1">
${main}
      </main>
      <footer class="oss-colophon">
        <p class="oss-colophon-text">${t(lang, c.lowJoin)} ${t(lang, c.notScore)} <a href="${repoUrl}/issues/new?template=correction.yml${correction}">${c.corrections}</a> ${t(lang, c.correctionsMail)}.</p>
        <p class="oss-colophon-text">${t(lang, c.colophon(latest.engine?.code_sha256, stamp(lang, latest.generated_at)))}</p>
        <div class="oss-colophon-foot">
          <p><strong>Quavern</strong> — ${lang === "fr" ? "Bâti sous le bruit." : "Built below the noise."}</p>
          <nav aria-label="Quavern">
            <a href="${origin}${lang === "fr" ? "/fr/" : "/"}">${c.oss}</a>
            <a href="${repoUrl}">GitHub</a>
            <a href="https://support.quavern.com/${lang}/">${c.help}</a>
            <a href="https://quavern.com/mentions-legales.html?lang=${lang}">${c.legal}</a>
            <a href="https://quavern.com/privacy.html?lang=${lang}">${c.privacy}</a>
          </nav>
        </div>
      </footer>
    </div>
  </body>
</html>
`;
}

function timetableCell(lang, stat) {
  const c = copy[lang];
  if (stat.state === "never_ingested") return c.neverIngested;
  if (stat.timetable_ends_on_reason === "not_gtfs") return c.notGtfs;
  if (!stat.timetable_ends_on) return "—";
  if (stat.days_left < 0) return c.ended(longDate(lang, stat.timetable_ends_on));
  if (stat.days_left <= 30) return c.endsIn(stat.days_left);
  return c.runsTo(longDate(lang, stat.timetable_ends_on));
}

const ago = (lang, hours) =>
  hours < 0.5 ? copy[lang].lessThanAnHour : hours < 48 ? copy[lang].hoursAgo(Math.round(hours)) : copy[lang].daysAgo(Math.floor(hours / 24));

function loadedCell(lang, stat) {
  const c = copy[lang];
  if (stat.state === "never_ingested") return "—";
  if (stat.state === "error") return c.refreshFailing;
  if (stat.check_age_hours !== null && stat.check_age_hours !== undefined) return ago(lang, stat.check_age_hours);
  if (stat.age_hours === null) return "—";
  return c.changedAgo(ago(lang, stat.age_hours));
}

function feedCell(lang, network, kind, descriptorKinds) {
  const c = copy[lang];
  if (!descriptorKinds.includes(kind)) return { text: c.noneDeclared, live: false };
  const block = network.realtime[kind];
  if (!block) return { text: c.notMeasured, live: false };
  if (block.ok === 0) return { text: block.samples ? c.noAnswer : c.notMeasured, live: false };
  if (kind === "alerts") return { text: c.alertsCount(block.entities ?? 0, num(lang, block.entities ?? 0)), live: true };
  const value = kind === "trip_updates" ? block.trip_join : block.with_route_id;
  if (kind === "trip_updates" && value === null) return { text: c.noTimetable, live: true };
  if (!value || value.of === 0) return { text: c.emptyFeed, live: true };
  const format = kind === "trip_updates" ? c.joined : c.withLine;
  return { text: format(num(lang, value.n), num(lang, value.of)), live: true };
}

function indexPage(lang, latest) {
  const c = copy[lang];
  const byRegion = new Map();
  for (const network of latest.networks) {
    const region = network.region || "—";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(network);
  }
  const sections = [...byRegion.entries()]
    .map(([region, networks]) => {
      const rows = networks
        .map((network) => {
          const kinds = Object.keys(network.realtime || {});
          const cells = KINDS.map((kind) => {
            const cell = feedCell(lang, network, kind, kinds);
            return `<td${cell.live ? ' class="live"' : ""}>${cell.live ? `<span class="contact" aria-hidden="true"></span><span class="visually-hidden">${c.measuredWorking}${colon(lang)}</span>` : ""}${escapeHtml(t(lang, cell.text))}</td>`;
          }).join("");
          return `              <tr>
                <th scope="row"><a href="${networkPath(lang, network.network)}">${escapeHtml(named(lang, network.name))}</a><span class="city">${escapeHtml(named(lang, network.city))}</span></th>
                <td>${escapeHtml(t(lang, timetableCell(lang, network.static)))}</td>
                <td>${escapeHtml(t(lang, loadedCell(lang, network.static)))}</td>
                ${cells}
              </tr>`;
        })
        .join("\n");
      return `        <section class="region">
          <h2 id="region-${anchor(region)}">${escapeHtml(named(lang, region))}</h2>
          <div class="table-scroll" role="region" tabindex="0" aria-labelledby="ledger-${anchor(region)}">
            <table class="ledger ledger--index">
              <caption id="ledger-${anchor(region)}" class="visually-hidden">${escapeHtml(t(lang, c.ledgerCaption(named(lang, region))))}</caption>
              <colgroup><col class="col-network"><col class="col-timetable"><col class="col-loaded"><col class="col-feed"><col class="col-feed"><col class="col-alerts"></colgroup>
              <thead><tr>${c.columns.map((col) => `<th scope="col">${escapeHtml(col)}</th>`).join("")}</tr></thead>
              <tbody>
${rows}
              </tbody>
            </table>
          </div>
        </section>`;
    })
    .join("\n");
  const partial =
    latest.complete === false
      ? `<p class="partial-note">${t(lang, c.partial(latest.samples_taken, latest.samples_scheduled, stamp(lang, latest.generated_at)))}</p>`
      : "";
  return shell({
    lang,
    title: c.siteName,
    description: t(lang, c.lede(longDate(lang, latest.day), latest.networks.length)),
    path: home(lang),
    otherPath: home(lang === "fr" ? "en" : "fr"),
    latest,
    main: `        <section class="oss-intro" aria-labelledby="intro-title">
          <h1 id="intro-title">${escapeHtml(t(lang, c.title))}</h1>
          <p>${escapeHtml(t(lang, c.lede(longDate(lang, latest.day), latest.networks.length)))}</p>
          ${partial}
          <p class="intro-links"><a href="${methodPath(lang)}">${t(lang, c.method)}</a><a href="${base}/data/latest.json">${c.data}</a><a href="${repoUrl}/tree/main/data">${c.allData}</a><a href="${repoUrl}">${c.code}</a></p>
        </section>
        <nav class="region-index" aria-label="${c.regions}"><p>${c.regions}</p><ul>${[...byRegion.keys()]
          .map((region) => `<li><a href="#region-${anchor(region)}">${escapeHtml(named(lang, region))}</a></li>`)
          .join("")}</ul></nav>
        <p class="ledger-key"><span><span class="contact" aria-hidden="true"></span>${t(lang, c.legend)}</span><span class="scroll-hint">${t(lang, c.scrollHint)}</span></p>
${sections}`
  });
}

function memberRows(lang, kind, block) {
  const c = copy[lang];
  const order = ["host", "samples", "ok", "failures", "rate_limited", "samples_night", "header_age_seconds", "no_header_timestamp", "entities", ...(kind === "trip_updates" ? ["no_trip_id"] : []), ...RATE_MEMBERS[kind]];
  return order
    .map((member) => {
      const [label, definition] = c.members[member];
      let value = block[member];
      if (member === "failures")
        value = Object.entries(value).filter(([, v]) => v).map(([k, v]) => `${c.failureNames[k] ?? k} ${num(lang, v)}`).join(", ") || num(lang, 0);
      else if (RATE_MEMBERS[kind].includes(member)) {
        // A rate is null when no answer was valid (nothing to count), or, for
        // the joins only, when the network has no timetable to join against.
        if (!block.ok) value = c.notMeasured;
        else if (value === null) value = JOIN_MEMBERS.includes(member) ? c.noTimetable : "—";
        else value = rateText(lang, value);
      }
      else if (typeof value === "number") value = num(lang, value);
      else if (value === null || value === undefined) value = "—";
      return `<div class="fact"><dt>${escapeHtml(t(lang, label))}<span class="definition">${escapeHtml(t(lang, definition))}</span></dt><dd>${escapeHtml(value)}</dd></div>`;
    })
    .join("\n");
}

function networkPage(lang, latest, network, history) {
  const c = copy[lang];
  const stat = network.static;
  const facts = [
    [c.factLabels.state, c.states[stat.state]],
    [c.factLabels.refreshed, stat.refreshed_at ? `${stamp(lang, stat.refreshed_at)} (${ago(lang, stat.age_hours)})` : "—"],
    [c.factLabels.checked, stat.checked_at ? `${stamp(lang, stat.checked_at)} (${ago(lang, stat.check_age_hours)})` : "—"],
    [c.factLabels.source, stat.source ? c.sources[stat.source] : "—"],
    [c.factLabels.ends, stat.timetable_ends_on ? (stat.days_left <= 30 ? `${longDate(lang, stat.timetable_ends_on)} (${timetableCell(lang, stat)})` : longDate(lang, stat.timetable_ends_on)) : timetableCell(lang, stat)],
    [c.factLabels.counts, stat.counts ? c.countsText(Object.fromEntries(Object.entries(stat.counts).map(([k, v]) => [k, v === null ? null : num(lang, v)]))) : "—"],
    [c.factLabels.dataset, stat.pan_dataset_slug ? `<a href="https://transport.data.gouv.fr/datasets/${encodeURIComponent(stat.pan_dataset_slug)}">transport.data.gouv.fr</a>` : "—"],
    [c.factLabels.lastError, stat.last_error ? `${c.errorReasons[stat.last_error.reason] ?? stat.last_error.reason}${stat.last_error.host ? ` · ${stat.last_error.host}` : ""}` : "—"]
  ]
    .map(([label, value]) => `<div class="fact"><dt>${escapeHtml(t(lang, label))}</dt><dd>${String(value).startsWith("<a ") ? value : escapeHtml(t(lang, value))}</dd></div>`)
    .join("\n");
  const kinds = KINDS.filter((kind) => kind in (network.realtime || {}));
  const blocks = kinds
    .map((kind) => {
      const block = network.realtime[kind];
      const body = block ? `<dl class="facts">${memberRows(lang, kind, block)}</dl>` : `<p>${c.notMeasured}</p>`;
      return `<section class="oss-section" aria-labelledby="kind-${kind}"><div class="section-head"><h2 id="kind-${kind}">${c.kinds[kind]}</h2></div>${body}</section>`;
    })
    .join("\n") ||
    `<section class="oss-section" aria-labelledby="kind-none"><div class="section-head"><h2 id="kind-none">${c.realtime}</h2><p>${t(lang, c.noRealtime)}</p></div></section>`;
  const observed = network.engine_observed?.length
    ? `<section class="oss-section" aria-labelledby="engine-observed"><div class="section-head"><h2 id="engine-observed">${t(lang, c.engineObserved)}</h2><p>${t(lang, c.engineObservedNote)}</p></div><dl class="facts">${network.engine_observed
        .map((source) => `<div class="fact"><dt><code>${escapeHtml(source.source)}</code></dt><dd>${escapeHtml(t(lang, c.sourceStates[source.state]))} · ${c.lastOk} ${stamp(lang, source.last_ok_at)} · ${c.lastError} ${stamp(lang, source.last_error_at)}</dd></div>`)
        .join("\n")}</dl></section>`
    : "";
  const days = (history?.days || []).slice(-30).reverse();
  const partialDays = days.some((entry) => entry.complete === false);
  const historyTable = days.length
    ? `<section class="oss-section" aria-labelledby="history-title"><div class="section-head"><h2 id="history-title">${c.history}</h2></div><div class="table-scroll" role="region" tabindex="0" aria-labelledby="history-caption"><table class="ledger ledger--history"><caption id="history-caption" class="visually-hidden">${escapeHtml(c.historyCaption(named(lang, network.name)))}</caption><thead><tr><th scope="col">${c.historyDay}</th><th scope="col">${c.columns[1]}</th>${kinds.map((kind) => `<th scope="col">${c.columns[3 + KINDS.indexOf(kind)]}</th>`).join("")}</tr></thead><tbody>${days
        .map((entry) => {
          const cells = kinds
            .map((kind) => {
              const cell = feedCell(lang, { realtime: entry.realtime || {} }, kind, kinds);
              return `<td>${escapeHtml(t(lang, cell.text))}</td>`;
            })
            .join("");
          return `<tr><th scope="row"><time datetime="${entry.day}">${shortDate(lang, entry.day)}</time>${entry.complete === false ? " *" : ""}</th><td>${escapeHtml(t(lang, timetableCell(lang, entry.static)))}</td>${cells}</tr>`;
        })
        .join("")}</tbody></table></div>${partialDays ? `<p class="history-note">${t(lang, c.partialDay)}</p>` : ""}</section>`
    : "";
  return shell({
    lang,
    title: `${named(lang, network.name)} — ${c.siteName}`,
    description: t(lang, c.networkDescription(named(lang, network.name), named(lang, network.city))),
    path: networkPath(lang, network.network),
    otherPath: networkPath(lang === "fr" ? "en" : "fr", network.network),
    latest,
    correction: `&amp;network=${encodeURIComponent(network.network)}&amp;day=${latest.day}`,
    main: `        <p class="licence-back"><a href="${home(lang)}">${c.networkBack}</a></p>
        <section class="oss-intro network-intro" aria-labelledby="network-title">
          <h1 id="network-title">${escapeHtml(named(lang, network.name))}</h1>
          <p>${escapeHtml(named(lang, [network.city, network.region].filter(Boolean).join(" · ")))} · ${t(lang, c.latestDay(longDate(lang, latest.day)))}</p>
          ${network.attribution ? `<p class="attribution">${escapeHtml(t(lang, c.attribution(named(lang, network.attribution))))}</p>` : ""}
          <p class="intro-links"><a href="${base}/data/networks/${network.network}.json">JSON</a><a href="${base}/data/networks/${network.network}.csv">CSV</a><a href="${methodPath(lang)}">${t(lang, c.method)}</a></p>
        </section>
        <section class="oss-section" aria-labelledby="facts-title"><div class="section-head"><h2 id="facts-title">${c.facts}</h2></div><dl class="facts">${facts}</dl></section>
${blocks}
${observed}
${historyTable}`
  });
}

function methodologyPage(lang, latest, markdown) {
  const c = copy[lang];
  const doc = renderMarkdown(markdown);
  return shell({
    lang,
    title: `${doc.title} — ${c.siteName}`,
    description: t(lang, c.title),
    path: methodPath(lang),
    otherPath: methodPath(lang === "fr" ? "en" : "fr"),
    latest,
    main: `        <p class="licence-back"><a href="${home(lang)}">${c.networkBack}</a></p>
        <article class="licence" aria-labelledby="method-title">
          <h1 id="method-title">${escapeHtml(t(lang, doc.title))}</h1>
          <div class="licence-body">
${lang === "fr" ? frenchSpacing(doc.html) : doc.html}
          </div>
        </article>`
  });
}

// GitHub Pages serves this for any missing address under the project path, in
// either language, so it says so in both.
function notFoundPage(latest) {
  const en = copy.en;
  const fr = copy.fr;
  return shell({
    lang: "en",
    title: `404 — ${en.siteName}`,
    description: en.notFound,
    path: `${base}/404.html`,
    otherPath: home("fr"),
    latest,
    main: `        <section class="oss-intro" aria-labelledby="intro-title">
          <h1 id="intro-title">${en.notFound}</h1>
          <p>${en.notFoundBody} <a href="${home("en")}">${en.networkBack}</a></p>
          <p lang="fr">${t("fr", `${fr.notFound} ${fr.notFoundBody}`)} <a href="${home("fr")}">${fr.networkBack}</a></p>
        </section>`
  })
    .replace(/\n    <link rel="canonical"[^\n]*\n    <link rel="alternate"[^\n]*\n    <link rel="alternate"[^\n]*/, "")
    .replace(/\n    <meta property="og:url"[^\n]*/, "");
}

async function write(path, text) {
  const target = resolve(out, path.replace(new RegExp(`^${base}/`), ""));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

function csvFor(history) {
  const lines = ["day,kind,metric,n,of,value"];
  for (const entry of history.days) {
    for (const [metric, value] of Object.entries({ state: entry.static.state, days_left: entry.static.days_left, age_hours: entry.static.age_hours })) {
      lines.push([entry.day, "static", metric, "", "", value ?? ""].join(","));
    }
    for (const [kind, block] of Object.entries(entry.realtime || {})) {
      if (!block) continue;
      for (const metric of ["samples", "ok", "header_age_seconds", "entities"]) lines.push([entry.day, kind, metric, "", "", block[metric] ?? ""].join(","));
      for (const metric of RATE_MEMBERS[kind]) {
        const value = block[metric];
        lines.push([entry.day, kind, metric, value ? value.n : "", value ? value.of : "", ""].join(","));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---- build -------------------------------------------------------------------------------
const latest = JSON.parse(await readFile(resolve(root, "data/latest.json"), "utf8"));
const histories = {};
for (const file of (await readdir(resolve(root, "data/networks"))).filter((name) => name.endsWith(".json"))) {
  const history = JSON.parse(await readFile(resolve(root, "data/networks", file), "utf8"));
  histories[history.network] = history;
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, "site/assets"), resolve(out, "assets"), { recursive: true });
await rm(resolve(out, "assets/tokens.css"));
await cp(resolve(root, "site/assets/tokens.css"), resolve(out, "tokens.css"));
await cp(resolve(root, "site/observatory.css"), resolve(out, "observatory.css"));
await cp(resolve(root, "data"), resolve(out, "data"), { recursive: true });

for (const lang of ["en", "fr"]) {
  await write(`${home(lang)}index.html`, indexPage(lang, latest));
  await write(`${methodPath(lang)}index.html`, methodologyPage(lang, latest, await readFile(resolve(root, `methodology/${lang}.md`), "utf8")));
  for (const network of latest.networks) {
    await write(`${networkPath(lang, network.network)}index.html`, networkPage(lang, latest, network, histories[network.network]));
  }
}
for (const [slug, history] of Object.entries(histories)) {
  await writeFile(resolve(out, "data/networks", `${slug}.csv`), csvFor(history));
}
await write(`${base}/404.html`, notFoundPage(latest));
const pages = ["en", "fr"].flatMap((lang) => [home(lang), methodPath(lang), ...latest.networks.map((network) => networkPath(lang, network.network))]);
await writeFile(
  resolve(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((page) => `  <url><loc>${origin}${page}</loc></url>`)
    .join("\n")}\n</urlset>\n`
);
await writeFile(resolve(out, ".nojekyll"), "");
process.stdout.write(`Built Quavsit Observatory for ${latest.day}: ${latest.networks.length} networks → ${out}\n`);
