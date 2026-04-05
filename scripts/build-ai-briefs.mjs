import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ARTICLES_PATH = path.join(ROOT, "data", "articles.json");
const BODIES_PATH = path.join(ROOT, "cache", "article-bodies.json");
const BRIEFS_PATH = path.join(ROOT, "data", "daily-briefs.json");
const CONFIG_PATH = path.join(ROOT, "config", "watch.json");
const ROME_TIME_ZONE = "Europe/Rome";
const THEME_LABELS = {
  politica: "politica",
  giudiziaria: "sviluppi giudiziari",
  "societa'": "societa' e assetti",
  bisteccheria: "bisteccheria e attivita' commerciali",
  territorio: "territorio"
};
const TITLE_STOPWORDS = new Set([
  "a",
  "ad",
  "agli",
  "ai",
  "al",
  "alla",
  "alle",
  "allo",
  "anche",
  "con",
  "da",
  "dal",
  "dalla",
  "dello",
  "dei",
  "del",
  "della",
  "di",
  "e",
  "gli",
  "ha",
  "i",
  "il",
  "in",
  "la",
  "le",
  "lo",
  "ma",
  "nel",
  "nella",
  "non",
  "per",
  "piu",
  "su",
  "tra",
  "un",
  "una",
  "uno"
]);

const [articlesPayload, bodiesPayload, config] = await Promise.all([
  readJson(ARTICLES_PATH),
  readJson(BODIES_PATH),
  readJson(CONFIG_PATH)
]);

const model = process.env.OLLAMA_MODEL || config.ai?.model || "qwen2.5:7b";
const baseUrl = process.env.OLLAMA_BASE || config.ai?.baseUrl || "http://127.0.0.1:11434";
const maxPromptClusters = Number(config.ai?.maxBriefingClusters ?? 12);
const bodyMap = new Map((bodiesPayload.items ?? []).map((item) => [item.id, item]));

await ensureModelAvailable(baseUrl, model);

const records = (articlesPayload.articles ?? [])
  .map((article) => {
    const body = bodyMap.get(article.id);
    return {
      ...article,
      bodyText: body?.bodyText || "",
      bodyExcerpt: body?.bodyExcerpt || "",
      extractionStatus: body?.extractionStatus || "missing"
    };
  })
  .filter((article) => Boolean(article.link))
  .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());

const coverage = buildCoverage(records);
const allClusters = clusterAndRankArticles(records);
const aiResult = await generateActors({
  baseUrl,
  model,
  coverage,
  clusters: allClusters.slice(0, maxPromptClusters).map(toPromptCluster)
});
const briefing = buildCompleteBriefing({
  records,
  clusters: allClusters,
  coverage,
  window: articlesPayload.window,
  notableActors: aiResult.notableActors.length > 0 ? aiResult.notableActors : extractActorsFromClusters(allClusters)
});

