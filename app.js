const [data, status] = await Promise.all([
  fetch("./data/articles.json").then((response) => response.json()),
  fetch("./data/status.json")
    .then((response) => (response.ok ? response.json() : { lastCheckedAt: null }))
    .catch(() => ({ lastCheckedAt: null }))
]);

const dateWindow = document.querySelector("#date-window");
const articleCount = document.querySelector("#article-count");
const mastheadCount = document.querySelector("#masthead-count");
const checkedRelative = document.querySelector("#checked-relative");
const sources = document.querySelector("#sources");
const toggleSourcesButton = document.querySelector("#toggle-sources");
const sourcesPanel = document.querySelector(".sources-panel");
const timelineRoot = document.querySelector("#timeline");
const chartMax = document.querySelector("#chart-max");
const chartMid = document.querySelector("#chart-mid");
const articlesRoot = document.querySelector("#articles");
const template = document.querySelector("#article-template");
const sourceSelection = new Set((data.sources ?? []).map((source) => source.label));
const DISPLAY_TIME_ZONE = "Europe/Rome";

initializeResponsivePanels();

dateWindow.textContent = formatWindow(data.window?.from, data.window?.to);
checkedRelative.textContent = status.lastCheckedAt
  ? `Ultimo controllo ${formatRelativeTime(status.lastCheckedAt)}`
  : "Controllo automatico ogni 30 minuti";

for (const source of data.sources ?? []) {
  const label = document.createElement("label");
  label.className = "source-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  input.dataset.source = source.label;
  input.addEventListener("change", () => {
    if (input.checked) {
      sourceSelection.add(source.label);
    } else {
      sourceSelection.delete(source.label);
    }
    updateToggleSourcesLabel();
    applyFilters();
  });

  const text = document.createElement("span");
  text.textContent = `${source.label} · ${source.articleCount} articoli`;

  label.append(input, text);
  sources.append(label);
}

renderTimeline(data.timeline ?? []);
updateToggleSourcesLabel();
applyFilters();

toggleSourcesButton.addEventListener("click", () => {
  const shouldSelectAll = sourceSelection.size !== (data.sources ?? []).length;

  sourceSelection.clear();
  for (const input of sources.querySelectorAll("input[type='checkbox']")) {
    input.checked = shouldSelectAll;
    if (shouldSelectAll) {
      sourceSelection.add(input.dataset.source);
    }
  }

  updateToggleSourcesLabel();
  applyFilters();
});

function renderArticles(articles) {
  articlesRoot.innerHTML = "";

  if (articles.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nessun articolo corrisponde ai filtri correnti.";
    articlesRoot.append(empty);
    return;
  }

  for (const article of articles) {
    const node = template.content.cloneNode(true);
    node.querySelector(".article-source").textContent = article.source;
    node.querySelector(".article-time").textContent = formatDateTime(article.publishedAt);
    node.querySelector(".article-title").textContent = cleanHeadline(article.title, article.source);
    node.querySelector(".article-excerpt").textContent =
      cleanExcerpt(article.excerpt, article.source) || "Estratto non disponibile.";

    const link = node.querySelector(".article-link");
    link.href = article.link;
    articlesRoot.append(node);
  }
}

function applyFilters() {
  const filtered = data.articles.filter((article) => sourceSelection.has(article.sourceHost));

  articleCount.textContent = `${filtered.length} articoli`;
  mastheadCount.textContent = `${filtered.length} articoli`;
  renderArticles(filtered);
}

function renderTimeline(items) {
  timelineRoot.innerHTML = "";
  const maxCount = Math.max(...items.map((item) => item.count), 0);
  const midCount = Math.round(maxCount / 2);

  chartMax.textContent = String(maxCount);
  chartMid.textContent = String(midCount);

  for (const item of items) {
    const bar = document.createElement("div");
    bar.className = "timeline-bar";
    const height = maxCount === 0 ? 16 : Math.max(16, Math.round((item.count / maxCount) * 180));

    const count = document.createElement("span");
    count.className = "timeline-count";
    count.textContent = String(item.count);

    const column = document.createElement("span");
    column.className = "timeline-column";
    column.style.height = `${height}px`;
    column.title = `${item.count} articoli il ${formatLongDate(item.date)}`;

    const date = document.createElement("span");
    date.className = "timeline-date";
    date.textContent = formatShortDate(item.date);

    bar.append(count, column, date);
    timelineRoot.append(bar);
  }
}

function cleanFeedText(value) {
  return String(value ?? "")
    .replace(/\bdel\s+mastro\b/gi, "Delmastro")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHeadline(value, source) {
  const text = cleanFeedText(value);
  return stripTrailingNoise(stripSourceSuffix(text, source));
}

function cleanExcerpt(value, source) {
  const text = cleanFeedText(value);
  return stripSourceSuffix(text, source);
}

function stripSourceSuffix(text, source) {
  const escapedSource = escapeRegExp(source);
  return text
    .replace(new RegExp(`\\s+[\\-|–—]\\s+${escapedSource}$`, "i"), "")
    .replace(new RegExp(`\\s+${escapedSource}$`, "i"), "")
    .trim();
}

function stripTrailingNoise(text) {
  let cleaned = text;
  const trailingNoisePatterns = [
    /\s+[\\-|–—:]\s*(video|foto|live|diretta|photogallery)$/i,
    /\s+\((video|foto|live|diretta|photogallery)\)$/i,
    /\s+\[(video|foto|live|diretta|photogallery)\]$/i,
    /\s+(video|foto|live|diretta|photogallery)$/i
  ];

  for (const pattern of trailingNoisePatterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateToggleSourcesLabel() {
  const total = (data.sources ?? []).length;
  toggleSourcesButton.textContent =
    sourceSelection.size === total ? "Deseleziona tutte" : "Seleziona tutte";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRelativeTime(value) {
  const target = new Date(value);
  const diffMs = Date.now() - target.getTime();

  if (diffMs <= 0) {
    return "adesso";
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) {
    return "adesso";
  }
  if (minutes === 1) {
    return "1 minuto fa";
  }
  if (minutes < 60) {
    return `${minutes} minuti fa`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours === 1) {
    return "1 ora fa";
  }
  if (hours < 24) {
    return `${hours} ore fa`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "1 giorno fa";
  }
  return `${days} giorni fa`;
}

function formatWindow(from, to) {
  if (!from || !to) {
    return "Finestra non disponibile";
  }

  const formatter = new Intl.DateTimeFormat("it-IT", {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "medium"
  });
  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "medium"
  }).format(new Date(value));
}

function initializeResponsivePanels() {
  if (!window.matchMedia("(max-width: 640px)").matches) {
    return;
  }

  sourcesPanel?.removeAttribute("open");
}
