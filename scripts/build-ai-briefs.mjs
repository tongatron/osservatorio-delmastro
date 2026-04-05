import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ARTICLES_PATH = path.join(ROOT, "data", "articles.json");
const BODIES_PATH = path.join(ROOT, "cache", "article-bodies.json");
const BRIEFS_PATH = path.join(ROOT, "data", "daily-briefs.json");
const CONFIG_PATH = path.join(ROOT, "config", "watch.json");
const ROME_TIME_ZONE = "Europe/Rome";

const [articlesPayload, bodiesPayload, config] = await Promise.all([
  readJson(ARTICLES_PATH),
  readJson(BODIES_PATH),
  readJson(CONFIG_PATH)
]);

const model = process.env.OLLAMA_MODEL || config.ai?.model || "qwen2.5:7b";
const baseUrl = process.env.OLLAMA_BASE || config.ai?.baseUrl || "http://127.0.0.1:11434";
const maxArticlesPerDay = Number(config.ai?.maxArticlesPerDay ?? 10);
const bodyMap = new Map((bodiesPayload.items ?? []).map((item) => [item.id, item]));

await ensureModelAvailable(baseUrl, model);

const articlesByDate = new Map();

for (const article of articlesPayload.articles ?? []) {
  const key = formatRomeDateKey(article.publishedAt);
  const body = bodyMap.get(article.id);
  const record = {
    ...article,
    bodyText: body?.bodyText || "",
    bodyExcerpt: body?.bodyExcerpt || article.excerpt || "",
    extractionStatus: body?.extractionStatus || "missing"
  };

  const list = articlesByDate.get(key) ?? [];
  list.push(record);
  articlesByDate.set(key, list);
}

const dailyBriefs = [];

for (const [date, records] of [...articlesByDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
  const selected = selectArticles(records, maxArticlesPerDay);
  const promptPayload = selected.map((article) => ({
    id: article.id,
    title: article.title,
    source: article.source,
    sourceHost: article.sourceHost,
    publishedAt: article.publishedAt,
    queryLabel: article.queryLabel,
    matchedTerms: article.matchedTerms,
    tags: article.tags,
    excerpt: article.excerpt,
    bodyExcerpt: article.bodyExcerpt
  }));

  const aiResult = await generateBrief({
    baseUrl,
    model,
    date,
    articles: promptPayload
  });

  dailyBriefs.push({
    date,
    articleCount: records.length,
    coveredArticleCount: selected.length,
    headline: aiResult.headline,
    summary: aiResult.summary,
    keyEvents: aiResult.keyEvents,
    themes: aiResult.themes,
    notableActors: aiResult.notableActors,
    sourceArticles: selected.map((article) => ({
      id: article.id,
      title: article.title,
      source: article.source,
      sourceHost: article.sourceHost,
      link: article.link,
      publishedAt: article.publishedAt
    }))
  });
}

await writeFile(
  BRIEFS_PATH,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generatedBy: "ollama",
      model,
      dailyBriefs
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Saved ${dailyBriefs.length} daily briefs to ${BRIEFS_PATH}`);

async function ensureModelAvailable(baseUrl, modelName) {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Unable to reach Ollama tags endpoint: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const names = new Set((payload.models ?? []).map((item) => item.name));

  if (!names.has(modelName)) {
    throw new Error(
      `Model ${modelName} is not available in Ollama. Install it first with: ollama pull ${modelName}`
    );
  }
}

async function generateBrief({ baseUrl, model, date, articles }) {
  const prompt = [
    "Sei un redattore che prepara un briefing giornaliero.",
    "Ricevi articoli sul caso Delmastro per una singola data.",
    "Devi produrre solo JSON valido in italiano, senza markdown.",
    "Usa solo le informazioni presenti negli articoli.",
    "Non inventare fatti, ruoli, motivazioni o sviluppi.",
    "Non espandere sigle o abbreviazioni se non sono spiegate chiaramente nel testo.",
    "Mantieni un tono neutro e concreto.",
    "Basati soprattutto su titolo ed estratto. Usa bodyExcerpt solo come supporto secondario.",
    "Non attribuire azioni a un soggetto diverso da quello esplicitamente indicato nei testi.",
    "Evita etichette generiche o astratte come 'cronaca legale', 'punizioni professionali', 'economia sospetta'.",
    "Se un dettaglio e' incerto o compare in una sola fonte, trattalo con cautela oppure omettilo.",
    "Campi richiesti:",
    "- headline: stringa fattuale, max 90 caratteri",
    "- summary: 2-3 frasi compatte e specifiche",
    "- keyEvents: array di 2-5 stringhe brevi, ciascuna su un fatto o sviluppo",
    "- themes: array di 2-5 temi concreti e leggibili",
    "- notableActors: array di 0-6 persone, enti o gruppi effettivamente citati",
    `Data di riferimento: ${date}.`,
    "Articoli:",
    JSON.stringify(articles)
  ].join("\n");

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [
        {
          role: "system",
          content:
            "Rispondi sempre e solo con JSON valido. Scrivi in italiano naturale, preciso e prudente."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.message?.content?.trim();
  const parsed = parseJsonObject(content);

  return {
    headline: stringifyOrFallback(parsed.headline, `Aggiornamento del ${date}`),
    summary: stringifyOrFallback(parsed.summary, "Nessun riassunto disponibile."),
    keyEvents: toStringArray(parsed.keyEvents, 6),
    themes: toStringArray(parsed.themes, 6),
    notableActors: toStringArray(parsed.notableActors, 8)
  };
}

function parseJsonObject(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value ?? "").match(/\{[\s\S]*\}/);
    if (!match) {
      return {};
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function stringifyOrFallback(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toStringArray(value, maxItems) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(
    value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
  )
    .slice(0, maxItems);
}

function selectArticles(records, limit) {
  const seen = new Set();
  const ranked = records
    .filter((article) => !isLowSignalArticle(article))
    .sort((left, right) => {
    const leftScore = buildArticleScore(left);
    const rightScore = buildArticleScore(right);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });

  const selected = [];

  for (const article of ranked) {
    const dedupeKey = normalizeHeadline(article.title);
    if (dedupeKey && seen.has(dedupeKey)) {
      continue;
    }

    if (dedupeKey) {
      seen.add(dedupeKey);
    }

    selected.push(article);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function buildArticleScore(article) {
  let score = 0;
  if (article.excerpt) {
    score += Math.min(article.excerpt.length, 240);
  }
  if (article.bodyExcerpt) {
    score += Math.min(article.bodyExcerpt.length, 120);
  }
  if (article.tags?.length) {
    score += article.tags.length * 20;
  }
  if (article.queryLabel) {
    score += 25;
  }
  return score;
}

function normalizeHeadline(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

function isLowSignalArticle(article) {
  const title = String(article.title ?? "").toLowerCase();
  return (
    title.includes("notizie su caso") ||
    title.includes("notizie e video") ||
    title.includes("ultime notizie") ||
    title.includes("live") ||
    title.includes("diretta")
  );
}

function formatRomeDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
