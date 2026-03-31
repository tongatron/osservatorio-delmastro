import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "watch.json");
const OUTPUT_PATH = path.join(ROOT, "data", "articles.json");
const ROME_TIME_ZONE = "Europe/Rome";

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const now = new Date();
const since = new Date(now.getTime() - config.windowDays * 24 * 60 * 60 * 1000);
const queryGroups = Array.isArray(config.queryGroups) && config.queryGroups.length > 0
  ? config.queryGroups
  : [{ label: "Query principale", terms: config.keywords }];
const sourceUrls = buildSourceUrls(config, queryGroups);

const seen = new Set();
const articles = [];
const queryStats = new Map();
const sourceStats = new Map();

for (const source of sourceUrls) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "DelmastroNewswatch/0.1 (+local project)"
    }
  });

  if (!response.ok) {
    console.warn(`Skipping ${source.label}/${source.queryLabel}: HTTP ${response.status}`);
    continue;
  }

  const xml = await response.text();
  for (const item of extractItems(xml)) {
    const title = decodeEntities(extractTag(item, "title"));
    const link = extractTag(item, "link").trim();
    const pubDateRaw = extractTag(item, "pubDate").trim();
    const description = stripHtml(decodeEntities(extractTag(item, "description")));
    const sourceName = decodeEntities(extractTag(item, "source")) || source.label;
    const publishedAt = new Date(pubDateRaw);

    if (!title || !link || Number.isNaN(publishedAt.getTime())) {
      continue;
    }

    if (publishedAt < since || publishedAt > now) {
      continue;
    }

    const haystack = `${title} ${description}`.toLowerCase();
    if (!config.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      continue;
    }

    if (config.excludedKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      continue;
    }

    registerHit(queryStats, source.queryLabel, false);

    const dedupeKey = buildArticleFingerprint({
      title,
      sourceName,
      sourceHost: source.label,
      publishedAt: publishedAt.toISOString()
    });
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    registerHit(queryStats, source.queryLabel, true);
    registerSource(sourceStats, source.label);

    articles.push({
      id: dedupeKey,
      title,
      link,
      source: sourceName,
      sourceHost: source.label,
      queryLabel: source.queryLabel,
      matchedTerms: source.terms,
      tags: inferTags(`${title} ${description}`, config.tagRules ?? {}),
      publishedAt: publishedAt.toISOString(),
      excerpt: description.slice(0, 280)
    });
  }
}

articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

const payload = {
  generatedAt: now.toISOString(),
  topic: {
    title: config.title,
    subtitle: config.subtitle,
    description: config.description,
    topicLabel: config.topicLabel,
    keywords: config.keywords,
    excludedKeywords: config.excludedKeywords,
    queryGroups,
    manualNotes: config.manualNotes
  },
  window: {
    from: since.toISOString(),
    to: now.toISOString(),
    days: config.windowDays
  },
  sources: [...sourceStats.entries()]
    .map(([label, articleCount]) => ({ label, articleCount }))
    .sort((a, b) => b.articleCount - a.articleCount),
  queries: [...queryStats.entries()]
    .map(([label, stats]) => ({
      label,
      fetchedArticles: stats.fetchedArticles,
      uniqueArticles: stats.uniqueArticles
    }))
    .sort((a, b) => b.uniqueArticles - a.uniqueArticles),
  tagSummary: buildTagSummary(articles),
  timeline: buildTimeline(articles, since, now),
  articles
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Saved ${articles.length} articles to ${OUTPUT_PATH}`);

function buildSourceUrls(activeConfig, groups) {
  return activeConfig.googleNewsSites.flatMap((site) =>
    groups.map((group) => {
      const query = group.terms.map((term) => `"${term}"`).join(" OR ");
      const params = new URLSearchParams({
        q: `${query} when:${activeConfig.windowDays}d site:${site}`,
        hl: "it",
        gl: "IT",
        ceid: "IT:it"
      });

      return {
        label: site,
        queryLabel: group.label,
        terms: group.terms,
        type: "google-news-rss",
        url: `https://news.google.com/rss/search?${params.toString()}`
      };
    })
  );
}

function registerHit(map, label, isUnique) {
  const entry = map.get(label) ?? { fetchedArticles: 0, uniqueArticles: 0 };
  entry.fetchedArticles += 1;
  if (isUnique) {
    entry.uniqueArticles += 1;
  }
  map.set(label, entry);
}

function registerSource(map, label) {
  map.set(label, (map.get(label) ?? 0) + 1);
}

function inferTags(text, rules) {
  const haystack = text.toLowerCase();
  const tags = Object.entries(rules)
    .filter(([, terms]) => terms.some((term) => haystack.includes(term.toLowerCase())))
    .map(([tag]) => tag);

  return tags.length > 0 ? tags : ["altro"];
}

function buildTagSummary(records) {
  const counts = new Map();

  for (const article of records) {
    for (const tag of article.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function buildTimeline(records, start, end) {
  const counts = new Map();
  const cursor = getRomeDayStart(start);
  const finalDay = getRomeDayStart(end);

  while (cursor <= finalDay) {
    counts.set(formatRomeDateKey(cursor), 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const article of records) {
    const key = formatRomeDateKey(article.publishedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

function formatRomeDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function getRomeDayStart(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return new Date(`${year}-${month}-${day}T00:00:00Z`);
}

function buildArticleFingerprint({ title, sourceName, sourceHost, publishedAt }) {
  return [
    sourceHost,
    sourceName.toLowerCase(),
    normalizeTitle(title),
    publishedAt
  ].join("__");
}

function normalizeTitle(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractItems(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
}

function extractTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? unwrapCdata(match[1]).trim() : "";
}

function unwrapCdata(value) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
