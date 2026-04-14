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
let activeDateFilter = null;

initializeResponsivePanels();

dateWindow.textContent = formatWindow(data.window?.from, data.window?.to);
checkedRelative.textContent = status.lastCheckedAt
  ? buildLastCheckLabel(status)
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
  let filtered = data.articles.filter((article) => sourceSelection.has(article.sourceHost));

  if (activeDateFilter) {
    filtered = filtered.filter((article) => {
      const d = new Date(article.publishedAt);
      const dateStr = d.toLocaleDateString("sv-SE", { timeZone: DISPLAY_TIME_ZONE });
      return dateStr === activeDateFilter;
    });
  }

  articleCount.textContent = `${filtered.length} articoli`;
  mastheadCount.textContent = `${filtered.length} articoli`;
  renderArticles(filtered);
}

function renderTimeline(items) {
  timelineRoot.innerHTML = "";
  const maxCount = Math.max(...items.map((item) => item.count), 0);
  const midCount = Math.round(maxCount / 2);
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: DISPLAY_TIME_ZONE });

  chartMax.textContent = maxCount > 0 ? String(maxCount) : "";
  chartMid.textContent = maxCount > 1 ? String(midCount) : "";

  // tooltip condiviso
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  timelineRoot.append(tooltip);

  for (const item of items) {
    const isToday = item.date === todayStr;
    const hasArticles = item.count > 0;
    const heightPct = maxCount === 0 ? 4 : Math.max(4, Math.round((item.count / maxCount) * 100));

    const bar = document.createElement("button");
    bar.className = "timeline-bar" + (isToday ? " timeline-bar--today" : "") + (hasArticles ? " timeline-bar--active" : "");
    bar.type = "button";
    bar.disabled = !hasArticles;
    bar.dataset.date = item.date;
    bar.setAttribute("aria-label", `${item.count} articoli il ${formatLongDate(item.date)}`);

    const column = document.createElement("span");
    column.className = "timeline-column";
    column.style.setProperty("--bar-height", `${heightPct}%`);

    const dateLabel = document.createElement("span");
    dateLabel.className = "timeline-date";

    // mostra solo alcune etichette per non sovraffollare
    const d = new Date(item.date + "T12:00:00");
    const dayOfWeek = d.getDay(); // 0=dom, 1=lun...
    const dayOfMonth = d.getDate();
    if (isToday) {
      dateLabel.textContent = "oggi";
      dateLabel.classList.add("timeline-date--today");
    } else if (dayOfMonth === 1 || dayOfWeek === 1) {
      // primo del mese o lunedì
      dateLabel.textContent = formatShortDate(item.date);
    } else {
      dateLabel.textContent = "";
    }

    // tooltip al hover
    bar.addEventListener("mouseenter", (e) => {
      tooltip.textContent = `${formatLongDate(item.date)}: ${item.count} ${item.count === 1 ? "articolo" : "articoli"}`;
      tooltip.classList.add("chart-tooltip--visible");
      const barRect = bar.getBoundingClientRect();
      const rootRect = timelineRoot.getBoundingClientRect();
      tooltip.style.left = `${barRect.left - rootRect.left + barRect.width / 2}px`;
    });
    bar.addEventListener("mouseleave", () => {
      tooltip.classList.remove("chart-tooltip--visible");
    });

    // click: filtra articoli per data
    bar.addEventListener("click", () => {
      if (activeDateFilter === item.date) {
        activeDateFilter = null;
        timelineRoot.querySelectorAll(".timeline-bar--selected").forEach((el) => el.classList.remove("timeline-bar--selected"));
        applyFilters();
      } else {
        activeDateFilter = item.date;
        timelineRoot.querySelectorAll(".timeline-bar--selected").forEach((el) => el.classList.remove("timeline-bar--selected"));
        bar.classList.add("timeline-bar--selected");
        applyFilters();
      }
    });

    bar.append(column, dateLabel);
    timelineRoot.append(bar);
  }

  // animazione entrata
  requestAnimationFrame(() => timelineRoot.classList.add("timeline--loaded"));
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

function buildLastCheckLabel(status) {
  const origin = formatCheckOrigin(status.lastCheckedBy);
  const suffix = origin ? ` · ${origin}` : "";
  return `Ultimo controllo ${formatRelativeTime(status.lastCheckedAt)}${suffix}`;
}

function formatCheckOrigin(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "raspberry.local" || normalized === "github-actions" || normalized.startsWith("github-actions/")) {
    return "";
  }

  return `da ${value}`;
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