await writeFile(
  BRIEFS_PATH,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generatedBy: "ollama-hybrid",
      model,
      methodology: {
        note: buildMethodologyNote(coverage),
        source: "Briefing globale costruito su tutti gli articoli linkati; AI locale usata come supporto sugli attori citati."
      },
      briefing
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Saved global briefing to ${BRIEFS_PATH}`);

async function ensureModelAvailable(baseUrl, modelName) {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Unable to reach Ollama tags endpoint: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const names = new Set((payload.models ?? []).map((item) => item.name));

  if (!names.has(modelName)) {
    throw new Error(`Model ${modelName} is not available in Ollama. Install it first with: ollama pull ${modelName}`);
  }
}

async function generateActors({ baseUrl, model, coverage, clusters }) {
  const prompt = [
    "Sei un assistente editoriale.",
    "Ricevi filoni di notizie deduplicati del caso Delmastro.",
    "Devi produrre solo JSON valido in italiano, senza markdown.",
    "Ti chiedo solo di identificare gli attori esplicitamente citati.",
    "Usa solo persone, enti o gruppi nominati in modo chiaro nei filoni forniti.",
    "Non inventare ruoli, non espandere sigle e non aggiungere spiegazioni.",
    "Campi richiesti:",
    "- notableActors: array di 0-8 persone, enti o gruppi nominati nelle fonti",
    `Copertura: ${JSON.stringify(coverage)}.`,
    "Filoni:",
    JSON.stringify(clusters)
  ].join("\n");

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1
      },
      messages: [
        {
          role: "system",
          content: "Rispondi sempre e solo con JSON valido. Scrivi in modo preciso e prudente."
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
    notableActors: sanitizeActors(toStringArray(parsed.notableActors, 8))
  };
}

function buildCompleteBriefing({ records, clusters, coverage, window, notableActors }) {
  const events = dedupeEventLines(
    clusters.map((cluster) => simplifyEventTitle(cluster.title)).filter(Boolean)
  )
    .map((item) => capitalizeSentence(item))
    .slice(0, 10);
  const topSources = buildSourceBreakdown(records).slice(0, 12);
  const themes = summarizeThemes(clusters);
  const headline = events[0] || "Briefing completo sul caso Delmastro";
  const summaryParts = [];

  summaryParts.push(
    `Il briefing aggiornato lavora su ${records.length} articoli linkati, raccolti in ${clusters.length} filoni e ${coverage.sourceCount} fonti${formatWindowSuffix(window)}.`
  );

  if (events.length > 0) {
    summaryParts.push(
      `I nuclei piu ricorrenti riguardano ${events.slice(0, 3).map(toSentenceFragment).join("; ")}.`
    );
  }

  if (topSources.length > 0) {
    summaryParts.push(
      `Le fonti piu presenti sono ${topSources.slice(0, 5).map((item) => `${item.label} (${item.count})`).join(", ")}.`
    );
  }

  return {
    headline,
    summary: summaryParts.join(" "),
    linkedArticleCount: records.length,
    clusterCount: clusters.length,
    sourceCount: coverage.sourceCount,
    coverage,
    timeWindow: buildTimeWindow(window),
    events,
    themes,
    notableActors,
    sourceBasis: buildSourceBasis(coverage, clusters.length, records.length),
    cautionNote: buildCautionNote(coverage),
    timeline: buildDailyTimeline(records),
    topSources,
    sourceArticles: records.map((article) => ({
      id: article.id,
      title: article.title,
      source: article.source,
      sourceHost: article.sourceHost,
      link: article.link,
      publishedAt: article.publishedAt
    }))
  };
}

function buildDailyTimeline(records) {
  const byDate = new Map();

  for (const record of records) {
    const key = formatRomeDateKey(record.publishedAt);
    const list = byDate.get(key) ?? [];
    list.push(record);
    byDate.set(key, list);
  }

  return [...byDate.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, dayRecords]) => {
      const dayClusters = clusterAndRankArticles(dayRecords);
      const events = dedupeEventLines(
        dayClusters.map((cluster) => simplifyEventTitle(cluster.title)).filter(Boolean)
      )
        .map((item) => capitalizeSentence(item))
        .slice(0, 5);
      const topSources = buildSourceBreakdown(dayRecords).slice(0, 4);

      return {
        date,
        label: formatLongDate(date),
        linkedArticleCount: dayRecords.length,
        sourceCount: new Set(dayRecords.map((item) => item.source || item.sourceHost).filter(Boolean)).size,
        summary: buildDailyTimelineSummary(dayRecords, dayClusters, events, topSources),
        events,
        topSources
      };
    });
}

function buildDailyTimelineSummary(records, clusters, events, topSources) {
  const parts = [
    `${records.length} articoli linkati raccolti in ${clusters.length} filoni.`
  ];

  if (events.length > 0) {
    parts.push(`In evidenza: ${events.slice(0, 2).map(toSentenceFragment).join("; ")}.`);
  }

  if (topSources.length > 0) {
    parts.push(
      `Fonti più presenti: ${topSources.map((item) => `${item.label} (${item.count})`).join(", ")}.`
    );
  }

  return parts.join(" ");
}

function buildCoverage(records) {
  const sourceCount = new Set(records.map((record) => record.source || record.sourceHost).filter(Boolean)).size;
  const bodyCount = records.filter((record) => record.extractionStatus === "ok" && record.bodyExcerpt).length;
  const excerptCount = records.filter((record) => record.excerpt).length;
  const mode = bodyCount === 0 ? "excerpt-only" : bodyCount === records.length ? "body" : "mixed";

  return {
    articleCount: records.length,
    sourceCount,
    excerptCount,
    bodyCount,
    mode
  };
}

function clusterAndRankArticles(records) {
  const filtered = records
    .filter((article) => !isLowSignalArticle(article))
    .sort((left, right) => {
      const leftScore = buildArticleScore(left);
      const rightScore = buildArticleScore(right);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    });

  return clusterArticles(filtered).sort((left, right) => buildClusterScore(right) - buildClusterScore(left));
}

function clusterArticles(records) {
  const clusters = [];

  for (const article of records) {
    const normalizedTitle = normalizeHeadline(article.title);
    const titleTokens = tokenizeTitle(article.title);
    let bestCluster = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const score = compareTitleSets(titleTokens, cluster.titleTokens);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestScore >= 0.72) {
      addArticleToCluster(bestCluster, article, normalizedTitle, titleTokens);
      continue;
    }

    clusters.push(createCluster(article, normalizedTitle, titleTokens));
  }

  return clusters;
}

function createCluster(article, normalizedTitle, titleTokens) {
  return {
    id: article.id,
    title: article.title,
    normalizedTitle,
    titleTokens,
    articles: [article],
    titles: [article.title],
    excerpts: article.excerpt ? [article.excerpt] : [],
    sources: new Set([article.source || article.sourceHost]),
    tags: new Set(article.tags ?? [])
  };
}

function addArticleToCluster(cluster, article, normalizedTitle, titleTokens) {
  cluster.articles.push(article);
  cluster.sources.add(article.source || article.sourceHost);

  if (!cluster.titles.includes(article.title)) {
    cluster.titles.push(article.title);
  }

  if (article.excerpt && !cluster.excerpts.includes(article.excerpt)) {
    cluster.excerpts.push(article.excerpt);
  }

  for (const tag of article.tags ?? []) {
    cluster.tags.add(tag);
  }

  if (article.title.length > cluster.title.length) {
    cluster.title = article.title;
    cluster.normalizedTitle = normalizedTitle;
    cluster.titleTokens = titleTokens;
  }
}

function toPromptCluster(cluster) {
  return {
    title: cluster.title,
    articleCount: cluster.articles.length,
    sourceCount: cluster.sources.size,
    sources: [...cluster.sources].slice(0, 8),
    alternateTitles: cluster.titles.slice(0, 5),
    excerpts: cluster.excerpts.slice(0, 5),
    tags: [...cluster.tags].filter((tag) => tag && tag !== "altro")
  };
}

function buildClusterScore(cluster) {
  const bestArticleScore = Math.max(...cluster.articles.map((article) => buildArticleScore(article)), 0);
  return (
    bestArticleScore +
    cluster.articles.length * 35 +
    cluster.sources.size * 120 +
    Math.min(cluster.excerpts.join(" ").length, 320)
  );
}

function buildArticleScore(article) {
  let score = 0;
  if (article.excerpt) {
    score += Math.min(article.excerpt.length, 220);
  }
  if (article.bodyExcerpt) {
    score += Math.min(article.bodyExcerpt.length, 80);
  }
  if (article.tags?.length) {
    score += article.tags.length * 16;
  }
  if (article.queryLabel) {
    score += 20;
  }
  return score;
}

function summarizeThemes(clusters) {
  const counts = new Map();

  for (const cluster of clusters) {
    for (const tag of cluster.tags) {
      if (!tag || tag === "altro") {
        continue;
      }

      counts.set(tag, (counts.get(tag) ?? 0) + cluster.articles.length);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([tag]) => THEME_LABELS[tag] ?? tag);
}

function buildSourceBasis(coverage, clusterCount, recordCount) {
  const base = `Briefing costruito su ${recordCount} articoli linkati, ${clusterCount} filoni e ${coverage.sourceCount} fonti.`;
  if (coverage.mode === "excerpt-only") {
    return `${base} Corpi articolo non disponibili.`;
  }
  if (coverage.mode === "mixed") {
    return `${base} Corpi articolo disponibili solo in parte.`;
  }
  return `${base} Corpi articolo disponibili.`;
}

function buildCautionNote(coverage) {
  if (coverage.mode === "excerpt-only") {
    return "Sintesi basata principalmente su titoli ed estratti: verificare sempre i testi originali.";
  }

  if (coverage.mode === "mixed") {
    return "Sintesi basata su titoli ed estratti e, quando disponibile, sul corpo articolo.";
  }

  return "";
}

function buildMethodologyNote(coverage) {
  if (coverage.mode === "excerpt-only") {
    return "Briefing globale costruito soprattutto da titoli ed estratti dei feed monitorati; i corpi articolo non sono ancora disponibili in modo affidabile.";
  }

  if (coverage.mode === "mixed") {
    return "Briefing globale costruito da titoli ed estratti e, quando disponibile, dal corpo degli articoli.";
  }

  return "Briefing globale costruito anche a partire dal corpo degli articoli.";
}

function formatWindowSuffix(window) {
  if (!window?.from || !window?.to) {
    return "";
  }

  return ` tra il ${formatShortDate(window.from)} e il ${formatShortDate(window.to)}`;
}

function buildTimeWindow(window) {
  if (!window?.from || !window?.to) {
    return null;
  }

  return {
    from: window.from,
    to: window.to,
    label: `${formatShortDate(window.from)} - ${formatShortDate(window.to)}`
  };
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function compareTitleSets(left, right) {
  if (!left.length || !right.length) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const overlap = [...leftSet].filter((token) => rightSet.has(token)).length;
  const minSize = Math.min(leftSet.size, rightSet.size);
  const unionSize = new Set([...leftSet, ...rightSet]).size;

  if (overlap === 0) {
    return 0;
  }

  return Math.max(overlap / minSize, overlap / unionSize);
}

function tokenizeTitle(value) {
  return normalizeHeadline(value)
    .split(" ")
    .filter((token) => token.length > 2 && !TITLE_STOPWORDS.has(token));
}

function normalizeHeadline(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function toStringArray(value, maxItems) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(
    value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  ).slice(0, maxItems);
}

function sanitizeActors(values) {
  return values.filter((value) => !/[A-Za-z].*\(.+\)/.test(value));
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

function clampText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function simplifyEventTitle(value) {
  let text = String(value ?? "")
    .replace(/\s+\|\s+.+$/u, "")
    .replace(/\s+-\s+[A-Z][\p{L}\s'.’]+$/u, "")
    .replace(/[«»"]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  text = text
    .replace(/^caso delmastro[:, -]\s*/iu, "")
    .replace(/^caso bisteccheria(?: d'italia)?[:, -]\s*/iu, "")
    .replace(/^bisteccheria delmastro[:, -]\s*/iu, "")
    .replace(/^dopo delmastro[:, -]\s*/iu, "")
    .replace(/^fonti\s+/iu, "")
    .replace(/^anche\s+/iu, "");

  const [lead] = text.split(/:\s/u);
  if (lead && lead.split(/\s+/u).length >= 3) {
    text = lead.trim();
  }

  return clampText(text, 96);
}

function toSentenceFragment(value) {
  const text = String(value ?? "").trim().replace(/[.?!]+$/u, "");
  if (!text) {
    return "sviluppi non specificati";
  }

  const [firstWord] = text.split(/\s+/u);
  if (/^(FdI|Dda|pm|Osap|ANSA)$/u.test(firstWord) || /^[A-Z]{2,}$/u.test(firstWord)) {
    return text;
  }

  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function extractActorsFromClusters(clusters) {
  const actors = new Set();

  for (const cluster of clusters) {
    const text = [cluster.title, ...cluster.titles.slice(0, 2)].join(". ");
    const matches = text.match(
      /\b(?:FdI|Dda|Osap|Antimafia|Commissione Antimafia|Ordine degli avvocati|[A-ZÀ-ÖØ-Ý][\p{L}'’.()-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’.()-]+){0,2})\b/gu
    ) ?? [];

    for (const match of matches) {
      const cleaned = match.trim();
      if (cleaned.length < 3) {
        continue;
      }
      if (/^(Un|Una|Il|La|Le|I|Gli|Tra|Poi|Caso)$/u.test(cleaned)) {
        continue;
      }

      actors.add(cleaned);
      if (actors.size >= 8) {
        return [...actors];
      }
    }
  }

  return [...actors];
}

function buildSourceBreakdown(records) {
  const counts = new Map();

  for (const record of records) {
    const label = record.source || record.sourceHost;
    if (!label) {
      continue;
    }

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "it"));
}

function dedupeEventLines(values) {
  const output = [];

  for (const value of values) {
    const tokens = tokenizeTitle(value);
    const isDuplicate = output.some((item) => compareTitleSets(tokens, tokenizeTitle(item)) >= 0.6);
    if (!isDuplicate) {
      output.push(value);
    }
  }

  return output;
}

function capitalizeSentence(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return text;
  }

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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
