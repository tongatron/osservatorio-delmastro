const briefsPayload = await fetch("./data/daily-briefs.json").then((response) => response.json());

const generatedEl = document.querySelector("#briefing-generated");
const modelEl = document.querySelector("#briefing-model");
const countEl = document.querySelector("#briefing-count");
const root = document.querySelector("#briefing-root");
const template = document.querySelector("#brief-card-template");

generatedEl.textContent = briefsPayload.generatedAt
  ? `Generato ${formatRelativeTime(briefsPayload.generatedAt)}`
  : "Briefing non ancora generato";

modelEl.textContent = briefsPayload.model
  ? `${briefsPayload.model} · ${formatOrigin(briefsPayload.generatedBy)}`
  : "Ollama locale";

countEl.textContent = `${(briefsPayload.dailyBriefs ?? []).length} giornate sintetizzate`;

renderBriefs(briefsPayload.dailyBriefs ?? []);

function renderBriefs(items) {
  root.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nessun briefing AI disponibile. Esegui `npm run ai:update` sul Mac.";
    root.append(empty);
    return;
  }

  for (const item of items) {
    const node = template.content.cloneNode(true);
    node.querySelector(".brief-card-date").textContent = formatLongDate(item.date);
    node.querySelector(".brief-card-title").textContent = item.headline;
    node.querySelector(".brief-card-count").textContent = `${item.articleCount} articoli`;
    node.querySelector(".brief-card-summary").textContent = item.summary;

    fillList(node.querySelector(".brief-events"), item.keyEvents);
    fillTagList(node.querySelector(".brief-themes"), item.themes);
    fillList(node.querySelector(".brief-actors"), item.notableActors);

    const sourcesRoot = node.querySelector(".brief-source-list");
    for (const article of item.sourceArticles ?? []) {
      const link = document.createElement("a");
      link.className = "brief-source-link";
      link.href = article.link;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `${article.source} · ${article.title}`;
      sourcesRoot.append(link);
    }

    root.append(node);
  }
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

function formatLongDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
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

  if (value === "ollama") {
    return "briefing locale";
  }

  return value;
}
