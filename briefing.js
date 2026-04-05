const payload = await fetch("./data/daily-briefs.json").then((response) => response.json());

const generatedEl = document.querySelector("#briefing-generated");
const modelEl = document.querySelector("#briefing-model");
const countEl = document.querySelector("#briefing-count");
const methodologyEl = document.querySelector("#briefing-methodology");
const windowEl = document.querySelector("#briefing-window");
const root = document.querySelector("#briefing-root");
const template = document.querySelector("#brief-card-template");

const briefing = payload.briefing;

generatedEl.textContent = payload.generatedAt
  ? `Generato ${formatRelativeTime(payload.generatedAt)}`
  : "Briefing non ancora generato";

modelEl.textContent = payload.model
  ? `${payload.model} · ${formatOrigin(payload.generatedBy)}`
  : "Ollama locale";

methodologyEl.textContent =
  payload.methodology?.note ||
  "Briefing globale basato su titoli, estratti e, quando disponibile, sul corpo degli articoli.";

if (!briefing) {
  windowEl.textContent = "Finestra non disponibile";
  countEl.textContent = "Nessun briefing disponibile";
  renderEmptyState();
} else {
  windowEl.textContent = briefing.timeWindow?.label || "Finestra monitorata";
  countEl.textContent = formatMetrics(briefing);
  renderBriefing(briefing);
}

function renderBriefing(item) {
  root.innerHTML = "";

  const node = template.content.cloneNode(true);
  node.querySelector(".brief-card-date").textContent = item.timeWindow?.label || "Finestra monitorata";
  node.querySelector(".brief-card-title").textContent = item.headline;
  node.querySelector(".brief-card-count").textContent = formatMetrics(item);
  node.querySelector(".brief-card-summary").textContent = item.summary;
  node.querySelector(".brief-card-note").textContent = item.cautionNote || item.sourceBasis || "";

  fillList(node.querySelector(".brief-events"), item.events);
  fillTagList(node.querySelector(".brief-themes"), item.themes);
  fillList(node.querySelector(".brief-actors"), item.notableActors);
  renderCoverage(node, item);
  renderTimeline(node, item.timeline);
  renderSourceArticles(node, item.sourceArticles);

  root.append(node);
}

function renderCoverage(node, item) {
  node.querySelector(".brief-complete-summary").textContent = item.sourceBasis || "";

  const sourcesRoot = node.querySelector(".brief-complete-sources");
  sourcesRoot.innerHTML = "";

  for (const source of item.topSources ?? []) {
    const span = document.createElement("span");
    span.className = "brief-source-pill";
    span.textContent = `${source.label} (${source.count})`;
    sourcesRoot.append(span);
  }
}

function renderTimeline(node, items) {
  const root = node.querySelector(".brief-timeline-list");
  root.innerHTML = "";

  if (!items?.length) {
    node.querySelector(".brief-timeline").remove();
    return;
  }

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "timeline-day";

    const head = document.createElement("div");
    head.className = "timeline-day-head";

    const date = document.createElement("p");
    date.className = "timeline-day-date";
    date.textContent = item.label;
    head.append(date);

    const metrics = document.createElement("p");
    metrics.className = "timeline-day-metrics";
    metrics.textContent = `${item.linkedArticleCount} articoli · ${item.sourceCount} fonti`;
    head.append(metrics);

    article.append(head);

    const summary = document.createElement("p");
    summary.className = "timeline-day-summary";
    summary.textContent = item.summary;
    article.append(summary);

    const list = document.createElement("ul");
    list.className = "brief-list";
    fillList(list, item.events);
    article.append(list);

    const sources = document.createElement("div");
    sources.className = "brief-complete-sources";
    for (const source of item.topSources ?? []) {
      const span = document.createElement("span");
      span.className = "brief-source-pill";
      span.textContent = `${source.label} (${source.count})`;
      sources.append(span);
    }
    article.append(sources);

    root.append(article);
  }
}

function renderSourceArticles(node, items) {
  const sourcesRoot = node.querySelector(".brief-source-list");
  sourcesRoot.innerHTML = "";

  for (const article of items ?? []) {
    const link = document.createElement("a");
    link.className = "brief-source-link";
    link.href = article.link;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${article.source} · ${article.title}`;
    sourcesRoot.append(link);
  }
}

function renderEmptyState() {
  root.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "Nessun briefing disponibile. Esegui `npm run build:briefs` sul Mac.";
  root.append(empty);
}

function fillList(root, items) {
  root.innerHTML = "";

  for (const item of items ?? []) {
    const li = document.createElement("li");
    li.textContent = item;
    root.append(li);
  }
}

function fillTagList(root, items) {
  root.innerHTML = "";

  for (const item of items ?? []) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = item;
    root.append(span);
  }
}

function formatRelativeTime(value) {
  const target = new Date(value);
  const diffMs = Date.now() - target.getTime();

  if (diffMs <= 0) return "adesso";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "adesso";
  if (minutes === 1) return "1 minuto fa";
  if (minutes < 60) return `${minutes} minuti fa`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 ora fa";
  if (hours < 24) return `${hours} ore fa`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 giorno fa" : `${days} giorni fa`;
}

function formatOrigin(value) {
  if (!value) {
    return "locale";
  }

  if (value === "ollama-hybrid") {
    return "briefing locale ibrido";
  }

  return value;
}

function formatMetrics(item) {
  const parts = [];

  if (item.linkedArticleCount) {
    parts.push(`${item.linkedArticleCount} articoli`);
  }

  if (item.clusterCount) {
    parts.push(`${item.clusterCount} filoni`);
  }

  if (item.sourceCount) {
    parts.push(`${item.sourceCount} fonti`);
  }

  return parts.join(" · ");
}
